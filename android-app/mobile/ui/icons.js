import { html } from '../js/vendor/preact-htm.js';

const paths = {
  today:'M4 9h16v11H4z M7 4v4 M17 4v4 M4 9V6h16v3 M8 13h3v3H8z',
  projects:'M3 7V5h7l2 3h9l-2 11H3z M4 10h15',
  shop:'M3 9h18v11H3z M8 9V6h8v3 M3 13h18 M10 13v2h4v-2',
  progress:'M4 19h16 M5 15l5-5 4 3 6-8 M15 5h5v5',
  calc:'M5 3h14v18H5z M8 7h8 M8 11h1 M14 11h1 M8 15h1 M14 15h1',
  theme:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 3v18 M15 6v12 M17.5 9v6',
  arrow:'M5 12h13 M13 6l6 6-6 6', next:'M9 5l7 7-7 7', back:'M15 5l-7 7 7 7',
  logo:'M3 17l9-13 9 13 M7 17l5-7 5 7 M10 20h8',
  medal:'M8 3h8l-1 6H9z M12 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 13v4',
  sander:'M4 17h16l1 3H3z M5 17l1-6 3-2h5l3 3v5 M8 10V7h5v2 M17 13l4-2',
  disc:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M8 7h.2 M16 7h.2 M8 17h.2 M16 17h.2',
  can:'M5 6q7-4 14 0v13q-7 4-14 0z M5 6q7 4 14 0 M5 11q7 3 14 0 M5 16q7 3 14 0',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
};
export function Icon({name, size=22}) {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d=${paths[name]}/></svg>`;
}
