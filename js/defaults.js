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

export function defaultSettings() {
  return {
    v: 1,
    updatedAt: 0,
    prices: {
      surfaces: [{ id: 't0', from: 0, oil: 14000, lacquer: 17000 }],
      stairs: [{ id: 't0', from: 0, oil: 14000, lacquer: 17000 }],
    },
    tierBy: 'total',      // 'total' — по всей площади заказа, 'section' — по площади раздела
    rounding: 100,
    currency: '₽',
    nightK: 1.5,
    edgeThickness: 40,
    services: [
      { id: 'sink', key: 'раковина', name: 'Раковина: снятие и установка с герметизацией', price: 6000 },
      { id: 'stove', key: 'плита', name: 'Плита: снятие и установка', price: 1000 },
    ],
    templates: structuredClone(DEFAULT_TEMPLATES),
  };
}

export function newItem(kind, shape, settings) {
  return {
    id: uid(), shape, name: '',
    l: '', w: '', d: '', a: '', b: '', h: '', area: '', edgeLen: '',
    qty: 1,
    thickness: settings?.edgeThickness ?? 40,
    edges: {},
    bothSides: false,
  };
}

export function defaultDraft(settings) {
  return {
    v: 1,
    surfaces: [newItem('surfaces', 'rect', settings)],
    stairs: [],
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
    s.prices[k] = s.prices[k].map((t) => ({ id: t.id || uid(), from: t.from ?? 0, oil: t.oil ?? 0, lacquer: t.lacquer ?? 0 }));
  }
  if (!Array.isArray(s.services)) s.services = d.services;
  if (!Array.isArray(s.templates)) s.templates = d.templates;
  return s;
}

export function normalizeDraft(raw, settings) {
  const d = defaultDraft(settings);
  if (!raw || typeof raw !== 'object') return d;
  const fix = (list) => (Array.isArray(list) ? list : []).map((it) => ({ ...newItem('', it.shape || 'rect', settings), ...it }));
  return {
    ...d, ...raw,
    surfaces: fix(raw.surfaces),
    stairs: fix(raw.stairs),
    night: { ...d.night, ...(raw.night || {}) },
    rates: { surfaces: { ...(raw.rates?.surfaces || {}) }, stairs: { ...(raw.rates?.stairs || {}) } },
    manual: { ...(raw.manual || {}) },
  };
}
