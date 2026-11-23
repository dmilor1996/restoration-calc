import { html, useState } from '../js/vendor/preact-htm.js';
import { inventory } from './demo.js';
import { Facts, Filters } from './components.js';
import { Icon } from './icons.js';

export function Workshop() {
  const [filter,setFilter] = useState('Все');
  return html`<h1>Мастерская</h1><a class="primary" href="#shop/recipes">Материалы для замеса</a><p class="hint">Инструменты и остатки ниже — демонстрационные.</p><${Filters} options=${['Все','Инструмент','Расходники'].map(v => [v,v])} value=${filter} onChange=${setFilter}/>
    <div class="rows">${inventory.filter(t => filter === 'Все' || t.group === filter).map(t => html`
      <a key=${t.id} class="row" href=${'#shop/' + t.id}><span class="tile"><${Icon} name=${t.mark} size=${32}/></span>
      <div class="row-text"><small>${t.kind}</small><strong>${t.title}</strong><small>${t.amount}</small></div><${Icon} name="next" size=${16}/></a>`)}</div>`;
}
export function StockItem({item:t}) {
  return html`<a class="back" href="#shop"><${Icon} name="back" size=${15}/>Мастерская</a><h1>${t.title}</h1>
    <div class="stock-visual"><${Icon} name=${t.mark} size=${84}/></div><div class="panel">
    <${Facts} rows=${[['Категория',t.kind],['В наличии',t.amount],['Хранение',t.place],...(t.spec ? [['Размер',t.spec]] : [])]}/></div>`;
}
