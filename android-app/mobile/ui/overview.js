import { html, useState } from '../js/vendor/preact-htm.js';
import { duration, money, openVisit, projectStatus, visitStats } from '../work/model.js';
import { artFor, Facts, Filters, ProjectRow, SectionTitle } from './components.js';
import { localDate, pathFor } from './forms.js';
import { useClock } from './visits.js';
import { Icon } from './icons.js';

export function Today({projects}) {
  const live = projects.find(openVisit);
  const now = useClock(!!live);
  const day = localDate(now);
  const todo = projects.filter(p=>p.doneAt === null && p !== live);
  const scheduled = todo.filter(p=>p.scheduled && p.scheduled >= day).sort((a,b)=>a.scheduled.localeCompare(b.scheduled));
  const featured = live || scheduled[0] || todo[0];
  const stage = live && visitStats(openVisit(live),now);
  const done = projects.filter(p=>p.doneAt !== null);
  return html`<p class="dateline">${new Date(now).toLocaleDateString('ru-RU',{weekday:'long',month:'long',day:'numeric'})}</p><h1>Сегодня</h1>
    <a class="hero" href=${featured ? pathFor(featured) : '#projects/new'}><div class="hero-image"><img src=${artFor(featured?.type)} alt=""/>
    ${featured && html`<span class="hero-tag"><i></i>${projectStatus(featured)}</span>`}</div>
    <div class="hero-body"><small>${featured?.type || 'Моя мастерская'}</small><h2>${featured?.title || (projects.length ? 'Новый объект' : 'Первый объект')}</h2>
    <div class="hero-footer"><span>${stage ? (stage.running || (stage.paused ? 'Пауза' : 'Между этапами'))+' · '+duration(stage.active,true) :
      featured ? 'Открыть объект' : 'Создать объект'}</span><span class="round-arrow"><${Icon} name="arrow"/></span></div></div></a>
    <${SectionTitle} title="Ближайшие выезды" href="#projects" link="Объекты"/>
    ${scheduled.length ? html`<div class="rows">${scheduled.slice(0,3).map(p=>html`<${ProjectRow} key=${p.id} project=${p} subtitle=${p.scheduled+' · '+(p.address || p.type)}/>`)}</div>` : html`<p class="hint">Запланированных выездов пока нет.</p>`}
    <${SectionTitle} title="Моя работа" href="#progress" link="Итоги"/>
    <div class="panel"><${Facts} rows=${[['Открытые объекты',projects.length-done.length],['Завершённые',done.length]]}/></div>`;
}
export function Projects({projects}) {
  const [filter,setFilter]=useState('all');
  const shown=projects.filter(p=>filter === 'all' || (filter === 'done') === (p.doneAt !== null));
  return html`<h1>Объекты</h1><a class="primary" href="#projects/new">Создать объект</a>
    <div class="spaced"><${Filters} options=${[['all','Все'],['open','Открытые'],['done','Завершённые']]} value=${filter} onChange=${setFilter}/></div>
    <div class="rows">${shown.map(p=>html`<${ProjectRow} key=${p.id} project=${p}/>`)}</div>
    ${!shown.length && html`<p class="hint">${projects.length ? 'В этом списке пока пусто.' : 'Здесь появятся ваши объекты и история выездов.'}</p>`}
    <${SectionTitle} title="Расчёты и данные"/><div class="rows"><a class="row" href="calculator.html#orders"><span class="tile"><${Icon} name="calc"/></span><strong>Заказы калькулятора</strong></a>
    <a class="row" href="#projects/backup"><span class="tile"><${Icon} name="shop"/></span><strong>Резервная копия</strong></a></div>`;
}
export function Progress({projects}) {
  const done = projects.filter(p=>p.doneAt !== null);
  const paid = projects.filter(p=>p.received !== null);
  const known = paid.filter(p=>p.expenses !== null);
  const received = paid.reduce((sum,p)=>sum+p.received,0);
  const net = known.reduce((sum,p)=>sum+p.received-p.expenses,0);
  const closedVisits = projects.flatMap(p=>p.visits.filter(v=>v.endedAt!==null));
  const active = closedVisits.reduce((sum,v)=>sum+visitStats(v).active,0);
  return html`<p class="dateline">За всё время</p><h1>Прогресс</h1><div class="finance"><small>Получено по объектам</small><strong>${paid.length ? money(received) : 'Нет данных'}</strong>
    <div>Объекты с суммой оплаты <b>${paid.length} / ${projects.length}</b></div>
    <div>Завершённые объекты <b>${done.length}</b></div></div>
    <${SectionTitle} title="Результаты"/><div class="panel"><${Facts} rows=${[['Работа в закрытых выездах',closedVisits.length ? duration(active) : 'Нет записей'],
      ['После прямых расходов',known.length ? (known.some(p=>p.estimated) ? '≈ ' : '')+money(net) : 'Недостаточно данных'],
      ['Объекты с обеими суммами',known.length+' / '+projects.length]]}/></div>
    ${done.length > 0 && html`<${SectionTitle} title="Достижения"/><div class="row award"><span class="tile"><${Icon} name="medal"/></span><div class="row-text"><strong>Первая реставрация</strong><small>Есть завершённый объект</small></div></div>
    <${SectionTitle} title="Завершённые объекты"/><div class="rows">${done.map(p=>html`<${ProjectRow} key=${p.id} project=${p} subtitle=${'Получено · '+money(p.received)}/>`)}</div>`}`;
}
