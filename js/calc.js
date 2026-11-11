// Чистая логика расчёта: геометрия, тарифы, цены, подстановка в тексты.
// Без обращения к DOM — этот файл проверяется тестами (tests/calc.test.mjs).

/** Разбор числа из поля ввода: «2 000», «1,5», «1.5» → число. Пустое/мусор → 0. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export const COATS = ['oil', 'lacquer'];

/**
 * Грани (торцы) фигуры. Длины в мм.
 * Прямоугольник: t/b — длина, l/r — ширина.
 * Трапеция: l и r — параллельные стороны (A и B), t/b — боковые (равнобокая трапеция).
 * Круг: одна грань c — окружность.
 */
export function shapeSides(item) {
  switch (item.shape) {
    case 'rect': {
      const l = num(item.l), w = num(item.w);
      return [
        { id: 't', len: l }, { id: 'r', len: w },
        { id: 'b', len: l }, { id: 'l', len: w },
      ];
    }
    case 'trap': {
      const a = num(item.a), b = num(item.b), h = num(item.h);
      const leg = h > 0 ? Math.hypot(h, (a - b) / 2) : 0;
      return [
        { id: 't', len: leg }, { id: 'r', len: b },
        { id: 'b', len: leg }, { id: 'l', len: a },
      ];
    }
    case 'circle':
      return [{ id: 'c', len: Math.PI * num(item.d) }];
    default:
      return [];
  }
}

/** Площадь лицевой поверхности одной штуки, м². */
export function faceArea(item) {
  switch (item.shape) {
    case 'rect': return (num(item.l) * num(item.w)) / 1e6;
    case 'trap': return ((num(item.a) + num(item.b)) / 2 * num(item.h)) / 1e6;
    case 'circle': { const d = num(item.d); return (Math.PI * d * d) / 4 / 1e6; }
    case 'custom': return num(item.area);
    default: return 0;
  }
}

/** Полная геометрия позиции: лицевая площадь, кромка, итог с учётом количества. */
export function itemGeometry(item) {
  const qty = Math.max(0, num(item.qty));
  const face = faceArea(item) * (item.bothSides ? 2 : 1);
  const edgeLen = item.shape === 'custom'
    ? num(item.edgeLen)
    : shapeSides(item).reduce((s, side) => s + (item.edges?.[side.id] ? side.len : 0), 0);
  const edge = (edgeLen * num(item.thickness)) / 1e6;
  const unit = face + edge;
  return { qty, face, edgeLen, edge, unit, total: unit * qty };
}

export function sectionArea(items) {
  return (items || []).reduce((s, it) => s + itemGeometry(it).total, 0);
}

/** Диапазоны по возрастанию «от». */
export function sortedTiers(tiers) {
  return [...(tiers || [])].sort((x, y) => num(x.from) - num(y.from));
}

/** Диапазон цены для площади: последний, у которого «от» ≤ площади. */
export function pickTier(tiers, area) {
  const list = sortedTiers(tiers);
  let hit = list[0] || null;
  for (const t of list) if (num(t.from) <= area + 1e-9) hit = t;
  return hit;
}

/** Подпись диапазона: «до 1 м²», «1–10 м²», «от 10 м²». */
export function tierLabel(tiers, tier) {
  const list = sortedTiers(tiers);
  if (list.length < 2 || !tier) return '';
  const i = list.indexOf(tier);
  const from = fmtNum(num(tier.from));
  const next = list[i + 1];
  if (!next) return `от ${from} м²`;
  const to = fmtNum(num(next.from));
  return i === 0 && num(tier.from) === 0 ? `до ${to} м²` : `${from}–${to} м²`;
}

export function roundTo(value, step) {
  const s = num(step) || 1;
  return Math.round(value / s) * s;
}

const isSet = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** Главный расчёт: площади, применённые ставки, итоговые цены. */
export function calcTotals(draft, settings) {
  const area = {
    surfaces: sectionArea(draft.surfaces),
    stairs: sectionArea(draft.stairs),
  };
  area.total = area.surfaces + area.stairs;

  const sections = {};
  for (const key of ['surfaces', 'stairs']) {
    const tiers = settings.prices[key];
    const basis = settings.tierBy === 'section' ? area[key] : area.total;
    const tier = pickTier(tiers, basis);
    const rate = {}, auto = {}, overridden = {};
    for (const c of COATS) {
      auto[c] = num(tier?.[c]);
      const ov = draft.rates?.[key]?.[c];
      overridden[c] = isSet(ov);
      rate[c] = overridden[c] ? num(ov) : auto[c];
    }
    sections[key] = { area: area[key], tier, label: tierLabel(tiers, tier), rate, auto, overridden };
  }

  const k = draft.night?.on ? Math.max(1, num(draft.night.k)) : 1;
  const price = {};
  for (const c of COATS) {
    const base = area.surfaces * sections.surfaces.rate[c] + area.stairs * sections.stairs.rate[c];
    const autoPrice = roundTo(base * k, settings.rounding);
    const manual = draft.manual?.[c];
    price[c] = {
      base, auto: autoPrice,
      manual: isSet(manual),
      final: isSet(manual) ? num(manual) : autoPrice,
    };
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
