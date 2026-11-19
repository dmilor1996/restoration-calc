// Only the calculator owns its order records. Keep a dated price snapshot in the link.
import { loadOrders, loadSettings } from '../js/store.js';
export function availableOrders() {
  const settings = loadSettings();
  return loadOrders().filter(o => o && typeof o.id === 'string' && o.id && !o.deleted).map(o => {
    const draft = o.draft || {};
    const price = o.totals?.[draft.coat || 'oil'];
    return {id:o.id, label:draft.client?.name || draft.client?.address || 'Расчёт ' + o.id,
      price:Number.isFinite(price) && price >= 0 ? Math.round(price*100) : null,
      currency:settings.currency || '₽'};
  });
}
