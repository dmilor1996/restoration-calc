import { html, render, useState, useEffect, useRef, useMemo } from './vendor/preact-htm.js';
import {
  num, itemGeometry, shapeSides, faceArea, sectionArea, calcTotals, sortedTiers,
  templateVars, templateParts, usedKeys, normKey,
  fmtArea, fmtInt, fmtNum, fmtPrice, plural,
} from './calc.js';
import { uid, newItem, defaultDraft, normalizeSettings, DEFAULT_TEMPLATES } from './defaults.js';
import {
  loadSettings, saveSettings, loadDraft, saveDraft, loadTheme, saveTheme,
  cloudConfigured, initCloud, pushSettings, signIn, signOutCloud,
} from './store.js';

// ── Иконки ──────────────────────────────────────────────────────

const svg = (body, size = 20) => html`
  <svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const Icon = {
  rect: () => svg(html`<rect x="3" y="6.5" width="18" height="11" rx="1.5" />`),
  circle: () => svg(html`<circle cx="12" cy="12" r="8.5" />`),
  trap: () => svg(html`<path d="M3.5 9.5 20.5 5.5v13l-17-4z" />`),
  custom: () => svg(html`<path d="M4 10.5 10.5 4l9.5 3.5-2.5 11.5-11 1z" />`),
  plus: () => svg(html`<path d="M12 5v14M5 12h14" />`, 18),
  minus: () => svg(html`<path d="M5 12h14" />`, 18),
  x: () => svg(html`<path d="M6 6l12 12M18 6 6 18" />`, 18),
  copy: () => svg(html`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />`, 18),
  check: () => svg(html`<path d="m5 12.5 4.5 4.5L19 7.5" />`, 18),
  share: () => svg(html`<path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" />`, 18),
  dup: () => svg(html`<rect x="4.5" y="4.5" width="11" height="11" rx="2.5" /><path d="M9 19.5h8a2.5 2.5 0 0 0 2.5-2.5V9" />`, 18),
  moon: () => svg(html`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />`, 18),
  sun: () => svg(html`<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />`, 18),
  auto: () => svg(html`<circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" />`, 18),
  reset: () => svg(html`<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" />`, 16),
  down: () => svg(html`<path d="M12 5v14m0 0-5-5m5 5 5-5" />`, 18),
  cloud: () => svg(html`<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.25 18.5z" />`, 18),
};

const SHAPES = [
  { id: 'rect', label: 'Прямоугольник' },
  { id: 'circle', label: 'Круг' },
  { id: 'trap', label: 'Трапеция' },
  { id: 'custom', label: 'Своя площадь' },
];

const KINDS = {
  surfaces: {
    title: 'Поверхности',
    hint: 'Столешницы, столы, подоконники',
    names: { rect: 'Столешница', circle: 'Круглый стол', trap: 'Трапеция', custom: 'Своя форма' },
    fields: {
      rect: [['l', 'Длина'], ['w', 'Ширина']],
      circle: [['d', 'Диаметр']],
      trap: [['h', 'Длина'], ['a', 'Сторона A'], ['b', 'Сторона B']],
    },
    add: [['rect', 'Прямоугольная'], ['circle', 'Круглая'], ['trap', 'Трапеция'], ['custom', 'Своя площадь']],
  },
  stairs: {
    title: 'Лестница',
    hint: 'Ступени, площадки, подступенки',
    names: { rect: 'Прямые ступени', circle: 'Круглая площадка', trap: 'Забежные ступени', custom: 'Своя форма' },
    fields: {
      rect: [['l', 'Длина'], ['w', 'Глубина']],
      circle: [['d', 'Диаметр']],
      trap: [['h', 'Длина'], ['a', 'Узкий край'], ['b', 'Широкий край']],
    },
    add: [['rect', 'Прямые ступени'], ['trap', 'Трапециевидные'], ['custom', 'Своя площадь']],
  },
};

const COAT_LABEL = { lacquer: 'Лак', oil: 'Масло-воск' };

