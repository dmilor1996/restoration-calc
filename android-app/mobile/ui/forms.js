import { html, useRef, useState } from '../js/vendor/preact-htm.js';
import { parseMoney, template, types, uuid, visitStats, duration, materialRows, expenseSummary, projectStats } from '../work/model.js';
import { availableOrders } from '../work/legacy.js';
import { exportFile } from '../work/files.js';
import { parseBackup } from '../work/backup.js';

export const pathFor = p => '#projects/' + p.id;
export const dayText = ms => new Date(ms).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
export function localDate(ms = Date.now()) {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
export function Back({href,label}) { return html`<a class="back" href=${href}>‹　${label}</a>`; }
function Field({label,children}) { return html`<label class="field-label"><span>${label}</span>${children}</label>`; }
const values = e => { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget)); };


export function ProjectForm({p,projects,run}) {
  const identity=useRef({id:p?.id || uuid(),rev:p?.rev || 0}).current;
  const [type,setType]=useState(p?.type || 'Другая работа');
  const [workplace,setWorkplace]=useState(p?.workplace || 'client');
  const [orderId,setOrderId]=useState(p?.legacy?.id || '');
  const [orders]=useState(()=>availableOrders().filter(o=>!projects.some(other=>other.id!==p?.id && other.legacy?.id===o.id)));
  const choices=p?.legacy && !orders.some(o=>o.id===p.legacy.id)?[p.legacy,...orders]:orders;
  function submit(e) {
    const f=values(e);
    const legacy=orderId && orderId===p?.legacy?.id?p.legacy:choices.find(o=>o.id===orderId)||null;
    const command={kind:'details',title:f.title||'',type,workplace,
      address:(f.address||'').trim(),client:(f.client||'').trim(),note:(f.note||'').trim(),
      scheduled:f.scheduled||'',legacy,stages:p?.stages||template()};
    run(identity,command,'#projects/'+identity.id);
  }
  return html`<${Back} href=${p?pathFor(p):'#projects'} label="Заказы"/>
    <h1>${p?'Редактировать заказ':'Новый заказ'}</h1>
    <p class="hint">Для начала достаточно названия. Расчёт, клиент и детали необязательны.</p>
    <form class="editor" onSubmit=${submit}>
      <${Field} label="Название или краткое описание">
        <input name="title" maxlength="200" defaultValue=${p?.title==='Новый заказ'?'':p?.title||''}
          placeholder="Например: дубовая столешница" autocomplete="off"/><//>
      <${Field} label="Где выполняется работа">
        <select value=${workplace} onChange=${e=>setWorkplace(e.target.value)}>
          <option value="client">У клиента · с выездом</option><option value="workshop">В мастерской · без выезда</option>
        </select><//>
      <details class="fold" open=${!!p?.legacy}>
        <summary>Привязать готовый расчёт (по желанию)</summary>
        <p class="hint">Если цена и площадь уже рассчитаны в калькуляторе, выберите сохранённый заказ. Мы перенесём плановую стоимость и примерный расход покрытия. Можно также работать без расчёта.</p>
        <${Field} label="Расчёт из калькулятора">
          <select value=${orderId} onChange=${e=>setOrderId(e.target.value)}>
            <option value="">Без привязки</option>
            ${choices.map(o=>html`<option key=${o.id} value=${o.id}>${o.label}${o.area?' · '+o.area+' м²':''}${o.price!==null?' · '+(o.price/100).toLocaleString('ru-RU')+' ₽':''}</option>`)}
          </select><//>
        <a class="secondary full" href="calculator.html#calc">Открыть подробный калькулятор</a>
      </details>
      <details class="fold" open=${!!(p?.address||p?.client||p?.scheduled||p?.note)}>
        <summary>Клиент и детали заказа (необязательно)</summary>
        <${Field} label="Клиент / контакт"><input name="client" defaultValue=${p?.client||''} placeholder="Имя или телефон"/><//>
        <${Field} label=${workplace==='client'?'Адрес клиента':'Адрес / место хранения (по желанию)'}>
          <input name="address" defaultValue=${p?.address||''} placeholder="Можно добавить позже"/><//>
        <${Field} label="Плановая дата"><input name="scheduled" type="date" defaultValue=${p?.scheduled||''}/><//>
        <${Field} label="Заметки"><textarea name="note" defaultValue=${p?.note||''}/><//>
        <${Field} label="Категория для поиска и статистики">
          <select value=${type} onChange=${e=>setType(e.target.value)}>
            ${types.map(t=>html`<option key=${t} value=${t}>${t}</option>`)}
          </select><//>
        <p class="hint">Категория не ограничивает этапы работы. Любой этап можно выбрать позже во время заказа.</p>
      </details>
      <button class="primary">${p?'Сохранить заказ':'Создать заказ'}</button>
    </form>`;
}

