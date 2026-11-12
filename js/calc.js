// Чистая логика расчёта: геометрия, тарифы, цены, подстановка в тексты.
// Без обращения к DOM — этот файл проверяется тестами (tests/calc.test.mjs).

/** Разбор числа из поля ввода: «2 000», «1,5», «1.5» → число. Пустое/мусор → 0. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export const COATS = ['oil', 'lacquer'];

const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

/** Площадь многоугольника со знаком (формула шнурков), в единицах координат². */
export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/**
 * Контур фигуры в мм (x вправо, y вниз) и идентификаторы сторон.
 * Сторона i идёт от точки i к точке i+1.
 *   Прямоугольник: t/b — длина, l/r — ширина.
 *   Трапеция: l и r — параллельные стороны A и B; t/b — боковые грани.
 *     Обычный режим — длина (расстояние между A и B), трапеция равнобокая.
 *     Режим «4 грани» — боковые грани s1 (верх) и s2 (низ) задаются отдельно.
 *   Своя форма: точки, нарисованные в редакторе.
 */
export function shapeOutline(item) {
  switch (item.shape) {
    case 'rect': {
      const l = num(item.l), w = num(item.w);
      return {
        pts: [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: w }, { x: 0, y: w }],
        ids: ['t', 'r', 'b', 'l'], valid: l > 0 && w > 0,
      };
    }
    case 'trap': {
      const a = num(item.a), b = num(item.b);
      const ids = ['t', 'r', 'b', 'l'];
      if (item.four) {
        const c = num(item.s1), d = num(item.s2), k = b - a;
        let t = 0, h = 0;
        if (Math.abs(k) < 1e-9) h = c > 0 && d > 0 ? (c + d) / 2 : 0;
        else {
          t = (d * d - c * c - k * k) / (2 * k);
          const h2 = c * c - t * t;
          h = h2 > 0 ? Math.sqrt(h2) : 0;
        }
        const valid = h > 0 && a + b > 0 && c > 0 && d > 0;
        if (!valid) return { pts: [], ids, valid: false, filled: a + b > 0 && c > 0 && d > 0 };
        return { pts: [{ x: 0, y: 0 }, { x: h, y: t }, { x: h, y: t + b }, { x: 0, y: a }], ids, valid };
      }
      const h = num(item.h), m = Math.max(a, b);
      return {
        pts: [{ x: 0, y: (m - a) / 2 }, { x: h, y: (m - b) / 2 }, { x: h, y: (m + b) / 2 }, { x: 0, y: (m + a) / 2 }],
        ids, valid: h > 0 && m > 0,
      };
    }
    case 'poly': {
      const pts = (item.pts || []).map((p) => ({ x: num(p.x), y: num(p.y) }));
      return { pts, ids: pts.map((_, i) => String(i)), valid: pts.length >= 3 && Math.abs(polyArea(pts)) > 0 };
    }
    default:
      return { pts: [], ids: [], valid: false };
  }
}

/** Грани (торцы) фигуры: длина в мм и признак «учитывается». */
export function shapeSides(item) {
  if (item.shape === 'circle') return [{ id: 'c', len: Math.PI * num(item.d), on: !!item.edges?.c }];
  const o = shapeOutline(item);
  return o.ids.map((id, i) => ({
    id,
    len: o.pts.length ? dist(o.pts[i], o.pts[(i + 1) % o.pts.length]) : 0,
    on: item.shape === 'poly' ? !!item.pts?.[i]?.e : !!item.edges?.[id],
  }));
}

/** Площадь лицевой поверхности одной штуки, м². */
export function faceArea(item) {
  switch (item.shape) {
    case 'circle': { const d = num(item.d); return (Math.PI * d * d) / 4 / 1e6; }
    case 'custom': return num(item.area);
    default: {
      const o = shapeOutline(item);
      return o.valid ? Math.abs(polyArea(o.pts)) / 1e6 : 0;
    }
  }
}

/** Изменить длину стороны i: соседняя сторона сдвигается параллельно себе (прямые углы сохраняются). */
export function setSideLength(pts, i, length) {
  const n = pts.length;
  const a = pts[i], b = pts[(i + 1) % n];
  const len = dist(a, b);
  if (!(len > 0) || !(length > 0)) return pts;
  const k = (length - len) / len;
  const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k;
  const out = pts.map((p) => ({ ...p }));
  const move = n > 3 ? [(i + 1) % n, (i + 2) % n] : [(i + 1) % n];
  for (const j of move) { out[j].x = Math.round((out[j].x + dx) * 10) / 10; out[j].y = Math.round((out[j].y + dy) * 10) / 10; }
  return out;
}

/** Полная геометрия позиции: лицевая площадь, кромка, итог с учётом количества. */
export function itemGeometry(item) {
  const qty = Math.max(0, num(item.qty));
  const face = faceArea(item) * (item.bothSides ? 2 : 1);
  const edgeLen = item.shape === 'custom'
    ? num(item.edgeLen)
    : shapeSides(item).reduce((s, side) => s + (side.on ? side.len : 0), 0);
  const edge = (edgeLen * num(item.thickness)) / 1e6;
  const unit = face + edge;
  return { qty, face, edgeLen, edge, unit, total: unit * qty };
}

export function sectionArea(items) {
  return (items || []).reduce((s, it) => s + itemGeometry(it).total, 0);
}

const isSet = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** Диапазоны по возрастанию «от». */
export function sortedTiers(tiers) {
  return [...(tiers || [])].sort((x, y) => num(x.from) - num(y.from));
}

