// Genera las imágenes y textos de la ficha de la Chrome Web Store en dist/store/, sin dependencias:
//
//   dist/store/icon-128.png                      ícono de la tienda (arte de 96 px + 16 px de margen)
//   dist/store/<idioma>/screenshot-{1,2,3}.jpg   capturas de 1280×800
//   dist/store/<idioma>/promo-440x280.jpg        mosaico promocional pequeño
//   dist/store/<idioma>/description.txt          descripción detallada, lista para pegar
//
// Las capturas son de la extensión real, con Chrome en cada idioma, sobre store/assets/player.html;
// store/assets/compose.html las monta con los textos de store/listing/<idioma>.json.
// JPEG porque la tienda no admite PNG con canal alfa en capturas y mosaicos.
//
// Uso: npm run store:assets

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, sleep, waitFor, prepareExtensionCopy, startServer, launchChrome, loadExtension, openPage } from './lib/chrome.mjs';

const PORT = 8766;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, 'dist', 'store');

// Idioma de la extensión → idioma de la interfaz de Chrome.
const LOCALES = { en: 'en-US', es: 'es', pt_BR: 'pt-BR', fr: 'fr', de: 'de' };

const dataUrl = (b64) => `data:image/png;base64,${b64}`;

async function setViewport(cdp, sessionId, width, height, deviceScaleFactor = 1) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false }, sessionId);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId);
  await sleep(200);
}

/** Rectángulo de un elemento en coordenadas del documento, para recortar una captura. */
function rectOf(cdp, sessionId, selector) {
  return cdp.evaluate(
    sessionId,
    `(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
    })()`
  );
}

async function capture(cdp, sessionId, params = {}) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...params }, sessionId);
  return data;
}

/** Capturas reales de la extensión en un idioma: reproductor, popup y tarjetas de opciones. */
async function captureExtension(lang, text) {
  const extDir = prepareExtensionCopy();
  const chrome = launchChrome({ lang: LOCALES[lang] });
  const { cdp } = chrome;
  const errors = [];
  try {
    const { id, swEval } = await loadExtension(cdp, extDir);
    await waitFor('registro del content script', async () => (await swEval('chrome.scripting.getRegisteredContentScripts()')).length);
    // Chrome nombra las teclas en su idioma (p. ej. «Ctrl+Mayús+1», «Strg+Umschalttaste+1»).
    const shortcut = await waitFor('atajos', () => swEval(`chrome.commands.getAll().then((c) => c.find((x) => x.name === 'toggle-play').shortcut)`));
    const keys = shortcut.replace(/1$/, '');

    // Reproductor: sonando a 1.2× (se muestra en el popup)
    const playerUrl = `${BASE}/store/assets/player.html?title=${encodeURIComponent(text.mock.player)}`;
    const { sessionId: player } = await openPage(cdp, playerUrl, errors);
    const media = (expr) => cdp.evaluate(player, `document.getElementById('media').${expr}`, { userGesture: true });
    await waitFor('content script en el reproductor', () => swEval(`chrome.tabs.query({ url: '${BASE}/*' }).then(([t]) => t && probeFrames(t.id)).then((p) => p && p.some(Boolean))`));
    await media('play().then(() => true)');
    await media('currentTime = 24');
    await swEval(`handleCommand('speed-up').then(() => handleCommand('speed-up'))`);
    await sleep(1200); // que desaparezca el indicador

    await setViewport(cdp, player, 1152, 556);
    const playerWide = await capture(cdp, player);

    // Popup abierto como pestaña. chrome.tabs.query({ active }) devolvería la propia pestaña del
    // popup; se redirige a la del reproductor para que se vea como al abrirlo desde la barra.
    const { sessionId: popup } = await openPage(cdp, `chrome-extension://${id}/popup/popup.html`, errors, (s) =>
      cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `{
          const query = chrome.tabs.query.bind(chrome.tabs);
          chrome.tabs.query = (info, ...rest) => query(info && info.active ? { url: '${BASE}/*' } : info, ...rest);
        }`,
      }, s)
    );
    await setViewport(cdp, popup, 340, 900, 2);
    await sleep(1500);
    // Hasta el final de la sección de controles (la de «Este sitio» mostraría localhost).
    const controls = await rectOf(cdp, popup, 'section[aria-labelledby="controls-h"]');
    const popupHeight = Math.ceil(controls.y + controls.height + 12);
    const popupShot = await capture(cdp, popup, { clip: { x: 0, y: 0, width: 340, height: popupHeight, scale: 1 } });

    // Reproductor recién pausado con el atajo: retrocede 2 s y muestra el indicador «⏸ −2 s»
    await setViewport(cdp, player, 760, 480, 2);
    await media('currentTime = 33');
    await sleep(300);
    await swEval(`handleCommand('toggle-play')`);
    await sleep(400);
    const playerPaused = await capture(cdp, player);

    // Opciones: reproducción, marcas de tiempo y privacidad a la izquierda; atajos a la derecha
    const { sessionId: options } = await openPage(cdp, `chrome-extension://${id}/options/options.html`, errors);
    await setViewport(cdp, options, 600, 2400, 2);
    await sleep(800);
    const cards = [];
    for (const h of ['playback-h', 'stamp-h', 'privacy-h', 'keys-h']) {
      const r = await rectOf(cdp, options, `section[aria-labelledby="${h}"]`);
      cards.push(dataUrl(await capture(cdp, options, { clip: { ...r, scale: 1 } })));
    }

    if (errors.length) throw new Error(`errores en las páginas: ${errors.join(' | ')}`);
    return { keys, playerWide: dataUrl(playerWide), playerPaused: dataUrl(playerPaused), popup: dataUrl(popupShot), cards };
  } finally {
    await chrome.close();
    rmSync(extDir, { recursive: true, force: true });
  }
}

