import { html, render, useState, useEffect, useRef, useMemo } from './vendor/preact-htm.js';
import {
  num, itemGeometry, shapeSides, shapeOutline, sectionArea, calcTotals, calcCost, travelPlan, factSummary, sortedTiers,
  materialsOfKind, pickMaterial, materialCostPerM2,
  templateVars, templateParts, usedKeys, normKey,
  fmtArea, fmtInt, fmtNum, fmtPrice, plural,
} from './calc.js';
import { uid, newItem, defaultDraft, normalizeSettings, normalizeDraft, DEFAULT_TEMPLATES } from './defaults.js';
import {
  loadSettings, saveSettings, loadDraft, saveDraft, loadOrders, saveOrders, loadTheme, saveTheme,
  cloudConfigured, initCloud, pushSettings, pushOrder, signIn, signOutCloud,
} from './store.js';
import { Icon, Num, Text, Stepper, Switch, AutoText, copyText } from './ui.js';
import { Diagram, PolyEditor } from './diagram.js';
import { NormPanel, CostPage, FactModal, StatsPage } from './cost.js';

// ── Справочники ─────────────────────────────────────────────────

const SHAPES = [
  { id: 'rect', label: 'Прямоугольник' },
  { id: 'circle', label: 'Круг' },
  { id: 'trap', label: 'Трапеция' },
  { id: 'poly', label: 'Своя форма' },
  { id: 'custom', label: 'Площадь' },
];

const KINDS = {
  surfaces: {
    title: 'Поверхности',
    hint: 'Столешницы, столы, подоконники',
    icon: 'rect',
    names: { rect: 'Столешница', circle: 'Круглый стол', trap: 'Трапеция', poly: 'Своя форма', custom: 'Известная площадь' },
    fields: {
      rect: [['l', 'Длина'], ['w', 'Ширина']],
      circle: [['d', 'Диаметр']],
      trap: [['h', 'Длина'], ['a', 'Сторона A'], ['b', 'Сторона B']],
      trap4: [['a', 'Сторона A'], ['b', 'Сторона B'], ['s1', 'Грань сверху'], ['s2', 'Грань снизу']],
    },
    add: [['rect', 'Прямоугольная'], ['circle', 'Круглая'], ['trap', 'Трапеция'], ['poly', 'Своя форма']],
  },
  stairs: {
    title: 'Лестница',
    hint: 'Ступени, площадки, подступенки',
    icon: 'stairs',
    names: { rect: 'Прямые ступени', circle: 'Круглая площадка', trap: 'Забежные ступени', poly: 'Ступени своей формы', custom: 'Известная площадь' },
    fields: {
      rect: [['l', 'Длина'], ['w', 'Глубина']],
      circle: [['d', 'Диаметр']],
      trap: [['h', 'Длина'], ['a', 'Узкий край'], ['b', 'Широкий край']],
      trap4: [['a', 'Узкий край'], ['b', 'Широкий край'], ['s1', 'Грань сверху'], ['s2', 'Грань снизу']],
    },
    add: [['rect', 'Прямые ступени'], ['trap', 'Трапециевидные'], ['poly', 'Своя форма']],
  },
};

const COAT_LABEL = { lacquer: 'Лак', oil: 'Масло-воск' };

/** Телефон в международном виде без знаков: «8 (999) 123-45-67» → «79991234567». */
function phoneDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length >= 11 ? d : '';
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ── Карточка позиции ────────────────────────────────────────────

function ItemCard({ item, kind, index, onChange, onDelete, onDuplicate, onEditPoly }) {
  const K = KINDS[kind];
  const g = itemGeometry(item);
  const set = (key) => (v) => onChange((it) => { it[key] = v; });
  const sides = shapeSides(item);
  const allOn = sides.length > 0 && sides.every((s) => s.on);
  const anyOn = sides.some((s) => s.on);
  const isCustom = item.shape === 'custom';
  const isPoly = item.shape === 'poly';
  const hasPoly = isPoly && (item.pts || []).length >= 3;
  const outline = item.shape === 'trap' ? shapeOutline(item) : null;
  const badTrap = !!(outline && !outline.valid && outline.filled);

  const setShape = (shape) => {
    onChange((it) => {
      const keep = ['rect', 'trap'].includes(it.shape) && ['rect', 'trap'].includes(shape);
      if (!keep) it.edges = {};
      it.shape = shape;
    });
    if (shape === 'poly' && !hasPoly) onEditPoly();
  };
  const toggleEdge = (id) => onChange((it) => {
    if (it.shape === 'poly') { const p = it.pts[Number(id)]; if (p) p.e = !p.e; }
    else it.edges = { ...(it.edges || {}), [id]: !it.edges?.[id] };
  });
  const setAll = (on) => onChange((it) => {
    if (it.shape === 'poly') it.pts.forEach((p) => { p.e = on; });
    else it.edges = on ? Object.fromEntries(shapeSides(it).map((s) => [s.id, true])) : {};
  });
  // Переход между «длина + 2 стороны» и «4 грани»: размеры пересчитываются, чтобы фигура не менялась.
  const toggleFour = () => onChange((it) => {
    if (!it.four) {
      const leg = Math.round(Math.hypot(num(it.h), (num(it.a) - num(it.b)) / 2));
      if (leg > 0) { if (!num(it.s1)) it.s1 = leg; if (!num(it.s2)) it.s2 = leg; }
    } else {
      const o = shapeOutline(it);
      if (o.valid) it.h = Math.round(o.pts[1].x);
    }
    it.four = !it.four;
  });

  const fields = item.shape === 'trap' && item.four ? K.fields.trap4 : K.fields[item.shape];
  const hint = badTrap ? 'Из таких размеров фигура не складывается — проверьте грани'
    : anyOn ? 'Выделенные грани войдут в расчёт' : 'Нажмите на грани, которые нужно обработать';

  return html`
    <article class="item">
      <header class="item__head">
        <span class="item__idx">${String(index + 1).padStart(2, '0')}</span>
        <input class="item__name" type="text" value=${item.name} placeholder=${K.names[item.shape]}
          aria-label="Название позиции" onInput=${(e) => set('name')(e.target.value)} />
        <div class="item__tools">
          <button type="button" class="icon-btn" title="Дублировать" aria-label="Дублировать" onClick=${onDuplicate}>${Icon.dup()}</button>
          <button type="button" class="icon-btn" title="Удалить" aria-label="Удалить" onClick=${onDelete}>${Icon.x()}</button>
        </div>
      </header>

      <div class="shape-seg" role="radiogroup" aria-label="Форма">
        ${SHAPES.map((s) => html`
          <button type="button" role="radio" aria-checked=${item.shape === s.id ? 'true' : 'false'} title=${s.label}
            class=${'shape-seg__btn' + (item.shape === s.id ? ' is-on' : '')} onClick=${() => setShape(s.id)}>
            ${Icon[s.id]()}<span>${s.label}</span>
          </button>`)}
      </div>

      <div class=${'item__body' + (isCustom ? ' item__body--flat' : '')}>
        <div class="item__fields">
          ${isCustom ? html`
            <div class="fields">
              <${Num} label="Площадь" suffix="м²" decimal value=${item.area} onChange=${set('area')} placeholder="0,00" />
              <${Num} label="Длина торцов" suffix="мм" value=${item.edgeLen} onChange=${set('edgeLen')} />
            </div>` : null}
          ${fields ? html`
            <div class="fields">
              ${fields.map(([key, label]) => html`
                <${Num} key=${key} label=${label} suffix="мм" value=${item[key]} onChange=${set(key)} />`)}
            </div>` : null}
          ${isPoly ? html`
            <button type="button" class="adder adder--wide" onClick=${onEditPoly}>
              ${Icon.pen()}<span>${hasPoly ? 'Изменить форму' : 'Нарисовать форму'}</span>
            </button>` : null}
          <div class="fields">
            <${Stepper} label="Количество" value=${item.qty} onChange=${set('qty')} />
            <${Num} label="Толщина торца" suffix="мм" value=${item.thickness} onChange=${set('thickness')} />
          </div>
          <div class="chips">
            ${item.shape === 'trap' ? html`
              <button type="button" class=${'chip' + (item.four ? ' is-on' : '')} aria-pressed=${item.four ? 'true' : 'false'}
                onClick=${toggleFour}>4 разные грани</button>` : null}
            ${!isCustom && (!isPoly || hasPoly) ? html`
              <button type="button" class=${'chip' + (allOn ? ' is-on' : '')} aria-pressed=${allOn ? 'true' : 'false'}
                onClick=${() => setAll(!allOn)}>${item.shape === 'circle' ? 'Торец по кругу' : 'Все торцы'}</button>` : null}
            <button type="button" class=${'chip' + (item.bothSides ? ' is-on' : '')} aria-pressed=${item.bothSides ? 'true' : 'false'}
              onClick=${() => set('bothSides')(!item.bothSides)}>Обе стороны</button>
          </div>
        </div>

        ${!isCustom ? html`
          <div class="item__diagram">
            ${isPoly && !hasPoly
              ? html`<button type="button" class="item__draw" onClick=${onEditPoly}>${Icon.poly()}<span>Форма не задана</span></button>`
              : html`<${Diagram} item=${item} onToggle=${toggleEdge} />`}
            ${!isPoly || hasPoly ? html`<p class=${'item__hint' + (badTrap ? ' is-bad' : '')}>${hint}</p>` : null}
          </div>` : null}
      </div>

      <footer class="item__foot">
        <div class="item__parts">
          <span>Поверхность <b>${fmtArea(g.face)}</b></span>
          ${g.edge > 0 ? html`<span>Торцы <b>${fmtArea(g.edge)}</b> <i>(${fmtNum(g.edgeLen / 1000, 2)} м)</i></span>` : null}
          ${g.qty !== 1 ? html`<span>× <b>${fmtInt(g.qty)}</b> шт</span>` : null}
        </div>
        <div class="item__total">${fmtArea(g.total)}<small>м²</small></div>
      </footer>
    </article>`;
}

