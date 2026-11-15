// Нормочас и себестоимость: блок в итоге, настройки, факт выполнения, статистика.

import { html, useState, useMemo } from './vendor/preact-htm.js';
import {
  num, materialCostPerM2, materialMlPerM2, materialsOfKind, travelPlan, calcTotals, calcCost,
  factSummary, aggregateStats, normKey, fmtInt, fmtNum, fmtArea, fmtPrice, plural,
} from './calc.js';
import { uid, normalizeDraft } from './defaults.js';
import { Icon, Num, Text } from './ui.js';

const COAT = { lacquer: 'Лак', oil: 'Масло' };
const KIND = { oil: 'Масло', lacquer: 'Лак', stain: 'Морилка', extra: 'Расходник' };
const fmtH = (h) => `${fmtNum(h, 1)} ч`;
const STATUS_TEXT = { good: 'выше желаемого', warn: 'ниже желаемого', bad: 'ниже минимума', none: '' };

// ── Блок «Нормочас» в итоге ─────────────────────────────────────

export function NormPanel({ cost, settings, hidden, onToggle }) {
  const cur = settings.currency;
  const sel = cost.selected, other = sel === 'oil' ? 'lacquer' : 'oil';
  const x = cost.coats[sel], o = cost.coats[other];
  const adv = cost.travelAdvice;
  const finish = x.mats.find((m) => m.m.kind === sel)?.m.name;
  return html`
    <div class="card norm">
      <div class="tpl__head">
        <span class="eyebrow">Нормочас · ${finish || COAT[sel]}</span>
        <button type="button" class="link-btn" onClick=${onToggle}>${hidden ? 'Показать' : 'Скрыть'}</button>
      </div>
      ${hidden ? null : !(cost.area > 0) ? html`<p class="total__note">Укажите размеры — здесь появится себестоимость, прибыль и сколько стоит ваш час.</p>` : html`
        <div class=${'norm__main is-' + x.status}>
          <span class="norm__label">Ваш час при этой цене</span>
          <b class="norm__rate">${fmtInt(x.rate)}<small>${cur}/ч</small></b>
          <span class="norm__status">${STATUS_TEXT[x.status]} · желаемый ${fmtInt(cost.rateTarget)}, минимум ${fmtInt(cost.rateMin)}</span>
        </div>
        <dl class="norm__list">
          <div><dt>Цена клиенту</dt><dd>${fmtPrice(x.revenue, cur)}</dd></div>
          <div><dt>Себестоимость</dt><dd>${fmtPrice(x.expenses, cur)}</dd></div>
          <div class="is-strong"><dt>Прибыль</dt><dd>${fmtPrice(x.profit, cur)}</dd></div>
          <div><dt>Время</dt><dd>${fmtH(x.hours.total)}</dd></div>
        </dl>
        <dl class="norm__list norm__list--floor">
          <div><dt>Цена при ${fmtInt(cost.rateTarget)}/ч</dt><dd>${fmtPrice(x.priceTarget, cur)}</dd></div>
          <div><dt>Нижняя граница (${fmtInt(cost.rateMin)}/ч)</dt><dd>${fmtPrice(x.priceMin, cur)}</dd></div>
        </dl>

        <div class="norm__m2">
          <span class="eyebrow">Цена за м² работы</span>
          <p>прайс <b>${fmtInt(x.perM2.price)}</b> · по нормочасу <b>${fmtInt(x.perM2.target)}</b> · минимум <b>${fmtInt(x.perM2.min)}</b></p>
        </div>

        ${adv ? html`
          <p class=${'norm__advice' + (adv.need > 0 && !adv.charged ? ' is-warn' : '')}>
            ${adv.charged ? `Выезд включён в цену: ${fmtPrice(adv.charged, cur)}.` : ''}
            ${adv.need > 0
              ? ` С дорогой час ниже желаемого. Чтобы выйти на ${fmtInt(cost.rateTarget)} ${cur}/ч, не хватает ${fmtPrice(adv.need, cur)}${adv.charged ? '' : ` (по тарифу за выезд было бы ${fmtPrice(adv.tariff, cur)})`}.`
              : (adv.charged ? '' : ' Дорога окупается ценой заказа — доплата за выезд не нужна.')}
          </p>` : null}

        <p class="norm__other">Если ${other === 'lacquer' ? 'лаком' : 'маслом'}: <b>${fmtInt(o.rate)} ${cur}/ч</b>, прибыль ${fmtPrice(o.profit, cur)}, время ${fmtH(o.hours.total)}</p>

        <details class="norm__details">
          <summary>Из чего складывается</summary>
          <table>
            ${[['Шлифовка', 'sand'], ['Нанесение', 'coat'], ['Подготовка, сушка', 'fixed'], ['Покраска', 'stain'], ['Услуги', 'services'], ['Дорога', 'travel']].map(([label, key]) => (
              x.hours[key] > 0 ? html`<tr key=${key}><td>${label}</td><td>${fmtH(x.hours[key])}</td></tr>` : null))}
            ${x.mats.map(({ m, sum }) => html`<tr key=${m.id}><td>${m.name || KIND[m.kind]}</td><td>${fmtPrice(sum, cur)}</td></tr>`)}
            ${x.carCost > 0 ? html`<tr><td>Машина, ${fmtInt(cost.travel.dist)} км</td><td>${fmtPrice(x.carCost, cur)}</td></tr>` : null}
          </table>
        </details>`}
    </div>`;
}

