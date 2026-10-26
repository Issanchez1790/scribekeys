'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pb = require('../lib/playback.js');

test('stepRate sube y baja en pasos de 0.1 sin errores de coma flotante', () => {
  let r = 1;
  for (let i = 0; i < 3; i++) r = pb.stepRate(r, -1);
  assert.equal(r, 0.7);
  r = 1;
  for (let i = 0; i < 7; i++) r = pb.stepRate(r, 1);
  assert.equal(r, 1.7);
});

test('stepRate respeta los límites 0.5×–2×', () => {
  assert.equal(pb.stepRate(0.5, -1), 0.5);
  assert.equal(pb.stepRate(2, 1), 2);
  assert.equal(pb.stepRate(1.95, 1), 2);
});

test('stepRate devuelve al rango una velocidad ajena', () => {
  assert.equal(pb.stepRate(0.25, 1), 0.5);
  assert.equal(pb.stepRate(3, -1), 2);
  assert.equal(pb.stepRate(NaN, 1), 1.1);
});

test('clampRate', () => {
  assert.equal(pb.clampRate(0), 1);
  assert.equal(pb.clampRate(-1), 1);
  assert.equal(pb.clampRate(10), 2);
  assert.equal(pb.clampRate(1.04), 1);
});

test('clampTime con duración conocida, NaN e Infinity', () => {
  assert.equal(pb.clampTime(-2, 100), 0);
  assert.equal(pb.clampTime(120, 100), 100);
  assert.equal(pb.clampTime(120, NaN), 120);
  assert.equal(pb.clampTime(120, Infinity), 120);
  assert.equal(pb.clampTime(NaN, 100), 0);
});

test('seekTarget retrocede y adelanta dentro de los límites', () => {
  assert.equal(pb.seekTarget(10, -3, 100), 7);
  assert.equal(pb.seekTarget(1, -3, 100), 0);
  assert.equal(pb.seekTarget(98, 3, 100), 100);
});

test('planToggle: reproduce si está pausado o terminado', () => {
  assert.deepEqual(pb.planToggle({ paused: true, currentTime: 5 }, 2), { action: 'play' });
  assert.deepEqual(pb.planToggle({ paused: false, ended: true }, 2), { action: 'play' });
});

test('planToggle: al pausar retrocede lo configurado', () => {
  assert.deepEqual(pb.planToggle({ paused: false, currentTime: 10, duration: 60 }, 2), {
    action: 'pause',
    seekTo: 8,
    rewound: 2,
  });
});

test('planToggle: cerca del inicio retrocede solo hasta 0', () => {
  assert.deepEqual(pb.planToggle({ paused: false, currentTime: 1, duration: 60 }, 2), {
    action: 'pause',
    seekTo: 0,
    rewound: 1,
  });
});

test('planToggle: retroceso 0 no mueve el tiempo', () => {
  const plan = pb.planToggle({ paused: false, currentTime: 10, duration: 60 }, 0);
  assert.equal(plan.seekTo, 10);
  assert.equal(plan.rewound, 0);
});