// ── Раздел (поверхности / лестница) ─────────────────────────────

function Section({ no, kind, items, settings, upDraft, withUndo, onEditPoly }) {
  const K = KINDS[kind];
  const area = sectionArea(items);
  const count = items.reduce((s, it) => s + num(it.qty), 0);
  const add = (shape) => {
    const it = newItem(kind, shape, settings);
    upDraft((d) => { d[kind].push(it); });
    if (shape === 'poly') onEditPoly(kind, it.id);
  };
  const meta = kind === 'stairs' && count > 0
    ? `${fmtInt(count)} ${plural(count, ['ступень', 'ступени', 'ступеней'])}`
    : K.hint;

  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title">
          <h2>${K.title}</h2>
          <p>${meta}</p>
        </div>
        <div class=${'section__area' + (area ? '' : ' is-empty')}>${fmtArea(area)}<small>м²</small></div>
      </header>

      <div class="items">
        ${items.map((item, i) => html`
          <${ItemCard} key=${item.id} item=${item} kind=${kind} index=${i}
            onEditPoly=${() => onEditPoly(kind, item.id)}
            onChange=${(fn) => upDraft((d) => { const it = d[kind].find((x) => x.id === item.id); if (it) fn(it); })}
            onDuplicate=${() => upDraft((d) => {
              const at = d[kind].findIndex((x) => x.id === item.id);
              d[kind].splice(at + 1, 0, { ...structuredClone(item), id: uid() });
            })}
            onDelete=${() => { withUndo('Позиция удалена'); upDraft((d) => { d[kind] = d[kind].filter((x) => x.id !== item.id); }); }} />`)}
      </div>

      <div class="adders">
        ${K.add.map(([shape, label]) => html`
          <button type="button" class="adder" onClick=${() => add(shape)}>
            ${Icon[shape]()}<span>${label}</span>${Icon.plus()}
          </button>`)}
      </div>
    </section>`;
}

// ── Что считаем: поверхности или лестница ────────────────────────

function ModeSwitch({ draft, settings, upDraft }) {
  const pick = (key) => upDraft((d) => {
    d.mode = key;
    if (!d[key].length) d[key].push(newItem(key, 'rect', settings));
  });
  return html`
    <div class="seg seg--mode" role="radiogroup" aria-label="Что считаем">
      ${['surfaces', 'stairs'].map((key) => html`
        <button type="button" role="radio" aria-checked=${draft.mode === key ? 'true' : 'false'}
          class=${'seg__btn' + (draft.mode === key ? ' is-on' : '')} onClick=${() => pick(key)}>
          ${Icon[KINDS[key].icon]()}<span>${KINDS[key].title}</span>
        </button>`)}
    </div>`;
}

// ── Покрытие: что было, чем покрываем, покраска ──────────────────

function Finish({ no, draft, settings, upDraft }) {
  const cost = settings.cost, cur = settings.currency;
  const coat = draft.coat === 'lacquer' ? 'lacquer' : 'oil';
  const list = materialsOfKind(cost, coat);
  const sel = pickMaterial(cost, coat, draft.finish?.[coat]);
  const stainList = materialsOfKind(cost, 'stain');
  const stainSel = pickMaterial(cost, 'stain', draft.stain?.id);
  const stainOn = !!draft.stain?.on;
  const k = num(cost.time.sandLacquerK);
  const matChips = (items, selId, onPick) => html`
    <div class="chips chips--mat">
      ${items.map((m) => html`
        <button type="button" key=${m.id} class=${'chip' + (selId === m.id ? ' is-on' : '')} aria-pressed=${selId === m.id ? 'true' : 'false'}
          onClick=${() => onPick(m.id)}>${m.name || 'Материал'} <i>${fmtInt(materialCostPerM2(m))} ${cur}/м²</i></button>`)}
    </div>`;
  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title"><h2>Покрытие</h2><p>От этого зависят время, материалы и ваша прибыль</p></div>
      </header>
      <div class="card finish">
        <div class="setting">
          <div><h3>Сейчас на поверхности</h3>
            <p>${k > 1 ? `Старый лак шлифуется в ${fmtNum(k)} раза дольше масла` : 'От этого зависит время шлифовки'}</p></div>
          <div class="seg">
            ${[['oil', 'Масло'], ['lacquer', 'Лак']].map(([v, l]) => html`
              <button type="button" class=${'seg__btn' + (draft.current === v ? ' is-on' : '')} onClick=${() => upDraft((d) => { d.current = v; })}>${l}</button>`)}
          </div>
        </div>
        <hr class="rule" />
        <div class="setting">
          <div><h3>Покрываем</h3><p>Для чего считаем себестоимость и прибыль</p></div>
          <div class="seg">
            ${[['oil', 'Масло-воск'], ['lacquer', 'Лак']].map(([v, l]) => html`
              <button type="button" class=${'seg__btn' + (coat === v ? ' is-on' : '')} onClick=${() => upDraft((d) => { d.coat = v; })}>${l}</button>`)}
          </div>
        </div>
        ${list.length > 1 ? matChips(list, sel?.id, (id) => upDraft((d) => { d.finish[coat] = id; }))
          : list.length === 1 ? html`<p class="finish__one">${list[0].name || 'Материал'} · ${fmtInt(materialCostPerM2(list[0]))} ${cur}/м²</p>`
          : html`<p class="finish__one is-warn">Нет материала для этого покрытия — добавьте его в «Настройки → Себестоимость».</p>`}
        <hr class="rule" />
        <div class="setting">
          <div><h3>Покраска морилкой</h3>
            <p>${stainOn ? `Добавляется ${fmtInt(cost.stainPrice)} ${cur}/м², а время и материал идут в себестоимость` : 'Включите, если красите перед покрытием'}</p></div>
          <button type="button" class=${'chip chip--big' + (stainOn ? ' is-on' : '')} aria-pressed=${stainOn ? 'true' : 'false'}
            onClick=${() => upDraft((d) => { d.stain.on = !d.stain.on; })}>${stainOn ? 'Покраска включена' : 'Покраска'}</button>
        </div>
        ${stainOn ? (stainList.length > 1 ? matChips(stainList, stainSel?.id, (id) => upDraft((d) => { d.stain.id = id; }))
          : stainList.length === 1 ? html`<p class="finish__one">${stainList[0].name || 'Морилка'} · ${fmtInt(materialCostPerM2(stainList[0]))} ${cur}/м²</p>`
          : html`<p class="finish__one is-warn">Нет материала-морилки — добавьте его в «Настройки → Себестоимость», иначе её стоимость не посчитается.</p>`) : null}
      </div>
    </section>`;
}

