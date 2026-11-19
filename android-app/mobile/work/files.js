import { listProjects } from './store.js';
import { exportText } from './backup.js';
export async function exportFile() {
  const text = exportText(await listProjects());
  const name = 'Моя-мастерская-' + new Date().toISOString().slice(0,10) + '.json';
  const cap = globalThis.Capacitor;
  if (cap?.isNativePlatform?.()) {
    await cap.Plugins.WorkshopBackup.save({text,name});
  } else {
    const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url),60000);
  }
}
