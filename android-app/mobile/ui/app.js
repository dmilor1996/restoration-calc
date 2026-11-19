import { html, render, useEffect, useState } from '../js/vendor/preact-htm.js';
import { Dock, ThemePicker, sections } from './components.js';
import { Icon } from './icons.js';
import { projects, inventory } from './demo.js';
import { Today, Projects, Project, Workshop, StockItem, Progress } from './screens.js';

function screen(hash) {
  const [section, id] = hash.slice(1).split('/');
  const project = section === 'projects' && projects.find(p => p.id === id);
  const item = section === 'shop' && inventory.find(t => t.id === id);
  if (project) return ['projects', project.title, html`<${Project} project=${project}/>`];
  if (item) return ['shop', item.title, html`<${StockItem} item=${item}/>`];
  const pages = {projects:Projects, shop:Workshop, progress:Progress};
  const key = Object.hasOwn(pages, section) ? section : 'today';
  return [key, sections.find(([s]) => s === key)[1], html`<${pages[key] || Today}/>`];
}
function App() {
  const [hash, setHash] = useState(location.hash);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'auto');
  const [section, title, view] = screen(hash);
  useEffect(() => {
    const update = () => {
      setHash(location.hash);
      window.scrollTo(0,0);
      document.querySelector('.themes').open = false;
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { document.title = title + ' · Моя мастерская'; }, [title]);
  const chooseTheme = value => {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('workshop.theme.v1', value); } catch {}
    setTheme(value);
  };
  return html`<div class="shell"><header class="mast">
    <a class="wordmark" href="#today"><span><${Icon} name="logo" size=${23}/></span>Моя мастерская</a>
    <div class="mast-tools"><span class="demo">Демоданные</span><${ThemePicker} theme=${theme} onChange=${chooseTheme}/></div>
    </header><main key=${hash}>${view}</main><${Dock} active=${section}/></div>`;
}
render(html`<${App}/>`, document.getElementById('workshop'));
