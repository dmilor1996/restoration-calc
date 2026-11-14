// Нормочас и себестоимость: блок в итоге, настройки, факт выполнения, статистика.

import { html, useState, useEffect, useMemo } from './vendor/preact-htm.js';
import {
  num, COATS, materialCostPerM2, materialMlPerM2, materialsFor, travelPlan, orderServices, calcTotals,
  factSummary, aggregateStats, normKey, fmtInt, fmtNum, fmtArea, fmtPrice, plural,
} from './calc.js';
import { uid } from './defaults.js';
import { Icon, Num, Text } from './ui.js';

const COAT = { lacquer: 'Лак', oil: 'Масло' };
const fmtH = (h) => `${fmtNum(h, 1)} ч`;
const STATUS_TEXT = { good: 'выше желаемого', warn: 'ниже желаемого', bad: 'ниже минимума', none: '' };

// ── Блок «Нормочас» в итоге ─────────────────────────────────────

export function NormPanel({ cost, settings, hidden, onToggle }) {
  const cur = settings.currency;
  const adv = cost.travelAdvice;
  return html`
    <div class="card norm">
      <div class="tpl__head">
        <span class="eyebrow">Нормочас</span>
        <button type="button" class="link-btn" onClick=${onToggle}>${hidden ? 'Показать' : 'Скрыть'}</button>
      </div>
      ${hidden ? null : !(cost.area > 0) ? html`<p class="total__note">Укажите размеры — здесь появится, сколько стоит ваш час при этой цене.</p>` : html`
        <div class="norm__grid">
          ${['lacquer', 'oil'].map((c) => {
            const x = cost.coats[c];
            return html`
              <div class=${'norm__col is-' + x.status} key=${c}>
                <span class="norm__label">${COAT[c]}</span>
                <b class="norm__rate">${fmtInt(x.rate)}<small>${cur}/ч</small></b>
                <span class="norm__status">${STATUS_TEXT[x.status]}</span>
                <dl>
                  <div><dt>Время</dt><dd>${fmtH(x.hours.total)}</dd></div>
                  <div><dt>При ${fmtInt(cost.rateTarget)}/ч</dt><dd>${fmtPrice(x.priceTarget, cur)}</dd></div>
                  <div><dt>Минимум</dt><dd>${fmtPrice(x.priceMin, cur)}</dd></div>
                </dl>
              </div>`;
          })}
        </div>

        <div class="norm__m2">
          <span class="eyebrow">Цена за м² работы</span>
          ${['lacquer', 'oil'].map((c) => {
            const p = cost.coats[c].perM2;
            return html`<p key=${c}><b>${COAT[c]}:</b> прайс ${fmtInt(p.price)} · по нормочасу ${fmtInt(p.target)} · минимум ${fmtInt(p.min)}</p>`;
          })}
        </div>

        ${adv ? html`
          <p class=${'norm__advice' + (adv.need > 0 && !adv.charged ? ' is-warn' : '')}>
            ${adv.charged ? `Выезд включён в цену: ${fmtPrice(adv.charged, cur)}.` : ''}
            ${adv.need > 0
              ? ` С дорогой час ниже желаемого. Чтобы выйти на ${fmtInt(cost.rateTarget)} ${cur}/ч, не хватает ${fmtPrice(adv.need, cur)}${adv.charged ? '' : ` (по тарифу за выезд было бы ${fmtPrice(adv.tariff, cur)})`}.`
              : (adv.charged ? '' : ' Дорога окупается ценой заказа — доплата за выезд не нужна.')}
          </p>` : null}

        <details class="norm__details">
          <summary>Из чего складывается</summary>
          <table>
            <tr><th></th><th>Лак</th><th>Масло</th></tr>
            ${[['Шлифовка', 'sand'], ['Нанесение', 'coat'], ['Подготовка, сушка', 'fixed'], ['Услуги', 'services'], ['Дорога', 'travel']].map(([label, key]) => (
              cost.coats.oil.hours[key] > 0 || cost.coats.lacquer.hours[key] > 0 ? html`
                <tr><td>${label}</td><td>${fmtH(cost.coats.lacquer.hours[key])}</td><td>${fmtH(cost.coats.oil.hours[key])}</td></tr>` : null))}
            <tr><td>Материалы</td><td>${fmtPrice(cost.coats.lacquer.materials, cur)}</td><td>${fmtPrice(cost.coats.oil.materials, cur)}</td></tr>
            ${cost.travel.carCost > 0 ? html`<tr><td>Машина, ${fmtInt(cost.travel.dist)} км</td><td>${fmtPrice(cost.travel.carCost, cur)}</td><td>${fmtPrice(cost.travel.carCost, cur)}</td></tr>` : null}
            <tr class="is-sum"><td>Получаете${cost.servicesRevenue ? ' (с услугами)' : ''}</td><td>${fmtPrice(cost.coats.lacquer.revenue, cur)}</td><td>${fmtPrice(cost.coats.oil.revenue, cur)}</td></tr>
          </table>
        </details>`}
    </div>`;
}

