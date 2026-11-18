// Read-only fixtures. No store, native bridge or Firebase dependencies.
export const stages = ['Подготовка', 'Шлифовка', 'Покрытие', 'Приёмка'];
export const projects = [
  { id:'oak-table', title:'Обеденный стол', wood:'Дуб', finish:'Масло', art:'table', status:'active', stage:1, day:0, time:'10:00', l:1800, w:850, qty:1, note:'Снять старое покрытие и сохранить естественный оттенок дуба.' },
  { id:'beech-stairs', title:'Буковая лестница', wood:'Бук', finish:'Лак', art:'steps', status:'planned', day:1, time:'09:30', l:1000, w:300, qty:16, note:'Восстановить проступи, затонировать и покрыть матовым лаком.' },
  { id:'ash-sills', title:'Пара подоконников', wood:'Ясень', finish:'Масло', art:'sill', status:'done', day:0, time:null, l:1500, w:400, qty:2, revenue:2200000, expenses:320000, note:'Обновлено покрытие двух подоконников. Работа принята.' },
];
export const inventory = [
  { id:'rotex', group:'Инструмент', title:'Festool ROTEX RO 150', kind:'Шлифмашина', mark:'sander', amount:'1 шт.', place:'Систейнер · шлифовка' },
  { id:'xtract', group:'Расходники', title:'3M Xtract 710W', kind:'Абразив · P120', mark:'disc', amount:'24 шт.', place:'Ящик абразивов', spec:'Ø 150 мм' },
  { id:'rubio', group:'Расходники', title:'Rubio Monocoat', kind:'Масло · Oil Plus 2C', mark:'can', amount:'450 мл', place:'Шкаф покрытий' },
];
export const projectStatus = {active:'В работе', planned:'Запланирован', done:'Завершён'};
export const goal = 5;
export function summary(items) {
  return items.filter(p => p.status === 'done').reduce((sum, p) => ({
    count:sum.count + 1, revenue:sum.revenue + p.revenue, expenses:sum.expenses + p.expenses,
  }), {count:0, revenue:0, expenses:0});
}
export function visitDate(offset, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return date;
}
