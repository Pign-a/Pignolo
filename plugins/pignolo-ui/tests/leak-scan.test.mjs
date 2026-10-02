import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree } from './helpers.mjs';
import { scanBytes, decodeEntities, diffStrings } from '../lib/leak-scan.mjs';

const VALUES = ['Pérez & Hijos', 'otro-valor-largo'];
const dirWith = (tree) => writeTree(makeTempDir(), tree);
const scan = (tree, values = VALUES, extra = {}) => { const dir = dirWith(tree); return scanBytes({ roots: [{ dir, expect: dir }], values, ...extra }); };
const codes = (r) => r.problems.map((p) => p.code);

test('fails closed: [] and one value are no-leak-values even over a folder that has a name and a mail (C-04, D-4c-16)', () => {
  const tree = { 'a.html': '<p>Pérez & Hijos pérez@ejemplo.test</p>' };
  assert.deepEqual(codes(scan(tree, [])), ['no-leak-values']);
  assert.deepEqual(codes(scan(tree, ['Pérez & Hijos'])), ['no-leak-values']);
  assert.deepEqual(codes(scan(tree, ['Pérez & Hijos', 'Pérez & Hijos'])), ['no-leak-values'], 'the same value twice is one value');
  assert.deepEqual(codes(scan(tree, ['ab', 'cd'])), ['no-leak-values'], 'values shorter than 3 characters do not count');
  assert.equal(scan({ 'a.html': '<p>nada</p>' }).ok, true);
});

test('a root without files is no-files; a missing root is root-missing', () => {
  const empty = makeTempDir();
  assert.deepEqual(codes(scanBytes({ roots: [{ dir: empty, expect: empty }], values: VALUES })), ['no-files']);
  fs.mkdirSync(path.join(empty, 'sub'));
  assert.deepEqual(codes(scanBytes({ roots: [{ dir: empty, expect: empty }], values: VALUES })), ['no-files'], 'empty folders only');
  assert.deepEqual(codes(scanBytes({ roots: [{ dir: path.join(empty, 'nada'), expect: empty }], values: VALUES })), ['root-missing']);
});

test('every encoding of the same value is a leak (C-05) and the problem never repeats the value', () => {
  const same = {
    'plain.html': '<p>Pérez & Hijos</p>',
    'named.html': '<p>P&eacute;rez &amp; Hijos</p>',
    'amp.html': '<p>Pérez &amp; Hijos</p>',
    'dec.html': '<p>P&#233;rez &amp; Hijos</p>',
    'hex.html': '<p>P&#xe9;rez &amp; Hijos</p>',
    'value.json': JSON.stringify({ n: 'Pérez & Hijos' }),
    'key.json': JSON.stringify({ 'Pérez & Hijos': 1 }),
    'nfd.html': `<p>${'Pérez & Hijos'.normalize('NFD')}</p>`,
    'escaped.json': '{"n":"P\\u00e9rez \\u0026 Hijos"}',
  };
  for (const [name, content] of Object.entries(same)) {
    const r = scan({ [name]: content });
    assert.ok(codes(r).includes('leak'), `${name}: ${JSON.stringify(r.problems)}`);
    assert.ok(!JSON.stringify(r).includes('Hijos'), `${name}: the value is echoed`);
  }
  const quoted = scan({ 'q.json': JSON.stringify({ n: 'Ana "Pepe" Gómez' }) }, ['Ana "Pepe" Gómez', 'otro-valor-largo']);
  assert.ok(codes(quoted).includes('leak'));
  assert.equal(scan({ 'ok.html': '<p>Pérez sin el resto</p>' }).ok, true);
});

test('more views (A4C2-16): +, %20, &nbsp;, double space, a line break, a tag in the middle, %40 in a mailto', () => {
  const values = ['Juan Perez', 'juan@ejemplo.test'];
  const leaks = {
    'plus.html': '<link href="https://x.test/css2?family=Juan+Perez">',
    'pct.html': '<a href="/x/Juan%20Perez">x</a>',
    'nbsp.html': '<p>Juan&nbsp;Perez</p>',
    'two.html': '<p>Juan  Perez</p>',
    'nl.html': '<p>Juan\nPerez</p>',
    'tag.html': '<p><b>Juan</b> Perez</p>',
    'mail.html': '<a href="mailto:juan%40ejemplo.test">x</a>',
  };
  for (const [name, content] of Object.entries(leaks)) assert.ok(codes(scan({ [name]: content }, values)).includes('leak'), name);
  assert.equal(scan({ 'only.html': '<p>solo Juan</p>' }, values).ok, true);
});