// ── Настройки себестоимости ─────────────────────────────────────

export function CostPage({ settings, upSettings }) {
  const cost = settings.cost;
  const cur = settings.currency;
  const up = (fn) => upSettings((s) => { fn(s.cost); });
  const setT = (path) => (v) => up((c) => {
    const keys = path.split('.'); let t = c.time;
    for (const k of keys.slice(0, -1)) t = t[k];
    t[keys.at(-1)] = v;
  });
  const upMat = (id, fn) => up((c) => { const m = c.materials.find((x) => x.id === id); if (m) fn(m); });
  const kindCost = (kind) => materialsOfKind(cost, kind).map((m) => `${m.name || KIND[kind]} ${fmtInt(materialCostPerM2(m))}`).join(' · ') || 'нет';

  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">01</span>
        <div class="section__title"><h2>Нормочас</h2><p>Сколько должен стоить час вашей работы</p></div>
      </header>
      <div class="card">
        <div class="setting">
          <div><h3>Желаемый час</h3><p>Цена, которую вы хотите держать всегда</p></div>
          <${Num} cls="field--w" group suffix=${cur + '/ч'} aria="Желаемый нормочас" value=${cost.rateTarget} onChange=${(v) => up((c) => { c.rateTarget = v; })} />
        </div>
        <hr class="rule" />
        <div class="setting">
          <div><h3>Минимальный час</h3><p>Нижняя граница: дешевле работать не готовы</p></div>
          <${Num} cls="field--w" group suffix=${cur + '/ч'} aria="Минимальный нормочас" value=${cost.rateMin} onChange=${(v) => up((c) => { c.rateMin = v; })} />
        </div>
      </div>
    </section>

    <section class="section">
      <header class="section__head">
        <span class="section__no">02</span>
        <div class="section__title"><h2>Время работ</h2><p>Нормы времени — позже их можно сверять со статистикой</p></div>
      </header>
      <div class="card">
        <div class="tiers__title"><h3>Шлифовка старого покрытия</h3><p>Зависит от того, что на поверхности сейчас, а не от того, чем покрываете</p></div>
        <div class="fields fields--tight">
          <${Num} decimal label="Старое масло" suffix="ч/м²" value=${cost.time.sand} onChange=${setT('sand')} />
          <${Num} decimal label="Старый лак: во сколько раз дольше" suffix="×" value=${cost.time.sandLacquerK} onChange=${setT('sandLacquerK')} />
        </div>
        <p class="card__note card__note--end">Сейчас старый лак шлифуется ${fmtNum(num(cost.time.sand) * num(cost.time.sandLacquerK), 2)} ч/м².</p>
        <hr class="rule" />
        <div class="tiers__title"><h3>Нанесение нового покрытия</h3><p>Для лака сюда входит межслойная сушка</p></div>
        <div class="grid3 grid3--head"><span></span><span>Масло</span><span>Лак</span></div>
        ${[['coat', 'Нанесение', 'часов на 1 м², все слои'], ['fixed', 'Подготовка, уборка, сушка', 'часов на заказ, не зависит от площади']].map(([key, title, hint]) => html`
          <div class="grid3" key=${key}>
            <div><h3>${title}</h3><p>${hint}</p></div>
            <${Num} decimal suffix="ч" aria=${title + ', масло'} value=${cost.time.oil[key]} onChange=${setT('oil.' + key)} />
            <${Num} decimal suffix="ч" aria=${title + ', лак'} value=${cost.time.lacquer[key]} onChange=${setT('lacquer.' + key)} />
          </div>`)}
        <hr class="rule" />
        <div class="tiers__title"><h3>Покраска морилкой</h3><p>Включается кнопкой «Покраска» в расчёте. Цена для клиента — на вкладке «Цены»</p></div>
        <div class="fields fields--tight">
          <${Num} decimal label="Покраска" suffix="ч/м²" value=${cost.time.stain.coat} onChange=${setT('stain.coat')} />
          <${Num} decimal label="Подготовка" suffix="ч/заказ" value=${cost.time.stain.fixed} onChange=${setT('stain.fixed')} />
        </div>
        <hr class="rule" />
        <div class="tiers__title"><h3>Услуги</h3><p>Время на одну услугу. Цены услуг — на вкладке «Цены»</p></div>
        <div class="fields fields--tight">
          ${settings.services.map((s) => html`
            <${Num} key=${s.id} decimal suffix="ч" label=${normKey(s.key) || s.name} value=${s.hours}
              onChange=${(v) => upSettings((st) => { const x = st.services.find((y) => y.id === s.id); if (x) x.hours = v; })} />`)}
        </div>
      </div>
    </section>

    <section class="section">
      <header class="section__head">
        <span class="section__no">03</span>
        <div class="section__title"><h2>Материалы</h2>
          <p>В расчёте выбираете, каким покрываете. ₽/м²: масло — ${kindCost('oil')}; лак — ${kindCost('lacquer')}; морилка — ${kindCost('stain')}</p></div>
      </header>
      <div class="card">
        <div class="mats">
          ${cost.materials.map((m) => html`
            <div class="mat" key=${m.id}>
              <div class="mat__head">
                <${Text} cls="field--grow" label="Название" value=${m.name} onChange=${(v) => upMat(m.id, (x) => { x.name = v; })} placeholder="Материал" />
                <button type="button" class="icon-btn" aria-label="Удалить материал" onClick=${() => up((c) => { c.materials = c.materials.filter((x) => x.id !== m.id); })}>${Icon.x()}</button>
              </div>
              <div class="mat__fields">
                <${Num} decimal label="Объём тары" suffix="л" value=${m.volume} onChange=${(v) => upMat(m.id, (x) => { x.volume = v; })} />
                <${Num} group label="Цена тары" suffix=${cur} value=${m.price} onChange=${(v) => upMat(m.id, (x) => { x.price = v; })} />
                <${Num} decimal label="Расход на слой" suffix="мл/м²" value=${m.perM2} onChange=${(v) => upMat(m.id, (x) => { x.perM2 = v; })} />
                <${Num} label="Слоёв" value=${m.layers} onChange=${(v) => upMat(m.id, (x) => { x.layers = v; })} />
              </div>
              <div class="mat__foot">
                <div class="seg">
                  ${[['oil', 'Масло'], ['lacquer', 'Лак'], ['stain', 'Морилка'], ['extra', 'Расходник']].map(([v, l]) => html`
                    <button type="button" class=${'seg__btn' + (m.kind === v ? ' is-on' : '')} onClick=${() => upMat(m.id, (x) => { x.kind = v; })}>${l}</button>`)}
                </div>
                <span class="mat__sum">${fmtInt(materialMlPerM2(m))} мл/м² · <b>${fmtInt(materialCostPerM2(m))} ${cur}/м²</b></span>
              </div>
            </div>`)}
        </div>
        <p class="card__note">«Расходник» (шкурка, плёнка, скотч) добавляется в каждый расчёт на м² независимо от выбора.</p>
        <button type="button" class="adder adder--sm"
          onClick=${() => up((c) => { c.materials.push({ id: uid(), name: '', kind: 'oil', volume: 1, price: 0, perM2: 0, layers: 1 }); })}>
          <span>Материал</span>${Icon.plus()}</button>
      </div>
    </section>

    <section class="section">
      <header class="section__head">
        <span class="section__no">04</span>
        <div class="section__title"><h2>Выезд</h2><p>Дорога считается и как время, и как расход на машину</p></div>
      </header>
      <div class="card">
        <div class="fields fields--tight">
          <${Num} label="Тариф клиенту" suffix=${cur + '/км'} value=${cost.travel.perKm} onChange=${(v) => up((c) => { c.travel.perKm = v; })} />
          <${Num} label="Себестоимость" suffix=${cur + '/км'} value=${cost.travel.costPerKm} onChange=${(v) => up((c) => { c.travel.costPerKm = v; })} />
          <${Num} label="Средняя скорость" suffix="км/ч" value=${cost.travel.speed} onChange=${(v) => up((c) => { c.travel.speed = v; })} />
        </div>
        <p class="card__note card__note--end">В расчёте указываете километры в одну сторону. Время в пути и расход на машину всегда входят в проверку нормочасом. Если заказ и с дорогой даёт желаемый час — доплата не нужна; если нет, сайт покажет, сколько не хватает, и доплату можно включить в цену одной кнопкой.</p>
      </div>
    </section>`;
}

// ── Факт выполнения заказа ──────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);
const r1 = (v) => String(Math.round(v * 10) / 10);

/** Заготовка факта из плана: то, что посчитал калькулятор. Правится под реальные цифры. */
function planFact(order, settings, coat) {
  const d = { ...normalizeDraft(order.draft, settings), coat };
  const totals = calcTotals(d, settings);
  const cost = calcCost(d, settings, totals);
  const x = cost.coats[coat];
  const area = totals.area.total;
  return {
    date: today(), coat, old: d.current === 'lacquer' ? 'lacquer' : 'oil', stain: !!d.stain?.on,
    area: Math.round(area * 100) / 100,
    received: String((order.totals?.[coat] ?? totals.price[coat].final) + cost.servicesRevenue),
    hoursMode: 'stages',
    hours: {
      sand: r1(x.hours.sand), coat: r1(x.hours.coat + x.hours.fixed), stain: x.hours.stain ? r1(x.hours.stain) : '',
      services: Object.fromEntries(cost.services.map((s) => [s.id, String(num(s.hours))])),
      travel: x.hours.travel ? r1(x.hours.travel) : '', other: '',
      total: r1(x.hours.total - x.hours.travel),     // «только общее» — время работы без дороги
    },
    materials: Object.fromEntries(x.mats.map(({ m }) => [m.id, String(Math.round(materialMlPerM2(m) * area))])),
    expenses: '',
  };
}

/** Достраивает производные поля факта: стоимость материалов и расход на машину. */
export function finalizeFact(f, order, settings) {
  const tp = travelPlan(normalizeDraft(order.draft, settings), settings.cost);
  const materialsCost = settings.cost.materials.reduce((s, m) => {
    const ml = num(m.volume) * 1000;
    return s + (ml > 0 ? (num(m.price) / ml) * num(f.materials?.[m.id]) : 0);
  }, 0);
  return { ...f, materialsCost: Math.round(materialsCost), carCost: Math.round(tp.carCost) };
}

/** Факт для заказа, который только что отмечен выполненным. */
export function startFact(order, settings) {
  const d = normalizeDraft(order.draft, settings);
  return finalizeFact(planFact(order, settings, d.coat === 'lacquer' ? 'lacquer' : 'oil'), order, settings);
}

/** Блок «Выполнение» на странице заказа. Правки сохраняются сразу, отдельной кнопки нет. */
export function FactSection({ no, order, settings, onFact }) {
  const f = order.fact;
  const cur = settings.currency;
  const set = (fn) => { const n = structuredClone(f); fn(n); onFact(finalizeFact(n, order, settings)); };
  const total = f.hoursMode === 'total';
  const mats = settings.cost.materials.filter((m) => m.id in (f.materials || {}));
  const moreMats = settings.cost.materials.filter((m) => !(m.id in (f.materials || {})));
  const services = settings.services.filter((s) => s.id in (f.hours.services || {}));
  const moreServices = settings.services.filter((s) => !(s.id in (f.hours.services || {})));
  const sum = factSummary({ fact: f });
  const noTime = !(sum.hours > 0);

  return html`
    <section class="section">
      <header class="section__head">
        <span class="section__no">${no}</span>
        <div class="section__title"><h2>Выполнение</h2><p>Как было на самом деле — это идёт в статистику. Сохраняется само</p></div>
      </header>
      <div class="card fact">
        <div class="fact__row">
          <div class="seg">
            ${['oil', 'lacquer'].map((v) => html`
              <button type="button" class=${'seg__btn' + (f.coat === v ? ' is-on' : '')} onClick=${() => set((n) => { n.coat = v; })}>Покрыл: ${COAT[v].toLowerCase()}</button>`)}
          </div>
          <div class="seg">
            ${['oil', 'lacquer'].map((v) => html`
              <button type="button" class=${'seg__btn' + (f.old === v ? ' is-on' : '')} onClick=${() => set((n) => { n.old = v; })}>Было: ${COAT[v].toLowerCase()}</button>`)}
          </div>
          <label class="field"><span class="field__box"><input type="date" value=${f.date} aria-label="Дата выполнения"
            onInput=${(e) => set((n) => { n.date = e.target.value; })} /></span></label>
        </div>
        <div class="fields">
          <${Num} group label="Получено от клиента" suffix=${cur} value=${f.received} onChange=${(v) => set((n) => { n.received = v; })} />
          <${Num} decimal label="Площадь" suffix="м²" value=${f.area} onChange=${(v) => set((n) => { n.area = v; })} />
        </div>

        <div class="fact__head">
          <span class="eyebrow">Время</span>
          <div class="seg">
            <button type="button" class=${'seg__btn' + (!total ? ' is-on' : '')} onClick=${() => set((n) => { n.hoursMode = 'stages'; })}>По этапам</button>
            <button type="button" class=${'seg__btn' + (total ? ' is-on' : '')} onClick=${() => set((n) => { n.hoursMode = 'total'; })}>Только общее</button>
          </div>
        </div>
        ${total ? html`
          <div class="fields">
            <${Num} decimal label="Время работы" suffix="ч" value=${f.hours.total} onChange=${(v) => set((n) => { n.hours.total = v; })} />
            <${Num} decimal label="Дорога" suffix="ч" value=${f.hours.travel} onChange=${(v) => set((n) => { n.hours.travel = v; })} />
          </div>
          <p class="card__note">Не помните по этапам — укажите всё время работы одним числом. Дорога считается всегда. В статистику пойдёт ваш час и прибыль; нормы шлифовки и покрытия по этому заказу не обновятся.</p>` : html`
          <div class="fields">
            <${Num} decimal label="Шлифовка" suffix="ч" value=${f.hours.sand} onChange=${(v) => set((n) => { n.hours.sand = v; })} />
            <${Num} decimal label="Покрытие" suffix="ч" value=${f.hours.coat} onChange=${(v) => set((n) => { n.hours.coat = v; })} />
            ${f.stain ? html`<${Num} decimal label="Покраска" suffix="ч" value=${f.hours.stain} onChange=${(v) => set((n) => { n.hours.stain = v; })} />` : null}
            ${services.map((s) => html`
              <${Num} key=${s.id} decimal label=${normKey(s.key) || s.name} suffix="ч" value=${f.hours.services[s.id]}
                onChange=${(v) => set((n) => { n.hours.services[s.id] = v; })} />`)}
            <${Num} decimal label="Дорога" suffix="ч" value=${f.hours.travel} onChange=${(v) => set((n) => { n.hours.travel = v; })} />
            <${Num} decimal label="Прочее" suffix="ч" value=${f.hours.other} onChange=${(v) => set((n) => { n.hours.other = v; })} />
          </div>
          <div class="chips">
            ${!f.stain ? html`<button type="button" class="chip" onClick=${() => set((n) => { n.stain = true; })}>+ покраска</button>` : null}
            ${moreServices.map((s) => html`<button type="button" class="chip" key=${s.id} onClick=${() => set((n) => { n.hours.services[s.id] = ''; })}>+ ${normKey(s.key) || s.name}</button>`)}
          </div>`}

        <span class="eyebrow">Расход материалов</span>
        <div class="fields">
          ${mats.map((m) => html`
            <${Num} key=${m.id} label=${m.name || KIND[m.kind]} suffix="мл" value=${f.materials?.[m.id] ?? ''}
              onChange=${(v) => set((n) => { n.materials = { ...(n.materials || {}), [m.id]: v }; })} />`)}
          <${Num} group label="Прочие расходы" suffix=${cur} value=${f.expenses} onChange=${(v) => set((n) => { n.expenses = v; })} />
        </div>
        ${moreMats.length ? html`
          <div class="chips">
            ${moreMats.map((m) => html`<button type="button" class="chip" key=${m.id} onClick=${() => set((n) => { n.materials = { ...(n.materials || {}), [m.id]: '' }; })}>+ ${m.name || KIND[m.kind]}</button>`)}
          </div>` : null}

        <div class="fact__result">
          <div class="pe__stats">
            <div><span>Прибыль</span><b>${fmtInt(sum.profit)}<small>${cur}</small></b></div>
            <div><span>Ваш час</span><b>${noTime ? '—' : fmtInt(sum.rate)}<small>${cur}/ч</small></b></div>
            <div><span>За м²</span><b>${fmtInt(sum.perM2)}<small>${cur}</small></b></div>
          </div>
          ${noTime ? html`<p class="fact__warn">Укажите время — без него час не посчитать и заказ не попадёт в средний час.</p>` : null}
        </div>
      </div>
    </section>`;
}

// ── Статистика ──────────────────────────────────────────────────

const PERIODS = [['30', '30 дней'], ['365', 'Год'], ['all', 'Всё время']];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthName = (key) => { const [y, m] = key.split('-'); return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${y}` : key; };

