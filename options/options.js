/*
 * Página de opciones: configuración (chrome.storage.sync), atajos y sitios activados.
 */
'use strict';

const { t } = SK.i18n;
const { MSG } = SK.protocol;
const sa = SK.siteAccess;
const $ = (id) => document.getElementById(id);
const form = $('settings');

const PREVIEW_SECONDS = 3723; // 01:02:03

let savedTimer = 0;

function readForm() {
  const data = new FormData(form);
  return SK.settings.normalize({
    rewindOnPause: data.get('rewindOnPause'),
    skipSeconds: data.get('skipSeconds'),
    timestampFormat: data.get('timestampFormat'),
    brackets: form.elements.brackets.checked,
    overlay: form.elements.overlay.checked,
    debug: form.elements.debug.checked,
  });
}

function fillForm(settings) {
  form.elements.rewindOnPause.value = settings.rewindOnPause;
  form.elements.skipSeconds.value = settings.skipSeconds;
  for (const radio of form.elements.timestampFormat) radio.checked = radio.value === settings.timestampFormat;
  form.elements.brackets.checked = settings.brackets;
  form.elements.overlay.checked = settings.overlay;
  form.elements.debug.checked = settings.debug;
  renderDerived(settings);
}

function renderDerived(settings) {
  $('rewindOnPause-out').textContent = `${settings.rewindOnPause} s`;
  $('stamp-preview').textContent = SK.time.formatTimestamp(PREVIEW_SECONDS, {
    format: settings.timestampFormat,
    brackets: settings.brackets,
  });
}

async function save() {
  const settings = readForm();
  renderDerived(settings);
  await chrome.storage.sync.set(settings);
  const saved = $('saved');
  saved.textContent = t('optionsSaved');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ''), 1500);
}

async function renderSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  const patterns = origins.filter(sa.isHttpPattern).sort();
  const list = $('site-list');
  list.replaceChildren();
  for (const pattern of patterns) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = pattern;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t('optionsSiteRemove');
    btn.addEventListener('click', async () => {
      await chrome.permissions.remove({ origins: [pattern] });
      await chrome.runtime.sendMessage({ type: MSG.SITE_DISABLED }).catch(() => {});
      await renderSites();
    });
    li.append(name, btn);
    list.append(li);
  }
  $('site-empty').classList.toggle('hidden', patterns.length > 0);
}

async function init() {
  SK.i18n.apply();
  fillForm(SK.settings.normalize(await chrome.storage.sync.get(null)));

  form.addEventListener('input', save);
  form.addEventListener('change', save);
  // Al salir del campo, mostrar el valor ya acotado (p. ej. 500 → 60).
  form.elements.skipSeconds.addEventListener('blur', () => fillForm(readForm()));
  $('reset').addEventListener('click', async () => {
    await chrome.storage.sync.clear();
    fillForm(SK.settings.normalize({}));
    await save();
  });

  $('open-shortcuts').addEventListener('click', SK.shortcuts.openSettings);
  await Promise.all([SK.shortcuts.render($('shortcut-list')), renderSites()]);

  chrome.permissions.onAdded.addListener(renderSites);
  chrome.permissions.onRemoved.addListener(renderSites);
  // Los atajos pueden cambiar en chrome://extensions/shortcuts mientras esta página está abierta.
  window.addEventListener('focus', () => SK.shortcuts.render($('shortcut-list')));
}

init();
