// Empaqueta la extensión en dist/scribekeys-v<versión>.zip a partir del último commit,
// con solo los archivos que necesita Chrome (sin tests, scripts ni documentación).
// Uso: npm run package

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['manifest.json', '_locales', 'background', 'content', 'icons', 'lib', 'offscreen', 'options', 'popup', 'ui', 'LICENSE'];

const { version } = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const out = path.join(ROOT, 'dist', `scribekeys-v${version}.zip`);
mkdirSync(path.dirname(out), { recursive: true });

execFileSync('git', ['archive', '--format=zip', '--prefix=scribekeys/', '-o', out, 'HEAD', ...FILES], { cwd: ROOT });
console.log(`Paquete creado: ${path.relative(ROOT, out)} (desde HEAD; los cambios sin commit no se incluyen)`);
