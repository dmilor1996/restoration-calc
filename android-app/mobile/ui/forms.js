import { html, useRef, useState } from '../js/vendor/preact-htm.js';
import { parseMoney, payments, template, types, uuid, visitStats, duration } from '../work/model.js';
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
  const identity = useRef({id:p?.id || uuid(),rev:p?.rev || 0}).current;
  const [type,setType] = useState(p?.type || types[0]);
  const [stageText,setStageText] = useState((p?.stages || template(type)).join('\n'));
  const [orderId,setOrderId] = useState(p?.legacy?.id || '');
  const [orders] = useState(() => availableOrders().filter(o => !projects.some(other => other.id !== p?.id && other.legacy?.id === o.id)));
  const choices = p?.legacy && !orders.some(o => o.id === p.legacy.id) ? [p.legacy,...orders] : orders;
  function submit(e) {
    const f = values(e);
    const legacy = orderId && orderId === p?.legacy?.id ? p.legacy : choices.find(o => o.id === orderId) || null;
    const command = {kind:'details',title:f.title,type,address:f.address.trim(),client:f.client.trim(),
      note:f.note.trim(),scheduled:f.scheduled,legacy,stages:stageText.split('\n').map(s=>s.trim()).filter(Boolean)};
    run(identity,command,'#projects/' + identity.id);
  }
  const changeType = v => {
    if (stageText === template(type).join('\n')) setStageText(template(v).join('\n'));
    setType(v);
  };
  return html`<${Back} href=${p ? pathFor(p) : '#projects'} label="Объекты"/>
    <h1>${p ? 'Редактировать объект' : 'Новый объект'}</h1>
    <form class="editor" onSubmit=${submit}>
      <${Field} label="Название"><input name="title" maxlength="200" defaultValue=${p?.title || ''} placeholder=${type}/><//>
      <${Field} label="Тип работы"><select value=${type} onChange=${e=>changeType(e.target.value)}>${types.map(t=>html`<option key=${t}>${t}</option>`)}</select><//>
      <details class="fold" open=${p && !!(p.legacy || p.scheduled || p.address || p.client || p.note)}>
        <summary>Клиент, выезд и расчёт</summary>
        <${Field} label="Сохранённый расчёт"><select aria-label="Сохранённый расчёт" value=${orderId} onChange=${e=>setOrderId(e.target.value)}>
          <option value="">Без расчёта</option>${choices.map(o=>html`<option key=${o.id} value=${o.id}>${o.label}</option>`)}</select><//>
        <${Field} label="Клиент или контакт"><input name="client" defaultValue=${p?.client || ''}/><//>
        <${Field} label="Адрес"><input name="address" defaultValue=${p?.address || ''}/><//>
        <${Field} label="Дата выезда"><input name="scheduled" type="date" defaultValue=${p?.scheduled || ''}/><//>
        <${Field} label="Заметки к работе"><textarea name="note" defaultValue=${p?.note || ''}/><//>
      </details>
      <details class="fold"><summary>Этапы работы</summary><${Field} label="По одному этапу на строку"><textarea rows="8" value=${stageText} onInput=${e=>setStageText(e.target.value)}/><//></details>
      <button class="primary">${p ? 'Сохранить изменения' : 'Создать объект'}</button>
    </form>`;
}
export function FinanceForm({p,finish,run,reportError}) {
  const snapshot = useRef(p).current;
  const [payment,setPayment] = useState(snapshot.payment);
  const [precision,setPrecision] = useState(snapshot.estimated ? 'estimated' : 'exact');
  function submit(e) {
    const f=values(e);
    try {
      run(snapshot,{kind:finish ? 'finish':'finance',received:parseMoney(f.received),expenses:parseMoney(f.expenses),
        estimated:precision === 'estimated',payment},pathFor(p));
    } catch (error) { reportError(error); }
  }
  return html`<${Back} href=${pathFor(p)} label=${p.title}/><h1>${finish ? 'Завершение заказа' : 'Фактические суммы'}</h1>
    <p class="hint">Суммы за весь заказ с учётом предоплаты. Можно заполнить позже.</p>
    <form class="editor" onSubmit=${submit}>
    <${Field} label="Получено всего, ₽"><input name="received" inputmode="decimal" placeholder="Не указано" defaultValue=${snapshot.received === null ? '' : snapshot.received/100}/><//>
    <${Field} label="Прямые расходы, ₽"><input name="expenses" inputmode="decimal" placeholder="Не указано" defaultValue=${snapshot.expenses === null ? '' : snapshot.expenses/100}/><//>
    <${Field} label="Точность расходов"><select aria-label="Точность расходов" value=${precision} onChange=${e=>setPrecision(e.target.value)}><option value="estimated">Приблизительно</option><option value="exact">Точно</option></select><//>
    <${Field} label="Оплата"><select aria-label="Оплата" value=${payment} onChange=${e=>setPayment(e.target.value)}>${payments.map(x=>html`<option key=${x} value=${x}>${x}</option>`)}</select><//>
    <button class="primary">${finish ? 'Завершить заказ' : 'Сохранить суммы'}</button></form>`;
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
