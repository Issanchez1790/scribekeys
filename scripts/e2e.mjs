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

import { rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT, sleep, waitFor, prepareExtensionCopy, startServer, launchChrome, loadExtension, openPage } from './lib/chrome.mjs';

// EXT_DIR permite probar otra copia de la extensión, p. ej. el .zip de la release descomprimido.
const EXT_SOURCE = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : ROOT;
const PORT = 8765;
const DEMO_URL = `http://localhost:${PORT}/test/demo.html`;

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
// Pruebas
// ---------------------------------------------------------------------------

async function run() {
  const extDir = prepareExtensionCopy(EXT_SOURCE);
  const server = await startServer(PORT);
  const chrome = launchChrome();
  const { cdp } = chrome;

  try {
    // 1. Cargar la extensión
    const { id, swEval } = await loadExtension(cdp, extDir);
    check('el manifest carga sin errores en Chrome', Boolean(id), `id ${id}`);

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
    server.kill();
    await chrome.close();
    rmSync(extDir, { recursive: true, force: true });
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
