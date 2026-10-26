/*
 * Service worker de ScribeKeys.
 *
 * - Recibe los atajos (chrome.commands) y los botones del popup.
 * - Decide la pestaña y el frame objetivo y le envía la orden al content script.
 * - Copia marcas de tiempo al portapapeles mediante un documento offscreen.
 * - Mantiene los content scripts registrados solo en los sitios que el usuario activó.
 *
 * El service worker de MV3 se detiene cuando está inactivo: el estado de ejecución
 * vive en chrome.storage.session y todos los listeners se registran al inicio.
 */
'use strict';

importScripts(
  '/lib/time-format.js',
  '/lib/playback.js',
  '/lib/settings.js',
  '/lib/target-tab.js',
  '/lib/media-pick.js',
  '/lib/site-access.js',
  '/lib/protocol.js',
  '/lib/feedback.js',
  '/lib/log.js'
);

const { MSG } = SK.protocol;
const log = SK.log.createLogger('sw');

/** Archivos del content script, en orden de carga (comparten mundo aislado). */
const CONTENT_FILES = [
  'lib/time-format.js',
  'lib/playback.js',
  'lib/media-pick.js',
  'lib/protocol.js',
  'lib/log.js',
  'content/overlay.js',
  'content/media-controller.js',
];

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const OFFSCREEN_IDLE_MS = 30_000;

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

let settingsCache = null;

async function getSettings() {
  if (!settingsCache) {
    const raw = await chrome.storage.sync.get(null);
    settingsCache = SK.settings.normalize(raw);
    log.setEnabled(settingsCache.debug);
  }
  return settingsCache;
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') settingsCache = null;
});

// ---------------------------------------------------------------------------
// Pestaña y frame objetivo
// ---------------------------------------------------------------------------

async function getSessionState() {
  const { pinned = null, lastMedia = null } = await chrome.storage.session.get(['pinned', 'lastMedia']);
  return { pinned, lastMedia };
}

async function resolveTarget() {
  const [state, allTabs, audible] = await Promise.all([
    getSessionState(),
    chrome.tabs.query({}),
    chrome.tabs.query({ audible: true }),
  ]);
  return SK.targetTab.selectTargetTab({
    ...state,
    openTabIds: allTabs.map((t) => t.id),
    // Sin el permiso "tabs", tab.url solo existe si tenemos acceso al sitio.
    audibleTabs: audible.map((t) => ({ id: t.id, controllable: Boolean(t.url), lastAccessed: t.lastAccessed })),
  });
}

/** Sondea todos los frames de la pestaña. Comparte el mundo aislado con el content script. */
async function probeFrames(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (globalThis.SK && SK.controller ? SK.controller.probe() : null),
  });
  return results.map((r) => (r.result ? { frameId: r.frameId, ...r.result } : null));
}

async function injectContent(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: CONTENT_FILES });
}

/**
 * Elige el frame con el medio a controlar. Si ningún frame tiene el content script
 * (pestaña abierta antes de activar el sitio o de recargar la extensión), lo inyecta.
 */
async function chooseFrame(tabId, preferredFrameId) {
  let probes;
  try {
    probes = await probeFrames(tabId);
  } catch (err) {
    log.debug('sin acceso a la pestaña', tabId, err.message);
    return { error: 'no-access' };
  }
  if (probes.every((p) => p === null)) {
    try {
      await injectContent(tabId);
      probes = await probeFrames(tabId);
    } catch (err) {
      log.debug('no se pudo inyectar', err.message);
      return { error: 'no-access' };
    }
  }
  const frameId = SK.mediaPick.pickFrame(probes, preferredFrameId);
  return frameId === null ? { error: 'no-media' } : { frameId };
}

async function sendToFrame(tabId, frameId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch (err) {
    log.debug('frame sin respuesta', tabId, frameId, err.message);
    return { ok: false, error: 'no-receiver' };
  }
}

