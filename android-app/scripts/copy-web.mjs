// The two entry points share the original WebView origin and one copy of the engine.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const android = fileURLToPath(new URL('../', import.meta.url));
const root = join(android, '..');
const out = join(android, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const dir of ['css', 'js', 'fonts', 'icons']) {
  cpSync(join(root, dir), join(out, dir), { recursive: true });
}
cpSync(join(android, 'mobile'), out, { recursive: true });
