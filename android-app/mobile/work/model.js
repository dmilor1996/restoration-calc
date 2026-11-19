// Pure session projections. Only user actions create events. Display ticks never write.
export const types = ['Столешница', 'Подоконник', 'Лестница', 'Стол', 'Другая работа'];
// Historical payment statuses remain for older backup files. New orders use paymentMethod.
export const payments = ['Не указано', 'Ожидается', 'Частично', 'Оплачено'];
export const paymentMethods = ['unknown', 'cash', 'transfer', 'card'];
export const clientKinds = ['person', 'business'];
export const uuid = () => crypto.randomUUID();
// Work type is descriptive, not a workflow restriction: every operation is optional.
export function template(_type) {
  return ['Подготовка', 'Демонтаж', 'Шлифовка', 'Устранение дефектов',
    'Подготовка к покрытию', 'Тонировка', 'Покрытие', 'Протирка',
    'Обратная установка', 'Уборка', 'Дорога'];
}
export function newProject(id, now) {
  return {version:1, id, rev:0, createdAt:now, updatedAt:now, doneAt:null, title:'Новый заказ',
    type:'Другая работа', workplace:'client', address:'', client:'', note:'', scheduled:'', stages:template(),
    legacy:null, received:null, expenses:null, expenseMode:'items', materials:[], materialsEdited:false,
    extraExpenses:null, estimated:true, payment:payments[0], paymentMethod:'unknown', clientKind:'person', visits:[]};
}
export const openVisit = p => p.visits.find(v => v.endedAt === null);
export function projectStatus(p) {
  if (p.doneAt !== null) return 'Завершён';
  if (openVisit(p)) return 'Идёт работа';
  return p.visits.length ? 'В работе' : 'Запланирован';
}

export function visitStats(v, now = Date.now()) {
  const byStage = new Map();
  let running = null, paused = null, since = null, dryingSince = null, dry = 0, corrected = null;
  const clock = v.endedAt ?? now;
  const accrue = end => {
    if (running !== null) byStage.set(running, (byStage.get(running) || 0) + Math.max(0, end - since));
  };
  for (const e of v.events) {
    switch (e.kind) {
      case 'stage':
        accrue(e.at); running = e.stage; since = e.at; paused = null; break;
      case 'pause':
      case 'ready':
      case 'end':
        accrue(e.at); paused = e.kind === 'pause' ? running : null; running = null; since = null;
        if (e.kind === 'end' && dryingSince !== null) { dry += e.at - dryingSince; dryingSince = null; }
        break;
      case 'dry-start': dryingSince = e.at; break;
      case 'dry-stop': dry += e.at - dryingSince; dryingSince = null; break;
      case 'correct': corrected = e.minutes; break;
    }
  }
  accrue(clock);
  if (dryingSince !== null) dry += Math.max(0, clock - dryingSince);
  let measured = 0;
  for (const [stage, duration] of byStage) if (stage !== 'Дорога') measured += duration;
  const travel = byStage.get('Дорога') || 0;
  return {running, paused, since, dryingSince, dry, travel, measured, corrected, byStage,
    active:corrected === null ? measured : corrected * 60000};
}
/**
 * A linked calculation supplies *estimated* material use, not stock movements.
 * Actual use is stored independently and overrides the estimate when confirmed.
 * Historical version-1 records without expenseMode keep their old direct-expense total.
 */
