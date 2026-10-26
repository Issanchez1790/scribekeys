/*
 * Texto del indicador visual que aparece sobre la página tras cada acción.
 */
(function (root) {
  'use strict';

  const time = root.SK && root.SK.time ? root.SK.time : require('./time-format.js');

  const ICON = Object.freeze({ play: '▶', pause: '⏸', copy: '⧉', warn: '⚠' });

  /**
   * @param {string} command  id de chrome.commands
   * @param {object} result   respuesta del content script ({action, rewound, delta, rate})
   */
  function overlayText(command, result) {
    const r = result || {};
    switch (command) {
      case 'toggle-play':
        if (r.action === 'play') return ICON.play;
        return r.rewound > 0 ? `${ICON.pause} ${time.formatDelta(-r.rewound)}` : ICON.pause;
      case 'rewind':
      case 'forward':
        return time.formatDelta(r.delta || 0);
      case 'speed-down':
      case 'speed-up':
      case 'speed-reset':
        return time.formatRate(r.rate || 1);
      default:
        return '';
    }
  }

  function timestampText(stamp, copied) {
    return copied ? `${ICON.copy} ${stamp}` : `${ICON.warn} ${stamp}`;
  }

  const api = { ICON, overlayText, timestampText };

  const SK = (root.SK = root.SK || {});
  SK.feedback = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
