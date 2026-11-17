// Копирует сайт (корень репозитория) в android-app/www — оттуда его берёт Capacitor.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, '..', 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'fonts', 'icons']) {
  cpSync(join(root, f), join(out, f), { recursive: true });
}
console.log('Сайт скопирован в', out);
