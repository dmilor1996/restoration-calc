import test from 'node:test';
import assert from 'node:assert/strict';
import {
  num, itemGeometry, faceArea, shapeSides, shapeOutline, polyArea, setSideLength,
  calcTotals, calcCost, materialCostPerM2, factSummary, aggregateStats, sandHours, upsertRecent, pickTier, tierLabel, roundTo, renderTemplate, templateVars, usedKeys, plural,
} from '../js/calc.js';
import { defaultSettings, defaultDraft, newItem, normalizeDraft, normalizeSettings, DEFAULT_TEMPLATES } from '../js/defaults.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const item = (shape, props) => ({ ...newItem('surfaces', shape, defaultSettings()), ...props });
const draftWith = (surfaces, stairs = []) => ({ ...defaultDraft(defaultSettings()), surfaces, stairs, mode: surfaces.length || !stairs.length ? 'surfaces' : 'stairs' });

test('num: разбор ввода', () => {
  assert.equal(num('2 000'), 2000);
  assert.equal(num('1,5'), 1.5);
  assert.equal(num(''), 0);
  assert.equal(num('abc'), 0);
});

test('столешница 2000×1000 = 2 м², масло 28 000, лак 34 000', () => {
  const s = defaultSettings();
  const t = calcTotals(draftWith([item('rect', { l: '2000', w: '1000' })]), s);
  near(t.area.total, 2);
  assert.equal(t.price.oil.final, 28000);
  assert.equal(t.price.lacquer.final, 34000);
});

test('кромка: только выбранные грани, с толщиной', () => {
  const g = itemGeometry(item('rect', { l: 2000, w: 1000, thickness: 40, edges: { t: true, r: true } }));
  near(g.face, 2);
  near(g.edgeLen, 3000);
  near(g.edge, 0.12);
  near(g.total, 2.12);
  const all = itemGeometry(item('rect', { l: 2000, w: 1000, thickness: 40, edges: { t: true, r: true, b: true, l: true } }));
  near(all.edge, 0.24);
});

test('круглый стол по диаметру', () => {
  const g = itemGeometry(item('circle', { d: 1000, thickness: 40, edges: { c: true } }));
  near(g.face, Math.PI / 4);
  near(g.edge, Math.PI * 0.04);
});

test('трапеция: площадь и боковые грани', () => {
  const g = itemGeometry(item('trap', { a: 100, b: 400, h: 900, qty: 5, thickness: 40, edges: { t: true } }));
  near(g.face, 0.225);
  near(g.edgeLen, Math.hypot(900, 150));
  near(g.total, (0.225 + (Math.hypot(900, 150) * 40) / 1e6) * 5);
});

test('лестница: 10 прямых + 5 трапециевидных', () => {
  const s = defaultSettings();
  const stairs = [
    item('rect', { l: 1000, w: 300, qty: 10 }),
    item('trap', { a: 100, b: 400, h: 900, qty: 5 }),
  ];
  const t = calcTotals(draftWith([], stairs), s);
  near(t.area.stairs, 3 + 1.125);
  assert.equal(t.price.oil.final, roundTo(4.125 * 14000, 100));
});

test('обе стороны и своя площадь', () => {
  near(itemGeometry(item('rect', { l: 1000, w: 1000, bothSides: true })).total, 2);
  const g = itemGeometry(item('custom', { area: '1,5', edgeLen: 2000, thickness: 50, qty: 2 }));
  near(g.total, (1.5 + 0.1) * 2);
});

