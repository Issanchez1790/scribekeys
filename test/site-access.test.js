'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sa = require('../lib/site-access.js');

test('originFromUrl solo acepta http(s)', () => {
  assert.equal(sa.originFromUrl('https://www.youtube.com/watch?v=1'), 'https://www.youtube.com');
  assert.equal(sa.originFromUrl('http://localhost:8080/test/demo.html'), 'http://localhost');
  assert.equal(sa.originFromUrl('chrome://extensions'), null);
  assert.equal(sa.originFromUrl('file:///C:/a.html'), null);
  assert.equal(sa.originFromUrl('no es url'), null);
  assert.equal(sa.originFromUrl(undefined), null);
});

test('patternForUrl omite puerto y ruta', () => {
  assert.equal(sa.patternForUrl('https://drive.google.com/file/d/x/view'), 'https://drive.google.com/*');
  assert.equal(sa.patternForUrl('http://127.0.0.1:5500/'), 'http://127.0.0.1/*');
});

test('ids de script reversibles', () => {
  const p = 'https://www.youtube.com/*';
  const id = sa.scriptIdForPattern(p);
  assert.ok(!id.startsWith('_'), 'Chrome no admite ids que empiecen por _');
  assert.equal(sa.patternFromScriptId(id), p);
  assert.equal(sa.patternFromScriptId('otro'), null);
});

test('hostLabel', () => {
  assert.equal(sa.hostLabel('https://www.youtube.com/*'), 'www.youtube.com');
  assert.equal(sa.hostLabel('*://*/*'), '*');
});

test('reconcile registra lo concedido y quita lo revocado', () => {
  const granted = ['https://a.com/*', 'https://b.com/*', 'chrome://favicon/*'];
  const registered = [sa.scriptIdForPattern('https://b.com/*'), sa.scriptIdForPattern('https://c.com/*'), 'ajeno'];
  assert.deepEqual(sa.reconcile(granted, registered), {
    toRegister: ['https://a.com/*'],
    toUnregister: [sa.scriptIdForPattern('https://c.com/*')],
  });
});

test('reconcile acepta el comodín de "en todos los sitios"', () => {
  assert.deepEqual(sa.reconcile(['https://*/*', 'http://*/*'], []).toRegister, ['http://*/*', 'https://*/*']);
});

test('reconcile sin datos', () => {
  assert.deepEqual(sa.reconcile(undefined, undefined), { toRegister: [], toUnregister: [] });
});

test('embeddedPatterns sugiere solo otros sitios http(s)', () => {
  const r = sa.embeddedPatterns(
    ['https://www.youtube.com/embed/x', 'https://www.youtube.com/embed/y', 'about:blank', '/relativo', 'https://app.com/a'],
    'https://app.com/editor'
  );
  assert.deepEqual(r, ['https://www.youtube.com/*']);
});
