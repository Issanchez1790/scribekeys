// Empaqueta la extensión a partir del último commit, con solo los archivos que necesita Chrome
// (sin tests, scripts ni documentación).
//
//   npm run package                → dist/scribekeys-v<versión>.zip        (carpeta scribekeys/ dentro, para la release)
//   npm run package -- --store     → dist/scribekeys-v<versión>-store.zip  (manifest.json en la raíz, para la Chrome Web Store)

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['manifest.json', '_locales', 'background', 'content', 'icons', 'lib', 'offscreen', 'options', 'popup', 'ui', 'LICENSE'];
const forStore = process.argv.includes('--store');

const { version } = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const out = path.join(ROOT, 'dist', `scribekeys-v${version}${forStore ? '-store' : ''}.zip`);
mkdirSync(path.dirname(out), { recursive: true });

const prefix = forStore ? [] : ['--prefix=scribekeys/'];
execFileSync('git', ['archive', '--format=zip', ...prefix, '-o', out, 'HEAD', ...FILES], { cwd: ROOT });
console.log(`Paquete creado: ${path.relative(ROOT, out)} (desde HEAD; los cambios sin commit no se incluyen)`);