// ── Дополнительно: услуги, выезд, ночная работа ─────────────────

const NIGHT_STEPS = ['1.5', '1.6', '1.7', '1.8', '1.9', '2'];

function Extras({ no, draft, settings, upDraft }) {
  const n = draft.night;
  const k = num(n.k);
  const cur = settings.currency;
  const tp = travelPlan(draft, settings.cost);
  const t = draft.travel;
  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title"><h2>Дополнительно</h2><p>Услуги и выезд — учитываются в нормочасе</p></div>
      </header>
      <div class="card extras">
        <div class="setting">
          <div><h3>В заказе</h3><p>Отметьте, что делаете сами</p></div>
          <div class="chips">
            ${settings.services.map((s) => html`
              <button type="button" key=${s.id} class=${'chip' + (draft.services[s.id] ? ' is-on' : '')} aria-pressed=${draft.services[s.id] ? 'true' : 'false'}
                onClick=${() => upDraft((d) => { d.services[s.id] = !d.services[s.id]; })}>${normKey(s.key) || s.name} · ${fmtPrice(s.price, cur)}</button>`)}
          </div>
        </div>
        <hr class="rule" />
        <div class="setting">
          <div><h3>Выезд</h3>
            <p>${tp.dist > 0 ? `${fmtInt(tp.dist)} км всего · ${fmtNum(tp.hours, 1)} ч в дороге · по тарифу ${fmtPrice(tp.tariff, cur)}` : 'Расстояние в одну сторону — для дальних заказов'}</p></div>
          <div class="fields fields--pair">
            <${Num} label="В одну сторону" suffix="км" value=${t.km} onChange=${(v) => upDraft((d) => { d.travel.km = v; })} />
            <${Num} label="Выездов" value=${t.trips} onChange=${(v) => upDraft((d) => { d.travel.trips = v; })} />
          </div>
        </div>
        ${tp.dist > 0 ? html`
          <div class="setting setting--sub">
            <div><h3>Добавить выезд в цену</h3><p>Сумма прибавится к цене лака и масла</p></div>
            <div class="extras__charge">
              ${t.charge ? html`<${Num} cls="field--w" group suffix=${cur} aria="Сумма за выезд" value=${t.amount}
                placeholder=${fmtInt(Math.round(tp.tariff / 100) * 100)} onChange=${(v) => upDraft((d) => { d.travel.amount = v; })} />` : null}
              <${Switch} on=${t.charge} label="Добавить выезд в цену" onChange=${(on) => upDraft((d) => { d.travel.charge = on; })} />
            </div>
          </div>` : null}
        <hr class="rule" />
        <details class="extras__night" open=${n.on}>
          <summary>Ночная работа${n.on ? ` · ×${fmtNum(k)}` : ''}</summary>
          <div class="night__row">
            <p>Вся цена умножается на коэффициент от 1,5 до 2</p>
            <${Switch} on=${n.on} label="Ночная работа" onChange=${(on) => upDraft((d) => { d.night.on = on; })} />
          </div>
          ${n.on ? html`
            <div class="night__k">
              <div class="chips">
                ${NIGHT_STEPS.map((v) => html`
                  <button type="button" class=${'chip chip--num' + (k === num(v) ? ' is-on' : '')}
                    onClick=${() => upDraft((d) => { d.night.k = v; })}>×${v.replace('.', ',')}</button>`)}
              </div>
              <${Num} cls="field--inline" decimal suffix="×" aria="Свой коэффициент" value=${n.k}
                onChange=${(v) => upDraft((d) => { d.night.k = v; })} placeholder="1,5" />
            </div>` : null}
        </details>
      </div>
    </section>`;
}

// ── Клиент и сохранение ─────────────────────────────────────────

function ClientSection({ no, draft, upDraft, saved, dirty, onSave, onDone }) {
  const c = draft.client;
  const set = (key) => (v) => upDraft((d) => { d.client[key] = v; });
  const done = !!saved?.fact;
  const status = !saved ? 'Расчёт не сохранён'
    : dirty ? (done ? 'Заказ выполнен · есть несохранённые изменения' : 'Есть несохранённые изменения')
    : done ? 'Заказ выполнен · учтён в статистике'
    : `Расчёт сохранён ${fmtDateTime(saved.updatedAt)} · в статистику не входит`;
  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title"><h2>Клиент</h2><p>Чтобы сохранить расчёт и вернуться к нему позже</p></div>
      </header>
      <div class="card client">
        <div class="client__grid">
          <${Text} label="Имя" value=${c.name} onChange=${set('name')} placeholder="Как зовут клиента" autocomplete="off" />
          <${Text} label="Телефон" type="tel" inputmode="tel" value=${c.phone} onChange=${set('phone')} placeholder="+7" />
          <${Text} cls="client__wide" label="Адрес" value=${c.address} onChange=${set('address')} placeholder="Город, улица, дом, квартира" />
          <label class="field client__wide">
            <span class="field__label">Заметка</span>
            <${AutoText} cls="textarea--sm" rows="2" value=${c.note} onInput=${set('note')} placeholder="Порода дерева, сроки, пожелания, код домофона…" />
          </label>
        </div>
        <div class="client__foot">
          <span class=${'client__status' + (done && !dirty ? ' is-done' : '')}>${status}</span>
          <div class="btn-row">
            ${saved ? html`<button type="button" class="btn btn--ghost" onClick=${() => onSave(true)}>Сохранить как новый</button>` : null}
            <button type="button" class=${'btn ' + (saved && !dirty ? 'btn--ghost' : 'btn--primary')} disabled=${!!saved && !dirty} onClick=${() => onSave(false)}>
              ${Icon.save()}<span>${saved ? 'Сохранить изменения' : 'Сохранить расчёт'}</span>
            </button>
          </div>
        </div>
        <div class="client__done">
          <div><h3>${done ? 'Заказ выполнен' : 'Работа сделана?'}</h3>
            <p>${done ? 'Факт можно поправить или убрать из статистики' : 'Укажите, сколько получили и сколько времени ушло — заказ попадёт в статистику'}</p></div>
          <button type="button" class=${'btn ' + (done ? 'btn--ghost' : 'btn--done')} onClick=${onDone}>
            ${Icon.check()}<span>${done ? 'Факт и статистика' : 'Заказ выполнен'}</span></button>
        </div>
      </div>
    </section>`;
}

// ── Итог ────────────────────────────────────────────────────────

function PriceTile({ coat, price, value, onChange, settings, picked }) {
  const tag = price.note === 'diff' ? `не ниже масла + ${fmtInt(settings.minDiff)}`
    : price.note === 'min' ? 'минимальный заказ' : 'расчёт';
  return html`
    <div class=${'price' + (price.manual ? ' is-manual' : '') + (picked ? ' is-picked' : '')}>
      <div class="price__head">
        <span class="price__label">${COAT_LABEL[coat]}${picked ? html`<i class="price__pick">выбрано</i>` : null}</span>
        ${price.manual
          ? html`<button type="button" class="price__reset" onClick=${() => onChange('')} title="Вернуть расчётную цену">
              ${Icon.reset()}<span>расчёт ${fmtInt(price.auto)}</span></button>`
          : html`<span class=${'price__tag' + (price.note ? ' is-rule' : '')}>${tag}</span>`}
      </div>
      <${Num} cls="field--price" group suffix=${settings.currency} value=${value ?? ''} placeholder=${fmtInt(price.auto)}
        aria=${COAT_LABEL[coat] + ': цена вручную'} onChange=${onChange} />
    </div>`;
}

