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
    time: {               // sand, coat — часов на м²; fixed — часов на заказ (подготовка, уборка, межслойная сушка)
      oil: { sand: 0.5, coat: 0.25, fixed: 0.5 },
      lacquer: { sand: 0.75, coat: 0.5, fixed: 1.5 },
    },
    materials: [
      { id: 'm-oil', name: 'Масло-воск', coat: 'oil', volume: 0.75, price: 4500, perM2: 40, layers: 2 },
      { id: 'm-lac', name: 'Лак', coat: 'lacquer', volume: 1, price: 3000, perM2: 100, layers: 3 },
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
    rounding: 100,
    minDiff: 5000,        // лак не дешевле масла на эту сумму (0 — не применять)
    minOrder: 0,          // минимальная стоимость заказа (0 — не применять)
    currency: '₽',
    nightK: 1.5,
    edgeThickness: 40,
    services: [
      { id: 'sink', key: 'раковина', name: 'Раковина: снятие и установка с герметизацией', price: 6000, hours: 1 },
      { id: 'stove', key: 'плита', name: 'Плита: снятие и установка', price: 1000, hours: 0.25 },
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
    show: { surfaces: true, stairs: false },
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
  s.services = s.services.map((x) => ({ hours: d.services.find((y) => y.id === x.id)?.hours ?? 0, ...x }));
  const c = raw.cost || {};
  s.cost = {
    ...d.cost, ...c,
    time: { oil: { ...d.cost.time.oil, ...(c.time?.oil || {}) }, lacquer: { ...d.cost.time.lacquer, ...(c.time?.lacquer || {}) } },
    materials: Array.isArray(c.materials) ? c.materials : d.cost.materials,
    travel: { ...d.cost.travel, ...(c.travel || {}) },
  };
  return s;
}

export function normalizeDraft(raw, settings) {
  const d = defaultDraft(settings);
  if (!raw || typeof raw !== 'object') return d;
  const fix = (list) => (Array.isArray(list) ? list : []).map((it) => ({ ...newItem('', it.shape || 'rect', settings), ...it }));
  return {
    ...d, ...raw,
    id: raw.id || null,
    // Старые расчёты без выбора разделов: лестница показывается, если в ней что-то есть.
    show: raw.show
      ? { surfaces: raw.show.surfaces !== false, stairs: !!raw.show.stairs }
      : { surfaces: true, stairs: Array.isArray(raw.stairs) && raw.stairs.length > 0 },
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