// ── Мелкие помощники ────────────────────────────────────────────

function cleanNum(v, decimal) {
  let s = String(v).replace(decimal ? /[^\d.,]/g : /\D/g, '');
  if (decimal) {
    const i = s.search(/[.,]/);
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '');
  }
  return s;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* запасной способ ниже */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* noop */ }
  ta.remove();
  return ok;
}

// ── Поля ввода ──────────────────────────────────────────────────

function Num({ value, onChange, onBlur, label, suffix, placeholder, decimal, group, cls, aria }) {
  const [focus, setFocus] = useState(false);
  const raw = value === null || value === undefined ? '' : String(value);
  const shown = group && !focus && raw !== '' ? fmtInt(raw) : raw;
  const onInput = (e) => {
    const v = cleanNum(e.target.value, decimal);
    if (v !== e.target.value) e.target.value = v;
    onChange(v);
  };
  return html`
    <label class=${'field ' + (cls || '')}>
      ${label ? html`<span class="field__label">${label}</span>` : null}
      <span class="field__box">
        <input type="text" inputmode=${decimal ? 'decimal' : 'numeric'} autocomplete="off" enterkeyhint="done"
          value=${shown} placeholder=${placeholder ?? '0'} aria-label=${aria || label}
          onInput=${onInput}
          onFocus=${(e) => { setFocus(true); const el = e.target; requestAnimationFrame(() => el.select()); }}
          onBlur=${() => { setFocus(false); onBlur?.(); }} />
        ${suffix ? html`<span class="field__suffix">${suffix}</span>` : null}
      </span>
    </label>`;
}

function Stepper({ value, onChange, label }) {
  const n = num(value);
  return html`
    <div class="field field--stepper">
      <span class="field__label">${label}</span>
      <span class="stepper">
        <button type="button" class="stepper__btn" aria-label="Меньше" onClick=${() => onChange(Math.max(1, n - 1))}>${Icon.minus()}</button>
        <input type="text" inputmode="numeric" autocomplete="off" value=${value} aria-label=${label}
          onInput=${(e) => { const v = cleanNum(e.target.value); if (v !== e.target.value) e.target.value = v; onChange(v); }}
          onFocus=${(e) => { const el = e.target; requestAnimationFrame(() => el.select()); }} />
        <button type="button" class="stepper__btn" aria-label="Больше" onClick=${() => onChange(n + 1)}>${Icon.plus()}</button>
      </span>
    </div>`;
}

function Switch({ on, onChange, label }) {
  return html`
    <button type="button" role="switch" aria-checked=${on ? 'true' : 'false'} class=${'switch' + (on ? ' is-on' : '')}
      aria-label=${label} onClick=${() => onChange(!on)}><span class="switch__dot"></span></button>`;
}

function AutoText({ value, onInput, placeholder, innerRef, cls }) {
  const own = useRef(null);
  const ref = innerRef || own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return html`<textarea ref=${ref} class=${'textarea ' + (cls || '')} value=${value} placeholder=${placeholder}
    onInput=${(e) => onInput(e.target.value)} rows="3"></textarea>`;
}

// ── Схема фигуры с нажимаемыми гранями ──────────────────────────