test('loose texts get the same views (titles, notes, params)', () => {
  const dir = dirWith({ 'a.html': '<p>nada</p>' });
  const r = scanBytes({ roots: [{ dir, expect: dir }], texts: [{ label: 'canvasTitle', text: 'Informe de P&eacute;rez &amp; Hijos' }], values: VALUES });
  assert.deepEqual(r.problems.map((p) => [p.code, p.file]), [['leak', 'canvasTitle']]);
});

test('absolute local paths are a leak of kind path', () => {
  const r = scan({ 'a.html': '<p>C:\\Users\\persona\\x</p>' });
  assert.ok(r.problems.some((p) => p.code === 'leak' && p.kind === 'path'));
});

test('a root that is a link is root-is-link and its target is never read; a link inside is link-in-output (C-07)', (t) => {
  const target = dirWith({ 'a.html': '<p>Pérez & Hijos</p>' });
  const holder = makeTempDir();
  const link = path.join(holder, 'canvas');
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`sin permiso para crear enlaces (${e.code})`); return; }
  const r = scanBytes({ roots: [{ dir: link, expect: path.join(holder, 'canvas') }], values: VALUES });
  assert.deepEqual(codes(r), ['root-is-link']);
  const real = dirWith({ 'ok.html': '<p>x</p>' });
  fs.symlinkSync(target, path.join(real, 'enlace'), 'junction');
  const inner = scanBytes({ roots: [{ dir: real, expect: real }], values: VALUES });
  assert.ok(codes(inner).includes('link-in-output'));
  assert.ok(!codes(inner).includes('leak'), 'the target of the link is not followed');
});

test('an entry that cannot be read is unreadable-entry, never a stack and never "no leaks"', () => {
  const dir = dirWith({ 'a.html': '<p>x</p>', 'b.html': '<p>y</p>' });
  const readFile = (file, enc) => { if (file.endsWith('b.html')) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); return fs.readFileSync(file, enc); };
  const r = scanBytes({ roots: [{ dir, expect: dir }], values: VALUES, readFile });
  assert.deepEqual(r.problems.map((p) => [p.code, p.file]), [['unreadable-entry', `${path.basename(dir)}/b.html`]]);
});

test('skipFiles leaves the named files out', () => {
  const r = scan({ 'a.html': '<p>x</p>', 'live.json': '{"n":"Pérez & Hijos"}' }, VALUES, { skipFiles: ['live.json'] });
  assert.equal(r.ok, true);
});

test('decodeEntities: the five basics, numeric forms and the Latin-1 names', () => {
  assert.equal(decodeEntities('&amp;&lt;&gt;&quot;&apos;'), '&<>"\'');
  assert.equal(decodeEntities('&#233;&#xe9;&eacute;&ntilde;&Eacute;'), 'éééñÉ');
  assert.equal(decodeEntities('&nbsp;'), '\u00a0');
  assert.equal(decodeEntities('&nombreraro;'), '&nombreraro;');
});

test('T7d diffStrings: only what the combined index adds or changes (new keys included) is looked at; what the live one had is not', () => {
  const base = { title: 'Mi lienzo', pages: [{ id: 'r1', name: 'new' }], notes: { ajena: { text: 'Persona Ejemplo' } }, order: ['a'] };
  assert.deepEqual(diffStrings(JSON.parse(JSON.stringify(base)), base), []);
  const next = JSON.parse(JSON.stringify(base));
  next.pages.push({ id: 'r2', name: 'improve' });
  next.notes.nuestra = { text: 'Opción A' };
  next.order.push('b');
  next.title = 'otro título';
  assert.deepEqual([...diffStrings(next, base)].sort(), ['Opción A', 'b', 'id', 'improve', 'name', 'nuestra', 'otro título', 'r2', 'text']);
  // the note of someone else is not in the diff; a new key with a value is
  assert.ok(!diffStrings(next, base).includes('Persona Ejemplo'));
  const planted = JSON.parse(JSON.stringify(base));
  planted.notes.nueva = { text: 'Persona Ejemplo' };
  assert.ok(diffStrings(planted, base).includes('Persona Ejemplo'));
  // nothing to compare with: everything is new
  assert.ok(diffStrings({ a: 'x' }, null).includes('x'));
});