export function materialRows(p) {
  return p.materialsEdited ? (p.materials || []) : (p.legacy?.materials || []);
}
export function expenseSummary(p) {
  if (p.expenseMode !== 'items') {
    return {total:p.expenses, materials:null, extra:null, estimated:!!p.estimated, known:p.expenses !== null, rows:[], historical:true};
  }
  const rows=materialRows(p);
  const valid=rows.every(r=>Number.isFinite(r.quantity) && r.quantity >= 0 && Number.isFinite(r.unitPriceRub) && r.unitPriceRub >= 0);
  const materials=valid ? Math.round(rows.reduce((sum,r)=>sum+r.quantity*r.unitPriceRub,0)*100) : null;
  const extra=p.extraExpenses ?? null;
  const entered=rows.length>0 || p.materialsEdited || extra !== null;
  const total=entered && materials !== null ? materials+(extra ?? 0) : null;
  const estimated=!p.materialsEdited || extra === null || !valid;
  return {total, materials, extra, estimated, known:total !== null, rows, historical:false};
}
export function projectStats(p, now = Date.now()) {
  const result = {active:0, dry:0, travel:0};
  for (const v of p.visits) {
    const stats = visitStats(v,now);
    for (const k of Object.keys(result)) result[k] += stats[k];
  }
  const costs=expenseSummary(p);
  const net = p.received !== null && costs.total !== null ? p.received - costs.total : null;
  // NPD depends on the buyer, not on cash/card/transfer. It is an estimate, not an issued tax receipt.
  const taxRate=p.clientKind === 'business' ? 0.06 : 0.04;
  const tax=p.received !== null ? Math.round(p.received*taxRate) : null;
  const afterTax=net !== null && tax !== null ? net-tax : null;
  const hourly=afterTax !== null && result.active>0 ? Math.round(afterTax*3600000/result.active) : null;
  return {...result, expenses:costs.total, costEstimate:costs.estimated, costs, net, tax, taxRate,
    afterTax, hourly, tinySession:result.active>0 && result.active<15*60000};
}
export function duration(ms, seconds = false) {
  const n = Math.floor(ms/1000), h = Math.floor(n/3600), m = Math.floor(n/60)%60;
  const pad = v => String(v).padStart(2,'0');
  return seconds ? [h,pad(m),pad(n%60)].join(':') : h ? h+' ч '+m+' мин' : m ? m+' мин' : n+' с';
}
export function money(cents) {
  return cents === null ? 'Не указано' : (cents/100).toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' ₽';
}
export function check(ok, text) { if (!ok) throw Error(text); }
export function parseMoney(value) {
  const s = String(value ?? '').trim().replace(/\s/g,'').replace(',','.');
  if (!s) return null;
  check(/^\d{1,12}(\.\d{1,2})?$/.test(s), 'Введите сумму в рублях с точностью до копеек.');
  const [whole, fraction = ''] = s.split('.');
  return Number(whole)*100 + Number(fraction.padEnd(2,'0'));
}
function event(visit, kind, now, fields = {}) {
  const last = visit.events.at(-1)?.at ?? visit.startedAt;
  visit.events.push({id:uuid(), kind, at:Math.max(now,last), ...fields});
}
const validMinutes = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
export function change(p, command, now) {
  const v = openVisit(p);
  const c = command;
  switch (c.kind) {
    case 'details':
      check(types.includes(c.type), 'Выберите тип работы.');
      check(!c.workplace || ['client','workshop'].includes(c.workplace),'Выберите место выполнения работы.');
      check(Array.isArray(c.stages) && c.stages.length && c.stages.every(x => typeof x === 'string' && x.trim()), 'Нужен хотя бы один этап.');
      for (const key of ['type','address','client','note','scheduled','legacy','workplace']) {
        if (Object.hasOwn(c,key)) p[key] = c[key];
      }
      p.stages = [...new Set(c.stages.map(s => s.trim()))];
      p.title = c.title.trim() || c.client?.trim() || 'Новый заказ';
      break;
    case 'start': {
      check(!v && p.doneAt === null, 'Завершите текущий выезд перед началом следующего.');
      const visit = {id:uuid(), startedAt:now, endedAt:null, manual:false, events:[]};
      // Time starts at the car/workshop without assuming that preparation began.
      event(visit,'stage',now,{stage:'Общая работа'}); p.visits.push(visit); break;
    }
    case 'manual':
      check(validMinutes(c.minutes) && Number.isFinite(c.date) && c.date <= now, 'Проверьте дату и длительность выезда.');
      p.visits.push({id:uuid(), startedAt:c.date, endedAt:c.date, manual:true,
        events:[{id:uuid(),kind:'correct',at:now,minutes:c.minutes}]});
      break;
    case 'correct': {
      const visit = p.visits.find(x => x.id === c.visitId);
      check(visit && visit.endedAt !== null, 'Сначала завершите выезд.');
      check(validMinutes(c.minutes) || (!visit.manual && c.minutes === null), 'Проверьте длительность.');
      event(visit,'correct',now,{minutes:c.minutes}); break;
    }
    case 'finance':
    case 'finish': {
      check(c.received === null || (Number.isSafeInteger(c.received) && c.received >= 0), 'Проверьте полученную сумму.');
      p.received = c.received;
      if (Object.hasOwn(c,'otherExpenses')) {
        check(c.otherExpenses === null || (Number.isSafeInteger(c.otherExpenses) && c.otherExpenses >= 0),'Проверьте дополнительные расходы.');
        p.extraExpenses = c.otherExpenses;
        p.expenseMode = 'items';
      } else if (Object.hasOwn(c,'expenses')) {
        // Backwards-compatible command from pre-itemized clients.
        check(c.expenses === null || (Number.isSafeInteger(c.expenses) && c.expenses >= 0),'Проверьте сумму.');
        p.expenses = c.expenses;
        p.expenseMode = 'manual';
      }
      if (Object.hasOwn(c,'payment')) {
        check(payments.includes(c.payment),'Проверьте статус оплаты.');
        p.payment = c.payment;
      }
      if (Object.hasOwn(c,'paymentMethod')) {
        check(paymentMethods.includes(c.paymentMethod),'Выберите способ оплаты.');
        p.paymentMethod = c.paymentMethod;
      }
      if (Object.hasOwn(c,'clientKind')) {
        check(clientKinds.includes(c.clientKind),'Выберите тип заказчика.');
        p.clientKind = c.clientKind;
      }
      if (Object.hasOwn(c,'estimated')) p.estimated = c.estimated;
      if (c.kind === 'finish') {
        check(!v, 'Сначала завершите текущую работу.');
        p.doneAt ??= now;
      }
      break;
    }
    case 'materials':
      check(Array.isArray(c.materials) && c.materials.length<=100,'Слишком много материалов.');
      check(c.materials.every(r => typeof r.id === 'string' && r.id.length>0 &&
        typeof r.name === 'string' && r.name.trim() && r.name.length<=150 &&
        ['мл','г','шт','л','кг'].includes(r.unit) &&
        Number.isFinite(r.quantity) && r.quantity>=0 && r.quantity<=1000000 &&
        Number.isFinite(r.unitPriceRub) && r.unitPriceRub>=0 && r.unitPriceRub<=10000000),
        'Проверьте количество, цену и единицы материалов.');
      check(new Set(c.materials.map(r=>r.id)).size === c.materials.length,'Повторяющийся материал.');
      p.materials=c.materials.map(r=>({...r,name:r.name.trim()}));
      if (Object.hasOwn(c,'extraExpenses')) {
        check(c.extraExpenses === null || (Number.isSafeInteger(c.extraExpenses) && c.extraExpenses >= 0),
          'Проверьте дополнительные расходы.');
        p.extraExpenses=c.extraExpenses;
      }
      p.materialsEdited=true; p.expenseMode='items';
      break;
    case 'reopen': p.doneAt = null; break;
    default: {
      check(v && v.id === c.visitId, 'Выезд уже завершён. Откройте актуальную карточку.');
      const s = visitStats(v,now);
      switch (c.kind) {
        case 'undo': {
          // Accidental tap: restore the immediately preceding state without a duplicate duration.
          const last=v.events.at(-1);
          check(v.events.length>1 && ['stage','ready','pause','dry-start','dry-stop'].includes(last?.kind),
            'Последнее действие нельзя отменить.');
          v.events.pop();
          // A custom stage added by mistake must not pollute the selector forever.
          if (last.kind === 'stage' && !template().includes(last.stage) &&
              !p.visits.some(x=>x.events.some(e=>e.kind==='stage' && e.stage===last.stage))) {
            p.stages=p.stages.filter(stage=>stage!==last.stage);
          }
          break;
        }
        case 'stage':
          check(typeof c.stage === 'string' && c.stage.trim(), 'Введите название этапа.');
          if (c.stage === s.running) return;
          if (!p.stages.includes(c.stage)) p.stages.push(c.stage);
          event(v,'stage',now,{stage:c.stage}); break;
        case 'pause':
        case 'ready':
          check(s.running !== null, 'Этап уже остановлен.'); event(v,c.kind,now); break;
        case 'resume':
          check(s.paused !== null, 'Выберите этап для продолжения.'); event(v,'stage',now,{stage:s.paused}); break;
        case 'dry-start':
        case 'dry-stop':
          check((c.kind === 'dry-start') === (s.dryingSince === null), 'Таймер сушки уже изменён.');
          if (c.kind === 'dry-start' && s.running === 'Покрытие') event(v,'ready',now);
          event(v,c.kind,now); break;
        case 'end':
          event(v,'end',now); v.endedAt = v.events.at(-1).at; break;
        default: throw Error('Неизвестное действие.');
      }
    }
  }
}