export function FinanceForm({p,finish,run,reportError}) {
  const snapshot=useRef(p).current;
  const [method,setMethod]=useState(snapshot.paymentMethod || 'unknown');
  const [buyer,setBuyer]=useState(snapshot.clientKind || 'person');
  const summary=expenseSummary(snapshot);
  const costs=projectStats(snapshot);
  function submit(e) {
    const f=values(e);
    try {
      const command={kind:finish?'finish':'finance',received:parseMoney(f.received),
        paymentMethod:method,clientKind:buyer};
      if (snapshot.expenseMode==='items') command.otherExpenses=parseMoney(f.extraExpenses);
      else command.expenses=parseMoney(f.extraExpenses);
      run(snapshot,command,pathFor(p));
    } catch(error) {reportError(error); }
  }
  return html`<${Back} href=${pathFor(p)} label=${p.title}/>
    <h1>${finish?'Завершение заказа':'Финансовый итог'}</h1>
    <p class="hint">Можно сохранить только полученную сумму, а расходы уточнить позднее.</p>
    <form class="editor" onSubmit=${submit}>
      <${Field} label="Получено от клиента всего, ₽">
        <input name="received" inputmode="decimal" placeholder="Можно заполнить позже"
          defaultValue=${snapshot.received===null?'':snapshot.received/100}/><//>
      <${Field} label="Способ оплаты">
        <select value=${method} onChange=${e=>setMethod(e.target.value)}>
          <option value="unknown">Не указан</option><option value="cash">Наличные</option>
          <option value="transfer">Перевод</option><option value="card">Картой</option>
        </select><//>
      <${Field} label="Кто заказчик">
        <select value=${buyer} onChange=${e=>setBuyer(e.target.value)}>
          <option value="person">Физическое лицо · НПД 4%</option>
          <option value="business">ИП или организация · НПД 6%</option>
        </select><//>
      <div class="panel">
        <strong>Материалы и расходники</strong>
        <p class="hint">Покрытие рассчитывается предварительно по привязанному расчёту. Абразивные диски и реальный расход указываются отдельно.</p>
        <${FactsSummary} summary=${summary}/>
        <a class="secondary full" href=${pathFor(p)+'/materials'}>Указать расход материалов и дисков</a>
      </div>
      <${Field} label=${snapshot.expenseMode==='items'?'Прочие расходы, ₽':'Ранее введённые прямые расходы, ₽'}>
        <input name="extraExpenses" inputmode="decimal" placeholder="Например: покупка в процессе работы"
          defaultValue=${snapshot.expenseMode==='items'
            ? snapshot.extraExpenses===null?'':snapshot.extraExpenses/100
            : snapshot.expenses===null?'':snapshot.expenses/100}/><//>
      <p class="hint">Оценочный НПД: ${buyer==='person'?'4%':'6%'} от поступлений независимо от наличных или перевода. Фактический налог рассчитывается в «Мой налог» с учётом возможного вычета.</p>
      <button class="primary">${finish?'Завершить заказ':'Сохранить финансы'}</button>
    </form>`;
}
function FactsSummary({summary}) {
  return html`<p class="hint">Расход покрытия: ${summary.materials===null?'неизвестен':(summary.estimated?'≈ ':'')+(summary.materials/100).toLocaleString('ru-RU')+' ₽'}
    ${summary.rows.length?'· '+summary.rows.length+' поз.':''}</p>`;
}

