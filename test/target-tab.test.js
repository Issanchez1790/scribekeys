'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTargetTab, forgetTab } = require('../lib/target-tab.js');

test('la pestaña fijada gana a todo', () => {
  const r = selectTargetTab({
    pinned: { tabId: 1 },
    lastMedia: { tabId: 2, frameId: 0 },
    audibleTabs: [{ id: 3, controllable: true }],
    openTabIds: [1, 2, 3],
  });
  assert.deepEqual(r, { tabId: 1, frameId: undefined, reason: 'pinned' });
});

test('la fijada hereda el frame si el último play fue en ella', () => {
  const r = selectTargetTab({
    pinned: { tabId: 1 },
    lastMedia: { tabId: 1, frameId: 7 },
    openTabIds: [1],
  });
  assert.equal(r.frameId, 7);
});

test('una pestaña fijada que se cerró se ignora', () => {
  const r = selectTargetTab({
    pinned: { tabId: 1 },
    lastMedia: { tabId: 2, frameId: 4 },
    openTabIds: new Set([2]),
  });
  assert.deepEqual(r, { tabId: 2, frameId: 4, reason: 'last-media' });
});

test('respaldo: pestaña audible, prefiriendo las controlables y luego la más reciente', () => {
  const r = selectTargetTab({
    pinned: null,
    lastMedia: { tabId: 9 }, // cerrada
    audibleTabs: [
      { id: 3, controllable: false, lastAccessed: 300 },
      { id: 4, controllable: true, lastAccessed: 100 },
      { id: 5, controllable: true, lastAccessed: 200 },
    ],
    openTabIds: [3, 4, 5],
  });
  assert.deepEqual(r, { tabId: 5, frameId: undefined, reason: 'audible' });
});

test('sin candidatos devuelve null', () => {
  assert.equal(selectTargetTab({ openTabIds: [] }), null);
  assert.equal(selectTargetTab(undefined), null);
  assert.equal(selectTargetTab({ audibleTabs: [{ id: 1 }], openTabIds: [] }), null);
});

test('forgetTab limpia referencias sin mutar la entrada', () => {
  const state = { pinned: { tabId: 1 }, lastMedia: { tabId: 1, frameId: 0 }, other: true };
  const next = forgetTab(state, 1);
  assert.deepEqual(next, { pinned: null, lastMedia: null, other: true });
  assert.deepEqual(state.pinned, { tabId: 1 });
  assert.deepEqual(forgetTab(state, 2), state);
});