test('диапазоны цен «от–до»', () => {
  const tiers = [
    { from: '0,1', to: '0,9', oil: 16000, lacquer: 19000 },
    { from: 1, to: 3, oil: 14000, lacquer: 17000 },
    { from: 3, to: '', oil: 12000, lacquer: 15000 },
  ];
  assert.equal(pickTier(tiers, 0.5).tier.oil, 16000);
  assert.equal(pickTier(tiers, 0.9).tier.oil, 16000);
  assert.equal(pickTier(tiers, 1).tier.oil, 14000);
  assert.equal(pickTier(tiers, 3).tier.oil, 12000);
  assert.equal(pickTier(tiers, 50).tier.oil, 12000);
  assert.ok(pickTier(tiers, 2).exact);
  // между диапазонами и ниже первого — ближайший, с пометкой
  assert.deepEqual([pickTier(tiers, 0.93).tier.oil, pickTier(tiers, 0.93).exact], [16000, false]);
  assert.deepEqual([pickTier(tiers, 0.98).tier.oil, pickTier(tiers, 0.98).exact], [14000, false]);
  assert.deepEqual([pickTier(tiers, 0.05).tier.oil, pickTier(tiers, 0.05).exact], [16000, false]);
  assert.equal(tierLabel(tiers[0]), '0,1–0,9 м²');
  assert.equal(tierLabel(tiers[2]), 'от 3 м²');
  assert.equal(tierLabel({ from: 0, to: 1 }), 'до 1 м²');

  // старые диапазоны только с «от» работают как раньше
  const old = [{ from: 0, oil: 16000 }, { from: 1, oil: 14000 }, { from: 10, oil: 12000 }];
  assert.equal(pickTier(old, 0.5).tier.oil, 16000);
  assert.equal(pickTier(old, 9.99).tier.oil, 14000);
  assert.equal(pickTier(old, 10).tier.oil, 12000);

  const s = defaultSettings();
  s.minDiff = 0;
  s.prices.surfaces = tiers;
  const big = calcTotals(draftWith([item('rect', { l: 5000, w: 1000, qty: 2 })]), s);
  assert.equal(big.price.oil.final, 120000);
  const small = calcTotals(draftWith([item('rect', { l: 500, w: 1000 })]), s);
  assert.equal(small.price.oil.final, 8000);
  assert.ok(small.sections.surfaces.exact);
});

test('минимальная разница между лаком и маслом', () => {
  const s = defaultSettings();
  s.prices.surfaces = [{ from: 0, to: '', oil: 11000, lacquer: 13000 }];
  const d = draftWith([item('rect', { l: 1000, w: 1000 })]);
  let t = calcTotals(d, s);
  assert.equal(t.price.oil.final, 11000);
  assert.equal(t.price.lacquer.final, 16000);
  assert.equal(t.price.lacquer.note, 'diff');
  // разница уже больше — ничего не меняется
  s.prices.surfaces[0].lacquer = 20000;
  t = calcTotals(d, s);
  assert.equal(t.price.lacquer.final, 20000);
  assert.equal(t.price.lacquer.note, '');
  // ручная цена масла тянет за собой лак, ручная цена лака — главнее правила
  s.prices.surfaces[0].lacquer = 13000;
  d.manual.oil = '12000';
  assert.equal(calcTotals(d, s).price.lacquer.final, 17000);
  d.manual.lacquer = '12500';
  assert.equal(calcTotals(d, s).price.lacquer.final, 12500);
  // пустой расчёт не показывает «5 000»
  assert.equal(calcTotals(draftWith([item('rect', {})]), s).price.lacquer.final, 0);
});

test('минимальная стоимость заказа', () => {
  const s = defaultSettings();
  s.minOrder = 10000; s.minDiff = 5000;
  const t = calcTotals(draftWith([item('rect', { l: 500, w: 500 })]), s);
  assert.equal(t.price.oil.final, 10000);
  assert.equal(t.price.oil.note, 'min');
  assert.equal(t.price.lacquer.final, 15000);
});

test('режим: считается только выбранный раздел', () => {
  const s = defaultSettings();
  const d = draftWith([item('rect', { l: 2000, w: 1000 })], [item('rect', { l: 1000, w: 300, qty: 10 })]);
  d.mode = 'surfaces';
  near(calcTotals(d, s).area.total, 2);
  d.mode = 'stairs';
  near(calcTotals(d, s).area.total, 3);
  // старые расчёты, где можно было включить оба раздела
  const st = defaultSettings();
  assert.equal(normalizeDraft({ show: { surfaces: true, stairs: true }, surfaces: [{}], stairs: [{}] }, st).mode, 'surfaces');
  assert.equal(normalizeDraft({ show: { surfaces: false, stairs: true }, surfaces: [{}], stairs: [{}] }, st).mode, 'stairs');
  assert.equal(normalizeDraft({ surfaces: [], stairs: [{}] }, st).mode, 'stairs');
  assert.equal(normalizeDraft({ mode: 'surfaces', surfaces: [], stairs: [{}] }, st).mode, 'surfaces');
});