function Diagram({ item, onToggle }) {
  const W = 240, H = 140, PX = 30, PY = 26;
  const bw = W - PX * 2, bh = H - PY * 2;
  const cx = W / 2, cy = H / 2;
  const edges = item.edges || {};
  const area = faceArea(item);
  const sides = shapeSides(item);
  const len = Object.fromEntries(sides.map((s) => [s.id, s.len]));

  const edgeProps = (id) => ({
    role: 'switch', tabindex: 0, 'aria-checked': edges[id] ? 'true' : 'false',
    onClick: () => onToggle(id),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } },
  });

  if (item.shape === 'circle') {
    const r = Math.min(bw, bh) / 2 + 8;
    const on = !!edges.c;
    return html`
      <svg class=${'diagram' + (area ? '' : ' is-ghost')} viewBox="0 0 ${W} ${H}" role="group" aria-label="Схема: нажмите на край, чтобы учесть торец">
        <circle class="diagram__fill" cx=${cx} cy=${cy} r=${r} />
        <circle class=${'edge' + (on ? ' is-on' : '')} cx=${cx} cy=${cy} r=${r} fill="none" />
        <circle class="edge-hit" cx=${cx} cy=${cy} r=${r} fill="none" aria-label="Торец по окружности" ...${edgeProps('c')} />
        <text class="diagram__center" x=${cx} y=${cy + 4} text-anchor="middle">${area ? '⌀ ' + fmtInt(item.d) : 'диаметр'}</text>
      </svg>`;
  }

  // Прямоугольник и трапеция: горизонталь — длина, вертикаль — ширина (стороны A и B).
  const isTrap = item.shape === 'trap';
  let lx = isTrap ? num(item.h) : num(item.l);
  let la = isTrap ? num(item.a) : num(item.w);
  let lb = isTrap ? num(item.b) : num(item.w);
  const ghost = !(lx > 0 && Math.max(la, lb) > 0);
  if (ghost) { lx = 2; la = isTrap ? 0.6 : 1; lb = 1; }
  const ly = Math.max(la, lb);
  const s = Math.min(bw / lx, bh / ly);
  const dw = Math.min(bw, Math.max(lx * s, 64));
  const dh = Math.min(bh, Math.max(ly * s, 40));
  const x0 = cx - dw / 2, x1 = cx + dw / 2;
  const ha = (dh * la) / ly / 2, hb = (dh * lb) / ly / 2;
  const P = { tl: [x0, cy - ha], tr: [x1, cy - hb], br: [x1, cy + hb], bl: [x0, cy + ha] };
  const lines = [
    { id: 't', a: P.tl, b: P.tr, name: 'Верхняя грань' },
    { id: 'r', a: P.tr, b: P.br, name: 'Правая грань' },
    { id: 'b', a: P.br, b: P.bl, name: 'Нижняя грань' },
    { id: 'l', a: P.bl, b: P.tl, name: 'Левая грань' },
  ];
  const label = (id) => (ghost || !len[id] ? '' : fmtInt(len[id]));
  const midT = (P.tl[1] + P.tr[1]) / 2, midB = (P.bl[1] + P.br[1]) / 2;

  return html`
    <svg class=${'diagram' + (ghost ? ' is-ghost' : '')} viewBox="0 0 ${W} ${H}" role="group" aria-label="Схема: нажмите на грань, чтобы учесть торец">
      <polygon class="diagram__fill" points=${[P.tl, P.tr, P.br, P.bl].map((p) => p.join(',')).join(' ')} />
      ${lines.map((ln) => html`
        <line class=${'edge' + (edges[ln.id] ? ' is-on' : '')} x1=${ln.a[0]} y1=${ln.a[1]} x2=${ln.b[0]} y2=${ln.b[1]} />`)}
      <text class=${'diagram__dim' + (edges.t ? ' is-on' : '')} x=${cx} y=${midT - 9} text-anchor="middle">${label('t')}</text>
      <text class=${'diagram__dim' + (edges.b ? ' is-on' : '')} x=${cx} y=${midB + 17} text-anchor="middle">${label('b')}</text>
      <text class=${'diagram__dim' + (edges.l ? ' is-on' : '')} x=${x0 - 10} y=${cy} text-anchor="middle"
        transform="rotate(-90 ${x0 - 10} ${cy})">${label('l')}</text>
      <text class=${'diagram__dim' + (edges.r ? ' is-on' : '')} x=${x1 + 10} y=${cy} text-anchor="middle"
        transform="rotate(90 ${x1 + 10} ${cy})">${label('r')}</text>
      ${lines.map((ln) => html`
        <line class="edge-hit" x1=${ln.a[0]} y1=${ln.a[1]} x2=${ln.b[0]} y2=${ln.b[1]} aria-label=${ln.name} ...${edgeProps(ln.id)} />`)}
    </svg>`;
}