function Summary({ draft, settings, totals, upDraft, onNew, notice, onNotice }) {
  const rows = [['surfaces', 'Поверхности'], ['stairs', 'Лестница']].filter(([key]) => draft.mode === key);
  const setRate = (key, coat) => (v) => upDraft((d) => { d.rates[key][coat] = v; });
  const offRange = rows.some(([key]) => !totals.sections[key].exact);

  return html`
    <div class="card total">
      <div class="total__head">
        <span class="eyebrow">Итог</span>
      </div>
      <div class="total__area">${fmtArea(totals.area.total)}<small>м²</small></div>

      <div class="rates">
        <div class="rates__row rates__row--head">
          <span>Цена за м²</span><span>Масло</span><span>Лак</span>
        </div>
        ${rows.map(([key, title]) => {
          const s = totals.sections[key];
          return html`
            <div class="rates__row" key=${key}>
              <span class="rates__name">${title}
                <i>${fmtArea(s.area)} м²${s.label ? ' · тариф ' + s.label : ''}</i></span>
              ${['oil', 'lacquer'].map((c) => html`
                <${Num} key=${c} cls=${'field--rate' + (s.overridden[c] ? ' is-over' : '')} group
                  aria=${title + ', ' + COAT_LABEL[c] + ': цена за м²'}
                  value=${draft.rates[key][c] ?? ''} placeholder=${fmtInt(s.auto[c])} onChange=${setRate(key, c)} />`)}
            </div>`;
        })}
        ${totals.k !== 1 ? html`
          <div class="rates__row rates__row--note">
            <span class="rates__name">Ночная работа</span><span></span><span class="rates__k">×${fmtNum(totals.k)}</span>
          </div>` : null}
        ${totals.stain ? html`
          <div class="rates__row rates__row--note">
            <span class="rates__name">Покраска</span><span></span><span class="rates__k">+${fmtInt(totals.stain)}</span>
          </div>` : null}
        ${totals.travel ? html`
          <div class="rates__row rates__row--note">
            <span class="rates__name">Выезд</span><span></span><span class="rates__k">+${fmtInt(totals.travel)}</span>
          </div>` : null}
        ${offRange ? html`<p class="rates__warn">Площадь не попала ни в один диапазон прайса — взята ближайшая ставка.</p>` : null}
      </div>

      ${notice ? html`
        <div class="notice">
          <p>С момента сохранения расчёт изменился. Клиенту называли: лак ${fmtPrice(notice.lacquer, settings.currency)}, масло ${fmtPrice(notice.oil, settings.currency)}.</p>
          <div class="btn-row">
            <button type="button" class="btn btn--primary btn--sm" onClick=${() => onNotice(true)}>Оставить прежние цены</button>
            <button type="button" class="btn btn--ghost btn--sm" onClick=${() => onNotice(false)}>Пересчитать</button>
          </div>
        </div>` : null}

      <div class="prices">
        ${['lacquer', 'oil'].map((c) => html`
          <${PriceTile} key=${c} coat=${c} price=${totals.price[c]} settings=${settings} picked=${draft.coat === c}
            value=${draft.manual[c]} onChange=${(v) => upDraft((d) => { d.manual[c] = v; })} />`)}
      </div>
      <p class="total__note">Нажмите на цену или ставку, чтобы указать свою. Пустое поле — расчёт по прайсу.</p>
    </div>`;
}

