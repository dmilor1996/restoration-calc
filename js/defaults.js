// Исходные цены и тексты. После первого изменения в интерфейсе
// действуют сохранённые значения (в браузере и, после настройки, в Firebase).

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_TEMPLATES = [
  {
    id: 'main',
    title: 'Основной текст',
    body:
`В вашем случае делается полная шлифовка поверхности в несколько этапов до чистого дерева. Заделываю трещинки, мелкие сколы и прочие возможные дефекты. Поверхность обеспыливается и наносится защитное покрытие, лак или масло-воск.
По стоимости за всё, при нанесении:
Лака — {лак}
Масла — {масло}
Вся работа выполняется профессиональным инструментом и материалами, пыли и грязи не будет, уборка не потребуется.`,
  },
  {
    id: 'sink',
    title: 'Плита и раковина',
    body:
`Отдельно по плите и раковине. Чаще всего их нужно снимать для нормальной обработки всех зон примыкания поверхностей, особенно за ними. Это отдельная процедура, которую вы можете сделать самостоятельно заранее или это могу сделать я. По стоимости за снятие и установку с герметизацией раковины - {раковина}. Плита - {плита}.
Можно сделать шлифовку вручную, но в таком случае чистота и глубина обработки может отличаться от машинной.`,
  },
];

/** Себестоимость: стартовые значения-заготовки, настраиваются на вкладке «Себестоимость». */
export function defaultCost() {
  return {
    rateTarget: 4000,     // желаемый нормочас
    rateMin: 2500,        // ниже этого часа не опускаться
    time: {               // всё в минутах
      sandMin: { oil: 30, lacquer: 60 },    // шлифовка 1 м² старого покрытия: сейчас масло / сейчас лак
      oil: { coatMin: 15, fixedMin: 30 },   // нанесение: минут на м² и минут на заказ (подготовка, уборка, сушка)
      lacquer: { coatMin: 30, fixedMin: 90 },
      stain: { coatMin: 12, fixedMin: 15 }, // покраска морилкой
    },
    stainPrice: 3000,     // цена покраски клиенту, ₽/м²
    materials: [          // kind: oil | lacquer | stain | extra (расходник, добавляется всегда)
      { id: 'm-oil', name: 'Масло-воск', kind: 'oil', volume: 0.75, price: 4500, perM2: 40, layers: 2 },
      { id: 'm-lac', name: 'Лак', kind: 'lacquer', volume: 1, price: 3000, perM2: 100, layers: 3 },
      { id: 'm-stain', name: 'Морилка', kind: 'stain', volume: 1, price: 2500, perM2: 80, layers: 1 },
    ],
    travel: { perKm: 50, costPerKm: 15, speed: 60 },
  };
}

export function defaultSettings() {
  return {
    v: 1,
    updatedAt: 0,
    prices: {
      surfaces: [{ id: 't0', from: 0, to: '', oil: 14000, lacquer: 17000 }],
      stairs: [{ id: 't0', from: 0, to: '', oil: 14000, lacquer: 17000 }],
    },
    tierBy: 'total',      // 'total' — по всей площади заказа, 'section' — по площади раздела
    rounding: 100,        // шаг округления по умолчанию, ₽ (в расчёте его можно поменять)
    roundingDir: 'near',  // near — ближайшее, down — вниз, up — вверх
    minDiff: 5000,        // лак не дешевле масла на эту сумму (0 — не применять)
    minOrder: 0,          // минимальная стоимость заказа (0 — не применять)
    currency: '₽',
    nightK: 1.5,
    edgeThickness: 40,
    services: [
      { id: 'sink', key: 'раковина', name: 'Раковина: снятие и установка с герметизацией', price: 6000, min: 60 },
      { id: 'stove', key: 'плита', name: 'Плита: снятие и установка', price: 1000, min: 15 },
    ],
    cost: defaultCost(),
    templates: structuredClone(DEFAULT_TEMPLATES),
  };
}

export function newItem(kind, shape, settings) {
  return {
    id: uid(), shape, name: '',
    l: '', w: '', d: '', a: '', b: '', h: '', s1: '', s2: '', four: false,
    area: '', edgeLen: '', pts: [],
    qty: 1,
    thickness: settings?.edgeThickness ?? 40,
    edges: {},
    bothSides: false,
  };
}

export function defaultDraft(settings) {
  return {
    v: 1,
    id: null,
    round: { step: null, dir: null },     // округление этого расчёта (null — как в настройках)
    rid: uid(),                           // номер расчёта в «Последних»: правки того же расчёта обновляют одну запись
    mode: 'surfaces',                     // что считаем: surfaces | stairs
    current: 'oil',                       // что на поверхности сейчас: oil | lacquer (влияет на шлифовку)
    coat: 'oil',                          // чем покрываем: oil | lacquer
    finish: { oil: null, lacquer: null }, // выбранный материал для каждого покрытия (null — первый в списке)
    stain: { on: false, id: null },       // покраска морилкой
    client: { name: '', phone: '', address: '', note: '' },
    surfaces: [newItem('surfaces', 'rect', settings)],
    stairs: [],
    services: {},
    travel: { km: '', trips: 1, charge: false, amount: '' },
    night: { on: false, k: settings?.nightK ?? 1.5 },
    rates: { surfaces: {}, stairs: {} },
    manual: {},
  };
}

