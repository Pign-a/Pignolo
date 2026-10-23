'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('el primer encabezado de versión del CHANGELOG es la versión de plugin.json', () => {
  const version = JSON.parse(read('plugins/pignolo/.claude-plugin/plugin.json')).version;
  const m = read('CHANGELOG.md').match(/^## (\d+\.\d+\.\d+)/m);
  assert.ok(m, 'el CHANGELOG no tiene encabezados de versión');
  assert.strictEqual(m[1], version);
});

test('CLAUDE.md nombra la 1.0.0 y no conserva el método viejo', () => {
  const t = read('CLAUDE.md');
  assert.ok(t.includes('1.0.0'));
  assert.ok(!t.includes('Ciclo ejecutar → revisar → arreglar'));
});

test('el README pide las seis skills por su comando', () => {
  const t = read('README.md');
  for (const c of ['start', 'work', 'validate', 'session', 'ui', 'ui-audit']) {
    assert.match(t, new RegExp(`/pignolo:${c}(?![-\w])`), `falta /pignolo:${c}`);
  }
});

test('README y SECURITY no ofrecen pignolo-ui ni pignolo-panel', () => {
  for (const f of ['README.md', 'SECURITY.md']) {
    const t = read(f);
    assert.ok(!t.includes('/plugin install pignolo-ui'), `${f}: instala pignolo-ui`);
    assert.ok(!t.includes('pignolo-panel'), `${f}: menciona pignolo-panel`);
  }
});

test('el estado nuevo existe y el anterior quedó en el historial', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/STATE.md')));
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/history/2026-10-23-estado-pignolo-0x.md')));
});
