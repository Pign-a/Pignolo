import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';
import { findLeaks, checkLeaks } from '../lib/leak-check.mjs';

// Synthetic identities only: nothing here belongs to a real person or machine.
const VALUES = ['ana.perez@example.com', 'Ana Pérez', 'aperez'];

test('user values are found without case, with their line', () => {
  const text = '<p>Hola</p>\n<p>Contacto: ANA.PEREZ@example.com</p>\n<footer>hecho por ana pérez</footer>\n';
  assert.deepEqual(findLeaks(text, VALUES), [
    { kind: 'value', index: 0, line: 2 },
    { kind: 'value', index: 1, line: 3 },
  ]);
  assert.deepEqual(findLeaks('<p>‹Nombre›</p>\n', VALUES), []);
});

test('absolute local paths of Windows, macOS and Linux are found; relative ones and URLs are not', () => {
  const leaks = (s) => findLeaks(s, []).map((l) => l.match);
  assert.deepEqual(leaks('<img src="C:\\Users\\x\\a.png">'), ['C:\\']);
  assert.deepEqual(leaks('ver D:/proyectos/app'), ['D:/']);
  assert.deepEqual(leaks('/Users/aperez/app/page.tsx'), ['/Users/']);
  assert.deepEqual(leaks('cd /home/aperez/app'), ['/home/']);
  assert.deepEqual(leaks('<a href="https://example.com/home/x">x</a> src/home/a.png ../Users/b mailto:x@example.com'), []);
});

test('short values are ignored so a two-letter user does not flag every word', () => {
  assert.deepEqual(findLeaks('mi casa', ['mi', '']), []);
});

test('checkLeaks scans every file and never echoes the values back', () => {
  const dir = writeTree(makeTempDir(), {
    'home.html': '<p>ok</p>\n',
    'detail.html': '<p>aperez</p>\n<p>/home/someone/x</p>\n',
  });
  const r = checkLeaks(dir, VALUES);
  assert.deepEqual(r.leaks, [
    { file: 'detail.html', kind: 'value', index: 2, line: 1 },
    { file: 'detail.html', kind: 'path', match: '/home/', line: 2 },
  ]);
  assert.ok(!JSON.stringify(r).includes('aperez'));
  assert.deepEqual(checkLeaks(writeTree(makeTempDir(), { 'a.html': '<p>‹Dato›</p>' }), VALUES).leaks, []);
});

test('CLI: exit 0 clean, 1 with a leak, 2 on a bad values file', () => {
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, JSON.stringify(VALUES));
  const clean = writeTree(makeTempDir(), { 'a.html': '<p>ok</p>' });
  let out = runScript('leak-check.mjs', ['--dir', clean, '--values-file', values]);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.json, { ok: true, leaks: [] });
  out = runScript('leak-check.mjs', ['--dir', writeTree(makeTempDir(), { 'a.html': 'Ana Pérez' }), '--values-file', values]);
  assert.equal(out.status, 1);
  assert.equal(out.json.ok, false);
  fs.writeFileSync(values, '{"not":"a list"}');
  out = runScript('leak-check.mjs', ['--dir', clean, '--values-file', values]);
  assert.equal(out.status, 2);
});
