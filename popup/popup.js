/*
 * Popup: estado de la pestaña objetivo, controles, activación por sitio y atajos.
 */
'use strict';

const { t } = SK.i18n;
const { MSG } = SK.protocol;
const sa = SK.siteAccess;
const $ = (id) => document.getElementById(id);

const REFRESH_MS = 1000;
const REASON_KEYS = { pinned: 'reasonPinned', 'last-media': 'reasonLastMedia', audible: 'reasonAudible' };
const ERROR_KEYS = {
  'no-target': 'errorNoTarget',
  'no-access': 'errorNoAccess',
  'no-media': 'errorNoMedia',
  'no-receiver': 'errorNoMedia',
  'play-blocked': 'errorPlayBlocked',
};

let activeTab = null;

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function errorText(code) {
  return t(ERROR_KEYS[code] || 'errorGeneric');
}

// ---------------------------------------------------------------------------
// Pestaña objetivo y medio
// ---------------------------------------------------------------------------

function mediaLine(media) {
  const icon = media.paused || media.ended ? '⏸' : '▶';
  const now = SK.time.formatTimestamp(media.currentTime, { brackets: false });
  const total = Number.isFinite(media.duration) ? ` / ${SK.time.formatTimestamp(media.duration, { brackets: false })}` : '';
  return `${icon} ${now}${total} · ${SK.time.formatRate(media.rate)}`;
}

function renderTarget(state) {
  const target = state && state.target;
  $('target-none').classList.toggle('hidden', Boolean(target));
  $('target-info').classList.toggle('hidden', !target);

  if (target) {
    const favicon = $('target-favicon');
    favicon.classList.toggle('hidden', !target.favIconUrl);
    if (target.favIconUrl) favicon.src = target.favIconUrl;
    $('target-title').textContent = target.title || t('popupTargetNoAccessTitle');
    $('target-reason').textContent = t(REASON_KEYS[target.reason] || 'reasonAudible');
    $('media-line').textContent = state.media ? mediaLine(state.media) : errorText(state.error);
  }
  $('rate').textContent = SK.time.formatRate(state && state.media ? state.media.rate : 1);

  // El botón de fijar siempre se refiere a la pestaña activa.
  const pin = $('pin');
  const activePinned = Boolean(target && target.pinned && activeTab && target.tabId === activeTab.id);
  pin.textContent = t(activePinned ? 'popupUnpin' : 'popupPin');
  pin.dataset.action = activePinned ? 'unpin' : 'pin';
  pin.disabled = !activeTab || !sa.originFromUrl(activeTab.url);
}

let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const state = await send({ type: MSG.POPUP_STATE });
    renderTarget(state || { target: null });
  } finally {
    refreshing = false;
  }
}

async function runCommand(command) {
  const res = await send({ type: MSG.POPUP_COMMAND, command });
  const status = $('action-status');
  if (!res || !res.ok) {
    status.textContent = errorText(res && res.error);
  } else if (command === 'copy-timestamp') {
    status.textContent = t(res.copied ? 'statusCopied' : 'statusCopyFailed', [res.stamp]);
  } else {
    status.textContent = '';
  }
  await refresh();
}

async function togglePin() {
  if ($('pin').dataset.action === 'unpin') await send({ type: MSG.UNPIN_TAB });
  else await send({ type: MSG.PIN_TAB, tabId: activeTab.id });
  await refresh();
}

// ---------------------------------------------------------------------------
// Activación por sitio
// ---------------------------------------------------------------------------

/** Debe llamarse directamente desde el clic: permissions.request exige un gesto del usuario. */
function enableSites(patterns) {
  chrome.permissions.request({ origins: patterns }).then(async (granted) => {
    if (granted) await send({ type: MSG.SITE_ENABLED, tabId: activeTab.id });
    await Promise.all([renderSite(), refresh()]);
  });
}

async function disableSite(pattern) {
  await chrome.permissions.remove({ origins: [pattern] });
  await send({ type: MSG.SITE_DISABLED });
  await renderSite();
}

/** Orígenes de los iframes visibles de la pestaña activa (activeTab da acceso al abrir el popup). */
async function embeddedFrameUrls() {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id, frameIds: [0] },
      func: () =>
        [...document.querySelectorAll('iframe[src], frame[src]')]
          .filter((f) => {
            const r = f.getBoundingClientRect();
            return r.width >= 160 && r.height >= 90; // descarta píxeles de seguimiento y similares
          })
          .map((f) => f.src),
    });
    return (res && res.result) || [];
  } catch {
    return [];
  }
}

async function renderEmbedded() {
  const patterns = sa.embeddedPatterns(await embeddedFrameUrls(), activeTab.url).slice(0, 5);
  const list = $('embedded-list');
  list.replaceChildren();
  for (const pattern of patterns) {
    const enabled = await chrome.permissions.contains({ origins: [pattern] });
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = sa.hostLabel(pattern);
    const btn = document.createElement('button');
    btn.textContent = t(enabled ? 'siteEnabled' : 'popupEnableAlso');
    btn.disabled = enabled;
    btn.addEventListener('click', () => enableSites([pattern]));
    li.append(name, btn);
    list.append(li);
  }
  $('embedded').classList.toggle('hidden', patterns.length === 0);
}

async function renderSite() {
  const pattern = activeTab && sa.patternForUrl(activeTab.url);
  const toggle = $('site-toggle');
  const state = $('site-state');
  $('site-unsupported').classList.toggle('hidden', Boolean(pattern));
  toggle.classList.toggle('hidden', !pattern);

  if (!pattern) {
    $('site-host').textContent = t('popupSiteNone');
    state.textContent = '';
    $('embedded').classList.add('hidden');
    return;
  }

  const enabled = await chrome.permissions.contains({ origins: [pattern] });
  $('site-host').textContent = sa.hostLabel(pattern);
  state.textContent = t(enabled ? 'siteEnabled' : 'siteDisabled');
  state.classList.toggle('off', !enabled);
  toggle.textContent = t(enabled ? 'popupDisableSite' : 'popupEnableSite');
  toggle.classList.toggle('primary', !enabled);
  toggle.onclick = () => (enabled ? disableSite(pattern) : enableSites([pattern]));
  await renderEmbedded();
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

async function init() {
  SK.i18n.apply();
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const settings = SK.settings.normalize(await chrome.storage.sync.get(null));
  $('btn-rewind').textContent = `⏪ ${SK.time.formatDelta(-settings.skipSeconds)}`;
  $('btn-forward').textContent = `${SK.time.formatDelta(settings.skipSeconds)} ⏩`;

  for (const btn of document.querySelectorAll('[data-command]')) {
    btn.addEventListener('click', () => runCommand(btn.dataset.command));
  }
  $('pin').addEventListener('click', togglePin);
  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('open-shortcuts').addEventListener('click', SK.shortcuts.openSettings);

  await Promise.all([renderSite(), SK.shortcuts.render($('shortcut-list')), refresh()]);
  setInterval(refresh, REFRESH_MS);
}

init();