function TemplateCard({ tpl, vars, settings, upSettings, toast, phone }) {
  const [done, setDone] = useState(false);
  const parts = templateParts(tpl.body, vars);
  const text = parts.map((p) => p.text).join('');
  const keys = usedKeys(tpl.body, vars);
  const services = settings.services.filter((s) => keys.includes(normKey(s.key)));
  const wa = phoneDigits(phone);

  const copy = async () => {
    const ok = await copyText(text);
    if (!ok) { toast('Не удалось скопировать'); return; }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  const share = async () => {
    try { await navigator.share({ text }); } catch { /* отмена */ }
  };

  return html`
    <div class="card tpl">
      <div class="tpl__head">
        <span class="eyebrow">${tpl.title || 'Текст'}</span>
        <div class="tpl__actions">
          ${wa ? html`
            <a class="btn btn--ghost btn--sm btn--icon" target="_blank" rel="noopener" aria-label="Отправить в WhatsApp" title="Отправить клиенту в WhatsApp"
              href=${`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}>${Icon.chat()}</a>` : null}
          ${typeof navigator.share === 'function' ? html`
            <button type="button" class="btn btn--ghost btn--sm btn--icon" aria-label="Поделиться" title="Поделиться" onClick=${share}>${Icon.share()}</button>` : null}
          <button type="button" class=${'btn btn--primary btn--sm' + (done ? ' is-done' : '')} onClick=${copy}>
            ${done ? Icon.check() : Icon.copy()}<span>${done ? 'Скопировано' : 'Скопировать'}</span>
          </button>
        </div>
      </div>
      ${services.length ? html`
        <div class="tpl__services">
          ${services.map((s) => html`
            <${Num} key=${s.id} cls="field--mini" group label=${normKey(s.key)} suffix=${settings.currency} value=${s.price}
              onChange=${(v) => upSettings((st) => { const x = st.services.find((y) => y.id === s.id); if (x) x.price = v; })} />`)}
        </div>` : null}
      <p class="tpl__text">${parts.map((p) => (p.key ? html`<mark>${p.text}</mark>` : p.text))}</p>
    </div>`;
}

// ── Страница «Расчёт» ───────────────────────────────────────────

function CalcPage({ draft, settings, totals, vars, cost, hideCost, onHideCost, upDraft, upSettings, withUndo, toast, onNew, saved, dirty, onSave, onDone, notice, onNotice }) {
  const summaryRef = useRef(null);
  const [barHidden, setBarHidden] = useState(false);
  const [polyEdit, setPolyEdit] = useState(null);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBarHidden(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const no = (i) => String(i + 1).padStart(2, '0');
  const editItem = polyEdit ? draft[polyEdit.kind].find((x) => x.id === polyEdit.id) : null;
  const onEditPoly = (kind, id) => setPolyEdit({ kind, id });

  return html`
    <div class="layout">
      <div class="layout__main">
        <div class="calc-top">
          <${ModeSwitch} draft=${draft} settings=${settings} upDraft=${upDraft} />
          <button type="button" class="clear-btn" onClick=${onNew} title="Очистить всё и начать новый расчёт">
            ${Icon.reset()}<span>Очистить всё</span>
          </button>
        </div>
        <${Section} key=${draft.mode} no="01" kind=${draft.mode} items=${draft[draft.mode]} settings=${settings}
          upDraft=${upDraft} withUndo=${withUndo} onEditPoly=${onEditPoly} />
        <${Finish} no="02" draft=${draft} settings=${settings} upDraft=${upDraft} />
        <${Extras} no="03" draft=${draft} settings=${settings} upDraft=${upDraft} />
        <${ClientSection} no="04" draft=${draft} upDraft=${upDraft} saved=${saved} dirty=${dirty} onSave=${onSave} onDone=${onDone} />
      </div>

      <aside class="layout__aside" id="summary" ref=${summaryRef}>
        <${Summary} draft=${draft} settings=${settings} totals=${totals} upDraft=${upDraft} onNew=${onNew} notice=${notice} onNotice=${onNotice} />
        <${NormPanel} cost=${cost} settings=${settings} hidden=${hideCost} onToggle=${onHideCost} />
        ${settings.templates.map((tpl) => html`
          <${TemplateCard} key=${tpl.id} tpl=${tpl} vars=${vars} settings=${settings} upSettings=${upSettings} toast=${toast} phone=${draft.client.phone} />`)}
      </aside>
    </div>

    <div class=${'bar' + (barHidden ? ' is-hidden' : '')}>
      <div class="bar__price"><span>Лак</span><b>${fmtPrice(totals.price.lacquer.final, settings.currency)}</b></div>
      <div class="bar__price"><span>Масло</span><b>${fmtPrice(totals.price.oil.final, settings.currency)}</b></div>
      <button type="button" class="btn btn--primary bar__btn"
        onClick=${() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <span>Текст</span>${Icon.down()}
      </button>
    </div>

    ${editItem ? html`
      <${PolyEditor} item=${editItem} title=${editItem.name || KINDS[polyEdit.kind].names.poly}
        onClose=${() => setPolyEdit(null)}
        onSave=${(pts) => {
          upDraft((d) => { const it = d[polyEdit.kind].find((x) => x.id === polyEdit.id); if (it) { it.pts = pts; it.shape = 'poly'; } });
          setPolyEdit(null);
        }} />` : null}`;
}

// ── Страница «Заказы» ───────────────────────────────────────────

function OrdersPage({ orders, settings, currentId, onOpen, onDelete, onDuplicate, onFact }) {
  const [q, setQ] = useState('');
  const live = orders.filter((o) => !o.deleted);
  const doneCount = live.filter((o) => o.fact).length;
  const quoteCount = live.length - doneCount;
  const [view, setView] = useState(() => (quoteCount === 0 && doneCount > 0 ? 'done' : 'quotes'));
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live
      .filter((o) => (view === 'done') === !!o.fact)
      .filter((o) => {
        if (!needle) return true;
        const c = o.draft?.client || {};
        return [c.name, c.phone, c.address, c.note].some((v) => String(v || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => (view === 'done' ? String(b.fact.date || '').localeCompare(String(a.fact.date || '')) : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [orders, q, view]);
  const inView = view === 'done' ? doneCount : quoteCount;

  return html`
    <div class="page">
      <section class="section">
        <header class="section__head">
          <div class="section__title"><h2>Заказы</h2>
            <p>${view === 'done' ? 'Выполненные заказы — из них считается статистика' : 'Сохранённые расчёты. В статистику не входят, пока заказ не отмечен выполненным'}</p></div>
        </header>

        <div class="seg seg--tabs" role="tablist">
          <button type="button" role="tab" aria-selected=${view === 'quotes' ? 'true' : 'false'} class=${'seg__btn' + (view === 'quotes' ? ' is-on' : '')} onClick=${() => setView('quotes')}>
            Расчёты<sup>${quoteCount}</sup></button>
          <button type="button" role="tab" aria-selected=${view === 'done' ? 'true' : 'false'} class=${'seg__btn' + (view === 'done' ? ' is-on' : '')} onClick=${() => setView('done')}>
            Выполненные<sup>${doneCount}</sup></button>
        </div>

        ${inView > 3 ? html`
          <label class="field search">
            <span class="field__box">${Icon.search()}<input type="search" value=${q} placeholder="Имя, телефон или адрес"
              aria-label="Поиск по заказам" onInput=${(e) => setQ(e.target.value)} /></span>
          </label>` : null}

        ${!inView ? html`
          <div class="card empty">
            <h3>${view === 'done' ? 'Выполненных заказов пока нет' : 'Сохранённых расчётов пока нет'}</h3>
            <p>${view === 'done'
              ? 'Откройте сохранённый расчёт и нажмите «Заказ выполнен» — он перейдёт сюда и попадёт в статистику.'
              : 'На вкладке «Расчёт» заполните блок «Клиент» и нажмите «Сохранить расчёт» — он появится здесь со всеми размерами и ценами.'}</p>
            <a class="btn btn--primary" href="#calc">К расчёту</a>
          </div>` : null}
        ${inView && !list.length ? html`<p class="lead">Ничего не найдено.</p>` : null}

        <div class="orders">
          ${list.map((o) => {
            const c = o.draft?.client || {};
            const tel = phoneDigits(c.phone);
            const fs = factSummary(o);
            const mode = o.draft?.mode || (o.draft?.show?.stairs && !o.draft?.show?.surfaces ? 'stairs' : 'surfaces');
            const count = o.draft?.[mode]?.length || 0;
            return html`
              <article class=${'card order' + (o.id === currentId ? ' is-current' : '') + (fs ? ' is-done' : '')} key=${o.id}>
                <button type="button" class="order__main" onClick=${() => onOpen(o)}>
                  <div class="order__title">
                    <h3>${c.name || c.address || 'Без имени'}</h3>
                    ${o.id === currentId ? html`<span class="order__badge">открыт</span>` : null}
                  </div>
                  ${c.name && c.address ? html`<p class="order__addr">${c.address}</p>` : null}
                  ${c.note ? html`<p class="order__note">${c.note}</p>` : null}
                  <p class="order__meta">${fs
                    ? `Выполнен ${fmtDate(new Date(o.fact.date || o.updatedAt).getTime())} · ${fmtArea(fs.area)} м² · ${fmtNum(fs.hours, 1)} ч${fs.byStages ? '' : ' (общее время)'}`
                    : `${fmtDate(o.updatedAt)} · ${fmtArea(o.totals?.area)} м² · ${count} ${plural(count, ['позиция', 'позиции', 'позиций'])}${o.draft?.night?.on ? ' · ночная' : ''}`}</p>
                </button>
                ${fs ? html`
                  <div class="order__prices">
                    <div><span>Получено</span><b>${fmtPrice(fs.received, settings.currency)}</b></div>
                    <div><span>Прибыль</span><b>${fmtPrice(fs.profit, settings.currency)}</b></div>
                    <div><span>Ваш час</span><b>${fs.hours > 0 ? fmtPrice(fs.rate, settings.currency) : '—'}</b></div>
                  </div>` : html`
                  <div class="order__prices">
                    <div><span>Лак</span><b>${fmtPrice(o.totals?.lacquer, settings.currency)}</b></div>
                    <div><span>Масло</span><b>${fmtPrice(o.totals?.oil, settings.currency)}</b></div>
                  </div>`}
                <div class="order__actions">
                  <button type="button" class="btn btn--primary btn--sm" onClick=${() => onOpen(o)}>Открыть расчёт</button>
                  <button type="button" class=${'btn btn--sm btn--fact ' + (fs ? 'btn--ghost' : 'btn--done')} onClick=${() => onFact(o)}>${Icon.check()}<span>${fs ? 'Факт' : 'Заказ выполнен'}</span></button>
                  ${tel ? html`<a class="btn btn--ghost btn--sm" href=${'tel:+' + tel}>${Icon.phone()}<span>Позвонить</span></a>` : null}
                  ${c.address ? html`<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener"
                    href=${'https://yandex.ru/maps/?text=' + encodeURIComponent(c.address)}>${Icon.pin()}<span>Карта</span></a>` : null}
                  <span class="order__spacer"></span>
                  <button type="button" class="icon-btn" title="Создать копию расчёта" aria-label="Создать копию" onClick=${() => onDuplicate(o)}>${Icon.dup()}</button>
                  <button type="button" class="icon-btn" title="Удалить" aria-label="Удалить заказ" onClick=${() => onDelete(o)}>${Icon.trash()}</button>
                </div>
              </article>`;
          })}
        </div>
      </section>
    </div>`;
}

// ── Страница «Цены» ─────────────────────────────────────────────

function TierTable({ title, hint, tiers, onChange }) {
  const up = (id, key) => (v) => onChange((list) => { const t = list.find((x) => x.id === id); if (t) t[key] = v; });
  const sort = () => onChange((list) => { list.sort((a, b) => num(a.from) - num(b.from)); });
  const add = () => onChange((list) => {
    const last = sortedTiers(list).at(-1);
    const from = last ? (String(last.to ?? '') !== '' ? num(last.to) : num(last.from) + 1) : 0;
    list.push({ id: uid(), from, to: '', oil: last?.oil ?? 0, lacquer: last?.lacquer ?? 0 });
  });
  return html`
    <div class="tiers">
      <div class="tiers__title"><h3>${title}</h3><p>${hint}</p></div>
      <div class="tiers__grid">
        <div class="tiers__row tiers__row--head"><span>От, м²</span><span>До, м²</span><span>Масло, ₽</span><span>Лак, ₽</span><span></span></div>
        ${tiers.map((t) => html`
          <div class="tiers__row" key=${t.id}>
            <${Num} decimal aria="Площадь от, м²" value=${t.from} onChange=${up(t.id, 'from')} onBlur=${sort} />
            <${Num} decimal aria="Площадь до, м²" value=${t.to} placeholder="∞" onChange=${up(t.id, 'to')} />
            <${Num} group aria="Масло, цена за м²" value=${t.oil} onChange=${up(t.id, 'oil')} />
            <${Num} group aria="Лак, цена за м²" value=${t.lacquer} onChange=${up(t.id, 'lacquer')} />
            <button type="button" class="icon-btn" aria-label="Удалить диапазон" disabled=${tiers.length < 2}
              onClick=${() => onChange((list) => { const i = list.findIndex((x) => x.id === t.id); if (i >= 0) list.splice(i, 1); })}>${Icon.x()}</button>
          </div>`)}
      </div>
      <button type="button" class="adder adder--sm" onClick=${add}><span>Диапазон</span>${Icon.plus()}</button>
    </div>`;
}

const CLOUD_TEXT = {
  off: ['Облако не подключено', 'Цены, тексты и заказы хранятся в этом браузере. После настройки Firebase они будут одинаковыми на телефоне и компьютере.'],
  init: ['Подключение…', 'Соединяюсь с Firebase.'],
  signedOut: ['Войдите, чтобы синхронизировать', 'Цены, тексты и заказы будут сохраняться в вашем Firebase.'],
  syncing: ['Синхронизация…', ''],
  synced: ['Синхронизировано', ''],
  error: ['Ошибка облака', ''],
};

function PricesPage({ settings, upSettings, cloud, toast, onImport, orders }) {
  const fileRef = useRef(null);
  const upTiers = (key) => (fn) => upSettings((s) => { fn(s.prices[key]); });
  const [title, text] = CLOUD_TEXT[cloud.status] || CLOUD_TEXT.off;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...settings, orders }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `restavraciya-kopiya-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.prices) throw new Error('bad file');
      onImport(data);
      toast('Данные загружены из файла');
    } catch { toast('Файл не подошёл'); }
  };

  return html`
    <div class="page">
      <section class="section">
        <header class="section__head">
          <span class="section__no">01</span>
          <div class="section__title"><h2>Цена за м²</h2><p>Для каждого диапазона площади — своя ставка</p></div>
        </header>
        <div class="card">
          <${TierTable} title="Поверхности" hint="Столешницы, столы, подоконники" tiers=${settings.prices.surfaces} onChange=${upTiers('surfaces')} />
          <hr class="rule" />
          <${TierTable} title="Лестница" hint="Ступени и площадки" tiers=${settings.prices.stairs} onChange=${upTiers('stairs')} />
          <hr class="rule" />
          <p class="card__note">Пустое «до» — без верхней границы. Если площадь попала между диапазонами, берётся ближайший, а в итоге появится предупреждение.</p>
          <div class="setting">
            <div><h3>Диапазон выбирается по</h3><p>Какая площадь определяет ставку</p></div>
            <div class="seg">
              ${[['total', 'Всему заказу'], ['section', 'Разделу']].map(([v, l]) => html`
                <button type="button" class=${'seg__btn' + (settings.tierBy === v ? ' is-on' : '')}
                  onClick=${() => upSettings((s) => { s.tierBy = v; })}>${l}</button>`)}
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">02</span>
          <div class="section__title"><h2>Правила цены</h2><p>Применяются к итогу автоматически</p></div>
        </header>
        <div class="card">
          <div class="setting">
            <div><h3>Разница между лаком и маслом</h3><p>Лак всегда не дешевле масла на эту сумму. 0 — не применять</p></div>
            <${Num} cls="field--w" group suffix=${settings.currency} aria="Минимальная разница между лаком и маслом" value=${settings.minDiff}
              onChange=${(v) => upSettings((s) => { s.minDiff = v; })} />
          </div>
          <hr class="rule" />
          <div class="setting">
            <div><h3>Минимальная стоимость заказа</h3><p>Ниже этой суммы цена не опускается. 0 — не применять</p></div>
            <${Num} cls="field--w" group suffix=${settings.currency} aria="Минимальная стоимость заказа" value=${settings.minOrder}
              onChange=${(v) => upSettings((s) => { s.minOrder = v; })} />
          </div>
          <hr class="rule" />
          <div class="setting">
            <div><h3>Округление цены</h3><p>Итог округляется до ближайшего значения</p></div>
            <div class="chips">
              ${[1, 50, 100, 500, 1000].map((v) => html`
                <button type="button" class=${'chip chip--num' + (num(settings.rounding) === v ? ' is-on' : '')}
                  onClick=${() => upSettings((s) => { s.rounding = v; })}>${v === 1 ? 'до рубля' : fmtInt(v)}</button>`)}
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">03</span>
          <div class="section__title"><h2>Дополнительные услуги</h2><p>Цены подставляются в тексты по ключу в фигурных скобках</p></div>
        </header>
        <div class="card">
          <div class="services">
            ${settings.services.map((s) => html`
              <div class="services__row" key=${s.id}>
                <label class="field field--grow">
                  <span class="field__label">Услуга</span>
                  <span class="field__box"><input type="text" value=${s.name} placeholder="Название"
                    onInput=${(e) => upSettings((st) => { st.services.find((x) => x.id === s.id).name = e.target.value; })} /></span>
                </label>
                <label class="field">
                  <span class="field__label">Ключ в тексте</span>
                  <span class="field__box field__box--key"><span class="field__prefix">{</span><input type="text" value=${s.key} placeholder="ключ"
                    autocapitalize="off" onInput=${(e) => upSettings((st) => { st.services.find((x) => x.id === s.id).key = e.target.value.replace(/[{}\s]/g, '').toLowerCase(); })} /><span class="field__suffix">}</span></span>
                </label>
                <${Num} label="Цена" group suffix=${settings.currency} value=${s.price}
                  onChange=${(v) => upSettings((st) => { st.services.find((x) => x.id === s.id).price = v; })} />
                <button type="button" class="icon-btn" aria-label="Удалить услугу"
                  onClick=${() => upSettings((st) => { st.services = st.services.filter((x) => x.id !== s.id); })}>${Icon.x()}</button>
              </div>`)}
          </div>
          <button type="button" class="adder adder--sm"
            onClick=${() => upSettings((st) => { st.services.push({ id: uid(), key: '', name: '', price: 0 }); })}>
            <span>Услуга</span>${Icon.plus()}</button>
          <hr class="rule" />
          <div class="setting">
            <div><h3>Покраска морилкой</h3><p>Цена за м², прибавляется к покрытию, когда в расчёте включена «Покраска»</p></div>
            <${Num} cls="field--w" group suffix=${settings.currency + '/м²'} aria="Цена покраски за м²" value=${settings.cost.stainPrice}
              onChange=${(v) => upSettings((s) => { s.cost.stainPrice = v; })} />
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">04</span>
          <div class="section__title"><h2>По умолчанию</h2><p>Подставляется в новые позиции и расчёты</p></div>
        </header>
        <div class="card">
          <div class="fields fields--tight">
            <${Num} label="Ночной коэф." decimal suffix="×" value=${settings.nightK} onChange=${(v) => upSettings((s) => { s.nightK = v; })} />
            <${Num} label="Толщина торца" suffix="мм" value=${settings.edgeThickness} onChange=${(v) => upSettings((s) => { s.edgeThickness = v; })} />
            <${Text} label="Валюта" value=${settings.currency} onChange=${(v) => upSettings((s) => { s.currency = v.slice(0, 6); })} />
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">05</span>
          <div class="section__title"><h2>Хранение</h2><p>Облако и резервная копия</p></div>
        </header>
        <div class="card">
          <div class="setting">
            <div class="cloud">
              <span class=${'cloud__dot cloud__dot--' + cloud.status}></span>
              <div>
                <h3>${title}</h3>
                <p>${cloud.status === 'error' ? cloud.error : (cloud.user?.email || text)}</p>
              </div>
            </div>
            ${cloud.status === 'signedOut' ? html`
              <button type="button" class="btn btn--primary" onClick=${() => signIn().catch((e) => toast('Вход не удался: ' + (e?.code || e?.message || '')))}>Войти через Google</button>` : null}
            ${cloud.user ? html`<button type="button" class="btn btn--ghost" onClick=${() => signOutCloud()}>Выйти</button>` : null}
          </div>
          <hr class="rule" />
          <div class="setting">
            <div><h3>Резервная копия</h3><p>Цены, тексты и заказы одним файлом</p></div>
            <div class="btn-row">
              <button type="button" class="btn btn--ghost" onClick=${exportJson}>Скачать</button>
              <button type="button" class="btn btn--ghost" onClick=${() => fileRef.current?.click()}>Загрузить</button>
              <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${importJson} />
            </div>
          </div>
        </div>
      </section>
    </div>`;
}

