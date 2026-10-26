// Prueba de extremo a extremo con un Chrome real, sin dependencias.
//
// - Lanza Chrome headless con un perfil temporal y el protocolo DevTools por pipe.
// - Carga la extensión con Extensions.loadUnpacked (Chrome ≥ 137 ya no admite --load-extension).
// - Sirve test/demo.html en localhost y comprueba cada comando contra los medios de la página.
//
// La concesión de permisos por sitio requiere un clic en un diálogo nativo, que no se puede
// automatizar. Por eso se carga una COPIA temporal de la extensión con host_permissions para
// http://localhost/*: simula que el usuario ya activó ese sitio. El flujo real del popup
// está en la lista de verificación manual del README.
//
// Uso: npm run test:e2e        (CHROME_PATH=/ruta/a/chrome para otro ejecutable)

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// EXT_DIR permite probar otra copia de la extensión, p. ej. el .zip de la release descomprimido.
const EXT_SOURCE = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : ROOT;
const PORT = 8765;
const DEMO_URL = `http://localhost:${PORT}/test/demo.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
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

class Cdp {
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

async function waitFor(label, fn, timeoutMs = 10_000) {
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
// Resultados
// ---------------------------------------------------------------------------

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `  — ${detail}` : ''}`);
}
function skip(name, reason) {
  results.push({ name, ok: true, skipped: true, detail: reason });
  console.log(`○ ${name}  — omitida: ${reason}`);
}
const near = (a, b, tol = 0.35) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------

function prepareExtensionCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scribekeys-ext-'));
  for (const entry of ['manifest.json', '_locales', 'background', 'content', 'icons', 'lib', 'offscreen', 'options', 'popup', 'ui']) {
    cpSync(path.join(EXT_SOURCE, entry), path.join(dir, entry), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://localhost/*']; // simula "Activar en este sitio"
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve-demo.mjs')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    proc.stdout.once('data', () => resolve(proc));
    proc.once('error', reject);
  });
}

async function openPage(cdp, url, errors) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)));
  });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await waitFor(`carga de ${url}`, () => cdp.evaluate(sessionId, 'document.readyState === "complete"'));
  return { targetId, sessionId };
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