/**
 * Envía un mensaje al frame correcto: primero al último frame conocido y,
 * si allí no hay medio, vuelve a elegir sondeando todos los frames.
 */
async function deliver(target, message) {
  if (target.frameId !== undefined) {
    const res = await sendToFrame(target.tabId, target.frameId, message);
    if (res && res.ok) return { res, frameId: target.frameId };
  }
  const chosen = await chooseFrame(target.tabId, target.frameId);
  if (chosen.error) return { res: { ok: false, error: chosen.error } };
  const res = await sendToFrame(target.tabId, chosen.frameId, message);
  if (res && res.ok) await rememberMedia(target.tabId, chosen.frameId);
  return { res, frameId: chosen.frameId };
}

async function rememberMedia(tabId, frameId) {
  await chrome.storage.session.set({ lastMedia: { tabId, frameId, at: Date.now() } });
}

// ---------------------------------------------------------------------------
// Portapapeles (documento offscreen)
// ---------------------------------------------------------------------------

let creatingOffscreen = null;
let offscreenTimer = 0;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['CLIPBOARD'],
        justification: 'Copy the media timestamp to the clipboard while another window has focus.',
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function copyToClipboard(text) {
  try {
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ type: MSG.COPY, text });
    clearTimeout(offscreenTimer);
    offscreenTimer = setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), OFFSCREEN_IDLE_MS);
    return Boolean(res && res.ok);
  } catch (err) {
    log.warn('no se pudo copiar al portapapeles', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

async function flashBadge(text) {
  await chrome.action.setBadgeBackgroundColor({ color: '#b3261e' });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }).catch(() => {}), 2000);
}

async function handleCommand(command) {
  if (!SK.protocol.COMMANDS.includes(command)) return { ok: false, error: 'unknown-command' };
  const settings = await getSettings();
  const target = await resolveTarget();
  log.debug('comando', command, 'objetivo', target);
  if (!target) {
    await flashBadge('!');
    return { ok: false, error: 'no-target' };
  }

  const message = {
    type: MSG.RUN,
    command,
    debug: settings.debug,
    params: { rewindOnPause: settings.rewindOnPause, skipSeconds: settings.skipSeconds },
  };
  const { res, frameId } = await deliver(target, message);
  if (!res || !res.ok) {
    log.debug('comando fallido', command, res);
    await flashBadge('!');
    return res || { ok: false, error: 'no-response' };
  }

  let text = SK.feedback.overlayText(command, res);
  if (command === 'copy-timestamp') {
    const stamp = SK.time.formatTimestamp(res.currentTime, {
      format: settings.timestampFormat,
      brackets: settings.brackets,
    });
    const copied = await copyToClipboard(stamp);
    text = SK.feedback.timestampText(stamp, copied);
    Object.assign(res, { stamp, copied });
    if (!copied) await flashBadge('!');
  }
  if (settings.overlay && text) await sendToFrame(target.tabId, frameId, { type: MSG.FLASH, text });
  return res;
}

chrome.commands.onCommand.addListener((command) => {
  handleCommand(command).catch((err) => log.error('comando', command, err));
});

// ---------------------------------------------------------------------------
// Activación por sitio: permisos concedidos ↔ content scripts registrados
// ---------------------------------------------------------------------------

let syncQueue = Promise.resolve();

/** Serializado para que onAdded y el popup no registren el mismo id a la vez. */
function syncRegistrations() {
  syncQueue = syncQueue.then(doSync, doSync);
  return syncQueue;
}

async function doSync() {
  const [{ origins = [] }, registered] = await Promise.all([
    chrome.permissions.getAll(),
    chrome.scripting.getRegisteredContentScripts(),
  ]);
  const { toRegister, toUnregister } = SK.siteAccess.reconcile(
    origins,
    registered.map((s) => s.id)
  );
  if (toUnregister.length) await chrome.scripting.unregisterContentScripts({ ids: toUnregister });
  if (toRegister.length) {
    await chrome.scripting.registerContentScripts(
      toRegister.map((pattern) => ({
        id: SK.siteAccess.scriptIdForPattern(pattern),
        matches: [pattern],
        js: CONTENT_FILES,
        allFrames: true,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }))
    );
  }
  log.debug('sitios sincronizados', { registrados: toRegister, quitados: toUnregister });
}