/**
 * Диапазон цены для площади. Сначала ищется диапазон, в который площадь попадает
 * («от» ≤ площадь ≤ «до»; пустое «до» — без верхней границы). Если такого нет
 * (площадь между диапазонами или за их пределами) — берётся ближайший, exact = false.
 */
export function pickTier(tiers, area) {
  const list = sortedTiers(tiers);
  if (!list.length) return { tier: null, exact: true };
  const eps = 1e-9;
  const lo = (t) => num(t.from);
  const hi = (t) => (isSet(t.to) ? num(t.to) : Infinity);
  let hit = null;
  for (const t of list) if (lo(t) <= area + eps && area <= hi(t) + eps) hit = t;
  if (hit) return { tier: hit, exact: true };
  let best = list[0], bestGap = Infinity;
  for (const t of list) {
    const gap = area < lo(t) ? lo(t) - area : area - hi(t);
    if (gap < bestGap - eps) { best = t; bestGap = gap; }
  }
  return { tier: best, exact: false };
}

/** Подпись диапазона: «0,1–0,9 м²», «от 3 м²», «до 1 м²». */
export function tierLabel(tier) {
  if (!tier) return '';
  const from = num(tier.from), hasTo = isSet(tier.to);
  if (hasTo) return from > 0 ? `${fmtNum(from)}–${fmtNum(tier.to)} м²` : `до ${fmtNum(tier.to)} м²`;
  return from > 0 ? `от ${fmtNum(from)} м²` : '';
}

export function roundTo(value, step) {
  const s = num(step) || 1;
  return Math.round(value / s) * s;
}

/** Главный расчёт: площади, применённые ставки, итоговые цены. */
export function calcTotals(draft, settings) {
  const show = draft.show || { surfaces: true, stairs: true };
  const area = {
    surfaces: show.surfaces ? sectionArea(draft.surfaces) : 0,
    stairs: show.stairs ? sectionArea(draft.stairs) : 0,
  };
  area.total = area.surfaces + area.stairs;

  const sections = {};
  for (const key of ['surfaces', 'stairs']) {
    const tiers = settings.prices[key];
    const basis = settings.tierBy === 'section' ? area[key] : area.total;
    const { tier, exact } = pickTier(tiers, basis);
    const rate = {}, auto = {}, overridden = {};
    for (const c of COATS) {
      auto[c] = num(tier?.[c]);
      const ov = draft.rates?.[key]?.[c];
      overridden[c] = isSet(ov);
      rate[c] = overridden[c] ? num(ov) : auto[c];
    }
    sections[key] = {
      area: area[key], tier, rate, auto, overridden,
      label: tiers.length > 1 ? tierLabel(tier) : '',
      exact: exact || basis <= 0,
    };
  }

  const k = draft.night?.on ? Math.max(1, num(draft.night.k)) : 1;
  const has = area.total > 0;
  const minOrder = has ? num(settings.minOrder) : 0;
  const minDiff = has ? num(settings.minDiff) : 0;
  const price = {};
  // Масло считается первым: цена лака зависит от него (минимальная разница).
  for (const c of COATS) {
    const base = area.surfaces * sections.surfaces.rate[c] + area.stairs * sections.stairs.rate[c];
    const calc = roundTo(base * k, settings.rounding);
    let auto = calc, note = '';
    if (auto < minOrder) { auto = minOrder; note = 'min'; }
    if (c === 'lacquer' && minDiff > 0 && auto < price.oil.final + minDiff) { auto = price.oil.final + minDiff; note = 'diff'; }
    const manual = draft.manual?.[c];
    price[c] = { base, calc, auto, note, manual: isSet(manual), final: isSet(manual) ? num(manual) : auto };
  }
  return { area, sections, k, price };
}

// ── Форматирование ──────────────────────────────────────────────

const NBSP = ' ';

export function fmtNum(n, digits = 2) {
  return num(n).toLocaleString('ru-RU', { maximumFractionDigits: digits });
}
export function fmtArea(n) {
  return num(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtInt(n) {
  return Math.round(num(n)).toLocaleString('ru-RU');
}
export function fmtPrice(n, currency = '₽') {
  return `${fmtInt(n)}${currency ? NBSP + currency : ''}`;
}

/** Склонение: plural(5, ['ступень','ступени','ступеней']). */
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

// ── Тексты ──────────────────────────────────────────────────────

export const normKey = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_');

/** Значения для подстановки в шаблоны: {лак}, {масло}, {площадь} и ключи доп. услуг. */
export function templateVars(totals, settings) {
  const cur = settings.currency;
  const vars = {
    'лак': fmtPrice(totals.price.lacquer.final, cur),
    'масло': fmtPrice(totals.price.oil.final, cur),
    'площадь': `${fmtArea(totals.area.total)}${NBSP}м²`,
  };
  for (const s of settings.services || []) {
    const key = normKey(s.key);
    if (key && !(key in vars)) vars[key] = fmtPrice(s.price, cur);
  }
  return vars;
}

/** Разбивает шаблон на части: обычный текст и подставленные значения. */
export function templateParts(body, vars) {
  const parts = [];
  const re = /\{([^{}\n]+)\}/g;
  let last = 0, m;
  const text = String(body ?? '');
  while ((m = re.exec(text))) {
    const key = normKey(m[1]);
    if (!(key in vars)) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: vars[key], key });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function renderTemplate(body, vars) {
  return templateParts(body, vars).map((p) => p.text).join('');
}

/** Ключи подстановок, реально использованные в шаблоне. */
export function usedKeys(body, vars) {
  return [...new Set(templateParts(body, vars).filter((p) => p.key).map((p) => p.key))];
}
