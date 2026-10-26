/*
 * Nombres compartidos entre service worker, content script, popup y offscreen.
 */
(function (root) {
  'use strict';

  /** Ids de chrome.commands (deben coincidir con manifest.json; lo comprueba un test). */
  const COMMANDS = Object.freeze([
    'toggle-play',
    'rewind',
    'forward',
    'speed-down',
    'speed-up',
    'speed-reset',
    'copy-timestamp',
  ]);

  /** Tipos de mensaje de chrome.runtime / chrome.tabs. */
  const MSG = Object.freeze({
    // service worker → content script
    RUN: 'sk/run', // ejecutar un comando sobre el medio
    STATUS: 'sk/status', // pedir estado del medio
    FLASH: 'sk/flash', // mostrar un indicador
    // content script → service worker
    MEDIA_PLAYED: 'sk/media-played',
    // popup → service worker
    POPUP_COMMAND: 'sk/popup-command',
    POPUP_STATE: 'sk/popup-state',
    PIN_TAB: 'sk/pin-tab',
    UNPIN_TAB: 'sk/unpin-tab',
    SITE_ENABLED: 'sk/site-enabled',
    SITE_DISABLED: 'sk/site-disabled',
    // service worker → offscreen
    COPY: 'sk/offscreen-copy',
  });

  const api = { COMMANDS, MSG };

  const SK = (root.SK = root.SK || {});
  SK.protocol = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
