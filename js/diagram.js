// Схема фигуры с нажимаемыми гранями и редактор «Своя форма» (рисование контура).

import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { num, shapeOutline, shapeSides, faceArea, polyArea, measuredSideLength, measuredSideError, measurePolySide, clearPolyMeasurements, fmtInt, fmtArea, fmtNum } from './calc.js';
import { Icon, cleanNum } from './ui.js';

const GHOST = {
  rect: { shape: 'rect', l: 2, w: 1 },
  trap: { shape: 'trap', a: 0.6, b: 1, h: 2 },
  poly: { shape: 'poly', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }] },
};

const SIDE_NAME = { t: 'Верхняя грань', r: 'Правая грань', b: 'Нижняя грань', l: 'Левая грань' };

/** Угол подписи вдоль стороны, чтобы текст не оказывался вверх ногами. */
function labelAngle(dx, dy) {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
}

/** Схема на карточке позиции: нажатие на грань включает или выключает торец. */
export function Diagram({ item, onToggle }) {
  const W = 240, H = 140, PX = 30, PY = 26;
  const bw = W - PX * 2, bh = H - PY * 2;
  const cx = W / 2, cy = H / 2;
  const area = faceArea(item);
  const sides = shapeSides(item);

  const edgeProps = (id, on) => ({
    role: 'switch', tabindex: 0, 'aria-checked': on ? 'true' : 'false',
    onClick: () => onToggle(id),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(id); } },
  });

  if (item.shape === 'circle') {
    const r = Math.min(bw, bh) / 2 + 8;
    const on = !!sides[0]?.on;
    return html`
      <svg class=${'diagram' + (area ? '' : ' is-ghost')} viewBox="0 0 ${W} ${H}" role="group" aria-label="Схема: нажмите на край, чтобы учесть торец">
        <circle class="diagram__fill" cx=${cx} cy=${cy} r=${r} />
        <circle class=${'edge' + (on ? ' is-on' : '')} cx=${cx} cy=${cy} r=${r} fill="none" />
        <circle class="edge-hit" cx=${cx} cy=${cy} r=${r} fill="none" aria-label="Торец по окружности" ...${edgeProps('c', on)} />
        <text class="diagram__center" x=${cx} y=${cy + 4} text-anchor="middle">${area ? '⌀ ' + fmtInt(item.d) : 'диаметр'}</text>
      </svg>`;
  }

  let o = shapeOutline(item);
  const ghost = !o.valid;
  if (ghost) o = shapeOutline(GHOST[item.shape] || GHOST.rect);
  const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y);
  const minx = Math.min(...xs), miny = Math.min(...ys);
  const lx = Math.max(...xs) - minx || 1, ly = Math.max(...ys) - miny || 1;
  const s = Math.min(bw / lx, bh / ly);
  const dw = Math.min(bw, Math.max(lx * s, 64)), dh = Math.min(bh, Math.max(ly * s, 40));
  const P = o.pts.map((p) => [cx - dw / 2 + ((p.x - minx) / lx) * dw, cy - dh / 2 + ((p.y - miny) / ly) * dh]);
  const sign = Math.sign(polyArea(P.map(([x, y]) => ({ x, y })))) || 1;
  const byId = Object.fromEntries(sides.map((sd) => [sd.id, sd]));

  const lines = o.ids.map((id, i) => {
    const a = P[i], b = P[(i + 1) % P.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const real = ghost && item.shape === 'poly' ? null : byId[id];
    return {
      id, a, b, on: !!real?.on, px: len,
      text: !ghost && real?.len ? fmtInt(real.len) : '',
      lx: (a[0] + b[0]) / 2 + (sign * dy / len) * 11,
      ly: (a[1] + b[1]) / 2 + (sign * -dx / len) * 11,
      angle: labelAngle(dx, dy),
      name: SIDE_NAME[id] || `Сторона ${i + 1}`,
    };
  });

  return html`
    <svg class=${'diagram' + (ghost ? ' is-ghost' : '')} viewBox="0 0 ${W} ${H}" role="group" aria-label="Схема: нажмите на грань, чтобы учесть торец">
      <polygon class="diagram__fill" points=${P.map((p) => p.join(',')).join(' ')} />
      ${lines.map((ln) => html`
        <line class=${'edge' + (ln.on ? ' is-on' : '')} x1=${ln.a[0]} y1=${ln.a[1]} x2=${ln.b[0]} y2=${ln.b[1]} />`)}
      ${lines.map((ln) => (ln.text && (item.shape !== 'poly' || ln.px > 24) ? html`
        <text class=${'diagram__dim' + (ln.on ? ' is-on' : '')} x=${ln.lx} y=${ln.ly} text-anchor="middle" dominant-baseline="central"
          transform="rotate(${ln.angle} ${ln.lx} ${ln.ly})">${ln.text}</text>` : null))}
      ${lines.map((ln) => html`
        <line class="edge-hit" x1=${ln.a[0]} y1=${ln.a[1]} x2=${ln.b[0]} y2=${ln.b[1]} aria-label=${ln.name} ...${edgeProps(ln.id, ln.on)} />`)}
    </svg>`;
}

