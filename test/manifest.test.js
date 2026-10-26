'use strict';
/*
 * Validación estática del manifest y de los recursos que referencia.
 * Se ejecuta con el resto de tests: `npm test`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { COMMANDS } = require('../lib/protocol.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const manifest = JSON.parse(read('manifest.json'));

const ALLOWED_PERMISSIONS = new Set(['storage', 'scripting', 'offscreen', 'clipboardWrite', 'activeTab']);
const GLOBAL_KEY = /^Ctrl\+Shift\+[0-9]$/;

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(rel, filter, out);
    } else if (filter(rel)) {
      out.push(rel);
    }
  }
  return out;
}

const locales = Object.fromEntries(
  fs.readdirSync(path.join(ROOT, '_locales')).map((lang) => [lang, JSON.parse(read(`_locales/${lang}/messages.json`))])
);

test('Manifest V3 con campos básicos', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.background.service_worker);
  assert.equal(manifest.background.type, undefined, 'el SW es clásico (usa importScripts)');
  assert.ok(manifest.default_locale);
});

test('permisos mínimos: nada de <all_urls> ni host_permissions fijos', () => {
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined, 'los content scripts se registran por sitio');
  assert.equal(manifest.web_accessible_resources, undefined);
  for (const p of manifest.permissions) assert.ok(ALLOWED_PERMISSIONS.has(p), `permiso no justificado: ${p}`);
  assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
  assert.deepEqual([...manifest.optional_host_permissions].sort(), ['http://*/*', 'https://*/*']);
});

test('comandos: coinciden con lib/protocol.js', () => {
  assert.deepEqual(Object.keys(manifest.commands).sort(), [...COMMANDS].sort());
});

test('comandos: máximo 4 atajos sugeridos y los globales solo con Ctrl+Shift+[0-9]', () => {
  const suggested = Object.entries(manifest.commands).filter(([, c]) => c.suggested_key);
  assert.ok(suggested.length <= 4, `hay ${suggested.length} atajos sugeridos`);
  const keys = new Set();
  for (const [name, c] of Object.entries(manifest.commands)) {
    assert.ok(c.description, `${name} sin descripción`);
    if (!c.suggested_key) continue;
    for (const key of Object.values(c.suggested_key)) {
      assert.ok(!keys.has(key), `atajo repetido ${key}`);
      keys.add(key);
      if (c.global) assert.match(key, GLOBAL_KEY, `${name}: ${key} no puede ser global`);
    }
  }
});

test('comandos: se evitan Ctrl+Shift+0 (Windows) y 7/8/9 (listas de Google Docs)', () => {
  for (const c of Object.values(manifest.commands)) {
    for (const key of Object.values(c.suggested_key || {})) assert.doesNotMatch(key, /Ctrl\+Shift\+[0789]$/);
  }
});

test('existen todos los archivos referenciados', () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const f of files) assert.ok(exists(f), `falta ${f}`);
});

test('los scripts que carga el service worker existen', () => {
  const sw = read(manifest.background.service_worker);
  const imported = [...sw.matchAll(/['"](\/?(?:lib|content)\/[\w.-]+\.js)['"]/g)].map((m) => m[1].replace(/^\//, ''));
  assert.ok(imported.length > 0);
  for (const f of imported) assert.ok(exists(f), `falta ${f}`);
});

test('los <script> y <link> de las páginas HTML existen', () => {
  for (const html of walk('.', (f) => f.endsWith('.html') && !f.startsWith('test/'))) {
    const dir = path.posix.dirname(html);
    const src = read(html);
    for (const m of src.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      const target = path.posix.normalize(path.posix.join(dir, m[1]));
      assert.ok(exists(target), `${html} referencia ${m[1]} que no existe`);
    }
    assert.doesNotMatch(src, /<script>(?!\s*<\/script>)/, `${html}: script en línea (lo bloquea la CSP de MV3)`);
    assert.doesNotMatch(src, /\son[a-z]+="/, `${html}: manejador en línea (lo bloquea la CSP de MV3)`);
  }
});

test('íconos PNG con el tamaño declarado', () => {
  for (const [size, file] of Object.entries(manifest.icons)) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} no es PNG`);
    assert.equal(buf.readUInt32BE(16), Number(size), `${file}: ancho`);
    assert.equal(buf.readUInt32BE(20), Number(size), `${file}: alto`);
  }
});

test('traducciones: mismas claves en todos los idiomas', () => {
  const [base, ...rest] = Object.keys(locales);
  assert.ok(locales[manifest.default_locale], 'falta el idioma por defecto');
  const baseKeys = Object.keys(locales[base]).sort();
  for (const lang of rest) assert.deepEqual(Object.keys(locales[lang]).sort(), baseKeys, `${lang} vs ${base}`);
  for (const [lang, msgs] of Object.entries(locales)) {
    for (const [key, v] of Object.entries(msgs)) assert.ok(v.message, `${lang}.${key} vacío`);
  }
});

test('traducciones: toda clave usada existe', () => {
  const used = new Set();
  for (const m of read('manifest.json').matchAll(/__MSG_(\w+)__/g)) used.add(m[1]);
  for (const f of walk('.', (p) => /^(popup|options|background|content|offscreen|ui)\//.test(p))) {
    const src = read(f);
    for (const m of src.matchAll(/data-i18n(?:-[a-z-]+)?="(\w+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:t|getMessage)\(\s*'(\w+)'/g)) used.add(m[1]);
  }
  for (const key of used) {
    for (const lang of Object.keys(locales)) assert.ok(locales[lang][key], `falta ${lang}.${key}`);
  }
});

test('todos los .js tienen sintaxis válida', () => {
  const files = walk('.', (f) => /\.(m?js)$/.test(f));
  for (const f of files) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  }
});

test('sin red ni analítica en el código de la extensión', () => {
  const files = walk('.', (f) => /^(lib|background|content|popup|options|offscreen|ui)\/.*\.(js|html)$/.test(f));
  for (const f of files) {
    // Los comentarios pueden contener URLs de ejemplo; el código no.
    const src = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, `${f} usa red`);
    assert.doesNotMatch(src, /https?:\/\/(?!\*)/, `${f} contiene una URL remota`);
  }
});

test('descripción dentro del límite de Chrome (132 caracteres)', () => {
  for (const [lang, msgs] of Object.entries(locales)) {
    assert.ok(msgs.extDescription.message.length <= 132, `${lang}: ${msgs.extDescription.message.length}`);
  }
});

test('placeholders de las traducciones bien formados', () => {
  for (const [lang, msgs] of Object.entries(locales)) {
    for (const [key, v] of Object.entries(msgs)) {
      const used = [...v.message.matchAll(/\$(\w+)\$/g)].map((m) => m[1].toLowerCase());
      const declared = Object.keys(v.placeholders || {});
      assert.deepEqual(used.sort(), declared.sort(), `${lang}.${key}`);
    }
  }
});
