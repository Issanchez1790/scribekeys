/*
 * Lista de atajos asignados (popup y opciones) y acceso a chrome://extensions/shortcuts.
 */
(function (root) {
  'use strict';

  const SK = (root.SK = root.SK || {});
  const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

  async function render(list) {
    const { t } = SK.i18n;
    const commands = await chrome.commands.getAll();
    list.replaceChildren();
    for (const cmd of commands) {
      if (cmd.name === '_execute_action') continue;
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = cmd.description;
      const key = document.createElement(cmd.shortcut ? 'kbd' : 'span');
      key.className = cmd.shortcut ? 'key' : 'key key-empty';
      key.textContent = cmd.shortcut || t('shortcutUnassigned');
      li.append(label, key);
      list.append(li);
    }
  }

  function openSettings() {
    chrome.tabs.create({ url: SHORTCUTS_URL });
  }

  SK.shortcuts = { render, openSettings };
})(globalThis);