// ── Страница «Тексты» ───────────────────────────────────────────

function TemplateEditor({ tpl, no, vars, upSettings, withUndoSettings, canDelete }) {
  const ref = useRef(null);
  const up = (fn) => upSettings((s) => { const t = s.templates.find((x) => x.id === tpl.id); if (t) fn(t); });
  const original = DEFAULT_TEMPLATES.find((d) => d.id === tpl.id);

  const insert = (key) => {
    const el = ref.current;
    const token = `{${key}}`;
    const start = el?.selectionStart ?? tpl.body.length;
    const end = el?.selectionEnd ?? tpl.body.length;
    up((t) => { t.body = t.body.slice(0, start) + token + t.body.slice(end); });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };

  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title section__title--edit">
          <input class="title-input" type="text" value=${tpl.title} placeholder="Название текста" aria-label="Название текста"
            onInput=${(e) => up((t) => { t.title = e.target.value; })} />
        </div>
        <div class="item__tools">
          ${original && original.body !== tpl.body ? html`
            <button type="button" class="link-btn" onClick=${() => { withUndoSettings('Текст возвращён к исходному'); up((t) => { t.body = original.body; }); }}>Исходный</button>` : null}
          ${canDelete ? html`
            <button type="button" class="icon-btn" aria-label="Удалить текст"
              onClick=${() => { withUndoSettings('Текст удалён'); upSettings((s) => { s.templates = s.templates.filter((x) => x.id !== tpl.id); }); }}>${Icon.x()}</button>` : null}
        </div>
      </header>
      <div class="card editor">
        <div class="editor__col">
          <div class="chips chips--vars">
            <span class="chips__label">Вставить</span>
            ${Object.keys(vars).map((key) => html`
              <button type="button" class="chip chip--var" onClick=${() => insert(key)}>{${key}}</button>`)}
          </div>
          <${AutoText} innerRef=${ref} value=${tpl.body} placeholder="Текст для клиента…" onInput=${(v) => up((t) => { t.body = v; })} />
        </div>
        <div class="editor__col editor__col--preview">
          <span class="eyebrow">Так увидит клиент</span>
          <p class="tpl__text">${templateParts(tpl.body, vars).map((p) => (p.key ? html`<mark>${p.text}</mark>` : p.text))}</p>
        </div>
      </div>
    </section>`;
}

function TextsPage({ settings, vars, upSettings, withUndoSettings }) {
  return html`
    <div class="page">
      <p class="lead">Меняйте текст как угодно — на месте фигурных скобок всегда будет актуальная цена из расчёта.</p>
      ${settings.templates.map((tpl, i) => html`
        <${TemplateEditor} key=${tpl.id} tpl=${tpl} no=${String(i + 1).padStart(2, '0')} vars=${vars}
          upSettings=${upSettings} withUndoSettings=${withUndoSettings} canDelete=${settings.templates.length > 1} />`)}
      <div class="adders">
        <button type="button" class="adder"
          onClick=${() => upSettings((s) => { s.templates.push({ id: uid(), title: 'Новый текст', body: '' }); })}>
          <span>Добавить текст</span>${Icon.plus()}</button>
      </div>
    </div>`;
}

// ── Настройки: цены, себестоимость, тексты ──────────────────────

const SETTINGS_TABS = [['prices', 'Цены'], ['cost', 'Себестоимость'], ['texts', 'Тексты']];

function SettingsNav({ tab }) {
  return html`
    <nav class="subnav" aria-label="Настройки">
      <div class="seg">
        ${SETTINGS_TABS.map(([id, label]) => html`
          <a href=${'#' + id} class=${'seg__btn' + (tab === id ? ' is-on' : '')}>${label}</a>`)}
      </div>
    </nav>`;
}

// ── Приложение ──────────────────────────────────────────────────

const TABS = [['calc', 'Расчёт'], ['orders', 'Заказы'], ['stats', 'Статистика'], ['prices', 'Настройки']];
const ROUTES = ['calc', 'orders', 'stats', 'prices', 'cost', 'texts'];
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' };
const tabFromHash = () => (ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calc');
const topTab = (tab) => (['cost', 'texts'].includes(tab) ? 'prices' : tab);

function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [draft, setDraft] = useState(() => loadDraft(settings));
  const [orders, setOrders] = useState(loadOrders);
  const [tab, setTab] = useState(tabFromHash);
  const [theme, setTheme] = useState(loadTheme);
  const [cloud, setCloud] = useState({ status: cloudConfigured ? 'init' : 'off', user: null });
  const [toastState, setToastState] = useState(null);
  const [notice, setNotice] = useState(null);
  const [factOrder, setFactOrder] = useState(null);
  const [hideCost, setHideCost] = useState(() => { try { return localStorage.getItem('rc.hideCost') === '1'; } catch { return false; } });
  const onHideCost = () => setHideCost((v) => { try { localStorage.setItem('rc.hideCost', v ? '0' : '1'); } catch { /* noop */ } return !v; });
  const settingsRef = useRef(settings);
  const ordersRef = useRef(orders);
  const remoteAt = useRef(null);
  const toastTimer = useRef(null);
  settingsRef.current = settings;
  ordersRef.current = orders;

  const upDraft = (fn) => setDraft((d) => { const n = structuredClone(d); fn(n); return n; });
  const upSettings = (fn) => setSettings((s) => { const n = structuredClone(s); fn(n); n.updatedAt = Date.now(); return n; });
  const replaceSettings = (s) => setSettings({ ...s, updatedAt: Date.now() });

  const toast = (msg, action) => {
    clearTimeout(toastTimer.current);
    setToastState({ msg, action, id: Date.now() });
    toastTimer.current = setTimeout(() => setToastState(null), action ? 6000 : 2600);
  };
  const withUndo = (msg) => { const prev = draft; toast(msg, () => setDraft(prev)); };
  const withUndoSettings = (msg) => { const prev = settings; toast(msg, () => replaceSettings(prev)); };
  const onNew = () => {
    withUndo('Расчёт очищен');
    setNotice(null);
    setDraft(defaultDraft(settings));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totals = useMemo(() => calcTotals(draft, settings), [draft, settings]);
  const vars = useMemo(() => templateVars(totals, settings), [totals, settings]);
  const cost = useMemo(() => calcCost(draft, settings, totals), [draft, settings, totals]);

  // ── Заказы ──
  // Заказы записываются в память браузера сразу, не дожидаясь перерисовки.
  const putOrder = (order) => {
    const list = ordersRef.current;
    const next = list.some((o) => o.id === order.id) ? list.map((o) => (o.id === order.id ? order : o)) : [order, ...list];
    ordersRef.current = next;
    saveOrders(next);
    setOrders(next);
    pushOrder(order).catch(() => {});
  };
  const saved = draft.id ? orders.find((o) => o.id === draft.id && !o.deleted) : null;
  const dirty = useMemo(() => !saved || JSON.stringify(saved.draft) !== JSON.stringify(draft), [saved, draft]);

  // Сохраняет расчёт. Факт выполнения (статистика) при обычном сохранении не теряется, при «как новый» — не копируется.
  const persist = (asNew) => {
    const now = Date.now();
    const fresh = asNew || !saved;
    const id = fresh ? uid() + uid() : saved.id;
    const d = { ...structuredClone(draft), id };
    const order = {
      id, createdAt: fresh ? now : saved.createdAt, updatedAt: now, deleted: false, draft: d,
      totals: { area: totals.area.total, lacquer: totals.price.lacquer.final, oil: totals.price.oil.final },
      fact: fresh ? null : (saved.fact || null),
    };
    putOrder(order);
    setDraft(d);
    setNotice(null);
    return order;
  };
  const onSave = (asNew) => {
    persist(asNew);
    toast(asNew ? 'Сохранено как новый расчёт' : 'Расчёт сохранён');
  };
  const onDone = () => setFactOrder(saved && !dirty ? saved : persist(false));
  const onOpen = (order) => {
    const d = normalizeDraft(order.draft, settings);
    d.id = order.id;
    const t = calcTotals(d, settings);
    const was = order.totals || {};
    setNotice(t.price.lacquer.final !== was.lacquer || t.price.oil.final !== was.oil ? { lacquer: was.lacquer, oil: was.oil } : null);
    setDraft(d);
    location.hash = '#calc';
    window.scrollTo(0, 0);
  };
  const onNotice = (keep) => {
    if (keep && notice) upDraft((d) => { d.manual = { lacquer: String(notice.lacquer), oil: String(notice.oil) }; });
    setNotice(null);
  };
  const onDeleteOrder = (order) => {
    putOrder({ ...order, deleted: true, updatedAt: Date.now() });
    toast('Заказ удалён', () => putOrder({ ...order, deleted: false, updatedAt: Date.now() }));
  };
  const onDuplicateOrder = (order) => {
    const now = Date.now(), id = uid() + uid();
    const d = structuredClone(order.draft);
    d.id = id;
    d.client = { ...d.client, name: d.client?.name ? d.client.name + ' (копия)' : '' };
    putOrder({ ...structuredClone(order), id, createdAt: now, updatedAt: now, draft: d, fact: null });
    toast('Создана копия расчёта');
  };
  const onFactSave = (fact) => {
    putOrder({ ...factOrder, fact, updatedAt: Date.now() });
    setFactOrder(null);
    toast('Заказ выполнен и учтён в статистике');
  };
  const onFactReopen = () => {
    const { fact, ...rest } = factOrder;
    putOrder({ ...rest, fact: null, updatedAt: Date.now() });
    setFactOrder(null);
    toast('Заказ убран из статистики и вернулся в расчёты');
  };
  const onImport = (data) => {
    const { orders: imported, ...rest } = data;
    replaceSettings(normalizeSettings(rest));
    if (Array.isArray(imported)) {
      const map = new Map(ordersRef.current.map((o) => [o.id, o]));
      for (const o of imported) {
        if (!o?.id) continue;
        const cur = map.get(o.id);
        if (!cur || (o.updatedAt || 0) > (cur.updatedAt || 0)) { map.set(o.id, o); pushOrder(o).catch(() => {}); }
      }
      setOrders([...map.values()]);
    }
  };

  // ── Сохранение ──
  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => { saveOrders(orders); }, [orders]);
  useEffect(() => {
    saveSettings(settings);
    if (!cloudConfigured || !cloud.user || settings.updatedAt === remoteAt.current) return;
    const t = setTimeout(() => {
      pushSettings(settings).catch((e) => setCloud((c) => ({ ...c, status: 'error', error: e.message })));
    }, 900);
    return () => clearTimeout(t);
  }, [settings, cloud.user]);

  // ── Облако ──
  useEffect(() => {
    initCloud({
      onStatus: (st) => setCloud(st),
      onRemote: (remote) => {
        const cur = settingsRef.current;
        if (!remote) { pushSettings(cur).catch(() => {}); return; }
        const rAt = remote.updatedAt || 0, lAt = cur.updatedAt || 0;
        if (rAt > lAt) { remoteAt.current = rAt; setSettings(normalizeSettings(remote)); }
        else if (rAt < lAt) pushSettings(cur).catch(() => {});
      },
      onRemoteOrders: (remote) => {
        const local = ordersRef.current;
        const map = new Map(local.map((o) => [o.id, o]));
        const seen = new Set();
        for (const r of remote) {
          if (!r?.id) continue;
          seen.add(r.id);
          const l = map.get(r.id);
          if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) map.set(r.id, r);
          else if ((l.updatedAt || 0) > (r.updatedAt || 0)) pushOrder(l).catch(() => {});
        }
        for (const l of local) if (!seen.has(l.id)) pushOrder(l).catch(() => {});
        setOrders([...map.values()]);
      },
    });
  }, []);

  // ── Навигация и тема ──
  useEffect(() => {
    const onHash = () => { setTab(tabFromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    saveTheme(theme);
  }, [theme]);

  const ThemeIcon = theme === 'auto' ? Icon.auto : theme === 'light' ? Icon.sun : Icon.moon;
  const orderCount = orders.filter((o) => !o.deleted).length;

  return html`
    <header class="top">
      <div class="top__in">
        <a class="brand" href="#calc" aria-label="Расчёт реставрации">
          <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="1" y="1" width="30" height="30" rx="9" />
            <circle cx="16" cy="16" r="2.2" />
            <path d="M16 10.2a5.8 5.8 0 1 1-5.8 5.8M25.4 16A9.4 9.4 0 1 1 16 6.6" />
          </svg>
          <span class="brand__text">Реставрация<i>расчёт стоимости</i></span>
        </a>
        <nav class="tabs" aria-label="Разделы">
          ${TABS.map(([id, label]) => html`
            <a href=${'#' + id} class=${'tabs__btn' + (topTab(tab) === id ? ' is-on' : '')} aria-current=${topTab(tab) === id ? 'page' : null}>${label}${id === 'orders' && orderCount ? html`<sup>${orderCount}</sup>` : null}</a>`)}
        </nav>
        <div class="top__tools">
          ${cloudConfigured ? html`
            <a href="#prices" class=${'icon-btn cloud-btn cloud-btn--' + cloud.status} title=${(CLOUD_TEXT[cloud.status] || [''])[0]}
              aria-label=${(CLOUD_TEXT[cloud.status] || [''])[0]}>${Icon.cloud()}</a>` : null}
          <button type="button" class="icon-btn" title=${THEME_LABEL[theme]} aria-label=${THEME_LABEL[theme]}
            onClick=${() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}>${ThemeIcon()}</button>
        </div>
      </div>
    </header>

    <main class="wrap">
      ${tab === 'calc' ? html`
        <${CalcPage} draft=${draft} settings=${settings} totals=${totals} vars=${vars} cost=${cost} hideCost=${hideCost} onHideCost=${onHideCost}
          upDraft=${upDraft} upSettings=${upSettings} withUndo=${withUndo} toast=${toast} onNew=${onNew}
          saved=${saved} dirty=${dirty} onSave=${onSave} onDone=${onDone} notice=${notice} onNotice=${onNotice} />` : null}
      ${tab === 'orders' ? html`
        <${OrdersPage} orders=${orders} settings=${settings} currentId=${draft.id}
          onOpen=${onOpen} onDelete=${onDeleteOrder} onDuplicate=${onDuplicateOrder} onFact=${setFactOrder} />` : null}
      ${tab === 'stats' ? html`<${StatsPage} orders=${orders} settings=${settings} />` : null}
      ${topTab(tab) === 'prices' ? html`<${SettingsNav} tab=${tab} />` : null}
      ${tab === 'cost' ? html`<div class="page"><${CostPage} settings=${settings} upSettings=${upSettings} /></div>` : null}
      ${tab === 'prices' ? html`
        <${PricesPage} settings=${settings} upSettings=${upSettings} cloud=${cloud} toast=${toast} onImport=${onImport} orders=${orders} />` : null}
      ${tab === 'texts' ? html`
        <${TextsPage} settings=${settings} vars=${vars} upSettings=${upSettings} withUndoSettings=${withUndoSettings} />` : null}
    </main>

    ${factOrder ? html`
      <${FactModal} order=${factOrder} settings=${settings} onSave=${onFactSave} onReopen=${onFactReopen} onClose=${() => setFactOrder(null)} />` : null}

    <div class=${'toast' + (toastState ? ' is-on' : '')} role="status" aria-live="polite">
      ${toastState ? html`
        <span>${toastState.msg}</span>
        ${toastState.action ? html`
          <button type="button" onClick=${() => { toastState.action(); setToastState(null); }}>Вернуть</button>` : null}` : null}
    </div>`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
