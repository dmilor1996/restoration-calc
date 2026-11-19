import { html } from '../js/vendor/preact-htm.js';
import { Icon } from './icons.js';
import { projectStatus } from '../work/model.js';

export const sections = [
  ['today','Сегодня','today'], ['projects','Объекты','projects'],
  ['shop','Мастерская','shop'], ['progress','Прогресс','progress'], ['calculator','Калькулятор','calc'],
];
export function sectionHref(id) {
  return id === 'calculator' ? 'calculator.html#calc' : '#' + id;
}
export function Dock({active}) {
  return html`<nav class="dock" aria-label="Разделы мастерской">${sections.map(([id,label,icon]) =>
    html`<a key=${id} href=${sectionHref(id)} aria-current=${id === active ? 'page' : undefined}>
      <span><${Icon} name=${icon}/></span>${label}</a>`)}</nav>`;
}
const themes = {auto:'Системная', light:'Светлая', dark:'Тёмная'};
export function ThemePicker({theme, onChange}) {
  return html`<details class="themes"><summary aria-label="Выбрать тему"><${Icon} name="theme"/></summary>
    <fieldset><legend>Оформление</legend>${Object.entries(themes).map(([key,label]) =>
      html`<label key=${key}><input type="radio" name="theme" checked=${key === theme} onChange=${e => {
        onChange(key); e.currentTarget.closest('details').open = false;
      }}/>${label}</label>`)}</fieldset></details>`;
}
export function SectionTitle({title, href, link}) {
  return html`<div class="section-title"><h2>${title}</h2>${href && html`<a href=${href}>${link} <${Icon} name="next" size=${13}/></a>`}</div>`;
}
export function ProjectRow({project:p, subtitle}) {
  return html`<a class="row" href=${'#projects/' + p.id}>
    <img class="thumb" src=${artFor(p.type)} alt=""/>
    <div class="row-text"><strong>${p.title}</strong><small>${subtitle || projectStatus(p) + ' · ' + p.type}</small></div>
    <${Icon} name="next" size=${16}/></a>`;
}
export function Filters({options, value, onChange}) {
  return html`<div class="filters" role="group" aria-label="Фильтр списка">${options.map(([id,label]) =>
    html`<button key=${id} aria-pressed=${id === value} onClick=${() => onChange(id)}>${label}</button>`)}</div>`;
}
export function Facts({rows}) {
  return html`<dl class="facts">${rows.map(([k,v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export function artFor(type) {
  const art = {'Лестница':'steps','Подоконник':'sill'}[type] || 'table';
  return 'assets/' + art + '.webp';
}
