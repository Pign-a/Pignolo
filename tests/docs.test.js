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
    assert.match(t, new RegExp(`/pignolo:${c}(?![-\\w])`), `falta /pignolo:${c}`);
  }
});

test('SECURITY y el README no ofrecen pignolo-ui ni pignolo-panel: el README solo los nombra para desinstalarlos', () => {
  assert.ok(!read('SECURITY.md').includes('pignolo-panel'), 'SECURITY.md: menciona pignolo-panel');
  assert.ok(!read('SECURITY.md').includes('/plugin install pignolo-ui'), 'SECURITY.md: instala pignolo-ui');
  const t = read('README.md');
  assert.ok(!/install pignolo-(ui|panel)/.test(t), 'README.md: instala un plugin retirado');
  for (const line of t.split('\n').filter((l) => /pignolo-(ui|panel)/.test(l))) {
    assert.match(line, /desinstal/i, `el README nombra un plugin retirado fuera del aviso de desinstalación: ${line}`);
  }
});

test('README y CHANGELOG piden desinstalar pignolo-ui y pignolo-panel desde /plugin, con el motivo', () => {
  for (const f of ['README.md', 'CHANGELOG.md']) {
    const text = read(f);
    const sec = f === 'CHANGELOG.md' ? text.split(/^## /m).find((s) => s.startsWith('1.0.0')) : text;
    const line = sec.split('\n').find((l) => /desinstal/i.test(l) && l.includes('pignolo-ui') && l.includes('pignolo-panel'));
    assert.ok(line, `${f}: falta la línea que pide desinstalar pignolo-ui y pignolo-panel`);
    assert.match(line, /\/plugin/, `${f}: no dice dónde desinstalar`);
    assert.match(line, /compiten con `ui` y `ui-audit`/, `${f}: no da el motivo`);
    assert.ok(!/plugin uninstall/.test(line), `${f}: afirma una sintaxis de CLI`);
  }
});

test('STATE.md: T10 hecha (3e25531) y la skill personal document-session compite con session', () => {
  const t = read('docs/STATE.md');
  assert.match(t, /T10[^\n]*3e25531/);
  assert.ok(!/- T10: kit de medición/.test(t), 'T10 sigue en la lista de pendientes');
  const line = t.split('\n').find((l) => l.includes('document-session'));
  assert.ok(line, 'falta la nota de document-session');
  assert.match(line, /`session`/);
  assert.match(line, /disparadores/);
});

test('el estado nuevo existe y el anterior quedó en el historial', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/STATE.md')));
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/history/2026-10-23-estado-pignolo-0x.md')));
});