/** Monta y captura una imagen con store/assets/compose.html. */
async function compose(cdp, sessionId, size, data, format = 'jpeg') {
  await setViewport(cdp, sessionId, size[0], size[1]);
  const got = await cdp.evaluate(sessionId, `render(${JSON.stringify(data)})`);
  if (got.width !== size[0] || got.height !== size[1]) throw new Error(`${data.kind}: ${got.width}×${got.height}, se esperaba ${size.join('×')}`);
  const shot = await capture(cdp, sessionId, { format, ...(format === 'jpeg' ? { quality: 92 } : {}), clip: { x: 0, y: 0, width: size[0], height: size[1], scale: 1 } });
  return Buffer.from(shot, 'base64');
}

async function run() {
  rmSync(OUT, { recursive: true, force: true });
  const server = await startServer(PORT);
  try {
    const shots = {};
    for (const lang of Object.keys(LOCALES)) {
      const text = JSON.parse(readFileSync(path.join(ROOT, 'store', 'listing', `${lang}.json`), 'utf8'));
      shots[lang] = { text, images: await captureExtension(lang, text) };
      console.log(`✔ ${lang}: capturas de la extensión`);
    }

    const chrome = launchChrome();
    try {
      const { sessionId } = await openPage(chrome.cdp, `${BASE}/store/assets/compose.html`);
      mkdirSync(OUT, { recursive: true });
      await chrome.cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
      writeFileSync(path.join(OUT, 'icon-128.png'), await compose(chrome.cdp, sessionId, [128, 128], { kind: 'icon' }, 'png'));
      await chrome.cdp.send('Emulation.setDefaultBackgroundColorOverride', {}, sessionId);

      for (const [lang, { text, images }] of Object.entries(shots)) {
        const dir = path.join(OUT, lang);
        mkdirSync(dir, { recursive: true });
        const base = { text, keys: images.keys };
        const files = {
          'screenshot-1.jpg': [[1280, 800], { ...base, kind: 'hero', images: { player: images.playerPaused } }],
          'screenshot-2.jpg': [[1280, 800], { ...base, kind: 'popup', images: { player: images.playerWide, popup: images.popup, popupWidth: 340 } }],
          'screenshot-3.jpg': [[1280, 800], { ...base, kind: 'options', images: { cards: images.cards } }],
          'promo-440x280.jpg': [[440, 280], { ...base, kind: 'promo' }],
        };
        for (const [file, [size, data]] of Object.entries(files)) {
          writeFileSync(path.join(dir, file), await compose(chrome.cdp, sessionId, size, data));
        }
        writeFileSync(path.join(dir, 'description.txt'), text.description.join('\n') + '\n');
        console.log(`✔ ${lang}: ${Object.keys(files).join(', ')}, description.txt`);
      }
    } finally {
      await chrome.close();
    }
    console.log(`\nImágenes y textos en ${path.relative(ROOT, OUT)}`);
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error('✖ Error generando las imágenes de la tienda:', err.message);
  process.exit(1);
});
