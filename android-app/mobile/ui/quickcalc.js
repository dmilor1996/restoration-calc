import { html, useMemo, useState } from '../js/vendor/preact-htm.js';
import { calcTotals, materialMlPerM2, renderTemplate, templateVars, usedMaterials } from '../js/calc.js';
import { defaultDraft, newItem } from '../js/defaults.js';
import { loadSettings } from '../js/store.js';
import { template, uuid } from '../work/model.js';

const parse = value => {
  const n=Number(String(value||'').trim().replace(',','.'));
  return Number.isFinite(n) && n>0?n:0;
};
const rub = n => Math.round(n).toLocaleString('ru-RU')+' ₽';
export function QuickCalc({run,notify}) {
  const [settings]=useState(loadSettings);
  const [mode,setMode]=useState('surfaces');
  const [shape,setShape]=useState('rect');
  const [length,setLength]=useState('');
  const [width,setWidth]=useState('');
  const [diameter,setDiameter]=useState('');
  const [area,setArea]=useState('');
  const [qty,setQty]=useState('1');
  const [coat,setCoat]=useState('lacquer');
  const [client,setClient]=useState('');
  const [textVisible,setTextVisible]=useState(false);
  const draft=useMemo(()=>{
    const d=defaultDraft(settings);
    const i=newItem(mode,shape,settings);
    i.qty=Math.max(1,parse(qty)||1);
    if(shape==='rect') {i.l=parse(length);i.w=parse(width);}
    else if(shape==='circle') i.d=parse(diameter);
    else i.area=parse(area);
    d.mode=mode;d.coat=coat;d[mode]=[i];
    return d;
  },[settings,mode,shape,length,width,diameter,area,qty,coat]);
  const totals=useMemo(()=>calcTotals(draft,settings),[draft,settings]);
  const templates=settings.templates||[];
  const vars=templateVars(totals,settings);
  const text=renderTemplate(templates[0]?.body || 'Стоимость реставрации: лак — {лак}, масло — {масло}.',vars);
  const total=totals.price[coat].final;
  const costMaterials=usedMaterials(draft,settings.cost,coat).filter(m=>m.volume>0).map(m=>({
    id:'quick-'+m.id,name:m.name||'Материал',kind:m.kind,unit:'мл',
    quantity:Math.round(totals.area.total*materialMlPerM2(m)*100)/100,
    unitPriceRub:Number(m.price)/(Number(m.volume)*1000),source:'estimate'
  }));
  async function copyText() {
    try { await navigator.clipboard.writeText(text);notify('Текст скопирован'); }
    catch {notify('Копирование недоступно. Выделите текст в поле ниже.');setTextVisible(true);}
  }
  function createOrder() {
    if(totals.area.total<=0)return notify('Укажите размеры или площадь.');
    const id=uuid(),price=Math.round(total*100);
    const legacy={id:'quick-'+uuid(),source:'quick',label:'Быстрый расчёт',price,
      area:Math.round(totals.area.total*1000)/1000,materials:costMaterials,
      currency:settings.currency||'₽'};
    const name=client.trim() || (mode==='stairs'?'Лестница':'Реставрация поверхности');
    run({id,rev:0},{kind:'details',title:name,type:mode==='stairs'?'Лестница':'Другая работа',
      workplace:'client',address:'',client:client.trim(),scheduled:'',note:'',
      legacy,stages:template()},'#projects/'+id);
  }
  return html`<p class="dateline">Расчёт за несколько действий</p><h1>Калькулятор</h1>
    <p class="hint">Для типовой работы нужны только размеры. Все тарифы взяты из существующего калькулятора.</p>
    <div class="editor">
      <div class="filters"><button aria-pressed=${mode==='surfaces'} onClick=${()=>setMode('surfaces')}>Поверхность</button>
        <button aria-pressed=${mode==='stairs'} onClick=${()=>setMode('stairs')}>Лестница</button></div>
      <div class="filters">
        ${[['rect','Прямоугольник'],['circle','Круг'],['custom','Известная площадь']].map(([key,label])=>
          html`<button key=${key} aria-pressed=${shape===key} onClick=${()=>setShape(key)}>${label}</button>`)}
      </div>
      ${shape==='rect' ? html`<div class="pair">
        <label class="field-label">Длина, мм<input inputmode="decimal" value=${length} placeholder="1500" onInput=${e=>setLength(e.target.value)}/></label>
        <label class="field-label">Ширина, мм<input inputmode="decimal" value=${width} placeholder="600" onInput=${e=>setWidth(e.target.value)}/></label>
      </div>` : shape==='circle'?html`<label class="field-label">Диаметр, мм<input inputmode="decimal" value=${diameter} placeholder="1000" onInput=${e=>setDiameter(e.target.value)}/></label>`
      :html`<label class="field-label">Площадь, м²<input inputmode="decimal" value=${area} placeholder="1,5" onInput=${e=>setArea(e.target.value)}/></label>`}
      <label class="field-label">Количество одинаковых изделий<input inputmode="numeric" type="number" min="1" max="999" step="1" value=${qty} onInput=${e=>setQty(e.target.value)}/></label>
      <div class="filters"><button aria-pressed=${coat==='lacquer'} onClick=${()=>setCoat('lacquer')}>Лак</button>
        <button aria-pressed=${coat==='oil'} onClick=${()=>setCoat('oil')}>Масло</button></div>
      <div class="quick-total"><small>Площадь · ${totals.area.total.toLocaleString('ru-RU',{maximumFractionDigits:3})} м²</small>
        <strong>${totals.area.total>0?rub(total):'Укажите размеры'}</strong>
        <span>Лак ${rub(totals.price.lacquer.final)} · Масло ${rub(totals.price.oil.final)}</span></div>
      <label class="field-label">Название / клиент для заказа (необязательно)<input value=${client} onInput=${e=>setClient(e.target.value)} placeholder="Например: столешница Анны"/></label>
      <button class="primary" disabled=${totals.area.total<=0} onClick=${createOrder}>Создать заказ по расчёту</button>
      <button class="secondary full" disabled=${totals.area.total<=0} onClick=${()=>setTextVisible(v=>!v)}>${textVisible?'Скрыть текст для клиента':'Показать текст для клиента'}</button>
      ${textVisible && html`<div class="panel"><textarea class="quote-text" readOnly value=${text}></textarea>
        <button class="secondary full" onClick=${copyText}>Копировать текст</button></div>`}
      <a class="secondary full" href="calculator.html#calc">Подробный расчёт: торцы, морилка, выезд и дополнительные работы</a>
      <p class="hint">Для сложных форм и корректировок используйте подробный калькулятор. Сайт и его расчёты сохранены без изменений.</p>
    </div>`;
}
