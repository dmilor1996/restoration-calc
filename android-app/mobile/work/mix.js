import { itemGeometry } from '../js/calc.js';
export const number = v => Number(String(v ?? '').trim().replace(',','.'));
const positive = v => Number.isFinite(number(v)) && number(v)>0;
export function geometryRows(draft) {
  const mode=draft?.mode==='stairs'?'stairs':'surfaces';
  return (draft?.[mode]||[]).map((item,i)=>({name:item.name || (mode==='stairs'?'Ступень ':'Изделие ')+(i+1), item:{...item}})).filter(r=>itemGeometry(r.item).total>0);
}
export function rowArea(row) {
  if(row.item) return itemGeometry(row.item).total;
  const q=number(row.qty), l=number(row.length), w=number(row.width), t=number(row.thickness);
  if(!Number.isInteger(q)||q<=0||!positive(l)||!positive(w)||!Number.isFinite(t)||t<0) return 0;
  return q*(l*w*(row.bottom?2:1)+(row.edges?2*(l+w)*t:0))/1e6;
}
export function validateRecipe(r) {
  return !!(r.name?.trim() && ['g','ml'].includes(r.basis) && ['g','ml'].includes(r.rateUnit) &&
    ['area','manual'].includes(r.mode) && (r.mode==='manual'||positive(r.rate)) &&
    Array.isArray(r.parts)&&r.parts.length>=1&&r.parts.length<=3&&r.parts.every(p=>p.name?.trim()&&positive(p.ratio)&&(!String(p.density??'').trim()||positive(p.density))) &&
    (r.mode==='manual'||r.rateUnit===r.basis||r.parts.every(p=>positive(p.density))));
}
// Reduce the decimal ratio to the smallest whole-unit batch (e.g. 1.5:0.5 -> 3:1).
function wholeBatch(parts) {
  const decimals=parts.map(p=>{
    const [mantissa,exp='0']=String(number(p.ratio)).split('e');
    const [whole,fraction='']=mantissa.split('.');
    return {digits:BigInt(whole+fraction),scale:fraction.length-Number(exp)};
  });
  const scale=Math.max(...decimals.map(p=>p.scale));
  const ints=decimals.map(p=>p.digits*10n**BigInt(scale-p.scale));
  const gcd=(a,b)=>b===0n?a:gcd(b,a%b);
  const divisor=ints.reduce(gcd);
  const batch=ints.map(n=>Number(n/divisor));
  if(!batch.every(Number.isSafeInteger)||!Number.isSafeInteger(batch.reduce((s,n)=>s+n,0))) throw Error('Пропорция слишком точная для целых компонентов. Выберите расчёт без округления.');
  return batch;
}
export function mix(r,{area=0,layers=1,reserve=0,amount=0,amountUnit=r.basis,anchor='total',rounding='none'}={}) {
  if(!validateRecipe(r)) throw Error('Проверьте рецепт.');
  const parts=r.parts, sum=parts.reduce((s,p)=>s+number(p.ratio),0);
  const factors=parts.map(p=>number(p.ratio)/sum);
  const convert=(n,from,to,p)=>from===to?n:positive(p.density)?n*(from==='ml'?number(p.density):1/number(p.density)):null;
  let total;
  if(r.mode==='area'){
    if(!positive(area)||!Number.isInteger(number(layers))||number(layers)<1||!Number.isFinite(number(reserve))||number(reserve)<0) throw Error('Укажите площадь, слои и запас.');
    const target=number(area)*number(r.rate)*number(layers)*(1+number(reserve)/100);
    const factor= factors.reduce((s,f,i)=>s+convert(f,r.basis,r.rateUnit,parts[i]),0);
    total=target/factor;
  } else {
    if(!positive(amount)||!['g','ml'].includes(amountUnit)) throw Error('Укажите количество.');
    if(anchor==='total'){
      if(amountUnit!==r.basis&&!parts.every(p=>positive(p.density))) throw Error('Для пересчёта нужны плотности всех компонентов.');
      total=number(amount)/factors.reduce((s,f,i)=>s+convert(f,r.basis,amountUnit,parts[i]),0);
    }else{
      const idx=Number(anchor);
      if(!parts[idx]) throw Error('Выберите компонент.');
      const value=convert(number(amount),amountUnit,r.basis,parts[idx]);
      if(value===null) throw Error('Укажите плотность компонента.');
      total=value/factors[idx];
    }
  }
  if(!positive(total)) throw Error('Проверьте исходные данные.');
  const exactTotal=total;
  let quantities=parts.map((p,i)=>total*factors[i]);
  if(rounding==='up'||rounding==='nearest'){
    const batch=wholeBatch(parts);
    const step=batch.reduce((s,n)=>s+n,0);
    const raw=total/step;
    // Avoid an additional batch due only to floating-point noise.
    const stable=Math.abs(raw-Math.round(raw))<=Math.max(1,raw)*Number.EPSILON*8?Math.round(raw):raw;
    const count=Math.max(1,rounding==='up'?Math.ceil(stable):Math.round(stable));
    quantities=batch.map(n=>n*count);
    total=quantities.reduce((s,n)=>s+n,0);
    if(!quantities.every(Number.isSafeInteger)||!Number.isSafeInteger(total)) throw Error('Слишком большой замес для округления.');
  }
  const rows=parts.map((p,i)=>({name:p.name,g:convert(quantities[i],r.basis,'g',p),ml:convert(quantities[i],r.basis,'ml',p)}));
  return {rows,g:rows.every(p=>p.g!==null)?rows.reduce((s,p)=>s+p.g,0):null,ml:rows.every(p=>p.ml!==null)?rows.reduce((s,p)=>s+p.ml,0):null,exactTotal,roundedTotal:total};
}
const KEY='workshop.recipes.v1';
export function loadRecipes(){try {const list=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(list)?list.filter(validateRecipe):[];}catch{return [];}}
export function saveRecipes(list){if(!list.every(validateRecipe))throw Error('Некорректный рецепт.');localStorage.setItem(KEY,JSON.stringify(list));}