// ── Настройки себестоимости ─────────────────────────────────────

export function CostPage({ settings, upSettings }) {
  const cost = settings.cost;
  const cur = settings.currency;
  const up = (fn) => upSettings((s) => { fn(s.cost); });
  const setTime = (coat, key) => (v) => up((c) => { c.time[coat][key] = v; });
  const upMat = (id, fn) => up((c) => { const m = c.materials.find((x) => x.id === id); if (m) fn(m); });
  const perM2 = (coat) => materialsFor(cost, coat).reduce((s, m) => s + materialCostPerM2(m), 0);

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
        <div class="grid3 grid3--head"><span></span><span>Под масло</span><span>Под лак</span></div>
        ${[['sand', 'Шлифовка', 'часов на 1 м²'], ['coat', 'Нанесение покрытия', 'часов на 1 м², все слои'], ['fixed', 'Подготовка, уборка, сушка', 'часов на заказ, не зависит от площади']].map(([key, title, hint]) => html`
          <div class="grid3" key=${key}>
            <div><h3>${title}</h3><p>${hint}</p></div>
            <${Num} decimal suffix="ч" aria=${title + ', под масло'} value=${cost.time.oil[key]} onChange=${setTime('oil', key)} />
            <${Num} decimal suffix="ч" aria=${title + ', под лак'} value=${cost.time.lacquer[key]} onChange=${setTime('lacquer', key)} />
          </div>`)}
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
          <p>Сейчас выходит: масло ${fmtInt(perM2('oil'))} ${cur}/м² · лак ${fmtInt(perM2('lacquer'))} ${cur}/м²</p></div>
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
                  ${[['oil', 'Для масла'], ['lacquer', 'Для лака'], ['both', 'Для обоих']].map(([v, l]) => html`
                    <button type="button" class=${'seg__btn' + (m.coat === v ? ' is-on' : '')} onClick=${() => upMat(m.id, (x) => { x.coat = v; })}>${l}</button>`)}
                </div>
                <span class="mat__sum">${fmtInt(materialMlPerM2(m))} мл/м² · <b>${fmtInt(materialCostPerM2(m))} ${cur}/м²</b></span>
              </div>
            </div>`)}
        </div>
        <button type="button" class="adder adder--sm"
          onClick=${() => up((c) => { c.materials.push({ id: uid(), name: '', coat: 'both', volume: 1, price: 0, perM2: 0, layers: 1 }); })}>
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
  const totals = calcTotals(order.draft, settings);
  const area = totals.area.total;
  const t = settings.cost.time[coat];
  const tp = travelPlan(order.draft, settings.cost);
  const services = orderServices(order.draft, settings);
  return {
    date: today(), coat, area: Math.round(area * 100) / 100,
    received: String((order.totals?.[coat] ?? totals.price[coat].final) + services.reduce((s, x) => s + num(x.price), 0)),
    hours: {
      sand: r1(area * num(t.sand)), coat: r1(area * num(t.coat) + num(t.fixed)),
      services: Object.fromEntries(services.map((s) => [s.id, String(num(s.hours))])),
      travel: tp.hours ? r1(tp.hours) : '', other: '',
    },
    materials: Object.fromEntries(materialsFor(settings.cost, coat).map((m) => [m.id, String(Math.round(materialMlPerM2(m) * area))])),
    expenses: '',
  };
}

export function FactModal({ order, settings, onSave, onClose, onReopen }) {
  const cur = settings.currency;
  const [f, setF] = useState(() => (order.fact ? structuredClone(order.fact) : planFact(order, settings, 'oil')));
  const set = (fn) => setF((prev) => { const n = structuredClone(prev); fn(n); return n; });
  const c = order.draft?.client || {};
  const mats = settings.cost.materials.filter((m) => m.coat === f.coat || m.coat === 'both' || f.materials?.[m.id]);
  const services = settings.services.filter((s) => s.id in (f.hours.services || {}));
  const tp = travelPlan(order.draft, settings.cost);

  useEffect(() => {
    document.documentElement.classList.add('is-locked');
    return () => document.documentElement.classList.remove('is-locked');
  }, []);

  const materialsCost = settings.cost.materials.reduce((s, m) => {
    const ml = num(m.volume) * 1000;
    return s + (ml > 0 ? (num(m.price) / ml) * num(f.materials?.[m.id]) : 0);
  }, 0);
  const full = { ...f, materialsCost: Math.round(materialsCost), carCost: Math.round(tp.carCost) };
  const sum = factSummary({ fact: full });
  const setCoat = (coat) => { if (order.fact) set((n) => { n.coat = coat; }); else setF(planFact(order, settings, coat)); };

  return html`
    <div class="modal" role="dialog" aria-modal="true" aria-label="Заказ выполнен">
      <div class="modal__box modal__box--narrow">
        <header class="modal__head">
          <div><span class="eyebrow">Заказ выполнен</span><h2>${c.name || c.address || 'Без имени'}</h2></div>
          <button type="button" class="icon-btn" aria-label="Закрыть" onClick=${onClose}>${Icon.x()}</button>
        </header>
        <div class="modal__body fact">
          <p class="card__note">Поля заполнены по плану — поправьте на то, как было на самом деле. Из этих цифр складывается статистика.</p>
          <div class="fact__row">
            <div class="seg">
              ${['oil', 'lacquer'].map((v) => html`
                <button type="button" class=${'seg__btn' + (f.coat === v ? ' is-on' : '')} onClick=${() => setCoat(v)}>${COAT[v]}</button>`)}
            </div>
            <label class="field"><span class="field__box"><input type="date" value=${f.date} aria-label="Дата выполнения"
              onInput=${(e) => set((n) => { n.date = e.target.value; })} /></span></label>
          </div>
          <div class="fields">
            <${Num} group label="Получено от клиента" suffix=${cur} value=${f.received} onChange=${(v) => set((n) => { n.received = v; })} />
            <${Num} decimal label="Площадь" suffix="м²" value=${f.area} onChange=${(v) => set((n) => { n.area = v; })} />
          </div>

          <span class="eyebrow">Время, часов</span>
          <div class="fields">
            <${Num} decimal label="Шлифовка" suffix="ч" value=${f.hours.sand} onChange=${(v) => set((n) => { n.hours.sand = v; })} />
            <${Num} decimal label="Покрытие" suffix="ч" value=${f.hours.coat} onChange=${(v) => set((n) => { n.hours.coat = v; })} />
            ${services.map((s) => html`
              <${Num} key=${s.id} decimal label=${normKey(s.key) || s.name} suffix="ч" value=${f.hours.services[s.id]}
                onChange=${(v) => set((n) => { n.hours.services[s.id] = v; })} />`)}
            <${Num} decimal label="Дорога" suffix="ч" value=${f.hours.travel} onChange=${(v) => set((n) => { n.hours.travel = v; })} />
            <${Num} decimal label="Прочее" suffix="ч" value=${f.hours.other} onChange=${(v) => set((n) => { n.hours.other = v; })} />
          </div>

          <span class="eyebrow">Расходы</span>
          <div class="fields">
            ${mats.map((m) => html`
              <${Num} key=${m.id} label=${m.name || 'Материал'} suffix="мл" value=${f.materials?.[m.id] ?? ''}
                onChange=${(v) => set((n) => { n.materials = { ...(n.materials || {}), [m.id]: v }; })} />`)}
            <${Num} group label="Прочие расходы" suffix=${cur} value=${f.expenses} onChange=${(v) => set((n) => { n.expenses = v; })} />
          </div>
        </div>
        <footer class="modal__foot">
          <div class="pe__stats">
            <div><span>Прибыль</span><b>${fmtInt(sum.profit)}<small>${cur}</small></b></div>
            <div><span>Ваш час</span><b>${fmtInt(sum.rate)}<small>${cur}/ч</small></b></div>
            <div><span>За м²</span><b>${fmtInt(sum.perM2)}<small>${cur}</small></b></div>
          </div>
          <div class="btn-row">
            ${order.fact ? html`<button type="button" class="btn btn--ghost" onClick=${onReopen}>Вернуть в работу</button>` : null}
            <button type="button" class="btn btn--primary" onClick=${() => onSave(full)}>${Icon.check()}<span>Сохранить</span></button>
          </div>
        </footer>
      </div>
    </div>`;
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
  const anyDone = orders.some((o) => !o.deleted && o.fact);

  return html`
    <div class="page">
      <section class="section">
        <header class="section__head">
          <div class="section__title"><h2>Статистика</h2><p>По выполненным заказам — реальные деньги и время</p></div>
          <div class="seg">
            ${PERIODS.map(([v, l]) => html`<button type="button" class=${'seg__btn' + (period === v ? ' is-on' : '')} onClick=${() => setPeriod(v)}>${l}</button>`)}
          </div>
        </header>

        ${!anyDone ? html`
          <div class="card empty">
            <h3>Пока нет выполненных заказов</h3>
            <p>На вкладке «Заказы» нажмите «Выполнен» у заказа и укажите, сколько получили и сколько времени ушло. Отсюда будет видно реальную прибыль и ваш фактический час.</p>
            <a class="btn btn--primary" href="#orders">К заказам</a>
          </div>` : html`
          <div class="kpis">
            <div class=${'card kpi kpi--main is-' + (st.avgRate >= num(cost.rateTarget) ? 'good' : st.avgRate >= num(cost.rateMin) ? 'warn' : 'bad')}>
              <span class="eyebrow">Ваш час в среднем</span>
              <b>${fmtInt(st.avgRate)}<small>${cur}/ч</small></b>
              <p>желаемый ${fmtInt(cost.rateTarget)} · минимум ${fmtInt(cost.rateMin)}</p>
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
            <div class="section__title"><h2>Факт против норм</h2><p>Если факт стабильно отличается — поправьте нормы на вкладке «Себестоимость»</p></div>
          </header>
          <div class="card versus-grid">
            <${Versus} label="Шлифовка под масло" unit="ч/м²" fact=${st.norm.oil.sand} plan=${num(cost.time.oil.sand)} n=${st.norm.oil.n} />
            <${Versus} label="Шлифовка под лак" unit="ч/м²" fact=${st.norm.lacquer.sand} plan=${num(cost.time.lacquer.sand)} n=${st.norm.lacquer.n} />
            <${Versus} label="Покрытие маслом" unit="ч/м²" fact=${st.norm.oil.coat} plan=${num(cost.time.oil.coat)} />
            <${Versus} label="Покрытие лаком" unit="ч/м²" fact=${st.norm.lacquer.coat} plan=${num(cost.time.lacquer.coat)} />
            ${settings.services.map((s) => html`
              <${Versus} key=${s.id} label=${normKey(s.key) || s.name} unit="ч" fact=${st.services[s.id]?.hours || 0} plan=${num(s.hours)} n=${st.services[s.id]?.n} />`)}
            ${cost.materials.map((m) => html`
              <${Versus} key=${m.id} label=${(m.name || 'Материал') + ', расход'} unit="мл/м²" fact=${st.materials[m.id]?.perM2 || 0} plan=${materialMlPerM2(m)} n=${st.materials[m.id]?.n} />`)}
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
