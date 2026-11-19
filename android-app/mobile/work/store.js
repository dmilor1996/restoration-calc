import { change, check, newProject, openVisit } from './model.js';
import { parseBackup } from './backup.js';

let connection;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('workshop-projects-v1') : null;
export function onExternalChange(callback) {
  channel?.addEventListener('message',callback);
  return () => channel?.removeEventListener('message',callback);
}
function db() {
  if (!connection) connection = new Promise((resolve,reject) => {
    const request = indexedDB.open('restoration-workshop',1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('projects',{keyPath:'id'});
      store.createIndex('oneOpenVisit','openSlot',{unique:true});
      store.createIndex('oneLinkedOrder','legacy.id',{unique:true});
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = undefined; };
      resolve(database);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
  return connection;
}
export async function listProjects() {
  const database = await db();
  return new Promise((resolve,reject) => {
    const request = database.transaction('projects').objectStore('projects').getAll();
    request.onsuccess = () => resolve(request.result.sort((a,b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
// Read revision, apply user intent, enforce cross-project uniqueness and commit together.
async function write(query, update) {
  const database = await db();
  return new Promise((resolve,reject) => {
    const tx = database.transaction('projects','readwrite',{durability:'strict'});
    const store = tx.objectStore('projects');
    const request = query(store);
    let error, result;
    request.onsuccess = () => {
      try { result = update(store,request.result); }
      catch (e) { error = e; tx.abort(); }
    };
    tx.oncomplete = () => { channel?.postMessage('updated'); resolve(result); };
    tx.onabort = () => reject(error || (tx.error?.name === 'ConstraintError'
      ? Error('Уже открыт другой выезд или этот расчёт привязан к другому объекту.') : tx.error || Error('Запись не сохранена.')));
  });
}
function indexActive(p) {
  delete p.openSlot;
  if (openVisit(p)) p.openSlot = 1;
  return p;
}
export function saveCommand(id, expectedRev, command, now = Date.now()) {
  return write(store => store.get(id), (store,existing) => {
    check((existing?.rev ?? 0) === expectedRev,'Запись уже изменилась. Откройте её заново и проверьте данные.');
    check(existing || command.kind === 'details','Объект не найден.');
    const p = existing || newProject(id,now);
    change(p,command,now);
    p.rev++; p.updatedAt = Math.max(now,p.updatedAt);
    store.put(indexActive(p));
    return p;
  });
}
export function importMissing(raw) {
  const projects = parseBackup(raw);
  return write(store => store.getAll(), (store,existing) => {
    const ids = new Set(existing.map(p => p.id));
    const missing = projects.filter(p => !ids.has(p.id));
    for (const p of missing) store.add(indexActive(p));
    return {added:missing.length, skipped:projects.length-missing.length};
  });
}