test('трапеция по 4 граням', () => {
  // равнобокая: совпадает с обычным режимом
  const leg = Math.hypot(900, 150);
  const g = itemGeometry(item('trap', { four: true, a: 100, b: 400, s1: leg, s2: leg }));
  near(g.face, 0.225, 1e-6);
  // прямоугольная трапеция: A=300, B=600, верхняя грань 400 (перпендикуляр), нижняя 500
  const r = item('trap', { four: true, a: 300, b: 600, s1: 400, s2: 500, thickness: 40, edges: { b: true } });
  near(faceArea(r), 0.18, 1e-9);
  near(itemGeometry(r).edgeLen, 500, 1e-6);
  near(shapeSides(r).find((x) => x.id === 't').len, 400, 1e-6);
  // A = B — прямоугольник
  near(faceArea(item('trap', { four: true, a: 500, b: 500, s1: 1000, s2: 1000 })), 0.5);
  // грани не сходятся
  const bad = item('trap', { four: true, a: 100, b: 900, s1: 200, s2: 200 });
  assert.equal(faceArea(bad), 0);
  assert.ok(shapeOutline(bad).filled && !shapeOutline(bad).valid);
});

test('своя форма: площадь, торцы, изменение длины стороны', () => {
  const L = [[0, 0], [2400, 0], [2400, 600], [600, 600], [600, 1800], [0, 1800]].map(([x, y]) => ({ x, y, e: false }));
  const it = item('poly', { pts: L, thickness: 40 });
  near(faceArea(it), 2.16);
  it.pts[0].e = true; it.pts[5].e = true;
  const g = itemGeometry(it);
  near(g.edgeLen, 2400 + 1800);
  near(g.total, 2.16 + 4200 * 40 / 1e6);
  // удлиняем верхнюю сторону: правая грань сдвигается, углы остаются прямыми
  const longer = setSideLength(L, 0, 3000);
  assert.deepEqual(longer.map((p) => [p.x, p.y]), [[0, 0], [3000, 0], [3000, 600], [600, 600], [600, 1800], [0, 1800]]);
  near(Math.abs(polyArea(longer)) / 1e6, 2.52);
  assert.equal(faceArea(item('poly', { pts: [] })), 0);
});

test('ночной коэффициент, ручная ставка и ручная цена', () => {
  const s = defaultSettings();
  const d = draftWith([item('rect', { l: 2000, w: 1000 })]);
  d.night = { on: true, k: '1,5' };
  let t = calcTotals(d, s);
  assert.equal(t.price.oil.final, 42000);
  assert.equal(t.price.lacquer.final, 51000);

  d.rates.surfaces.oil = '10000';
  t = calcTotals(d, s);
  assert.equal(t.price.oil.final, 30000);
  assert.equal(t.price.lacquer.final, 51000);

  d.manual.lacquer = '45000';
  t = calcTotals(d, s);
  assert.equal(t.price.lacquer.final, 45000);
  assert.equal(t.price.lacquer.auto, 51000);
  assert.ok(t.price.lacquer.manual);
});

test('округление', () => {
  assert.equal(roundTo(31360, 100), 31400);
  assert.equal(roundTo(31360, 500), 31500);
  assert.equal(roundTo(31360, 1), 31360);
});

test('тексты: подстановка цен', () => {
  const s = defaultSettings();
  const t = calcTotals(draftWith([item('rect', { l: 2000, w: 1000 })]), s);
  const vars = templateVars(t, s);
  const main = renderTemplate(DEFAULT_TEMPLATES[0].body, vars);
  assert.ok(main.includes('Лака — 34 000 ₽'));
  assert.ok(main.includes('Масла — 28 000 ₽'));
  assert.ok(!main.includes('{'));
  const sink = renderTemplate(DEFAULT_TEMPLATES[1].body, vars);
  assert.ok(sink.includes('раковины - 6 000 ₽. Плита - 1 000 ₽.'));
  assert.deepEqual(usedKeys(DEFAULT_TEMPLATES[1].body, vars), ['раковина', 'плита']);
  assert.equal(renderTemplate('Нет такого {ключа}', vars), 'Нет такого {ключа}');
});

test('склонение', () => {
  assert.equal(plural(1, ['ступень', 'ступени', 'ступеней']), 'ступень');
  assert.equal(plural(3, ['ступень', 'ступени', 'ступеней']), 'ступени');
  assert.equal(plural(15, ['ступень', 'ступени', 'ступеней']), 'ступеней');
});

