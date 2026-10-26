'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTimestamp, formatDelta, formatRate } = require('../lib/time-format.js');

test('hh:mm:ss con corchetes por defecto', () => {
  assert.equal(formatTimestamp(0), '[00:00:00]');
  assert.equal(formatTimestamp(754.9), '[00:12:34]');
  assert.equal(formatTimestamp(3723), '[01:02:03]');
});

test('hh:mm:ss admite más de 99 horas', () => {
  assert.equal(formatTimestamp(100 * 3600 + 1), '[100:00:01]');
});

test('mm:ss usa minutos totales', () => {
  assert.equal(formatTimestamp(65, { format: 'mm:ss' }), '[01:05]');
  assert.equal(formatTimestamp(3723, { format: 'mm:ss' }), '[62:03]');
});

test('sin corchetes', () => {
  assert.equal(formatTimestamp(3723, { brackets: false }), '01:02:03');
  assert.equal(formatTimestamp(65, { format: 'mm:ss', brackets: false }), '01:05');
});

test('valores inválidos se tratan como 0', () => {
  for (const v of [NaN, -5, Infinity, undefined, null, 'abc']) {
    assert.equal(formatTimestamp(v), '[00:00:00]', String(v));
  }
});

test('formato desconocido cae a hh:mm:ss', () => {
  assert.equal(formatTimestamp(65, { format: 'ss' }), '[00:01:05]');
});

test('formatDelta usa signo menos tipográfico y quita decimales sobrantes', () => {
  assert.equal(formatDelta(-3), '−3 s');
  assert.equal(formatDelta(3), '+3 s');
  assert.equal(formatDelta(-2.5), '−2.5 s');
});

test('formatRate', () => {
  assert.equal(formatRate(1), '1×');
  assert.equal(formatRate(0.8), '0.8×');
  assert.equal(formatRate(0.1 + 0.2), '0.3×');
});
