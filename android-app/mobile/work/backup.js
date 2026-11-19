import { check, openVisit, payments, types, paymentMethods, clientKinds } from './model.js';
const format = 'restoration.workshop.projects';
const text = v => typeof v === 'string';
const id = v => text(v) && /^[0-9a-f-]{36}$/i.test(v);
const stamp = v => Number.isSafeInteger(v) && v >= 0 && v < 8640000000000000;
const amount = v => v === null || (Number.isSafeInteger(v) && v >= 0);
const minutes = v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
const unique = values => new Set(values).size === values.length;
const requireValid = ok => check(ok,'Файл содержит повреждённую или несовместимую запись.');

function validateVisit(v) {
  requireValid(v && id(v.id) && stamp(v.startedAt) && (v.endedAt === null || (stamp(v.endedAt) && v.endedAt >= v.startedAt)));
  requireValid(typeof v.manual === 'boolean' && Array.isArray(v.events) && v.events.length && unique(v.events.map(e => e.id)));
  let last = v.startedAt, running = false, dry = false, ended = false;
  if (v.manual) requireValid(v.startedAt === v.endedAt && v.events.every(e => e.kind === 'correct'));
  else requireValid(v.events[0].kind === 'stage' && v.events[0].at === v.startedAt);
  for (const e of v.events) {
    requireValid(id(e.id) && stamp(e.at) && e.at >= last);
    last = e.at;
    requireValid(!ended || e.kind === 'correct');
    switch (e.kind) {
      case 'stage': requireValid(text(e.stage) && e.stage.trim()); running = true; break;
      case 'pause': case 'ready': requireValid(running); running = false; break;
      case 'dry-start': requireValid(!dry); dry = true; break;
      case 'dry-stop': requireValid(dry); dry = false; break;
      case 'end': requireValid(e.at === v.endedAt); ended = true; break;
      case 'correct': requireValid((v.manual || ended) && (minutes(e.minutes) || (!v.manual && e.minutes === null))); break;
      default: requireValid(false);
    }
  }
  if (!v.manual) requireValid(ended === (v.endedAt !== null));
}
function validateMaterials(rows) {
  requireValid(Array.isArray(rows) && rows.length<=100 && unique(rows.map(r=>r.id)));
  for(const r of rows) {
    requireValid(text(r.id) && r.id && text(r.name) && r.name.trim() && r.name.length<=150);
    requireValid(['мл','г','шт','л','кг'].includes(r.unit) &&
      Number.isFinite(r.quantity) && r.quantity>=0 && r.quantity<=1000000 &&
      Number.isFinite(r.unitPriceRub) && r.unitPriceRub>=0 && r.unitPriceRub<=10000000);
  }
}
function validateProject(p) {
  requireValid(p && p.version === 1 && id(p.id) && Number.isSafeInteger(p.rev) && p.rev >= 1);
  requireValid(stamp(p.createdAt) && stamp(p.updatedAt) && (p.doneAt === null || stamp(p.doneAt)));
  requireValid(['title','address','client','scheduled','note'].every(k => text(p[k])) && p.title.trim() && types.includes(p.type));
  requireValid(!p.scheduled || /^\d{4}-\d\d-\d\d$/.test(p.scheduled));
  requireValid(Array.isArray(p.stages) && p.stages.length && p.stages.every(s => text(s) && s.trim()) && unique(p.stages));
  requireValid(payments.includes(p.payment) && amount(p.received) && amount(p.expenses) && typeof p.estimated === 'boolean');
  if(p.workplace !== undefined) requireValid(['client','workshop'].includes(p.workplace));
  if(p.paymentMethod !== undefined) requireValid(paymentMethods.includes(p.paymentMethod));
  if(p.clientKind !== undefined) requireValid(clientKinds.includes(p.clientKind));
  if(p.expenseMode !== undefined) {
    requireValid(['items','manual'].includes(p.expenseMode) && amount(p.extraExpenses ?? null));
    requireValid(typeof p.materialsEdited==='boolean');
    validateMaterials(p.materials);
  }
  if(p.legacy?.materials!==undefined) validateMaterials(p.legacy.materials);

  requireValid(p.legacy === null || (p.legacy && text(p.legacy.id) && p.legacy.id && text(p.legacy.label) &&
    text(p.legacy.currency) && amount(p.legacy.price)));
  requireValid(Array.isArray(p.visits) && unique(p.visits.map(v => v.id)));
  p.visits.forEach(validateVisit);
  requireValid(p.visits.filter(v => v.endedAt === null).length <= 1 && !(p.doneAt !== null && openVisit(p)));
}
export function exportText(projects) {
  return JSON.stringify({format, version:1, exportedAt:new Date().toISOString(), projects}, null, 2);
}
export function parseBackup(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { throw Error('Выбранный файл не является копией мастерской.'); }
  check(data?.format === format && data.version === 1 && Array.isArray(data.projects),'Версия или формат резервной копии не поддерживается.');
  for (const p of data.projects) validateProject(p);
  requireValid(unique(data.projects.map(p => p.id)));
  return data.projects;
}