/**
 * Al conceder un sitio, inyecta el script en sus pestañas ya abiertas para no tener que recargar.
 * Se hace aquí (y no solo desde el popup) porque el popup puede cerrarse al mostrarse el diálogo de permisos.
 */
async function injectIntoOpenTabs(patterns) {
  const valid = (patterns || []).filter(SK.siteAccess.isHttpPattern);
  if (!valid.length) return;
  const tabs = await chrome.tabs.query({ url: valid });
  await Promise.all(tabs.map((tab) => injectContent(tab.id).catch((e) => log.debug('inyección', tab.id, e.message))));
}

chrome.permissions.onAdded.addListener((permissions) => {
  syncRegistrations()
    .then(() => injectIntoOpenTabs(permissions.origins))
    .catch((e) => log.error('sync', e));
});
chrome.permissions.onRemoved.addListener(() => syncRegistrations().catch((e) => log.error('sync', e)));

chrome.runtime.onStartup.addListener(() => syncRegistrations().catch((e) => log.error('sync', e)));
chrome.runtime.onInstalled.addListener((details) => {
  syncRegistrations().catch((e) => log.error('sync', e));
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Estado para el popup
// ---------------------------------------------------------------------------

async function popupState() {
  const target = await resolveTarget();
  if (!target) return { target: null, media: null };
  const { pinned } = await getSessionState();
  let tab = null;
  try {
    tab = await chrome.tabs.get(target.tabId);
  } catch {
    /* cerrada entre medias */
  }
  const info = {
    tabId: target.tabId,
    reason: target.reason,
    pinned: Boolean(pinned && pinned.tabId === target.tabId),
    title: tab ? tab.title : undefined, // undefined si no hay acceso al sitio
    url: tab ? tab.url : undefined,
    favIconUrl: tab ? tab.favIconUrl : undefined,
  };
  const { res } = await deliver(target, { type: MSG.STATUS });
  return { target: info, media: res && res.ok ? res : null, error: res && !res.ok ? res.error : undefined };
}

// ---------------------------------------------------------------------------
// Mensajes de content scripts y popup
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) return false;

  const reply = (promise) => {
    promise.then(sendResponse, (err) => {
      log.error(msg.type, err);
      sendResponse({ ok: false, error: 'exception' });
    });
    return true;
  };

  switch (msg.type) {
    case MSG.MEDIA_PLAYED:
      if (sender.tab) {
        rememberMedia(sender.tab.id, sender.frameId).catch((e) => log.error(e));
        log.debug('medio reproducido en', sender.tab.id, 'frame', sender.frameId);
      }
      return false;
    case MSG.POPUP_COMMAND:
      return reply(handleCommand(msg.command));
    case MSG.POPUP_STATE:
      return reply(popupState());
    case MSG.PIN_TAB:
      return reply(chrome.storage.session.set({ pinned: { tabId: msg.tabId } }).then(() => ({ ok: true })));
    case MSG.UNPIN_TAB:
      return reply(chrome.storage.session.set({ pinned: null }).then(() => ({ ok: true })));
    case MSG.SITE_ENABLED:
      return reply(
        syncRegistrations().then(async () => {
          if (msg.tabId !== undefined) await injectContent(msg.tabId).catch((e) => log.debug('inyección', e.message));
          return { ok: true };
        })
      );
    case MSG.SITE_DISABLED:
      return reply(syncRegistrations().then(() => ({ ok: true })));
    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getSessionState();
  const next = SK.targetTab.forgetTab(state, tabId);
  if (next.pinned !== state.pinned || next.lastMedia !== state.lastMedia) {
    await chrome.storage.session.set({ pinned: next.pinned, lastMedia: next.lastMedia });
  }
});
