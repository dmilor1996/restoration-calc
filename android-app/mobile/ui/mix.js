import {html,useState} from '../js/vendor/preact-htm.js';
import {loadOrders} from '../js/store.js';
import {geometryRows,rowArea,mix,validateRecipe,loadRecipes,saveRecipes,number} from '../work/mix.js';
import {uuid} from '../work/model.js';
const units=[['g','г'],['ml','мл']];
const fmt=n=>n===null?'—':n.toLocaleString('ru-RU',{maximumFractionDigits:2});
const field=(label,value,change,decimal=false)=>html`<label class="field-label">${label}<input value=${value} inputmode=${decimal?'decimal':'text'} onInput=${e=>change(e.target.value)}/></label>`;
const select=(label,value,change,options)=>html`<label class="field-label">${label}<select aria-label=${label} value=${value} onChange=${e=>change(e.target.value)}>${options.map(([v,l])=>html`<option value=${v}>${l}</option>`)}</select></label>`;
const blankPart=i=>({name:['Основа','Отвердитель','Разбавитель'][i],ratio:'1',density:''});
const blankRecipe=()=>({id:uuid(),name:'',mode:'area',basis:'ml',rateUnit:'ml',rate:'',parts:[blankPart(0),blankPart(1)]});
const blankRow=()=>({id:uuid(),name:'',length:'',width:'',thickness:'0',qty:'1',bottom:false,edges:false});
export function RecipeList(){
 const [recipes,setRecipes]=useState(loadRecipes);
 const [draft,setDraft]=useState(null),[error,setError]=useState('');
 const patch=(key,value)=>setDraft(d=>({...d,[key]:value}));
 const part=(i,key,value)=>patch('parts',draft.parts.map((p,j)=>i===j?{...p,[key]:value}:p));
 function save(){try{if(!validateRecipe(draft))throw Error('Укажите название, положительные пропорции и расход. Если единицы расхода и пропорций различаются, нужны плотности всех компонентов.');const next=[...recipes.filter(r=>r.id!==draft.id),draft];saveRecipes(next);setRecipes(next);setDraft(null);setError('');}catch(e){setError(e.message);}}
 return html`<a class="back" href="#shop">← Мастерская</a><h1>Материалы для замеса</h1><p class="hint">Рецепты сохраняются на устройстве. Расход задаётся для готовой смеси на один слой. Плотность каждого компонента нужна для перевода граммов в миллилитры и обратно.</p>
 <a class="secondary full" href="#calculator/mix">Калькулятор замеса</a>
 ${!draft?html`<div class="rows">${recipes.map(r=>html`<button class="secondary full" key=${r.id} onClick=${()=>{setDraft(r);setError('');}}>${r.name} · ${r.parts.map(p=>p.ratio).join(':')} · ${r.mode==='area'?r.rate+' '+(r.rateUnit==='g'?'г':'мл')+'/м²':'по количеству'}</button>`)}</div><button class="primary" onClick=${()=>setDraft(blankRecipe())}>Добавить материал</button>`:html`<div class="editor">
 ${field('Название материала',draft.name,v=>patch('name',v))}
 ${select('Способ расчёта',draft.mode,v=>patch('mode',v),[['area','По площади'],['manual','По количеству смеси или компонента']])}
 ${select('Пропорции по',draft.basis,v=>patch('basis',v),[['g','Массе (г)'],['ml','Объёму (мл)']])}
 ${draft.mode==='area'&&html`<div class="pair">${field('Расход на м², один слой',draft.rate,v=>patch('rate',v),true)}${select('Единица расхода',draft.rateUnit,v=>patch('rateUnit',v),units)}</div>`}
 ${select('Число компонентов',String(draft.parts.length),v=>patch('parts',Array.from({length:Number(v)},(_,i)=>draft.parts[i]||blankPart(i))),[['1','1'],['2','2'],['3','3']])}
 ${draft.parts.map((p,i)=>html`<div class="panel" key=${i}><strong>Компонент ${i+1}</strong>${field('Название компонента '+(i+1),p.name,v=>part(i,'name',v))}<div class="pair">${field('Частей '+(i+1),p.ratio,v=>part(i,'ratio',v),true)}${field('Плотность '+(i+1)+', г/мл (необязательно)',p.density,v=>part(i,'density',v),true)}</div></div>`)}
 ${error&&html`<p role="alert">${error}</p>`}<button class="primary" onClick=${save}>Сохранить материал</button><button class="secondary full" onClick=${()=>{setDraft(null);setError('');}}>Отмена</button>
 ${recipes.some(r=>r.id===draft.id)&&html`<button class="secondary full" onClick=${()=>{if(!confirm('Удалить рецепт?'))return;try{const next=recipes.filter(r=>r.id!==draft.id);saveRecipes(next);setRecipes(next);setDraft(null);}catch(e){setError(e.message);}}}>Удалить рецепт</button>`}</div>`}`;
}
export function MixCalc({projects=[],projectId}){
 const [recipes]=useState(loadRecipes),[recipeId,setRecipeId]=useState(recipes[0]?.id||'');
 const [rows,setRows]=useState([blankRow()]),[source,setSource]=useState(projectId && projects.some(p=>p.id===projectId && (p.legacy?.area>0||p.legacy?.geometry?.length||p.legacy?.id))?'p:'+projectId:'manual'),[excluded,setExcluded]=useState([]);
 const [area,setArea]=useState(''),[layers,setLayers]=useState('1'),[reserve,setReserve]=useState('0');
 const [amount,setAmount]=useState(''),[unit,setUnit]=useState(recipes[0]?.basis||'g'),[anchor,setAnchor]=useState('total');
 const [rounding,setRounding]=useState(()=>{try{const saved=localStorage.getItem('workshop.mix.rounding.v1');return ['none','nearest','up'].includes(saved)?saved:'up';}catch{return 'up';}});
 function changeRounding(value){setRounding(value);try{localStorage.setItem('workshop.mix.rounding.v1',value);}catch{}}
 const recipe=recipes.find(r=>r.id===recipeId);
 const orders=loadOrders().filter(o=>o&&!o.deleted&&o.id);
 const sources=[...projects.filter(p=>p.legacy?.area>0||p.legacy?.geometry?.length||orders.some(o=>o.id===p.legacy?.id)).map(p=>({id:'p:'+p.id,name:p.title,rows:p.legacy?.geometry?.length?p.legacy.geometry:geometryRows(orders.find(o=>o.id===p.legacy?.id)?.draft),area:p.legacy?.area})),...orders.map(o=>({id:'o:'+o.id,name:o.draft?.client?.name||o.draft?.client?.address||'Расчёт '+o.id,rows:geometryRows(o.draft)}))];
 const selected=sources.find(s=>s.id===source);
 const totalArea=source==='manual'?rows.reduce((s,r)=>s+rowArea(r),0):source==='area'?number(area):selected?.rows.length?selected.rows.reduce((s,r,i)=>s+(excluded.includes(i)?0:rowArea(r)),0):selected?.area||0;
 const patch=(i,k,v)=>setRows(rs=>rs.map((r,j)=>i===j?{...r,[k]:v}:r));
 let result=null,error='';if(recipe)try{result=mix(recipe,{area:totalArea,layers,reserve,amount,amountUnit:unit,anchor,rounding});}catch(e){error=e.message;}
 return html`<a class="back" href=${projectId?'#projects/'+projectId:'#calculator'}>← Назад</a><h1>Калькулятор замеса</h1><p class="hint">Расчёт не списывает материалы и не изменяет заказ.</p>
 <a class="secondary full" href="#shop/recipes">Справочник материалов</a>
 ${!recipes.length?html`<p>Добавьте первый материал и его рецепт в справочник.</p>`:html`<div class="editor">
 ${select('Материал',recipeId,v=>{setRecipeId(v);setAnchor('total');setUnit(recipes.find(r=>r.id===v).basis);},recipes.map(r=>[r.id,r.name]))}
 ${recipe&&html`<p class="hint">Пропорции ${recipe.parts.map(p=>p.ratio).join(':')} по ${recipe.basis==='g'?'массе':'объёму'}</p>`}
 ${recipe?.mode==='area'?html`
 ${select('Источник площади',source,v=>{setSource(v);setExcluded([]);},[['manual','Ввести размеры'],['area','Известная площадь'],...sources.map(s=>[s.id,(s.id.startsWith('p:')?'Заказ: ':'Расчёт: ')+s.name])])}
 ${source==='manual'&&html`<div>${rows.map((r,i)=>html`<div class="panel" key=${r.id}><strong>Изделие ${i+1}</strong>${field('Название изделия '+(i+1),r.name,v=>patch(i,'name',v))}<div class="pair">${field('Длина, мм',r.length,v=>patch(i,'length',v),true)}${field('Ширина, мм',r.width,v=>patch(i,'width',v),true)}</div><div class="pair">${field('Количество',r.qty,v=>patch(i,'qty',v),true)}${field('Толщина, мм',r.thickness,v=>patch(i,'thickness',v),true)}</div><label><input type="checkbox" checked=${r.bottom} onChange=${e=>patch(i,'bottom',e.target.checked)}/> Обе стороны</label> <label><input type="checkbox" checked=${r.edges} onChange=${e=>patch(i,'edges',e.target.checked)}/> Все торцы</label><p>${fmt(rowArea(r))} м²</p>${rows.length>1&&html`<button class="secondary" onClick=${()=>setRows(rs=>rs.filter((_,j)=>j!==i))}>Удалить изделие</button>`}</div>`)}<button class="secondary full" onClick=${()=>setRows(rs=>[...rs,blankRow()])}>Добавить изделие</button></div>`}
 ${source==='area'&&field('Площадь, м²',area,setArea,true)}
 ${selected?.rows.length?html`<div class="panel">${selected.rows.map((r,i)=>html`<p key=${i}><label><input type="checkbox" checked=${!excluded.includes(i)} onChange=${e=>setExcluded(xs=>e.target.checked?xs.filter(x=>x!==i):[...xs,i])}/> ${r.name} · ${fmt(rowArea(r))} м²</label></p>`)}</div>`:selected&&html`<p class="hint">Доступна только сохранённая суммарная площадь.</p>`}
 <p><strong>Площадь: ${fmt(totalArea)} м²</strong></p><div class="pair">${field('Слоёв в замесе',layers,setLayers,true)}${field('Запас, %',reserve,setReserve,true)}</div>`:html`
 ${select('Что известно',anchor,setAnchor,[['total','Количество всей смеси'],...(recipe?.parts||[]).map((p,i)=>[String(i),p.name])])}
 <div class="pair">${field('Количество',amount,setAmount,true)}${select('Единица',unit,setUnit,units)}</div>`}
 ${select('Округление компонентов',rounding,changeRounding,[['none','Без округления'],['nearest','До ближайших целых'],['up','До целых вверх']])}
 <p class="hint">Округление до целых ${recipe?.basis==='g'?'граммов':'миллилитров'} сохраняет пропорции компонентов. При пересчёте в другую единицу могут остаться дроби.</p>
 ${result?html`<div class="panel" aria-live="polite"><h2>Готовый замес</h2>
 ${rounding!=='none'&&Math.abs(result.roundedTotal-result.exactTotal)>1e-8&&html`<p class="hint">До округления: ${fmt(result.exactTotal)} ${recipe.basis==='g'?'г':'мл'} · ${result.roundedTotal>=result.exactTotal?'+':'−'}${fmt(Math.abs(result.roundedTotal-result.exactTotal))} ${recipe.basis==='g'?'г':'мл'}. ${result.roundedTotal<result.exactTotal?'Меньше расчётного количества.':result.roundedTotal>result.exactTotal*1.2?'Значительный запас из-за пропорций.':''} ${recipe.mode==='manual'&&anchor!=='total'?'Введённое количество компонента также изменено.':''}</p>`}<p><strong>Всего: ${fmt(result.g)} г / ${fmt(result.ml)} мл</strong></p>${result.rows.map((r,i)=>html`<p key=${i}>${r.name}: <strong>${fmt(r.g)} г / ${fmt(r.ml)} мл</strong></p>`)}${(result.g===null||result.ml===null)&&html`<p class="hint">— нет плотности для пересчёта.</p>`}</div>`:html`<p class="hint" aria-live="polite">${error}</p>`}</div>`}`;
}
