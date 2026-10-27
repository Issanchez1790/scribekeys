'use strict';
/*
 * Coherencia de los textos de la ficha de la Chrome Web Store (store/listing/*.json)
 * con los idiomas de la extensión y con los límites de la tienda.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LISTING_DIR = path.join(ROOT, 'store', 'listing');
const locales = fs.readdirSync(path.join(ROOT, '_locales')).sort();
const listings = Object.fromEntries(
  fs
    .readdirSync(LISTING_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(LISTING_DIR, f), 'utf8'))])
);

test('ficha: una por cada idioma de la extensión', () => {
  assert.deepEqual(Object.keys(listings).sort(), locales);
});

test('ficha: misma estructura en todos los idiomas', () => {
  for (const [lang, l] of Object.entries(listings)) {
    assert.ok(Array.isArray(l.description) && l.description.length > 5, `${lang}: description`);
    assert.equal(l.screenshots.length, 3, `${lang}: tres capturas`);
    for (const s of l.screenshots) assert.ok(s.title && s.subtitle, `${lang}: título y subtítulo`);
    assert.ok(l.promo, `${lang}: promo`);
    assert.ok(l.mock.player && l.mock.editor && l.mock.transcript.length >= 3, `${lang}: mock`);
  }
});

test('ficha: dentro de los límites de la tienda', () => {
  for (const [lang, l] of Object.entries(listings)) {
    // La descripción detallada admite hasta 16 000 caracteres.
    assert.ok(l.description.join('\n').length <= 16000, `${lang}: descripción demasiado larga`);
    for (const s of l.screenshots) {
      assert.ok(s.title.length <= 48, `${lang}: título de captura largo para 1280 px: «${s.title}»`);
      assert.ok(s.subtitle.length <= 100, `${lang}: subtítulo largo: «${s.subtitle}»`);
    }
    assert.ok(l.promo.length <= 60, `${lang}: texto del mosaico largo`);
  }
});

test('ficha: las marcas de tiempo del ejemplo usan el formato por defecto', () => {
  for (const [lang, l] of Object.entries(listings)) {
    for (const line of l.mock.transcript) assert.match(line, /^\[\d{2}:\d{2}:\d{2}\] /, `${lang}: ${line}`);
  }
});

test('la política de privacidad existe y declara que no hay red', () => {
  const policy = fs.readFileSync(path.join(ROOT, 'PRIVACY.md'), 'utf8');
  assert.match(policy, /no network requests/i);
  assert.match(policy, /no hace peticiones de red/i);
});
