// Общие элементы интерфейса: иконки, поля ввода, переключатели.

import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { num, fmtInt } from './calc.js';

const svg = (body, size = 20) => html`
  <svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const Icon = {
  rect: () => svg(html`<rect x="3" y="6.5" width="18" height="11" rx="1.5" />`),
  circle: () => svg(html`<circle cx="12" cy="12" r="8.5" />`),
  trap: () => svg(html`<path d="M3.5 9.5 20.5 5.5v13l-17-4z" />`),
  poly: () => svg(html`<path d="M4 5h16v7h-9v7H4z" />`),
  custom: () => svg(html`<rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3 3.4" />`),
  stairs: () => svg(html`<path d="M3 19h5v-5h5V9h5V4h3" />`),
  plus: () => svg(html`<path d="M12 5v14M5 12h14" />`, 18),
  minus: () => svg(html`<path d="M5 12h14" />`, 18),
  x: () => svg(html`<path d="M6 6l12 12M18 6 6 18" />`, 18),
  copy: () => svg(html`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />`, 18),
  check: () => svg(html`<path d="m5 12.5 4.5 4.5L19 7.5" />`, 18),
  share: () => svg(html`<path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13" />`, 18),
  dup: () => svg(html`<rect x="4.5" y="4.5" width="11" height="11" rx="2.5" /><path d="M9 19.5h8a2.5 2.5 0 0 0 2.5-2.5V9" />`, 18),
  moon: () => svg(html`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />`, 18),
  sun: () => svg(html`<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />`, 18),
  auto: () => svg(html`<circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" />`, 18),
  reset: () => svg(html`<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" />`, 16),
  down: () => svg(html`<path d="M12 5v14m0 0-5-5m5 5 5-5" />`, 18),
  cloud: () => svg(html`<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.25 18.5z" />`, 18),
  pen: () => svg(html`<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m14.5 7.5 3 3" />`, 18),
  phone: () => svg(html`<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />`, 18),
  pin: () => svg(html`<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />`, 18),
  chat: () => svg(html`<path d="M4 19.5 5.3 15A8 8 0 1 1 9 18.7z" />`, 18),
  save: () => svg(html`<path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" />`, 18),
  search: () => svg(html`<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />`, 18),
  trash: () => svg(html`<path d="M4.5 7h15M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7" />`, 18),
};

export function cleanNum(v, decimal) {
  let s = String(v).replace(decimal ? /[^\d.,]/g : /\D/g, '');
  if (decimal) {
    const i = s.search(/[.,]/);
    if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '');
  }
  return s;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* запасной способ ниже */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* noop */ }
  ta.remove();
  return ok;
}

/** Числовое поле. group — показывать разряды («14 000»), когда поле не в фокусе. */
export function Num({ value, onChange, onBlur, label, suffix, placeholder, decimal, group, cls, aria }) {
  const [focus, setFocus] = useState(false);
  const raw = value === null || value === undefined ? '' : String(value);
  const shown = group && !focus && raw !== '' ? fmtInt(raw) : raw;
  const onInput = (e) => {
    const v = cleanNum(e.target.value, decimal);
    if (v !== e.target.value) e.target.value = v;
    onChange(v);
  };
  return html`
    <label class=${'field ' + (cls || '')}>
      ${label ? html`<span class="field__label">${label}</span>` : null}
      <span class="field__box">
        <input type="text" inputmode=${decimal ? 'decimal' : 'numeric'} autocomplete="off" enterkeyhint="done"
          value=${shown} placeholder=${placeholder ?? '0'} aria-label=${aria || label}
          onInput=${onInput}
          onFocus=${(e) => { setFocus(true); const el = e.target; requestAnimationFrame(() => el.select()); }}
          onBlur=${() => { setFocus(false); onBlur?.(); }} />
        ${suffix ? html`<span class="field__suffix">${suffix}</span>` : null}
      </span>
    </label>`;
}

/** Текстовое поле в том же оформлении. */
export function Text({ value, onChange, label, placeholder, type, inputmode, cls, autocomplete }) {
  return html`
    <label class=${'field ' + (cls || '')}>
      ${label ? html`<span class="field__label">${label}</span>` : null}
      <span class="field__box">
        <input type=${type || 'text'} inputmode=${inputmode} autocomplete=${autocomplete || 'off'} value=${value ?? ''}
          placeholder=${placeholder || ''} aria-label=${label} onInput=${(e) => onChange(e.target.value)} />
      </span>
    </label>`;
}

export function Stepper({ value, onChange, label }) {
  const n = num(value);
  return html`
    <div class="field field--stepper">
      <span class="field__label">${label}</span>
      <span class="stepper">
        <button type="button" class="stepper__btn" aria-label="Меньше" onClick=${() => onChange(Math.max(1, n - 1))}>${Icon.minus()}</button>
        <input type="text" inputmode="numeric" autocomplete="off" value=${value} aria-label=${label}
          onInput=${(e) => { const v = cleanNum(e.target.value); if (v !== e.target.value) e.target.value = v; onChange(v); }}
          onFocus=${(e) => { const el = e.target; requestAnimationFrame(() => el.select()); }} />
        <button type="button" class="stepper__btn" aria-label="Больше" onClick=${() => onChange(n + 1)}>${Icon.plus()}</button>
      </span>
    </div>`;
}

export function Switch({ on, onChange, label }) {
  return html`
    <button type="button" role="switch" aria-checked=${on ? 'true' : 'false'} class=${'switch' + (on ? ' is-on' : '')}
      aria-label=${label} onClick=${() => onChange(!on)}><span class="switch__dot"></span></button>`;
}

export function AutoText({ value, onInput, placeholder, innerRef, cls, rows }) {
  const own = useRef(null);
  const ref = innerRef || own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return html`<textarea ref=${ref} class=${'textarea ' + (cls || '')} value=${value} placeholder=${placeholder}
    onInput=${(e) => onInput(e.target.value)} rows=${rows || 3}></textarea>`;
}