function Versus({ label, fact, plan, unit, n }) {
  const diff = plan > 0 && fact > 0 ? (fact / plan - 1) * 100 : 0;
  return html`
    <div class="versus">
      <span class="versus__label">${label}</span>
      <b>${fact > 0 ? fmtNum(fact, 2) : '—'}<small>${unit}</small></b>
      <span class="versus__plan">норма ${fmtNum(plan, 2)}${fact > 0 && Math.abs(diff) >= 1 ? html` · <i class=${diff > 0 ? 'is-up' : 'is-down'}>${diff > 0 ? '+' : ''}${fmtInt(diff)}%</i>` : ''}${n ? ` · ${n} зак.` : ''}</span>
    </div>`;
}

export function StatsPage({ orders, settings }) {
  const [period, setPeriod] = useState('all');
  const cur = settings.currency;
  const st = useMemo(() => {
    const from = period === 'all' ? '' : new Date(Date.now() - Number(period) * 864e5).toISOString().slice(0, 10);
    return aggregateStats(orders.filter((o) => o.fact && String(o.fact.date || '') >= from));
  }, [orders, period]);
  const cost = settings.cost;
  const t = cost.time;
  const anyDone = orders.some((o) => !o.deleted && o.fact);

  return html`
    <div class="page">
      <section class="section">
        <header class="section__head">
          <div class="section__title"><h2>Статистика</h2><p>Только выполненные заказы — реальные деньги и время</p></div>
          <div class="seg">
            ${PERIODS.map(([v, l]) => html`<button type="button" class=${'seg__btn' + (period === v ? ' is-on' : '')} onClick=${() => setPeriod(v)}>${l}</button>`)}
          </div>
        </header>

        ${!anyDone ? html`
          <div class="card empty">
            <h3>Пока нет выполненных заказов</h3>
            <p>Сохранённые расчёты в статистику не попадают. Откройте заказ, переключите статус на «Выполнен» и укажите, сколько получили и сколько времени ушло — тогда он появится здесь.</p>
            <a class="btn btn--primary" href="#orders">К заказам</a>
          </div>` : html`
          <div class="kpis">
            <div class=${'card kpi kpi--main is-' + (st.avgRate >= num(cost.rateTarget) ? 'good' : st.avgRate >= num(cost.rateMin) ? 'warn' : 'bad')}>
              <span class="eyebrow">Ваш час в среднем (чистыми, за вычетом расходов)</span>
              <b>${fmtInt(st.avgRate)}<small>${cur}/ч</small></b>
              <p>желаемый ${fmtInt(cost.rateTarget)} · минимум ${fmtInt(cost.rateMin)}${st.noTime ? ` · без времени ${st.noTime} ${plural(st.noTime, ['заказ', 'заказа', 'заказов'])} не учтено` : ''}</p>
            </div>
            <div class="card kpi"><span class="eyebrow">Средняя цена за м²</span><b>${fmtInt(st.avgPerM2)}<small>${cur}</small></b><p>${fmtArea(st.area)} м² всего</p></div>
            <div class="card kpi"><span class="eyebrow">Средний заказ</span><b>${fmtInt(st.avgCheck)}<small>${cur}</small></b><p>${st.count} ${plural(st.count, ['заказ', 'заказа', 'заказов'])}</p></div>
            <div class="card kpi"><span class="eyebrow">Прибыль</span><b>${fmtInt(st.profit)}<small>${cur}</small></b><p>выручка ${fmtInt(st.received)} · расходы ${fmtInt(st.expenses)}</p></div>
            <div class="card kpi"><span class="eyebrow">Отработано</span><b>${fmtNum(st.hours, 1)}<small>ч</small></b><p>включая дорогу</p></div>
          </div>`}
      </section>

      ${anyDone ? html`
        <section class="section">
          <header class="section__head">
            <div class="section__title"><h2>Факт против норм</h2>
              <p>Время по этапам введено в ${st.stages} из ${st.count} заказов — остальные идут только в час и прибыль</p></div>
          </header>
          <div class="card versus-grid">
            <${Versus} label="Шлифовка, было масло" unit="ч/м²" fact=${st.sand.oil.perM2} plan=${num(t.sand)} n=${st.sand.oil.n} />
            <${Versus} label="Шлифовка, был лак" unit="ч/м²" fact=${st.sand.lacquer.perM2} plan=${num(t.sand) * num(t.sandLacquerK)} n=${st.sand.lacquer.n} />
            <${Versus} label="Покрытие маслом" unit="ч/м²" fact=${st.coat.oil.perM2} plan=${num(t.oil.coat)} n=${st.coat.oil.n} />
            <${Versus} label="Покрытие лаком" unit="ч/м²" fact=${st.coat.lacquer.perM2} plan=${num(t.lacquer.coat)} n=${st.coat.lacquer.n} />
            ${st.stain.n ? html`<${Versus} label="Покраска" unit="ч/м²" fact=${st.stain.perM2} plan=${num(t.stain.coat)} n=${st.stain.n} />` : null}
            ${settings.services.map((s) => html`
              <${Versus} key=${s.id} label=${normKey(s.key) || s.name} unit="ч" fact=${st.services[s.id]?.hours || 0} plan=${num(s.hours)} n=${st.services[s.id]?.n} />`)}
            ${cost.materials.filter((m) => st.materials[m.id]).map((m) => html`
              <${Versus} key=${m.id} label=${(m.name || KIND[m.kind]) + ', расход'} unit="мл/м²" fact=${st.materials[m.id].perM2} plan=${materialMlPerM2(m)} n=${st.materials[m.id].n} />`)}
          </div>
          <p class="lead lead--sm">В покрытии факт включает ожидание между слоями, поэтому на маленьких заказах он выше нормы на м².</p>
        </section>

        <section class="section">
          <header class="section__head">
            <div class="section__title"><h2>По месяцам</h2></div>
          </header>
          <div class="card months">
            <div class="months__row months__row--head"><span>Месяц</span><span>Заказов</span><span>Выручка</span><span>Прибыль</span><span>${cur}/ч</span></div>
            ${st.months.map((m) => html`
              <div class="months__row" key=${m.key}>
                <span>${monthName(m.key)}</span><span>${m.count}</span><span>${fmtInt(m.received)}</span><span>${fmtInt(m.profit)}</span><b>${fmtInt(m.rate)}</b>
              </div>`)}
          </div>
        </section>` : null}
    </div>`;
}