// ── Редактор «Своя форма» ───────────────────────────────────────

const EW = 640, EH = 460, EP = 64;

const PRESETS = [
  { label: 'Г-образная', pts: [[0, 0], [2400, 0], [2400, 600], [600, 600], [600, 1800], [0, 1800]] },
  { label: 'П-образная', pts: [[0, 0], [3000, 0], [3000, 1800], [2400, 1800], [2400, 600], [600, 600], [600, 1800], [0, 1800]] },
  { label: 'Со срезом', pts: [[0, 0], [1700, 0], [2000, 300], [2000, 800], [0, 800]] },
  { label: 'С вырезом', pts: [[0, 0], [2000, 0], [2000, 600], [1400, 600], [1400, 300], [600, 300], [600, 600], [0, 600]] },
  { label: '4 угла', pts: [[0, 0], [1000, 150], [1000, 650], [0, 400]] },
  { label: 'Треугольник', pts: [[0, 0], [1000, 0], [0, 800]] },
];

function fitView(pts, room) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  if (room || !pts.length) { xs.push(0, room?.w || 3000); ys.push(0, room?.h || 2000); }
  const minx = Math.min(...xs), miny = Math.min(...ys);
  const bw = Math.max(Math.max(...xs) - minx, 200), bh = Math.max(Math.max(...ys) - miny, 200);
  const s = Math.min((EW - EP * 2) / bw, (EH - EP * 2) / bh);
  return { s, ox: (EW - bw * s) / 2 - minx * s, oy: (EH - bh * s) / 2 - miny * s };
}
const toS = (v, p) => [v.ox + p.x * v.s, v.oy + p.y * v.s];
const toW = (v, x, y) => ({ x: (x - v.ox) / v.s, y: (y - v.oy) / v.s });

/** Поле, которое применяет значение по Enter или при выходе из него. */
function CommitNum({ value, onCommit, suffix, label, aria, measure = false }) {
  const [text, setText] = useState(null);
  const dirty = useRef(false);
  const shown = text ?? String(Math.round(value));
  const commit = () => {
    if (text !== null && text !== '' && (num(text) !== Math.round(value) || (measure && dirty.current))) onCommit(num(text));
    dirty.current = false;
    setText(null);
  };
  return html`
    <label class="field field--commit">
      ${label ? html`<span class="field__label">${label}</span>` : null}
      <span class="field__box">
        <input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" value=${shown} aria-label=${aria || label}
          onFocus=${(e) => { setText(String(Math.round(value))); const el = e.target; requestAnimationFrame(() => el.select()); }}
          onInput=${(e) => { dirty.current = true; const v = cleanNum(e.target.value); if (v !== e.target.value) e.target.value = v; setText(v); }}
          onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); }}
          onBlur=${commit} />
        ${suffix ? html`<span class="field__suffix">${suffix}</span>` : null}
      </span>
    </label>`;
}

