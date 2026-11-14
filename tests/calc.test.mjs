import test from 'node:test';
import assert from 'node:assert/strict';
import {
  num, itemGeometry, faceArea, shapeSides, shapeOutline, polyArea, setSideLength,
  calcTotals, calcCost, materialCostPerM2, factSummary, aggregateStats, pickTier, tierLabel, roundTo, renderTemplate, templateVars, usedKeys, plural,
} from '../js/calc.js';
import { defaultSettings, defaultDraft, newItem, DEFAULT_TEMPLATES } from '../js/defaults.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const item = (shape, props) => ({ ...newItem('surfaces', shape, defaultSettings()), ...props });
const draftWith = (surfaces, stairs = []) => ({ ...defaultDraft(defaultSettings()), surfaces, stairs, show: { surfaces: true, stairs: true } });

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

test('выбор разделов: скрытая лестница не считается', () => {
  const s = defaultSettings();
  const d = draftWith([item('rect', { l: 2000, w: 1000 })], [item('rect', { l: 1000, w: 300, qty: 10 })]);
  d.show = { surfaces: true, stairs: false };
  near(calcTotals(d, s).area.total, 2);
  d.show = { surfaces: true, stairs: true };
  near(calcTotals(d, s).area.total, 5);
  d.show = { surfaces: false, stairs: true };
  near(calcTotals(d, s).area.total, 3);
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

test('нормочас: время, материалы, ваш час', () => {
  const s = defaultSettings();
  near(materialCostPerM2(s.cost.materials[0]), 480);   // 4500 ₽ / 750 мл × 40 мл × 2 слоя
  const d = draftWith([item('rect', { l: 2000, w: 1000 })]);
  let t = calcTotals(d, s), c = calcCost(d, s, t);
  near(c.coats.oil.hours.total, 2);                    // 2×0,5 + 2×0,25 + 0,5
  near(c.coats.oil.materials, 960);
  near(c.coats.oil.rate, (28000 - 960) / 2);
  near(c.coats.oil.priceTarget, 2 * 4000 + 960);
  near(c.coats.oil.priceMin, 2 * 2500 + 960);
  assert.equal(c.coats.oil.status, 'good');
  near(c.coats.oil.perM2.target, 4480);
  // раковина: +6000 к выручке и +1 час
  d.services = { sink: true };
  c = calcCost(d, s, calcTotals(d, s));
  near(c.coats.oil.rate, (34000 - 960) / 3);
  // цена вручную ниже минимума
  d.services = {}; d.manual = { oil: '5000', lacquer: '9000' };
  c = calcCost(d, s, calcTotals(d, s));
  assert.equal(c.coats.oil.status, 'bad');
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

test('статистика по выполненным заказам', () => {
  const mk = (coat, received, area, sand, coatH, date) => ({ id: date, fact: {
    date, coat, received, area, hours: { sand, coat: coatH, services: { sink: coat === 'oil' ? 1 : '' }, travel: '', other: '' },
    materials: { 'm-oil': coat === 'oil' ? 200 : '' }, materialsCost: 1000, carCost: 0, expenses: '',
  } });
  const a = mk('oil', 30000, 2, 1.2, 0.8, '2026-10-05'), b = mk('lacquer', 50000, 3, 3, 2, '2026-11-02');
  near(factSummary(a).rate, 29000 / 3);
  const st = aggregateStats([a, b, { id: 'x', fact: null }, { ...a, deleted: true }]);
  assert.equal(st.count, 2);
  near(st.avgCheck, 40000); near(st.avgPerM2, 16000); near(st.avgRate, 78000 / 8);
  near(st.norm.oil.sand, 0.6); near(st.norm.lacquer.sand, 1);
  near(st.services.sink.hours, 1); near(st.materials['m-oil'].perM2, 100);
  assert.deepEqual(st.months.map((m) => m.key), ['2026-11', '2026-10']);
});