async function run() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('No se encontró Chrome. Define CHROME_PATH.');

  const extDir = prepareExtensionCopy();
  const profile = mkdtempSync(path.join(os.tmpdir(), 'scribekeys-profile-'));
  const server = await startServer();
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
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
  const cdp = new Cdp(chrome);

  try {
    // 1. Cargar la extensión
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
    check('el manifest carga sin errores en Chrome', Boolean(id), `id ${id}`);

    const swTarget = await waitFor('service worker', async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      return targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`));
    });
    const { sessionId: sw } = await cdp.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true });
    const swEval = (expr) => cdp.evaluate(sw, expr);

    check('importScripts carga toda la lógica en el SW', await swEval('typeof handleCommand === "function" && !!SK.time && !!SK.siteAccess'));

    const commands = await swEval('chrome.commands.getAll()');
    const assigned = commands.filter((c) => c.shortcut).map((c) => `${c.name}=${c.shortcut}`);
    check('4 atajos sugeridos asignados', assigned.length === 4, assigned.join(', '));

    const scripts = await waitFor('registro del content script', async () => {
      const list = await swEval('chrome.scripting.getRegisteredContentScripts()');
      return list.length ? list : null;
    });
    check(
      'content script registrado por sitio con allFrames',
      scripts.length === 1 && scripts[0].matches[0] === 'http://localhost/*' && scripts[0].allFrames === true,
      scripts.map((s) => s.id).join(', ')
    );

    // 2. Página de prueba
    const pageErrors = [];
    const { sessionId: page } = await openPage(cdp, DEMO_URL, pageErrors);
    const pageEval = (expr, opts) => cdp.evaluate(page, expr, opts);
    const tabId = await waitFor('content script en la pestaña', async () => {
      const [tab] = await swEval(`chrome.tabs.query({ url: 'http://localhost/*' })`);
      if (!tab) return null;
      const probes = await swEval(`probeFrames(${tab.id})`);
      return probes.filter(Boolean).length >= 2 ? tab.id : null; // página + iframe
    });
    check('content script presente en la página y en el iframe', Boolean(tabId));

    const audio = (prop) => pageEval(`document.getElementById('audio').${prop}`);

    await pageEval(`document.getElementById('audio').play().then(() => true)`, { userGesture: true });
    await sleep(2500);
    const before = await audio('currentTime');
    let res = await swEval(`handleCommand('toggle-play')`);
    const after = await audio('currentTime');
    check(
      'pausar retrocede 2 s',
      res.ok && res.action === 'pause' && (await audio('paused')) && near(before - after, 2, 0.4),
      `${before.toFixed(2)} → ${after.toFixed(2)}`
    );

    res = await swEval(`handleCommand('toggle-play')`);
    check('reproducir reanuda', res.ok && res.action === 'play' && !(await audio('paused')));

    let t0 = await audio('currentTime');
    res = await swEval(`handleCommand('forward')`);
    let t1 = await audio('currentTime');
    check('adelantar 3 s', res.ok && near(t1 - t0, 3, 0.4), `${t0.toFixed(2)} → ${t1.toFixed(2)}`);

    t0 = await audio('currentTime');
    res = await swEval(`handleCommand('rewind')`);
    t1 = await audio('currentTime');
    check('retroceder 3 s', res.ok && near(t0 - t1, 3, 0.4), `${t0.toFixed(2)} → ${t1.toFixed(2)}`);

    await swEval(`handleCommand('rewind')`);
    await swEval(`handleCommand('rewind')`);
    check('retroceder no baja de 0', (await audio('currentTime')) < 0.6);

    await swEval(`handleCommand('speed-up')`);
    await swEval(`handleCommand('speed-up')`);
    check('subir velocidad dos pasos → 1.2×', (await audio('playbackRate')) === 1.2);
    for (let i = 0; i < 10; i++) await swEval(`handleCommand('speed-down')`);
    check('bajar velocidad respeta el mínimo 0.5×', (await audio('playbackRate')) === 0.5);
    await swEval(`handleCommand('speed-reset')`);
    check('restablecer velocidad → 1×', (await audio('playbackRate')) === 1);

    res = await swEval(`handleCommand('copy-timestamp')`);
    check('marca de tiempo con formato [hh:mm:ss]', /^\[\d{2}:\d{2}:\d{2}\]$/.test(res.stamp || ''), res.stamp);
    check('copia al portapapeles vía offscreen', res.copied === true);
    const offscreen = await swEval(`chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })`);
    check('documento offscreen creado', offscreen.length === 1);

    await pageEval(`document.getElementById('audio').pause()`);

    // 3. Medio dentro del iframe: debe convertirse en el objetivo
    await pageEval(`document.querySelector('iframe').contentDocument.getElementById('audio').play().then(() => true)`, {
      userGesture: true,
    });
    await sleep(800);
    res = await swEval(`handleCommand('toggle-play')`);
    const iframePaused = await pageEval(`document.querySelector('iframe').contentDocument.getElementById('audio').paused`);
    const lastMedia = await swEval(`chrome.storage.session.get('lastMedia')`);
    check(
      'controla el medio del iframe (all_frames)',
      res.ok && res.action === 'pause' && iframePaused && lastMedia.lastMedia.frameId !== 0,
      `frameId ${lastMedia.lastMedia.frameId}`
    );

    // 4. Medio añadido dinámicamente
    await pageEval(`document.getElementById('add-dynamic').click()`);
    await pageEval(`document.querySelector('#dynamic-area audio').play().then(() => true)`, { userGesture: true });
    await sleep(800);
    res = await swEval(`handleCommand('toggle-play')`);
    check(
      'controla un <audio> añadido después de cargar',
      res.ok && (await pageEval(`document.querySelector('#dynamic-area audio').paused`)) && (await audio('paused'))
    );

    // 5. Medio dentro de un shadow root abierto
    await pageEval(`document.getElementById('add-shadow').click()`);
    const shadowExpr = `[...document.querySelectorAll('#dynamic-area div')].pop().shadowRoot.querySelector('audio')`;
    await pageEval(`${shadowExpr}.play().then(() => true)`, { userGesture: true });
    await sleep(800);
    res = await swEval(`handleCommand('toggle-play')`);
    check('controla un <audio> dentro de un shadow root abierto', res.ok && (await pageEval(`${shadowExpr}.paused`)));

    // 6. Pestaña fijada y respaldo
    await swEval(`chrome.storage.session.set({ pinned: null, lastMedia: null })`);
    // Chrome mantiene la pestaña como audible unos segundos tras el último sonido.
    res = await waitFor('pestaña sin sonido', async () => ((await swEval(`resolveTarget()`)) === null ? 'ninguno' : null), 8000).catch(() => 'con objetivo');
    check('sin historial ni sonido no hay objetivo', res === 'ninguno');
    await pageEval(`document.getElementById('video').play().then(() => true)`, { userGesture: true });
    await swEval(`chrome.storage.session.set({ lastMedia: null })`); // forzar el respaldo
    res = await waitFor('pestaña audible', async () => {
      const r = await swEval(`resolveTarget()`);
      return r && r.reason === 'audible' ? r : null;
    }, 6000).catch(() => null);
    if (res) check('respaldo: pestaña audible', res.tabId === tabId, res.reason);
    else skip('respaldo: pestaña audible', 'Chrome headless sin salida de audio no marca pestañas como audibles');
    await pageEval(`document.getElementById('video').pause()`);
    await swEval(`chrome.storage.session.set({ pinned: { tabId: ${tabId} } })`);
    res = await swEval(`resolveTarget()`);
    check('la pestaña fijada tiene prioridad', res && res.reason === 'pinned' && res.tabId === tabId);

    check('sin errores de JavaScript en la página de prueba', pageErrors.length === 0, pageErrors.join(' | '));

    // 7. Popup y opciones abiertos como pestaña
    for (const [name, file] of [
      ['popup', 'popup/popup.html'],
      ['opciones', 'options/options.html'],
    ]) {
      const errors = [];
      const { sessionId } = await openPage(cdp, `chrome-extension://${id}/${file}`, errors);
      await sleep(1200);
      const text = await cdp.evaluate(sessionId, 'document.body.innerText');
      const untranslated = text.match(/\b(popup|options|shortcuts|cmd|error|reason|site)[A-Z]\w+/g) || [];
      check(`${name}: sin errores y traducido`, errors.length === 0 && untranslated.length === 0 && text.length > 50, [...errors, ...untranslated].join(' | '));
    }
  } finally {
    chrome.kill();
    server.kill();
    await sleep(500);
    rmSync(extDir, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

run()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((err) => {
    console.error('✖ Error en la prueba e2e:', err.message);
    process.exit(1);
  });
