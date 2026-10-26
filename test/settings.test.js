'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, normalize } = require('../lib/settings.js');

test('sin datos devuelve los valores por defecto', () => {
  assert.deepEqual(normalize(undefined), { ...DEFAULTS });
  assert.deepEqual(normalize(null), { ...DEFAULTS });
  assert.deepEqual(normalize('basura'), { ...DEFAULTS });
});

test('los valores por defecto son los del enunciado', () => {
  assert.equal(DEFAULTS.rewindOnPause, 2);
  assert.equal(DEFAULTS.skipSeconds, 3);
  assert.equal(DEFAULTS.timestampFormat, 'hh:mm:ss');
  assert.equal(DEFAULTS.brackets, true);
  assert.equal(DEFAULTS.overlay, true);
  assert.equal(DEFAULTS.debug, false);
});

test('acota rewindOnPause a 0–5 en pasos de 0.5', () => {
  assert.equal(normalize({ rewindOnPause: 9 }).rewindOnPause, 5);
  assert.equal(normalize({ rewindOnPause: -1 }).rewindOnPause, 0);
  assert.equal(normalize({ rewindOnPause: 1.3 }).rewindOnPause, 1.5);
  assert.equal(normalize({ rewindOnPause: '4' }).rewindOnPause, 4);
});

test('acota skipSeconds a 1–60', () => {
  assert.equal(normalize({ skipSeconds: 0 }).skipSeconds, 1);
  assert.equal(normalize({ skipSeconds: 500 }).skipSeconds, 60);
  assert.equal(normalize({ skipSeconds: 'x' }).skipSeconds, 3);
  assert.equal(normalize({ skipSeconds: '' }).skipSeconds, 3);
});

test('formato y booleanos inválidos vuelven al valor por defecto', () => {
  const s = normalize({ timestampFormat: 'ss', brackets: 'no', overlay: 0, debug: 'true' });
  assert.equal(s.timestampFormat, 'hh:mm:ss');
  assert.equal(s.brackets, true);
  assert.equal(s.overlay, true);
  assert.equal(s.debug, false);
});

test('respeta valores válidos e ignora claves desconocidas', () => {
  const s = normalize({ timestampFormat: 'mm:ss', brackets: false, overlay: false, debug: true, foo: 1 });
  assert.deepEqual(s, {
    rewindOnPause: 2,
    skipSeconds: 3,
    timestampFormat: 'mm:ss',
    brackets: false,
    overlay: false,
    debug: true,
  });
});