export function MaterialsForm({p,run,reportError}) {
  const [rows,setRows]=useState(()=>materialRows(p).map(r=>({...r})));
  const [extra,setExtra]=useState(p.expenseMode==='items'?(p.extraExpenses===null?'':p.extraExpenses/100):'');
  const add=(name='Абразивный диск',unit='шт')=>setRows(v=>[...v,{id:uuid(),name,kind:'manual',unit,quantity:1,unitPriceRub:0,source:'manual'}]);
  const changeRow=(id,key,value)=>setRows(v=>v.map(r=>r.id===id?{...r,[key]:value}:r));
  function submit(e) {
    e.preventDefault();
    try {
      const converted=rows.map(r=>{
        const quantity=Number(String(r.quantity).replace(',','.'));
        const unitPriceRub=Number(String(r.unitPriceRub).replace(',','.'));
        return {...r,quantity,unitPriceRub};
      });
      const amount=parseMoney(extra);
      // The two saves are intentional: materials and extra expenses are separate independent revisions.
      run(p,{kind:'materials',materials:converted},pathFor(p),{extraExpenses:amount});
    } catch(error) { reportError(error); }
  }
  const sum=rows.reduce((n,r)=>n+(Number(r.quantity)||0)*(Number(r.unitPriceRub)||0),0);
  return html`<${Back} href=${pathFor(p)} label=${p.title}/><h1>Расход материалов</h1>
    <p class="hint">Заполни только значимые материалы. Количество и цену можно исправить позже. Эти записи пока не списывают реальный склад.</p>
    <form class="editor" onSubmit=${submit}>
      ${rows.map((r,i)=>html`<div key=${r.id} class="panel material-row">
        <div class="material-head"><strong>${i+1}. ${r.source==='estimate'?'По расчёту':'Материал'}</strong>
          <button type="button" class="text-action" onClick=${()=>setRows(v=>v.filter(x=>x.id!==r.id))}>Удалить</button></div>
        <${Field} label="Название"><input value=${r.name} maxlength="150" onInput=${e=>changeRow(r.id,'name',e.target.value)}/><//>
        <div class="material-grid">
          <${Field} label="Количество"><input inputmode="decimal" type="number" min="0" step="any"
            value=${r.quantity} onInput=${e=>changeRow(r.id,'quantity',e.target.value)}/><//>
          <${Field} label="Ед."><select value=${r.unit} onChange=${e=>changeRow(r.id,'unit',e.target.value)}>
            ${['шт','мл','г','л','кг'].map(u=>html`<option value=${u}>${u}</option>`)}</select><//>
        </div>
        <${Field} label=${'Цена за 1 '+r.unit+', ₽'}>
          <input type="number" inputmode="decimal" min="0" step="any"
            value=${r.unitPriceRub} onInput=${e=>changeRow(r.id,'unitPriceRub',e.target.value)}/><//>
      </div>`)}
      <div class="choices">
        <button type="button" class="secondary" onClick=${()=>add()}>+ Абразивный диск</button>
        <button type="button" class="secondary" onClick=${()=>add('Другой материал','шт')}>+ Другой материал</button>
        <button type="button" class="secondary" onClick=${()=>add('Лак или масло','мл')}>+ Лак / масло</button>
      </div>
      <${Field} label="Другие разовые расходы, ₽">
        <input inputmode="decimal" name="extra" placeholder="Необязательно"
          value=${extra} onInput=${e=>setExtra(e.target.value)}/><//>
      <div class="panel"><strong>Материалы: ${sum.toLocaleString('ru-RU',{maximumFractionDigits:2})} ₽</strong>
        <p class="hint">Это фактические записи. Проверь количество дисков и мл покрытия до сохранения.</p></div>
      <button class="primary">Сохранить расход</button>
    </form>`;
}
export function VisitForm({p,v,run,reportError}) {
  const snapshot = useRef(p).current;
  const stats = v && visitStats(v);
  const previous = stats && Math.round(stats.active/60000);
  const back = pathFor(p);
  function submit(e) {
    const f = values(e);
    const mins = Number(f.hours || 0)*60 + Number(f.minutes || 0);
    if (!f.hours && !f.minutes) return reportError(Error('Укажите длительность. Для нулевого времени введите 0.'));
    if (v) run(snapshot,{kind:'correct',visitId:v.id,minutes:mins},back);
    else {
      const date = new Date(f.date+'T00:00:00').getTime();
      run(snapshot,{kind:'manual',date,minutes:mins},back);
    }
  }
  return html`<${Back} href=${back} label=${p.title}/><h1>${v ? 'Исправить время' : 'Записать выезд'}</h1>
    <p class="hint">${v ? dayText(v.startedAt)+' · '+(v.manual ? 'Ручная запись' : 'По таймеру '+duration(stats.measured,true)) : 'Для работы, которую выполнили без таймера.'}</p>
    <form class="editor" onSubmit=${submit}>
    ${!v && html`<${Field} label="Дата работы"><input required type="date" name="date" max=${localDate()} defaultValue=${localDate()}/><//>`}
    <p>Активная работа без дороги и сушки</p><div class="pair">
    <${Field} label="Часы"><input type="number" min="0" step="1" name="hours" inputmode="numeric" defaultValue=${v ? Math.floor(previous/60) : ''}/><//>
    <${Field} label="Минуты"><input type="number" min="0" max="59" step="1" name="minutes" inputmode="numeric" defaultValue=${v ? previous%60 : ''}/><//></div>
    <button class="primary">Сохранить время</button></form>
    ${v && !v.manual && stats.corrected !== null && html`<button class="secondary" onClick=${()=>run(snapshot,{kind:'correct',visitId:v.id,minutes:null},back)}>Вернуть время таймера</button>`}`;
}
export function Backup({restore,notify,reportError}) {
  const [file,setFile] = useState(null), [busy,setBusy] = useState(false);
  async function select(e) {
    const f = e.target.files[0]; e.target.value=''; setFile(null);
    if (!f) return;
    try { const raw = await f.text(); const records = parseBackup(raw); setFile({raw,count:records.length,name:f.name}); }
    catch(error) { reportError(error); }
  }
  async function perform(fn) {
    setBusy(true); try { await fn(); } catch(error) { reportError(error); } finally { setBusy(false); }
  }
  return html`<${Back} href="#projects" label="Объекты"/><h1>Резервная копия</h1>
    <p class="hint">Объекты, выезды и итоги хранятся на телефоне. Сохраните копию перед сменой устройства. У калькулятора отдельный экспорт.</p>
    <button class="primary" disabled=${busy} onClick=${()=>perform(async()=>{await exportFile();notify('Копия подготовлена');})}>Сохранить в файл</button>
    <div class="panel spaced"><h2>Восстановление</h2><p>Добавятся отсутствующие объекты. Уже имеющиеся записи сохранятся в текущей версии.</p>
    <label class="secondary file-button">Выбрать файл<input type="file" accept=".json,application/json" disabled=${busy} onChange=${select}/></label>
    ${file && html`<p>${file.name} · Объектов в копии: ${file.count}</p><button class="primary" disabled=${busy} onClick=${()=>perform(async()=>{
      const result=await restore(file.raw);setFile(null);notify('Добавлено: '+result.added+' · Пропущено: '+result.skipped);
    })}>Восстановить объекты</button>`}</div>`;
}