test('нормочас: шлифовка зависит от старого покрытия', () => {
  const s = defaultSettings();
  near(materialCostPerM2(s.cost.materials[0]), 480);   // 4500 ₽ / 750 мл × 40 мл × 2 слоя
  const d = draftWith([item('rect', { l: 2000, w: 1000 })]);
  let t = calcTotals(d, s), c = calcCost(d, s, t);
  near(c.coats.oil.hours.sand, 1);                      // 2 м² × 0,5, старое масло
  near(c.coats.oil.hours.total, 1 + 0.5 + 0.5);         // + нанесение 2×0,25 + подготовка 0,5
  near(c.coats.oil.expenses, 960);
  near(c.coats.oil.profit, 28000 - 960);
  near(c.coats.oil.rate, (28000 - 960) / 2);
  near(c.coats.oil.priceTarget, 2 * 4000 + 960);
  near(c.coats.oil.priceMin, 2 * 2500 + 960);
  assert.equal(c.coats.oil.status, 'good');
  near(c.coats.oil.perM2.target, (2 * 4000 + 960) / 2);
  // старый лак: шлифовка вдвое дольше, причём одинаково для масла и лака
  d.current = 'lacquer';
  c = calcCost(d, s, calcTotals(d, s));
  near(c.coats.oil.hours.sand, 2); near(c.coats.lacquer.hours.sand, 2);
  near(sandHours(2, 'lacquer', s.cost.time), 2); near(sandHours(2, 'oil', s.cost.time), 1);
  // лак: нанесение 2×0,5, подготовка 1,5, материал 900 ₽/м²
  d.coat = 'lacquer';
  c = calcCost(d, s, calcTotals(d, s));
  assert.equal(c.selected, 'lacquer');
  near(c.coats.lacquer.hours.total, 2 + 1 + 1.5);
  near(c.coats.lacquer.materials, 1800);
  // раковина: +6000 к выручке и +1 час
  d.current = 'oil'; d.services = { sink: true };
  c = calcCost(d, s, calcTotals(d, s));
  near(c.coats.lacquer.profit, 34000 + 6000 - 1800);
  // цена вручную ниже минимума
  d.services = {}; d.manual = { oil: '5000', lacquer: '9000' };
  c = calcCost(d, s, calcTotals(d, s));
  assert.equal(c.coats.oil.status, 'bad');
});

test('выбор материала и покраска морилкой', () => {
  const s = defaultSettings();
  s.cost.materials.push({ id: 'm-oil2', name: 'Дорогое масло', kind: 'oil', volume: 1, price: 9000, perM2: 50, layers: 2 });
  s.cost.materials.push({ id: 'm-sand', name: 'Шкурка', kind: 'extra', volume: 1, price: 1000, perM2: 100, layers: 1 });
  const d = draftWith([item('rect', { l: 2000, w: 1000 })]);
  let c = calcCost(d, s, calcTotals(d, s));
  near(c.coats.oil.materials, 960 + 200);               // первое масло + расходник (1000/1000×100 = 100 ₽/м²)
  d.finish = { oil: 'm-oil2', lacquer: null };
  c = calcCost(d, s, calcTotals(d, s));
  near(c.coats.oil.materials, 2 * 900 + 200);
  // покраска: +цена клиенту, +время, +материал
  d.stain = { on: true, id: null };
  const t = calcTotals(d, s);
  assert.equal(t.stain, 6000);
  assert.equal(t.price.oil.final, 28000 + 6000);
  c = calcCost(d, s, t);
  near(c.coats.oil.hours.stain, 2 * 0.2 + 0.25);
  near(c.coats.oil.mats.find((x) => x.m.kind === 'stain').sum, 2 * 80 / 1000 * 2500);
  // сравнение «за м²» не включает покраску
  near(c.coats.oil.perM2.price, 14000);
  d.stain.on = false;
  assert.equal(calcTotals(d, s).stain, 0);
});

test('старые настройки переносятся: шлифовка и материалы', () => {
  const s = normalizeSettings({ cost: {
    time: { oil: { sand: 0.6, coat: 0.3, fixed: 1 }, lacquer: { sand: 0.9, coat: 0.6, fixed: 2 } },
    materials: [{ id: 'a', name: 'Масло', coat: 'oil', volume: 1, price: 1000, perM2: 50, layers: 1 }, { id: 'b', name: 'Шкурка', coat: 'both' }],
  } });
  near(s.cost.time.sand, 0.6); near(s.cost.time.sandLacquerK, 2);
  near(s.cost.time.oil.coat, 0.3); near(s.cost.time.lacquer.fixed, 2);
  assert.deepEqual(s.cost.materials.map((m) => m.kind), ['oil', 'extra']);
});

