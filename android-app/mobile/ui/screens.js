import { html, useState } from '../js/vendor/preact-htm.js';
import { sectionArea, fmtArea, fmtPrice, plural } from '../js/calc.js';
import { projects, stages, inventory, projectStatus, summary, visitDate } from './demo.js';
import { Facts, Filters, Goal, ProjectRow, SectionTitle, Status } from './components.js';
import { Icon } from './icons.js';

const totals = summary(projects);
const formatDate = (date, options) => date.toLocaleDateString('ru-RU', options);
const dayLabel = offset => formatDate(visitDate(offset), {day:'numeric', month:'long'});
const area = p => fmtArea(sectionArea([{shape:'rect', l:p.l, w:p.w, qty:p.qty}])) + ' м²';

export function Today() {
  const active = projects.find(p => p.status === 'active');
  const next = projects.filter(p => p.status === 'planned').sort((a,b) => a.day-b.day || a.time.localeCompare(b.time))[0];
  return html`<p class="dateline">${formatDate(new Date(), {weekday:'long', day:'numeric', month:'long'})}</p>
    <h1>Сегодня</h1>
    <a class="hero" href=${'#projects/' + active.id}>
      <div class="hero-image"><img src=${'assets/' + active.art + '.webp'} alt=""/><span class="hero-tag"><i></i>Сейчас в работе</span></div>
      <div class="hero-body"><small>${active.wood} · ${area(active)}</small><h2>${active.title}</h2>
      <div class="hero-footer"><span>Этап · ${stages[active.stage]}</span><span class="round-arrow"><${Icon} name="arrow" size=${19}/></span></div></div>
    </a>
    <${SectionTitle} title="Ближайший выезд" href="#projects" link="Объекты"/>
    <${ProjectRow} project=${next} subtitle=${'Завтра, ' + next.time + ' · ' + next.qty + ' ступеней'}/>
    <${SectionTitle} title="Личный прогресс" href="#progress" link="Подробнее"/>
    <a href="#progress" class="panel goal"><${Goal} count=${totals.count}/></a>`;
}
export function Projects() {
  const [filter,setFilter] = useState('all');
  return html`<h1>Объекты</h1>
    <${Filters} options=${[['all','Все'],['active','В работе'],['planned','В плане'],['done','Готово']]} value=${filter} onChange=${setFilter}/>
    <div class="rows">${projects.filter(p => filter === 'all' || p.status === filter).map(p => html`<${ProjectRow} key=${p.id} project=${p}/>`)}</div>
    <${SectionTitle} title="Мои заказы"/>
    <a class="row" href="calculator.html#orders"><span class="tile"><${Icon} name="calc"/></span>
    <div class="row-text"><strong>Заказы калькулятора</strong><small>Ваши сохранённые расчёты</small></div><${Icon} name="next" size=${16}/></a>`;
}
export function Project({project:p}) {
  return html`<a class="back" href="#projects"><${Icon} name="back" size=${15}/>Объекты</a>
    <h1>${p.title}</h1><div class="detail-photo"><img src=${'assets/' + p.art + '.webp'} alt=""/></div>
    <div class="panel"><${Status} project=${p}/><p>${p.note}</p><${Facts} rows=${[
      ['Материал',p.wood],['Покрытие',p.finish],['Площадь',area(p)],
      ...(p.time ? [['Выезд',dayLabel(p.day) + ' · ' + p.time]] : []),
    ]}/></div>
    ${p.status === 'active' && html`<${SectionTitle} title="Ход работы"/><ol class="stages">${stages.map((s,i) =>
      html`<li key=${s} class=${i === p.stage ? 'current' : ''}><span>${i < p.stage ? '✓' : i+1}</span>${s}
      ${i === p.stage && html`<small>Текущий этап</small>`}</li>`)}</ol>`}
    <a class="action" href="calculator.html#calc"><${Icon} name="calc"/>Открыть калькулятор<${Icon} name="arrow"/></a>`;
}
export function Workshop() {
  const [filter,setFilter] = useState('Все');
  return html`<h1>Мастерская</h1><${Filters} options=${['Все','Инструмент','Расходники'].map(v => [v,v])} value=${filter} onChange=${setFilter}/>
    <div class="rows">${inventory.filter(t => filter === 'Все' || t.group === filter).map(t => html`
      <a key=${t.id} class="row" href=${'#shop/' + t.id}><span class="tile"><${Icon} name=${t.mark} size=${32}/></span>
      <div class="row-text"><small>${t.kind}</small><strong>${t.title}</strong><small>${t.amount}</small></div><${Icon} name="next" size=${16}/></a>`)}</div>`;
}
export function StockItem({item:t}) {
  return html`<a class="back" href="#shop"><${Icon} name="back" size=${15}/>Мастерская</a><h1>${t.title}</h1>
    <div class="stock-visual"><${Icon} name=${t.mark} size=${84}/></div><div class="panel">
    <${Facts} rows=${[['Категория',t.kind],['В наличии',t.amount],['Хранение',t.place],...(t.spec ? [['Размер',t.spec]] : [])]}/></div>`;
}
export function Progress() {
  const cash = n => fmtPrice(n / 100);
  return html`<p class="dateline">${formatDate(new Date(),{month:'long',year:'numeric'})}</p><h1>Прогресс</h1>
    <div class="finance"><small>Выручка за месяц</small><strong>${cash(totals.revenue)}</strong>
    <div>Прямые расходы <b>${cash(totals.expenses)}</b></div><div>После прямых расходов <b>${cash(totals.revenue-totals.expenses)}</b></div></div>
    <${SectionTitle} title="Личная цель"/><div class="panel goal"><${Goal} count=${totals.count}/></div>
    <${SectionTitle} title="Достижения"/><div class="row award"><span class="tile"><${Icon} name="medal" size=${30}/></span>
    <div class="row-text"><strong>Первая реставрация</strong><small>${totals.count} ${plural(totals.count,['объект завершён','объекта завершено','объектов завершено'])}</small></div></div>
    <${SectionTitle} title="Завершённые объекты"/>
    ${projects.filter(p => p.status === 'done').map(p => html`<${ProjectRow} key=${p.id} project=${p} subtitle=${'Выручка · ' + cash(p.revenue)}/>`)}`;
}
