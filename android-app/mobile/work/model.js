// Pure session projections. Only user actions create events. Display ticks never write.
export const types = ['Столешница', 'Подоконник', 'Лестница', 'Стол', 'Другая работа'];
export const payments = ['Не указано', 'Ожидается', 'Частично', 'Оплачено'];
export const uuid = () => crypto.randomUUID();
export function template(type) {
  return ['Подготовка', ...(type === 'Столешница' ? ['Демонтаж'] : []), 'Шлифовка',
    ...(type === 'Лестница' ? ['Тонировка'] : []), 'Подготовка к покрытию', 'Покрытие',
    'Протирка', ...(type === 'Столешница' ? ['Обратная установка'] : []), 'Уборка', 'Дорога'];
}
export function newProject(id, now) {
  return {version:1, id, rev:0, createdAt:now, updatedAt:now, doneAt:null, title:'Новый объект',
    type:types[0], address:'', client:'', note:'', scheduled:'', stages:template(types[0]),
    legacy:null, received:null, expenses:null, estimated:true, payment:payments[0], visits:[]};
}
export const openVisit = p => p.visits.find(v => v.endedAt === null);
export function projectStatus(p) {
  if (p.doneAt !== null) return 'Завершён';
  if (openVisit(p)) return 'Идёт выезд';
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
export function projectStats(p, now = Date.now()) {
  const result = {active:0, dry:0, travel:0};
  for (const v of p.visits) {
    const stats = visitStats(v,now);
    for (const k of Object.keys(result)) result[k] += stats[k];
  }
  const net = p.received !== null && p.expenses !== null ? p.received - p.expenses : null;
  return {...result, net, hourly:net !== null && result.active > 0 ? Math.round(net * 3600000/result.active) : null};
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
      check(Array.isArray(c.stages) && c.stages.length && c.stages.every(x => typeof x === 'string' && x.trim()), 'Нужен хотя бы один этап.');
      for (const key of ['type','address','client','note','scheduled','legacy']) p[key] = c[key];
      p.stages = [...new Set(c.stages.map(s => s.trim()))];
      p.title = c.title.trim() || c.type;
      break;
    case 'start': {
      check(!v && p.doneAt === null, 'Завершите текущий выезд перед началом следующего.');
      const visit = {id:uuid(), startedAt:now, endedAt:null, manual:false, events:[]};
      event(visit,'stage',now,{stage:p.stages[0]}); p.visits.push(visit); break;
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
    case 'finish':
      check(payments.includes(c.payment), 'Проверьте статус оплаты.');
      for (const key of ['received','expenses']) {
        check(c[key] === null || (Number.isSafeInteger(c[key]) && c[key] >= 0), 'Проверьте сумму.');
        p[key] = c[key];
      }
      p.payment = c.payment; p.estimated = c.estimated;
      if (c.kind === 'finish') {
        check(!v, 'Сначала завершите выезд.');
        p.doneAt ??= now;
      }
      break;
    case 'reopen': p.doneAt = null; break;
    default: {
      check(v && v.id === c.visitId, 'Выезд уже завершён. Откройте актуальную карточку.');
      const s = visitStats(v,now);
      switch (c.kind) {
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