export function PolyEditor({ item, title, onSave, onClose }) {
  const [pts, setPts] = useState(() => (item.pts || []).map((p) => ({ x: num(p.x), y: num(p.y), e: !!p.e, ...(Number.isFinite(p.m) && p.m > 0 ? { m: p.m } : {}) })));
  const [sel, setSel] = useState(null);
  const [hi, setHi] = useState(null);
  const [snap, setSnap] = useState(10);
  const [drawing, setDrawing] = useState(() => (item.pts || []).length < 3);
  const [, redraw] = useState(0);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const room = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('is-locked');
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('is-locked'); };
  }, []);

  // Пока рисуем или тянем точку, масштаб не меняется — иначе фигура «убегает» из-под пальца.
  if (drawing && !room.current) room.current = fitView(pts, { w: 3000, h: 2000 });
  if (!drawing) room.current = null;
  const view = drag.current?.view || room.current || fitView(pts);

  const n = pts.length;
  const hasMeasures = pts.some((p) => Number.isFinite(p.m) && p.m > 0);
  const mismatch = measuredSideError(pts);
  const S = pts.map((p) => toS(view, p));
  const area = n >= 3 ? Math.abs(polyArea(pts)) / 1e6 : 0;
  const sign = Math.sign(polyArea(S.map(([x, y]) => ({ x, y })))) || 1;
  const sides = n >= 2 ? pts.map((p, i) => {
    const q = pts[(i + 1) % n], a = S[i], b = S[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], px = Math.hypot(dx, dy) || 1;
    return {
      i, a, b, px, len: measuredSideLength(p, q), measured: Number.isFinite(p.m) && p.m > 0, on: !!p.e,
      mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2,
      nx: (sign * dy) / px, ny: (sign * -dx) / px, angle: labelAngle(dx, dy),
    };
  }).filter((sd) => n >= 3 || sd.i === 0) : [];
  const perimeter = n >= 3 ? sides.reduce((s, sd) => s + sd.len, 0) : 0;

  // Сетка
  const gridStep = [10, 50, 100, 250, 500, 1000, 2500].find((g) => g * view.s >= 22) || 5000;
  const w0 = toW(view, 0, 0), w1 = toW(view, EW, EH);
  const grid = [];
  for (let x = Math.ceil(w0.x / gridStep) * gridStep; x <= w1.x && grid.length < 200; x += gridStep) grid.push(['v', view.ox + x * view.s]);
  for (let y = Math.ceil(w0.y / gridStep) * gridStep; y <= w1.y && grid.length < 400; y += gridStep) grid.push(['h', view.oy + y * view.s]);

  const pointer = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * EW) / r.width, ((e.clientY - r.top) * EH) / r.height];
  };
  const snapW = (p) => ({ x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap });

  const finishDrawing = () => { setDrawing(false); setSel(null); };
  const onVertexDown = (i) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (drawing && i === 0 && n >= 3) { finishDrawing(); return; }
    svgRef.current.setPointerCapture?.(e.pointerId);
    drag.current = { i, view };
    setSel(i);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = pointer(e);
    const w = snapW(toW(d.view, x, y));
    setPts((ps) => {
      // «Прилипание» к другим углам по горизонтали и вертикали — так проще держать прямые углы.
      const tol = 9 / d.view.s;
      for (const [j, q] of ps.entries()) {
        if (j === d.i) continue;
        if (Math.abs(q.x - w.x) < tol) w.x = q.x;
        if (Math.abs(q.y - w.y) < tol) w.y = q.y;
      }
      if (ps[d.i].x === w.x && ps[d.i].y === w.y) return ps;
      return clearPolyMeasurements(ps, [(d.i - 1 + ps.length) % ps.length, d.i]).map((p, j) => (j === d.i ? { ...p, x: w.x, y: w.y } : p));
    });
  };
  const onUp = () => { if (drag.current) { drag.current = null; redraw((v) => v + 1); } };
  const onCanvasDown = (e) => {
    if (!drawing) { setSel(null); return; }
    const [x, y] = pointer(e);
    const w = snapW(toW(view, x, y));
    setSel(pts.length);
    setPts((ps) => [...clearPolyMeasurements(ps, [ps.length - 1]), { x: w.x, y: w.y, e: false }]);
  };
  const insertAfter = (i) => {
    const p = pts[i], q = pts[(i + 1) % n];
    const m = snapW({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const clean = clearPolyMeasurements(pts, [i]);
    setPts([...clean.slice(0, i + 1), { ...m, e: p.e }, ...clean.slice(i + 1)]);
    setSel(i + 1);
  };
  const removeSel = () => { setPts(clearPolyMeasurements(pts, [(sel - 1 + n) % n]).filter((_, j) => j !== sel)); setSel(null); };
  const applyPreset = (preset) => {
    setPts(preset.pts.map(([x, y]) => ({ x, y, e: false })));
    setDrawing(false);
    setSel(null);
  };
  const clear = () => { setPts([]); setSel(null); room.current = null; setDrawing(true); };
  const setCoord = (key) => (v) => setPts((ps) => clearPolyMeasurements(ps, [(sel - 1 + ps.length) % ps.length, sel]).map((p, j) => (j === sel ? { ...p, [key]: v } : p)));
  const toggleEdge = (i) => setPts(pts.map((p, j) => (j === i ? { ...p, e: !p.e } : p)));
  const allOn = n >= 3 && pts.every((p) => p.e);

  const save = () => {
    const minx = Math.min(...pts.map((p) => p.x)), miny = Math.min(...pts.map((p) => p.y));
    onSave(pts.map((p) => ({ x: Math.round((p.x - minx) * 10) / 10, y: Math.round((p.y - miny) * 10) / 10, e: !!p.e, ...(Number.isFinite(p.m) && p.m > 0 ? { m: p.m } : {}) })));
  };

  const hint = drawing
    ? (n < 3 ? 'Нажимайте на поле, чтобы поставить углы фигуры по порядку' : 'Продолжайте ставить углы или нажмите «Готово» — фигура замкнётся')
    : 'Тяните углы, «+» добавляет угол на стороне. Вводите замеры в списке сторон';

  return html`
    <div class="modal" role="dialog" aria-modal="true" aria-label="Своя форма">
      <div class="modal__box">
        <header class="modal__head">
          <div><span class="eyebrow">Своя форма</span><h2>${title}</h2></div>
          <button type="button" class="icon-btn" aria-label="Закрыть" onClick=${onClose}>${Icon.x()}</button>
        </header>

        <div class="modal__body pe">
          <div class="pe__main">
            <div class="chips chips--scroll">
              <span class="chips__label">Заготовка</span>
              <button type="button" class=${'chip' + (drawing ? ' is-on' : '')} onClick=${clear}>С нуля</button>
              ${PRESETS.map((p) => html`<button type="button" class="chip" onClick=${() => applyPreset(p)}>${p.label}</button>`)}
            </div>

            <svg ref=${svgRef} class=${'pe__svg' + (drawing ? ' is-drawing' : '')} viewBox="0 0 ${EW} ${EH}"
              onPointerDown=${onCanvasDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
              ${grid.map(([dir, v]) => (dir === 'v'
                ? html`<line class="pe__grid" x1=${v} y1="0" x2=${v} y2=${EH} />`
                : html`<line class="pe__grid" x1="0" y1=${v} x2=${EW} y2=${v} />`))}
              ${n >= 3 ? html`<polygon class="pe__fill" points=${S.map((p) => p.join(',')).join(' ')} />` : null}
              ${sides.map((sd) => html`
                <line class=${'pe__side' + (sd.on ? ' is-on' : '') + (hi === sd.i ? ' is-hi' : '')}
                  x1=${sd.a[0]} y1=${sd.a[1]} x2=${sd.b[0]} y2=${sd.b[1]} />`)}
              ${sides.map((sd) => (sd.px > 34 ? html`
                <text class=${'pe__len' + (sd.on ? ' is-on' : '')} x=${sd.mx + sd.nx * 15} y=${sd.my + sd.ny * 15}
                  text-anchor="middle" dominant-baseline="central"
                  transform="rotate(${sd.angle} ${sd.mx + sd.nx * 15} ${sd.my + sd.ny * 15})">${fmtInt(sd.len)}</text>` : null))}
              ${!drawing && n >= 3 ? sides.map((sd) => (sd.px > 46 ? html`
                <g class="pe__add" onPointerDown=${(e) => { e.stopPropagation(); insertAfter(sd.i); }}>
                  <circle cx=${sd.mx} cy=${sd.my} r="16" fill="transparent" />
                  <circle class="pe__add-dot" cx=${sd.mx} cy=${sd.my} r="8" />
                  <path d="M${sd.mx - 4} ${sd.my}h8M${sd.mx} ${sd.my - 4}v8" />
                </g>` : null)) : null}
              ${S.map(([x, y], i) => html`
                <g class=${'pe__pt' + (sel === i ? ' is-sel' : '') + (drawing && i === 0 && n >= 3 ? ' is-close' : '')}
                  onPointerDown=${onVertexDown(i)}>
                  <circle cx=${x} cy=${y} r="20" fill="transparent" />
                  <circle class="pe__pt-dot" cx=${x} cy=${y} r="7.5" />
                  <text x=${x} y=${y - 15} text-anchor="middle">${i + 1}</text>
                </g>`)}
            </svg>

            <p class="pe__hint">${hint}<i>Клетка — ${fmtInt(gridStep)} мм</i></p>

            <div class="pe__tools">
              <div class="chips">
                <span class="chips__label">Шаг</span>
                ${[10, 50, 100].map((v) => html`
                  <button type="button" class=${'chip chip--num' + (snap === v ? ' is-on' : '')} onClick=${() => setSnap(v)}>${v} мм</button>`)}
              </div>
              ${drawing && n >= 3 ? html`
                <button type="button" class="btn btn--primary btn--sm" onClick=${finishDrawing}>${Icon.check()}<span>Замкнуть</span></button>` : null}
            </div>
          </div>

          <div class="pe__aside">
            ${sel !== null && pts[sel] ? html`
              <div class="pe__point">
                <span class="eyebrow">Угол ${sel + 1}</span>
                <div class="pe__point-row">
                  <${CommitNum} label="По горизонтали" suffix="мм" value=${pts[sel].x} onCommit=${setCoord('x')} />
                  <${CommitNum} label="По вертикали" suffix="мм" value=${pts[sel].y} onCommit=${setCoord('y')} />
                  <button type="button" class="icon-btn" aria-label="Удалить угол" title="Удалить угол" disabled=${n <= 3} onClick=${removeSel}>${Icon.trash()}</button>
                </div>
              </div>` : null}

            <div class="pe__list-head">
              <span class="eyebrow">Стороны</span>
              ${n >= 3 ? html`
                <button type="button" class="link-btn" onClick=${() => setPts(pts.map((p) => ({ ...p, e: !allOn })))}>${allOn ? 'Снять все торцы' : 'Все торцы'}</button>` : null}
            </div>
            ${n >= 3 ? html`<p class="pe__hint">Введённые замеры сохраняются. Чертёж подстраивается под них; площадь ориентировочная. Перемещение, добавление или удаление угла сбрасывает замеры изменённых сторон.</p>
              ${hasMeasures ? html`<button type="button" class="link-btn" onClick=${() => setPts((ps) => clearPolyMeasurements(ps, ps.map((_, i) => i)))}>Сбросить замеры</button>` : null}
              ${mismatch > 2 ? html`<p class="pe__hint" role="status">Размеры не совпадают с контуром (до ${fmtNum(mismatch, 1)} мм). Проверьте форму; замеры не изменены.</p>` : null}` : null}
            ${n < 3 ? html`<p class="pe__empty">Выберите заготовку сверху или нарисуйте фигуру по углам.</p>` : html`
              <div class="pe__list">
                ${sides.map((sd) => html`
                  <div class=${'pe__row' + (hi === sd.i ? ' is-hi' : '')} key=${sd.i}
                    onPointerEnter=${() => setHi(sd.i)} onPointerLeave=${() => setHi(null)}>
                    <span class="pe__row-no">${sd.i + 1}–${((sd.i + 1) % n) + 1}${sd.measured ? " ✓" : ""}</span>
                    <${CommitNum} suffix="мм" aria=${'Длина стороны ' + (sd.i + 1)} value=${sd.len} measure=${true}
                      onCommit=${(v) => setPts((ps) => measurePolySide(ps, sd.i, v))} />
                    <button type="button" class=${'chip' + (sd.on ? ' is-on' : '')} aria-pressed=${sd.on ? 'true' : 'false'}
                      onClick=${() => toggleEdge(sd.i)}>Торец</button>
                  </div>`)}
              </div>`}
          </div>
        </div>

        <footer class="modal__foot">
          <div class="pe__stats">
            <div><span>${hasMeasures ? "Площадь ≈" : "Площадь"}</span><b>${fmtArea(area)}<small>м²</small></b></div>
            <div><span>Периметр</span><b>${fmtNum(perimeter / 1000, 2)}<small>м</small></b></div>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn--ghost" onClick=${onClose}>Отмена</button>
            <button type="button" class="btn btn--primary" disabled=${n < 3 || !(area > 0)} onClick=${save}>Готово</button>
          </div>
        </footer>
      </div>
    </div>`;
}
