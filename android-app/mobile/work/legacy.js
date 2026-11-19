// The calculator owns its saved orders. A link keeps a cost/area snapshot for offline order work.
import { loadOrders, loadSettings } from '../js/store.js';
import { calcTotals, materialMlPerM2, usedMaterials } from '../js/calc.js';

export function availableOrders() {
  const settings=loadSettings();
  return loadOrders().filter(o=>o && typeof o.id==='string' && o.id && !o.deleted).map(o=>{
    const draft=o.draft || {};
    const finish=draft.coat==='lacquer'?'lacquer':'oil';
    let area=0, materials=[];
    try {
      const calc=calcTotals(draft,settings);
      area=calc.area.total;
      materials=area>0 ? usedMaterials(draft,settings.cost,finish).filter(m=>m && m.volume>0).map(m=>({
        id:'calc-'+m.id, name:m.name || 'Материал', kind:m.kind, unit:'мл',
        quantity:Math.round(area*materialMlPerM2(m)*100)/100,
        unitPriceRub:Number(m.price)/(Number(m.volume)*1000),
        source:'estimate'
      })) : [];
    } catch { /* A legacy calculation can be incomplete. Linking must remain available. */ }
    const price=o.totals?.[finish];
    const label=draft.client?.name || draft.client?.address || 'Расчёт '+o.id;
    return {id:o.id,label,price:Number.isFinite(price) && price>=0?Math.round(price*100):null,
      area:Number.isFinite(area)?Math.round(area*1000)/1000:0,materials,
      currency:settings.currency || '₽'};
  });
}
