'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { overlayText, timestampText, ICON } = require('../lib/feedback.js');
const { createLogger, PREFIX } = require('../lib/log.js');

test('overlayText para cada comando', () => {
  assert.equal(overlayText('toggle-play', { action: 'play' }), ICON.play);
  assert.equal(overlayText('toggle-play', { action: 'pause', rewound: 2 }), `${ICON.pause} −2 s`);
  assert.equal(overlayText('toggle-play', { action: 'pause', rewound: 0 }), ICON.pause);
  assert.equal(overlayText('rewind', { delta: -3 }), '−3 s');
  assert.equal(overlayText('forward', { delta: 3 }), '+3 s');
  assert.equal(overlayText('speed-down', { rate: 0.8 }), '0.8×');
  assert.equal(overlayText('speed-reset', { rate: 1 }), '1×');
  assert.equal(overlayText('desconocido', {}), '');
});

test('timestampText distingue copiado y fallo', () => {
  assert.equal(timestampText('[00:00:05]', true), `${ICON.copy} [00:00:05]`);
  assert.equal(timestampText('[00:00:05]', false), `${ICON.warn} [00:00:05]`);
});

test('logger: debug desactivado por defecto, warn siempre, con prefijo', () => {
  const calls = [];
  const sink = {
    debug: (...a) => calls.push(['debug', ...a]),
    info: (...a) => calls.push(['info', ...a]),
    warn: (...a) => calls.push(['warn', ...a]),
    error: (...a) => calls.push(['error', ...a]),
  };
  const log = createLogger('sw', sink);
  log.debug('oculto');
  log.warn('visible');
  log.setEnabled(true);
  log.debug('ahora sí');
  assert.deepEqual(calls, [
    ['warn', `${PREFIX}[sw]`, 'visible'],
    ['debug', `${PREFIX}[sw]`, 'ahora sí'],
  ]);
  assert.equal(log.enabled, true);
});
