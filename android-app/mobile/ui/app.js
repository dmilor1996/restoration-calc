import { html, render, useEffect, useRef, useState } from '../js/vendor/preact-htm.js';
import { Dock, ThemePicker, sections } from './components.js';
import { Icon } from './icons.js';
import { inventory } from './demo.js';
import { Workshop, StockItem } from './screens.js';
import { Today, Projects, Progress } from './overview.js';
import { Project } from './visits.js';
import { Backup, FinanceForm, ProjectForm, VisitForm } from './forms.js';
import { importMissing, listProjects, onExternalChange, saveCommand } from '../work/store.js';

function screen(hash,props) {
  const [section,id,action,visitId] = hash.slice(1).split('/');
  const {projects} = props;
  if (section === 'projects') {
    if (id === 'new') return ['projects','Новый объект',html`<${ProjectForm} ...${props}/>`];
    if (id === 'backup') return ['projects','Резервная копия',html`<${Backup} ...${props}/>`];
    const p=projects.find(x=>x.id===id);
    if (!p && id) return ['projects','Объект не найден',html`<h1>Объект не найден</h1><a class="primary" href="#projects">К объектам</a>`];
    if (p) {
      const v=p.visits.find(s=>s.id===visitId && s.endedAt !== null);
      if (action === 'edit') return [section,p.title,html`<${ProjectForm} p=${p} ...${props}/>`];
      if (action === 'manual' || (action === 'time' && v)) return [section,p.title,html`<${VisitForm} p=${p} v=${v} ...${props}/>`];
      if (action === 'finance' || action === 'finish') return [section,p.title,html`<${FinanceForm} p=${p} finish=${action==='finish'} ...${props}/>`];
      return [section,p.title,html`<${Project} p=${p} ...${props}/>`];
    }
  }
  const item=section==='shop' && inventory.find(x=>x.id===id);
  if (item) return [section,item.title,html`<${StockItem} item=${item}/>`];
  const pages={today:Today,projects:Projects,shop:Workshop,progress:Progress};
  const key=Object.hasOwn(pages,section) ? section : 'today';
  return [key,sections.find(s=>s[0]===key)[1],html`<${pages[key]} ...${props}/>`];
}
function App() {
  const [hash,setHash]=useState(location.hash);
  const [projects,setProjects]=useState(null), [message,notify]=useState('');
  const [theme,setTheme]=useState(document.documentElement.dataset.theme || 'auto');
  const lock=useRef(false), readNumber=useRef(0);
  const reportError=e=>notify(e?.message || 'Не удалось сохранить данные.');
  async function refresh() {
    const number=++readNumber.current;
    const records=await listProjects();
    if (number===readNumber.current) setProjects(records);
  }
  useEffect(()=>{
    const update=()=>{setHash(location.hash);notify('');window.scrollTo(0,0);document.querySelector('.themes').open=false;};
    const reload=()=>{refresh().catch(reportError);};
    reload(); const unsubscribe=onExternalChange(reload);
    window.addEventListener('pageshow',reload); window.addEventListener('hashchange',update);
    setHash(location.hash);
    return ()=>{unsubscribe();window.removeEventListener('pageshow',reload);window.removeEventListener('hashchange',update);};
  },[]);
  async function run(p,command,next) {
    if (lock.current) return;
    lock.current=true; notify('');
    try {
      await saveCommand(p.id,p.rev,command); await refresh();
      if (next) location.hash=next;
      else if (['start','end','reopen'].includes(command.kind)) window.scrollTo(0,0);
    } catch(error) {reportError(error); await refresh().catch(reportError);}
    finally {lock.current=false;}
  }
  async function restore(raw) { const result=await importMissing(raw); await refresh(); return result; }
  const [section,title,view]=projects === null ? ['today','Моя мастерская',html`<p>Открываем мастерскую…</p>`] :
    screen(hash,{projects,run,restore,notify,reportError});
  useEffect(()=>{document.title=title+' · Моя мастерская';},[title]);
  const setAppearance=value=>{document.documentElement.dataset.theme=value;try {localStorage.setItem('workshop.theme.v1',value);} catch {}setTheme(value);};
  return html`<div class="shell"><header class="mast"><a class="wordmark" href="#today"><span><${Icon} name="logo" size=${23}/></span>Моя мастерская</a>
    <div class="mast-tools">${section==='shop' && html`<span class="demo">Демоданные</span>`}<${ThemePicker} theme=${theme} onChange=${setAppearance}/></div></header>
    ${message && html`<div class="feedback" role="alert">${message}<button aria-label="Закрыть сообщение" onClick=${()=>notify('')}>×</button></div>`}
    <main key=${hash}>${view}</main><${Dock} active=${section}/></div>`;
}
render(html`<${App}/>`,document.getElementById('workshop'));