/** Аккуратно дополняет сохранённые настройки недостающими полями. */
/** Нормы времени: прежние версии хранили часы (и коэффициент для лака) — переводим в минуты. */
function migrateTime(t, dt) {
  const has = (v) => v !== undefined && v !== null && v !== '';
  const m = (v) => Math.round(Number(v) * 60);
  const oldSand = has(t.sand) ? t.sand : t.oil?.sand;      // часов/м², старое масло
  const k = has(t.sandLacquerK) ? Number(t.sandLacquerK) : 2;
  const pick = (cur, hours, def) => (has(cur) ? cur : has(hours) ? m(hours) : def);
  return {
    sandMin: {
      oil: pick(t.sandMin?.oil, oldSand, dt.sandMin.oil),
      lacquer: has(t.sandMin?.lacquer) ? t.sandMin.lacquer : has(oldSand) ? m(oldSand * k) : dt.sandMin.lacquer,
    },
    oil: { coatMin: pick(t.oil?.coatMin, t.oil?.coat, dt.oil.coatMin), fixedMin: pick(t.oil?.fixedMin, t.oil?.fixed, dt.oil.fixedMin) },
    lacquer: { coatMin: pick(t.lacquer?.coatMin, t.lacquer?.coat, dt.lacquer.coatMin), fixedMin: pick(t.lacquer?.fixedMin, t.lacquer?.fixed, dt.lacquer.fixedMin) },
    stain: { coatMin: pick(t.stain?.coatMin, t.stain?.coat, dt.stain.coatMin), fixedMin: pick(t.stain?.fixedMin, t.stain?.fixed, dt.stain.fixedMin) },
  };
}

export function normalizeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw };
  s.prices = { ...d.prices, ...(raw.prices || {}) };
  for (const k of ['surfaces', 'stairs']) {
    if (!Array.isArray(s.prices[k]) || !s.prices[k].length) s.prices[k] = d.prices[k];
    s.prices[k] = s.prices[k].map((t) => ({ id: t.id || uid(), from: t.from ?? 0, to: t.to ?? '', oil: t.oil ?? 0, lacquer: t.lacquer ?? 0 }));
  }
  if (!Array.isArray(s.services)) s.services = d.services;
  if (!Array.isArray(s.templates)) s.templates = d.templates;
  // Время услуг раньше хранилось в часах — переводим в минуты.
  s.services = s.services.map(({ hours, ...x }) => ({
    ...x, min: x.min ?? (hours != null && hours !== '' ? Math.round(Number(hours) * 60) : (d.services.find((y) => y.id === x.id)?.min ?? 0)),
  }));
  const c = raw.cost || {};
  const t = c.time || {}, dt = d.cost.time;
  s.cost = {
    ...d.cost, ...c,
    time: migrateTime(t, dt),
    materials: Array.isArray(c.materials)
      ? c.materials.map((m) => ({ ...m, kind: m.kind || (m.coat === 'both' ? 'extra' : m.coat) || 'oil' }))
      : d.cost.materials,
    travel: { ...d.cost.travel, ...(c.travel || {}) },
  };
  return s;
}

/** Режим расчёта. Старые расчёты, где включались оба раздела: берём тот, где что-то есть (при обоих — поверхности). */
function draftMode(raw) {
  if (raw.mode === 'stairs' || raw.mode === 'surfaces') return raw.mode;
  const hasS = (raw.surfaces || []).length > 0 && raw.show?.surfaces !== false;
  const hasT = (raw.stairs || []).length > 0 && raw.show?.stairs !== false;
  return hasT && !hasS ? 'stairs' : 'surfaces';
}

export function normalizeDraft(raw, settings) {
  const d = defaultDraft(settings);
  if (!raw || typeof raw !== 'object') return d;
  const fix = (list) => (Array.isArray(list) ? list : []).map((it) => ({ ...newItem('', it.shape || 'rect', settings), ...it }));
  return {
    ...d, ...raw,
    id: raw.id || null,
    rid: raw.rid || uid(),
    round: { ...d.round, ...(raw.round || {}) },
    mode: draftMode(raw),
    finish: { ...d.finish, ...(raw.finish || {}) },
    stain: { ...d.stain, ...(raw.stain || {}) },
    client: { ...d.client, ...(raw.client || {}) },
    surfaces: fix(raw.surfaces),
    stairs: fix(raw.stairs),
    services: { ...(raw.services || {}) },
    travel: { ...d.travel, ...(raw.travel || {}) },
    night: { ...d.night, ...(raw.night || {}) },
    rates: { surfaces: { ...(raw.rates?.surfaces || {}) }, stairs: { ...(raw.rates?.stairs || {}) } },
    manual: { ...(raw.manual || {}) },
  };
}
