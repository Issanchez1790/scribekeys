// Utilidades compartidas por los scripts que manejan un Chrome real (e2e e imágenes de la tienda):
// lanzar Chrome headless con DevTools por pipe, cargar una copia de la extensión y abrir páginas.

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXTENSION_ENTRIES = ['manifest.json', '_locales', 'background', 'content', 'icons', 'lib', 'offscreen', 'options', 'popup', 'ui'];

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((p) => p && existsSync(p));
}

// ---------------------------------------------------------------------------
// Cliente CDP mínimo sobre --remote-debugging-pipe (mensajes JSON separados por \0)
// ---------------------------------------------------------------------------

export class Cdp {
  constructor(proc) {
    this.out = proc.stdio[3];
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    let buf = Buffer.alloc(0);
    proc.stdio[4].on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let i;
      while ((i = buf.indexOf(0)) >= 0) {
        const msg = JSON.parse(buf.subarray(0, i).toString('utf8'));
        buf = buf.subarray(i + 1);
        this.dispatch(msg);
      }
    });
  }

  dispatch(msg) {
    const p = msg.id && this.pending.get(msg.id);
    if (p) {
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
      return;
    }
    for (const l of this.listeners) l(msg);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
    this.out.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    return promise;
  }

  async evaluate(sessionId, expression, { userGesture = false } = {}) {
    const r = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true, userGesture },
      sessionId
    );
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
}

export async function waitFor(label, fn, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(150);
  }
  throw new Error(`Tiempo agotado esperando: ${label} (${last instanceof Error ? last.message : last})`);
}

// ---------------------------------------------------------------------------
// Extensión, servidor y Chrome
// ---------------------------------------------------------------------------

/**
 * Copia temporal de la extensión con host_permissions para http://localhost/*: simula que el
 * usuario ya activó ese sitio (el diálogo de permisos es nativo y no se puede automatizar).
 */
export function prepareExtensionCopy(source = ROOT) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scribekeys-ext-'));
  for (const entry of EXTENSION_ENTRIES) {
    cpSync(path.join(source, entry), path.join(dir, entry), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://localhost/*']; // simula "Activar en este sitio"
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

/** Sirve el repositorio en http://localhost:<port>/ con scripts/serve-demo.mjs. */
export function startServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve-demo.mjs')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    proc.stdout.once('data', () => resolve(proc));
    proc.once('error', reject);
  });
}

/** Lanza Chrome headless con un perfil temporal. `lang` fija el idioma de la interfaz (p. ej. 'pt-BR'). */
export function launchChrome({ lang } = {}) {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('No se encontró Chrome. Define CHROME_PATH.');
  const profile = mkdtempSync(path.join(os.tmpdir(), 'scribekeys-profile-'));
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      ...(lang ? [`--lang=${lang}`] : []),
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
  );
  const cdp = new Cdp(proc);
  async function close() {
    proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return { cdp, close };
}

/** Carga la extensión desempaquetada y devuelve su id y una función para evaluar en su service worker. */
export async function loadExtension(cdp, dir) {
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: dir });
  const swTarget = await waitFor('service worker', async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`));
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
  return { id, swEval: (expr) => cdp.evaluate(sessionId, expr) };
}

/**
 * Abre una pestaña nueva en `url` y espera a que cargue. Las excepciones y console.error de la
 * página se acumulan en `errors`. `beforeLoad(sessionId)` se ejecuta antes de navegar.
 */
export async function openPage(cdp, url, errors = [], beforeLoad) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)));
  });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  if (beforeLoad) await beforeLoad(sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await waitFor(`carga de ${url}`, () => cdp.evaluate(sessionId, 'document.readyState === "complete"'));
  return { targetId, sessionId };
}
