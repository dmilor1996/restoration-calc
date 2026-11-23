import { html, useEffect, useState } from '../js/vendor/preact-htm.js';
import { duration, money, openVisit, projectStats, projectStatus, visitStats, expenseSummary } from '../work/model.js';
import { Back, dayText, pathFor } from './forms.js';
import { Facts, SectionTitle } from './components.js';
import { availableOrders } from '../work/legacy.js';

export function useClock(enabled) {
  const [time,setTime] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setTime(Date.now());
    tick(); const timer = setInterval(tick,1000);
    document.addEventListener('visibilitychange',tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange',tick); };
  },[enabled]);
  return time;
}
function ActiveVisit({p,v,run}) {
  const now = useClock(true), stats = visitStats(v,now);
  const [custom,setCustom] = useState('');
  const command = (kind,fields={}) => run(p,{kind,visitId:v.id,...fields});
  const lastStage = v.events.filter(e=>e.kind === 'stage').at(-1)?.stage;
  const index = p.stages.indexOf(lastStage);
  const recommended = [...new Set([...(stats.running === 'Общая работа' ? ['Подготовка','Демонтаж','Шлифовка'] : []),
    p.stages[index+1], lastStage === 'Подготовка' ? 'Шлифовка' : null,
    lastStage === 'Покрытие' ? 'Уборка' : null,
    !stats.running ? lastStage : null])].filter(s=>s && s !== stats.running && s !== 'Дорога');
  const lastEvent=v.events.at(-1);
  const undoable=v.events.length>1 && ['stage','ready','pause','dry-start','dry-stop'].includes(lastEvent?.kind);
  const clock = s => s === null ? '0:00:00' : duration(Math.max(0,now-s),true);
  const doneLabels = {'Шлифовка':'Завершить шлифовку','Подготовка':'Завершить подготовку','Уборка':'Завершить уборку','Покрытие':'Завершить покрытие'};
  return html`<section class="live">
    <div class="live-top"><span class="live-dot"></span>Рабочий день ${p.visits.filter(visit=>visit.startedAt <= v.startedAt).length}<small>${dayText(v.startedAt)}</small></div>
    <h2>${stats.running === 'Общая работа' ? 'Работа началась' : stats.running || (stats.paused ? 'Пауза' : 'Выберите этап')}</h2>
    ${stats.running ? html`<div class="digits">${clock(stats.since)}</div>` : html`<p>${stats.paused || 'Таймер работы остановлен'}</p>`}
    <p class="live-total">Активная работа за выезд <b>${duration(stats.active,true)}</b></p>
    ${stats.running ? html`${stats.running !== 'Общая работа' && html`<button class="bright" onClick=${()=>command('ready')}>${doneLabels[stats.running] || 'Завершить этап'}</button>`}
      <button class="live-link" onClick=${()=>command('pause')}>Пауза</button>`
      : stats.paused && html`<button class="bright" onClick=${()=>command('resume')}>Продолжить этап</button>`}
    </section>
    ${undoable && html`<button class="text-action undo-action" onClick=${()=>command('undo')}>↶ Отменить последнее действие</button>`}
    <${SectionTitle} title="Выбрать действие"/>
    <div class="choices">${recommended.map(s=>html`<button key=${s} class="secondary" onClick=${()=>command('stage',{stage:s})}>${s}</button>`)}</div>
    <details class="fold spaced"><summary>Все этапы · выбрать любой</summary>
    <div class="choices">${p.stages.filter(s=>s!==stats.running).map(s=>html`<button key=${s} class="secondary" onClick=${()=>command('stage',{stage:s})}>${s}</button>`)}</div>
    <form class="inline-form" onSubmit=${e=>{e.preventDefault();if(custom.trim()) command('stage',{stage:custom.trim()});}}>
    <input aria-label="Своя операция" maxlength="120" placeholder="Своя операция" value=${custom} onInput=${e=>setCustom(e.target.value)}/>
    <button class="secondary" disabled=${!custom.trim()}>Начать</button></form></details>
    <div class="dry"><div><strong>${stats.dryingSince !== null ? 'Идёт сушка' : 'Сушка покрытия'}</strong>
    <small>${stats.dryingSince !== null ? clock(stats.dryingSince) : 'Отдельно от рабочего времени'}</small></div>
    <button class="secondary" onClick=${()=>command(stats.dryingSince === null ? 'dry-start':'dry-stop')}>${stats.dryingSince === null ? 'Начать сушку' : 'Закончить сушку'}</button></div>
    ${v.events.some(e=>e.stage==='Демонтаж') && !v.events.some(e=>e.stage==='Обратная установка') && html`<p class="hint">Был демонтаж. Проверьте, нужна ли обратная установка.</p>`}
    <a class="secondary full spaced" href=${pathFor(p)+'/materials'}>Указать расход материалов и дисков</a>
    <button class="secondary full spaced" onClick=${()=>command('end')}>Завершить работу на сегодня</button>
    <p class="hint">Это завершит только текущий день. Заказ можно продолжить завтра.</p>`;
}
function VisitHistory({p}) {
  const visits = [...p.visits].sort((a,b)=>b.startedAt-a.startedAt);
  return html`<${SectionTitle} title="Рабочие дни" href=${pathFor(p)+'/manual'} link="Добавить время"/>
    ${!visits.length && html`<p class="hint">Начните работу или укажите время вручную после завершения.</p>`}
    <div class="rows">${visits.map(v=>{
      const stats = visitStats(v);
      const time = ms => new Date(ms).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      const period = v.manual ? 'Внесён вручную' : time(v.startedAt) + ' — ' + (v.endedAt === null ? 'сейчас' : time(v.endedAt));
      return html`<details key=${v.id} class="fold visit"><summary><span>${dayText(v.startedAt)}<small>${period}</small></span>
      <b>${v.endedAt === null ? 'Сейчас' : duration(stats.active)}</b></summary>
      <${Facts} rows=${[...Array.from(stats.byStage,([stage,ms])=>[stage,duration(ms,true)]),
        ...(stats.dry ? [['Сушка параллельно',duration(stats.dry,true)]] : []),
        ...(stats.corrected !== null ? [['Введено вручную',duration(stats.active,true)]] : [])]}/>
      ${!v.manual && html`<details class="timeline"><summary>Хронология выезда</summary><ol>${v.events.map(e=>html`
        <li key=${e.id}><time>${new Date(e.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time>
        <span>${e.kind === 'correct' ? (e.minutes === null ? 'Возвращено время таймера' : 'Поправка · '+e.minutes+' мин') :
          e.stage || ({pause:'Пауза',ready:'Этап завершён',end:'Выезд завершён','dry-start':'Начало сушки','dry-stop':'Окончание сушки'})[e.kind]}</span></li>`)}</ol></details>`}
      ${v.endedAt !== null && html`<a class="secondary" href=${pathFor(p)+'/time/'+v.id}>Исправить время</a>`}</details>`;
    })}</div>`;
}
export function Project({p,projects,run}) {
  const v=openVisit(p), another=projects.find(x=>x.id !== p.id && openVisit(x));
  const totals=projectStats(p), path=pathFor(p);
  const costs=expenseSummary(p);
  const place=p.workplace==='workshop'?'В мастерской':'У клиента';
  const paymentLabel={cash:'Наличные',transfer:'Перевод',card:'Картой',unknown:'Не указан'}[p.paymentMethod||'unknown'];

  const amount = cents => (costs.estimated && cents !== null ? '≈ ' : '') + money(cents);
  const knownOrder = p.legacy && availableOrders().some(o=>o.id === p.legacy.id);
  const plan = p.legacy?.price;
  return html`<${Back} href="#projects" label="Заказы"/><div class="project-heading"><span class="dateline">${projectStatus(p)} · ${place}</span><a href=${path+'/edit'}>Изменить</a></div>
    <h1>${p.title}</h1>
    ${v ? html`<${ActiveVisit} p=${p} v=${v} run=${run}/>` : html`
    ${!p.doneAt && (another ? html`<a class="secondary full" href=${pathFor(another)}>Перейти к открытому выезду</a>`
      : html`<button class="primary" onClick=${()=>run(p,{kind:'start'})}>${p.visits.length ? 'Начать следующий рабочий день' : 'Начать работу'}</button>`)}
    ${!p.doneAt && !another && html`<p class="hint">Таймер начнёт считать общую работу сразу. Этап можно выбрать после начала или записать время вручную.</p>`}
    <div class="panel spaced"><div class="dateline">${p.doneAt ? 'Итог заказа' : 'По заказу'}</div>
    <div class="result-time">${p.visits.length ? duration(totals.active) : 'Нет выездов'}</div>
    <${Facts} rows=${[['Рабочих дней',String(p.visits.length)],...(totals.travel ? [['Дорога',duration(totals.travel)]] : []),
      ...(totals.dry ? [['Сушка',duration(totals.dry)]] : [])]}/></div>`}
    <${VisitHistory} p=${p}/>
    <${SectionTitle} title="Финансы" href=${path+'/finance'} link="Внести суммы"/>
    <div class="panel"><${Facts} rows=${[['Способ оплаты',paymentLabel],
      ['Получено',money(p.received)],
      ['Материалы',costs.materials===null?(costs.historical?'В прежних общих расходах':'Пока не учтены'):(costs.estimated?'≈ ':'')+money(costs.materials)],
      ['Прочие расходы',costs.extra===null?'Не указаны':money(costs.extra)],
      ['Прямые расходы',amount(totals.expenses)],
      ['Остаток после расходов',totals.net===null?'Недостаточно данных':amount(totals.net)],
      ...(p.received!==null?[['Расчётный НПД ('+(totals.taxRate*100)+'%)',money(totals.tax)]]:[]),
      ...(totals.afterTax!==null?[['После прямых расходов и НПД',amount(totals.afterTax)]]:[]),
      ...(!v && totals.hourly!==null?[['После расходов и НПД за час',amount(totals.hourly)]]:[]),
      ...(plan != null && ['₽','RUB','руб.','руб'].includes(p.legacy.currency) && p.received !== null ? [['Отклонение от плана',money(p.received-plan)]] : [])]}/></div>
    ${totals.tinySession && html`<p class="hint">Учтено менее 15 минут работы. Почасовой показатель может быть очень высоким и не отражать обычную доходность.</p>`}
    ${costs.estimated && !costs.historical && html`<p class="hint">Расходы рассчитаны предварительно по нормативам. Уточни реальный расход материалов.</p>`}
    <a class="secondary full spaced" href=${path+'/mix'}>Рассчитать замес материалов</a>
    <a class="secondary full spaced" href=${path+'/materials'}>Расход лака, масла и абразивных дисков</a>
    ${(p.address || p.client || p.note || p.scheduled || p.legacy) && html`<${SectionTitle} title="Детали заказа"/><div class="panel">
      <${Facts} rows=${[['Клиент',p.client],['Адрес',p.address],['Плановая дата',p.scheduled],['Заметки',p.note],
      ['Расчёт',p.legacy?.label],['Плановая цена',plan != null ? (plan/100).toLocaleString('ru-RU')+' '+p.legacy.currency : '']].filter(([,val])=>val)}/>
      ${p.legacy && (knownOrder ? html`<a class="secondary" href=${'calculator.html#order/'+encodeURIComponent(p.legacy.id)}>Открыть связанный расчёт</a>`
        : html`<p class="hint">Расчёт отсутствует в локальном списке калькулятора. Сохранена привязка.</p>`)}</div>`}
    ${!v && (p.doneAt ? html`<button class="secondary full spaced" onClick=${()=>run(p,{kind:'reopen'})}>Возобновить заказ</button>`
      : html`<a class="secondary full spaced" href=${path+'/finish'}>Завершить заказ</a>`)}`;
}
