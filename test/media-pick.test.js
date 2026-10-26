'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickMedia, pickFrame } = require('../lib/media-pick.js');

const m = (index, extra) => ({ index, playing: false, lastPlayedAt: 0, hasMedia: true, area: 0, ...extra });

test('pickMedia: el que se está reproduciendo gana', () => {
  const r = pickMedia([m(0, { lastPlayedAt: 900, area: 9999 }), m(1, { playing: true, lastPlayedAt: 100 })]);
  assert.equal(r.index, 1);
});

test('pickMedia: entre varios reproduciéndose, el más reciente', () => {
  const r = pickMedia([m(0, { playing: true, lastPlayedAt: 100 }), m(1, { playing: true, lastPlayedAt: 200 })]);
  assert.equal(r.index, 1);
});

test('pickMedia: si ninguno suena, el último reproducido', () => {
  const r = pickMedia([m(0, { lastPlayedAt: 50 }), m(1, { lastPlayedAt: 70 }), m(2, { area: 5000 })]);
  assert.equal(r.index, 1);
});

test('pickMedia: sin historial, prefiere medio cargado y luego mayor área', () => {
  assert.equal(pickMedia([m(0, { hasMedia: false, area: 9999 }), m(1, { area: 10 })]).index, 1);
  assert.equal(pickMedia([m(0, { area: 10 }), m(1, { area: 300 })]).index, 1);
});

test('pickMedia: empate total → orden del documento', () => {
  assert.equal(pickMedia([m(2), m(0), m(1)]).index, 0);
});

test('pickMedia: lista vacía o con huecos', () => {
  assert.equal(pickMedia([]), null);
  assert.equal(pickMedia(undefined), null);
  assert.equal(pickMedia([null, m(3)]).index, 3);
});

test('pickFrame: frame reproduciéndose gana aunque no sea el preferido', () => {
  const probes = [
    { frameId: 0, count: 1, playing: false, lastPlayedAt: 500 },
    { frameId: 12, count: 1, playing: true, lastPlayedAt: 100 },
  ];
  assert.equal(pickFrame(probes, 0), 12);
});

test('pickFrame: ignora frames sin medios y resultados nulos', () => {
  const probes = [null, { frameId: 0, count: 0, playing: false }, { frameId: 4, count: 2, playing: false }];
  assert.equal(pickFrame(probes), 4);
  assert.equal(pickFrame([{ frameId: 0, count: 0 }]), null);
  assert.equal(pickFrame([]), null);
});

test('pickFrame: sin actividad, el preferido y si no el principal', () => {
  const probes = [
    { frameId: 3, count: 1, playing: false },
    { frameId: 0, count: 1, playing: false },
    { frameId: 8, count: 1, playing: false },
  ];
  assert.equal(pickFrame(probes, 8), 8);
  assert.equal(pickFrame(probes), 0);
});