// ── Карточка позиции ────────────────────────────────────────────

function ItemCard({ item, kind, index, onChange, onDelete, onDuplicate }) {
  const K = KINDS[kind];
  const g = itemGeometry(item);
  const set = (key) => (v) => onChange((it) => { it[key] = v; });
  const sides = shapeSides(item);
  const allOn = sides.length > 0 && sides.every((s) => item.edges?.[s.id]);
  const anyOn = sides.some((s) => item.edges?.[s.id]);
  const isCustom = item.shape === 'custom';

  const setShape = (shape) => onChange((it) => {
    const keep = ['rect', 'trap'].includes(it.shape) && ['rect', 'trap'].includes(shape);
    if (!keep) it.edges = {};
    it.shape = shape;
  });
  const toggleEdge = (id) => onChange((it) => { it.edges = { ...(it.edges || {}), [id]: !it.edges?.[id] }; });
  const setAll = (on) => onChange((it) => { it.edges = on ? Object.fromEntries(shapeSides(it).map((s) => [s.id, true])) : {}; });

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
          <button type="button" role="radio" aria-checked=${item.shape === s.id ? 'true' : 'false'}
            class=${'shape-seg__btn' + (item.shape === s.id ? ' is-on' : '')} onClick=${() => setShape(s.id)}>
            ${Icon[s.id]()}<span>${s.label}</span>
          </button>`)}
      </div>

      <div class=${'item__body' + (isCustom ? ' item__body--flat' : '')}>
        <div class="item__fields">
          <div class="fields">
            ${isCustom
              ? html`
                <${Num} label="Площадь" suffix="м²" decimal value=${item.area} onChange=${set('area')} placeholder="0,00" />
                <${Num} label="Длина торцов" suffix="мм" value=${item.edgeLen} onChange=${set('edgeLen')} />`
              : K.fields[item.shape].map(([key, label]) => html`
                <${Num} key=${key} label=${label} suffix="мм" value=${item[key]} onChange=${set(key)} />`)}
          </div>
          <div class="fields">
            <${Stepper} label="Количество" value=${item.qty} onChange=${set('qty')} />
            <${Num} label="Толщина торца" suffix="мм" value=${item.thickness} onChange=${set('thickness')} />
          </div>
          <div class="chips">
            ${!isCustom ? html`
              <button type="button" class=${'chip' + (allOn ? ' is-on' : '')} aria-pressed=${allOn ? 'true' : 'false'}
                onClick=${() => setAll(!allOn)}>${item.shape === 'circle' ? 'Торец по кругу' : 'Все торцы'}</button>` : null}
            <button type="button" class=${'chip' + (item.bothSides ? ' is-on' : '')} aria-pressed=${item.bothSides ? 'true' : 'false'}
              onClick=${() => set('bothSides')(!item.bothSides)}>Обе стороны</button>
          </div>
        </div>

        ${!isCustom ? html`
          <div class="item__diagram">
            <${Diagram} item=${item} onToggle=${toggleEdge} />
            <p class="item__hint">${anyOn ? 'Выделенные грани войдут в расчёт' : 'Нажмите на грани, которые нужно обработать'}</p>
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

function Section({ no, kind, items, settings, upDraft, withUndo }) {
  const K = KINDS[kind];
  const area = sectionArea(items);
  const count = items.reduce((s, it) => s + num(it.qty), 0);
  const add = (shape) => upDraft((d) => { d[kind].push(newItem(kind, shape, settings)); });
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

// ── Условия: ночная работа ──────────────────────────────────────

const NIGHT_STEPS = ['1.5', '1.6', '1.7', '1.8', '1.9', '2'];

function Conditions({ draft, upDraft }) {
  const n = draft.night;
  const k = num(n.k);
  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">03</span>
        <div class="section__title"><h2>Условия</h2><p>Коэффициент к стоимости работ</p></div>
      </header>
      <div class=${'card night' + (n.on ? ' is-on' : '')}>
        <div class="night__row">
          <div>
            <h3>Ночная работа</h3>
            <p>Цена умножается на коэффициент от 1,5 до 2</p>
          </div>
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
      </div>
    </section>`;
}

// ── Итог ────────────────────────────────────────────────────────

function PriceTile({ coat, price, value, onChange, currency }) {
  return html`
    <div class=${'price' + (price.manual ? ' is-manual' : '')}>
      <div class="price__head">
        <span class="price__label">${COAT_LABEL[coat]}</span>
        ${price.manual
          ? html`<button type="button" class="price__reset" onClick=${() => onChange('')} title="Вернуть расчётную цену">
              ${Icon.reset()}<span>расчёт ${fmtInt(price.auto)}</span></button>`
          : html`<span class="price__tag">расчёт</span>`}
      </div>
      <${Num} cls="field--price" group suffix=${currency} value=${value ?? ''} placeholder=${fmtInt(price.auto)}
        aria=${COAT_LABEL[coat] + ': цена вручную'} onChange=${onChange} />
    </div>`;
}

function Summary({ draft, settings, totals, upDraft, onNew }) {
  const rows = [['surfaces', 'Поверхности'], ['stairs', 'Лестница']]
    .filter(([key]) => key === 'surfaces' || draft.stairs.length > 0);
  const setRate = (key, coat) => (v) => upDraft((d) => { d.rates[key][coat] = v; });

  return html`
    <div class="card total">
      <div class="total__head">
        <span class="eyebrow">Итог</span>
        <button type="button" class="link-btn" onClick=${onNew}>Новый расчёт</button>
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
      </div>

      <div class="prices">
        ${['lacquer', 'oil'].map((c) => html`
          <${PriceTile} key=${c} coat=${c} price=${totals.price[c]} currency=${settings.currency}
            value=${draft.manual[c]} onChange=${(v) => upDraft((d) => { d.manual[c] = v; })} />`)}
      </div>
      <p class="total__note">Нажмите на цену или ставку, чтобы указать свою. Пустое поле — расчёт по прайсу.</p>
    </div>`;
}

function TemplateCard({ tpl, vars, settings, upSettings, toast }) {
  const [done, setDone] = useState(false);
  const parts = templateParts(tpl.body, vars);
  const text = parts.map((p) => p.text).join('');
  const keys = usedKeys(tpl.body, vars);
  const services = settings.services.filter((s) => keys.includes(normKey(s.key)));

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

function CalcPage({ draft, settings, totals, vars, upDraft, upSettings, withUndo, toast, onNew }) {
  const summaryRef = useRef(null);
  const [barHidden, setBarHidden] = useState(false);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBarHidden(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return html`
    <div class="layout">
      <div class="layout__main">
        <${Section} no="01" kind="surfaces" items=${draft.surfaces} settings=${settings} upDraft=${upDraft} withUndo=${withUndo} />
        <${Section} no="02" kind="stairs" items=${draft.stairs} settings=${settings} upDraft=${upDraft} withUndo=${withUndo} />
        <${Conditions} draft=${draft} upDraft=${upDraft} />
      </div>

      <aside class="layout__aside" id="summary" ref=${summaryRef}>
        <${Summary} draft=${draft} settings=${settings} totals=${totals} upDraft=${upDraft} onNew=${onNew} />
        ${settings.templates.map((tpl) => html`
          <${TemplateCard} key=${tpl.id} tpl=${tpl} vars=${vars} settings=${settings} upSettings=${upSettings} toast=${toast} />`)}
      </aside>
    </div>

    <div class=${'bar' + (barHidden ? ' is-hidden' : '')}>
      <div class="bar__price"><span>Лак</span><b>${fmtPrice(totals.price.lacquer.final, settings.currency)}</b></div>
      <div class="bar__price"><span>Масло</span><b>${fmtPrice(totals.price.oil.final, settings.currency)}</b></div>
      <button type="button" class="btn btn--primary bar__btn"
        onClick=${() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <span>Текст</span>${Icon.down()}
      </button>
    </div>`;
}

// ── Страница «Цены» ─────────────────────────────────────────────

function TierTable({ title, hint, tiers, onChange }) {
  const up = (id, key) => (v) => onChange((list) => { const t = list.find((x) => x.id === id); if (t) t[key] = v; });
  const sort = () => onChange((list) => { list.sort((a, b) => num(a.from) - num(b.from)); });
  const add = () => onChange((list) => {
    const last = sortedTiers(list).at(-1);
    list.push({ id: uid(), from: last ? num(last.from) + (num(last.from) >= 5 ? 5 : 1) : 0, oil: last?.oil ?? 0, lacquer: last?.lacquer ?? 0 });
  });
  return html`
    <div class="tiers">
      <div class="tiers__title"><h3>${title}</h3><p>${hint}</p></div>
      <div class="tiers__grid">
        <div class="tiers__row tiers__row--head"><span>Площадь от</span><span>Масло</span><span>Лак</span><span></span></div>
        ${tiers.map((t) => html`
          <div class="tiers__row" key=${t.id}>
            <${Num} decimal suffix="м²" aria="Площадь от" value=${t.from} onChange=${up(t.id, 'from')} onBlur=${sort} />
            <${Num} group suffix="₽" aria="Масло, цена за м²" value=${t.oil} onChange=${up(t.id, 'oil')} />
            <${Num} group suffix="₽" aria="Лак, цена за м²" value=${t.lacquer} onChange=${up(t.id, 'lacquer')} />
            <button type="button" class="icon-btn" aria-label="Удалить диапазон" disabled=${tiers.length < 2}
              onClick=${() => onChange((list) => { const i = list.findIndex((x) => x.id === t.id); if (i >= 0) list.splice(i, 1); })}>${Icon.x()}</button>
          </div>`)}
      </div>
      <button type="button" class="adder adder--sm" onClick=${add}><span>Диапазон</span>${Icon.plus()}</button>
    </div>`;
}

const CLOUD_TEXT = {
  off: ['Облако не подключено', 'Цены и тексты хранятся в этом браузере. После настройки Firebase они будут одинаковыми на телефоне и компьютере.'],
  init: ['Подключение…', 'Соединяюсь с Firebase.'],
  signedOut: ['Войдите, чтобы синхронизировать', 'Цены и тексты будут сохраняться в вашем Firebase.'],
  syncing: ['Синхронизация…', ''],
  synced: ['Синхронизировано', ''],
  error: ['Ошибка облака', ''],
};

function PricesPage({ settings, upSettings, cloud, toast, replaceSettings }) {
  const fileRef = useRef(null);
  const upTiers = (key) => (fn) => upSettings((s) => { fn(s.prices[key]); });
  const [title, text] = CLOUD_TEXT[cloud.status] || CLOUD_TEXT.off;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ceny-i-teksty-${new Date().toISOString().slice(0, 10)}.json`;
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
      replaceSettings(normalizeSettings(data));
      toast('Цены и тексты загружены из файла');
    } catch { toast('Файл не подошёл'); }
  };

  return html`
    <div class="page">
      <section class="section">
        <header class="section__head">
          <span class="section__no">01</span>
          <div class="section__title"><h2>Цена за м²</h2><p>Диапазоны по площади: чем больше заказ, тем ниже ставка</p></div>
        </header>
        <div class="card">
          <${TierTable} title="Поверхности" hint="Столешницы, столы, подоконники" tiers=${settings.prices.surfaces} onChange=${upTiers('surfaces')} />
          <hr class="rule" />
          <${TierTable} title="Лестница" hint="Ступени и площадки" tiers=${settings.prices.stairs} onChange=${upTiers('stairs')} />
          <hr class="rule" />
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
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">03</span>
          <div class="section__title"><h2>Расчёт</h2><p>Округление и значения по умолчанию</p></div>
        </header>
        <div class="card">
          <div class="setting">
            <div><h3>Округление цены</h3><p>Итог округляется до ближайшего значения</p></div>
            <div class="chips">
              ${[1, 50, 100, 500, 1000].map((v) => html`
                <button type="button" class=${'chip chip--num' + (num(settings.rounding) === v ? ' is-on' : '')}
                  onClick=${() => upSettings((s) => { s.rounding = v; })}>${v === 1 ? 'до рубля' : fmtInt(v)}</button>`)}
            </div>
          </div>
          <hr class="rule" />
          <div class="setting">
            <div><h3>Значения по умолчанию</h3><p>Подставляются в новые позиции и расчёты</p></div>
            <div class="fields fields--tight">
              <${Num} label="Ночной коэф." decimal suffix="×" value=${settings.nightK} onChange=${(v) => upSettings((s) => { s.nightK = v; })} />
              <${Num} label="Толщина торца" suffix="мм" value=${settings.edgeThickness} onChange=${(v) => upSettings((s) => { s.edgeThickness = v; })} />
              <label class="field">
                <span class="field__label">Валюта</span>
                <span class="field__box"><input type="text" value=${settings.currency} maxlength="6"
                  onInput=${(e) => upSettings((s) => { s.currency = e.target.value; })} /></span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <header class="section__head">
          <span class="section__no">04</span>
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
            <div><h3>Резервная копия</h3><p>Все цены и тексты одним файлом</p></div>
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
            <span class="chips__label">Вставить цену</span>
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

// ── Приложение ──────────────────────────────────────────────────

const TABS = [['calc', 'Расчёт'], ['prices', 'Цены'], ['texts', 'Тексты']];
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' };
const tabFromHash = () => (TABS.some(([id]) => '#' + id === location.hash) ? location.hash.slice(1) : 'calc');

function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [draft, setDraft] = useState(() => loadDraft(settings));
  const [tab, setTab] = useState(tabFromHash);
  const [theme, setTheme] = useState(loadTheme);
  const [cloud, setCloud] = useState({ status: cloudConfigured ? 'init' : 'off', user: null });
  const [toastState, setToastState] = useState(null);
  const settingsRef = useRef(settings);
  const remoteAt = useRef(null);
  const toastTimer = useRef(null);
  settingsRef.current = settings;

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
  const onNew = () => { withUndo('Начат новый расчёт'); setDraft(defaultDraft(settings)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // Сохранение
  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => {
    saveSettings(settings);
    if (!cloudConfigured || !cloud.user || settings.updatedAt === remoteAt.current) return;
    const t = setTimeout(() => {
      pushSettings(settings).catch((e) => setCloud((c) => ({ ...c, status: 'error', error: e.message })));
    }, 900);
    return () => clearTimeout(t);
  }, [settings, cloud.user]);

  // Облако
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
    });
  }, []);

  // Навигация и тема
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

  const totals = useMemo(() => calcTotals(draft, settings), [draft, settings]);
  const vars = useMemo(() => templateVars(totals, settings), [totals, settings]);
  const ThemeIcon = theme === 'auto' ? Icon.auto : theme === 'light' ? Icon.sun : Icon.moon;

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
            <a href=${'#' + id} class=${'tabs__btn' + (tab === id ? ' is-on' : '')} aria-current=${tab === id ? 'page' : null}>${label}</a>`)}
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
        <${CalcPage} draft=${draft} settings=${settings} totals=${totals} vars=${vars}
          upDraft=${upDraft} upSettings=${upSettings} withUndo=${withUndo} toast=${toast} onNew=${onNew} />` : null}
      ${tab === 'prices' ? html`
        <${PricesPage} settings=${settings} upSettings=${upSettings} cloud=${cloud} toast=${toast} replaceSettings=${replaceSettings} />` : null}
      ${tab === 'texts' ? html`
        <${TextsPage} settings=${settings} vars=${vars} upSettings=${upSettings} withUndoSettings=${withUndoSettings} />` : null}
    </main>

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