test('выезд: время, машина, доплата', () => {
  const s = defaultSettings();
  const d = draftWith([item('rect', { l: 1000, w: 1000 })]);
  d.travel = { km: '100', trips: 1, charge: false, amount: '' };
  let t = calcTotals(d, s), c = calcCost(d, s, t);
  near(c.travel.dist, 200); near(c.travel.carCost, 3000); near(c.travel.hours, 200 / 60);
  assert.equal(t.price.oil.final, 14000);
  assert.ok(c.travelAdvice.need > 0);                  // маленький заказ дорогу не окупает
  d.travel.charge = true;
  t = calcTotals(d, s);
  assert.equal(t.travel, 10000);
  assert.equal(t.price.oil.final, 24000);
  assert.equal(t.price.lacquer.final, 29000);
  d.travel.amount = '4000';
  assert.equal(calcTotals(d, s).price.oil.final, 18000);
});

test('статистика: этапы, общее время и старое покрытие', () => {
  const mk = (id, over) => ({ id, fact: {
    date: '2026-10-05', coat: 'oil', old: 'oil', received: 30000, area: 2, hoursMode: 'stages',
    hours: { sand: 1.2, coat: 0.8, stain: '', services: { sink: 1 }, travel: '', other: '', total: '' },
    materials: { 'm-oil': 200 }, materialsCost: 1000, carCost: 0, expenses: '', ...over,
  } });
  const a = mk('a', {});
  const b = mk('b', { date: '2026-11-02', coat: 'lacquer', old: 'lacquer', received: 50000, area: 3, hours: { sand: 3, coat: 2, services: {} }, materials: {} });
  const c = mk('c', { date: '2026-11-03', hoursMode: 'total', received: 20000, area: 1, hours: { total: 4, travel: 1, sand: 99, coat: 99, services: { sink: 99 } }, materials: { 'm-oil': 100 }, materialsCost: 500 });
  near(factSummary(a).hours, 3);                        // 1,2 + 0,8 + раковина 1
  near(factSummary(a).rate, 29000 / 3);
  near(factSummary(c).hours, 5);                        // общее время работы 4 + дорога 1; этапы игнорируются
  near(factSummary(c).rate, 19500 / 5);
  assert.equal(factSummary(c).byStages, false);
  const st = aggregateStats([a, b, c, { id: 'x', fact: null }, { ...a, deleted: true }]);
  assert.equal(st.count, 3); assert.equal(st.stages, 2);
  near(st.avgCheck, 100000 / 3); near(st.avgRate, (29000 + 49000 + 19500) / (3 + 5 + 5));
  near(st.sand.oil.perM2, 0.6); near(st.sand.lacquer.perM2, 1);   // c в нормы не попал
  near(st.coat.oil.perM2, 0.4); near(st.coat.lacquer.perM2, 2 / 3);
  near(st.services.sink.hours, 1); assert.equal(st.services.sink.n, 1);
  near(st.materials['m-oil'].perM2, 300 / 3 );                    // расход считается и по заказу с общим временем
  assert.deepEqual(st.months.map((m) => m.key), ['2026-11', '2026-10']);
});

test('заказ без времени не искажает средний час', () => {
  const o = (id, received, h) => ({ id, fact: { date: '2026-11-01', coat: 'oil', old: 'oil', received, area: 1, hoursMode: 'total', hours: { total: h, travel: '' }, materials: {}, materialsCost: 0, carCost: 0, expenses: '' } });
  const st = aggregateStats([o('a', 10000, 2), o('b', 50000, 0)]);
  assert.equal(st.count, 2); assert.equal(st.noTime, 1);
  near(st.avgRate, 5000);                               // заказ без времени в час не входит
  near(st.profit, 60000);                               // но в прибыль и выручку входит
  near(st.months[0].rate, 5000);
});

test('последние расчёты: обновление по rid и не больше 10', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = upsertRecent(list, { rid: 'r' + i, updatedAt: i + 1 });
  assert.equal(list.length, 10);
  assert.equal(list[0].rid, 'r11'); assert.equal(list.at(-1).rid, 'r2');
  // правка уже существующего расчёта не плодит запись, а поднимает её наверх
  list = upsertRecent(list, { rid: 'r5', updatedAt: 100, extra: true });
  assert.equal(list.length, 10); assert.equal(list[0].rid, 'r5'); assert.ok(list[0].extra);
  assert.equal(list.filter((e) => e.rid === 'r5').length, 1);
});
