import test from 'node:test';
import assert from 'node:assert/strict';
import {
  num, itemGeometry, calcTotals, pickTier, tierLabel, roundTo, renderTemplate, templateVars, usedKeys, plural,
} from '../js/calc.js';
import { defaultSettings, defaultDraft, newItem, DEFAULT_TEMPLATES } from '../js/defaults.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const item = (shape, props) => ({ ...newItem('surfaces', shape, defaultSettings()), ...props });
const draftWith = (surfaces, stairs = []) => ({ ...defaultDraft(defaultSettings()), surfaces, stairs });

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

test('диапазоны цен по площади', () => {
  const tiers = [
    { from: 0, oil: 16000, lacquer: 19000 },
    { from: 1, oil: 14000, lacquer: 17000 },
    { from: 10, oil: 12000, lacquer: 15000 },
  ];
  assert.equal(pickTier(tiers, 0.5).oil, 16000);
  assert.equal(pickTier(tiers, 1).oil, 14000);
  assert.equal(pickTier(tiers, 9.99).oil, 14000);
  assert.equal(pickTier(tiers, 10).oil, 12000);
  assert.equal(tierLabel(tiers, tiers[0]), 'до 1 м²');
  assert.equal(tierLabel(tiers, tiers[1]), '1–10 м²');
  assert.equal(tierLabel(tiers, tiers[2]), 'от 10 м²');

  const s = defaultSettings();
  s.prices.surfaces = tiers;
  const big = calcTotals(draftWith([item('rect', { l: 5000, w: 1000, qty: 2 })]), s);
  assert.equal(big.price.oil.final, 120000);
  const small = calcTotals(draftWith([item('rect', { l: 500, w: 1000 })]), s);
  assert.equal(small.price.oil.final, 8000);
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
