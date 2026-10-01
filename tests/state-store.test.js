'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));

const FULL = `---
id: 2026-09-30-fix-lock
status: open
evidence: tests/shadow.test.js
source: session
superseded_by:
created: 2026-09-30
review_after: 2026-10-30
---
# Arreglar el lock de la siembra

El lock se roba a los 10 minutos aunque el gc siga corriendo.

Más detalle.
`;

function write(main, kind, id, text) {
  const dir = store.stateDir(main, kind);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), text);
}
const withId = (id, extra = '') => FULL.replace('id: 2026-09-30-fix-lock', `id: ${id}${extra}`);

test('KINDS, STATUSES and ID_RE are the closed sets of R-1', () => {
  assert.deepStrictEqual([...store.KINDS], ['work', 'decisions', 'issues', 'learnings/proposed', 'learnings/accepted', 'learnings/rejected', 'sessions', 'metrics', 'archive']);
  assert.deepStrictEqual([...store.STATUSES.work], ['open', 'closed']);
  assert.deepStrictEqual([...store.STATUSES.decisions], ['open', 'decided', 'superseded']);
  assert.deepStrictEqual([...store.STATUSES['learnings/proposed']], ['proposed', 'accepted', 'rejected']);
  assert.ok(store.ID_RE.test('2026-09-30-a'));
  assert.ok(!store.ID_RE.test('2026-09-30-'));
  assert.ok(!store.ID_RE.test('Foo bar'));
});

test('parseEntry: a complete entry gives title, first line and normal priority', () => {
  const r = store.parseEntry(FULL);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.entry.id, '2026-09-30-fix-lock');
  assert.strictEqual(r.entry.status, 'open');
  assert.strictEqual(r.entry.priority, 'normal');
  assert.strictEqual(r.entry.title, 'Arreglar el lock de la siembra');
  assert.strictEqual(r.entry.line, 'El lock se roba a los 10 minutos aunque el gc siga corriendo.');
  assert.strictEqual(r.entry.fields.evidence, 'tests/shadow.test.js');
});

test('parseEntry: the line is cut at 140 characters and high priority is kept', () => {
  const long = 'x'.repeat(200);
  const r = store.parseEntry(withId('2026-09-30-a', '\npriority: high').replace(/El lock.*\n/, `${long}\n`));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.entry.priority, 'high');
  assert.strictEqual(r.entry.line.length, 140);
});

test('parseEntry: without frontmatter, with an unknown priority or without status it fails', () => {
  assert.strictEqual(store.parseEntry('# Solo cuerpo\n\ntexto\n').ok, false);
  const urgent = store.parseEntry(withId('2026-09-30-a', '\npriority: urgent'));
  assert.strictEqual(urgent.ok, false);
  assert.match(urgent.error, /priority/);
  const noStatus = store.parseEntry(FULL.replace('status: open\n', ''));
  assert.strictEqual(noStatus.ok, false);
  assert.match(noStatus.error, /status/);
  assert.strictEqual(store.parseEntry('---\nid: 2026-09-30-a\nstatus: open\n').ok, false);
});

test('readEntries: an id different from the file name goes to errors', () => {
  const main = makeTempDir('pignolo-state-');
  write(main, 'work', '2026-09-30-other', FULL);
  const r = store.readEntries({ main, kind: 'work' });
  assert.deepStrictEqual(r.entries, []);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].file, /2026-09-30-other\.md$/);
  assert.match(r.errors[0].error, /no coincide/);
});

test('readEntries: 3 valid and 1 truncated give 3 entries and 1 error with the file name; missing folder is empty', () => {
  const main = makeTempDir('pignolo-state-');
  for (const id of ['2026-09-01-a', '2026-09-02-b', '2026-09-03-c']) write(main, 'issues', id, withId(id));
  write(main, 'issues', '2026-09-04-d', '---\nid: 2026-09-04-d\nstatus: op');
  const r = store.readEntries({ main, kind: 'issues' });
  assert.deepStrictEqual(r.entries.map((e) => e.id), ['2026-09-01-a', '2026-09-02-b', '2026-09-03-c']);
  assert.strictEqual(r.entries[0].kind, 'issues');
  assert.strictEqual(r.entries[0].name, '2026-09-01-a.md');
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].file, /2026-09-04-d\.md$/);
  assert.deepStrictEqual(store.readEntries({ main, kind: 'decisions' }), { entries: [], errors: [] });
});

test('writeEntry creates the file with LF, without BOM, and the entry reads back', () => {
  const main = makeTempDir('pignolo-state-');
  const r = store.writeEntry({ main, kind: 'work', id: '2026-09-30-a', fields: { status: 'open', evidence: 'x', created: '2026-09-30' }, body: '# Título\r\n\r\nLínea.\r\n' });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const text = fs.readFileSync(r.file, 'utf8');
  assert.ok(!text.includes('\r'));
  assert.notStrictEqual(text.charCodeAt(0), 0xFEFF);
  assert.ok(text.startsWith('---\nid: 2026-09-30-a\nstatus: open\n'));
  const back = store.readEntries({ main, kind: 'work' });
  assert.strictEqual(back.entries.length, 1);
  assert.strictEqual(back.entries[0].title, 'Título');
  assert.strictEqual(back.entries[0].line, 'Línea.');
});

test('writeEntry refuses a duplicate id and leaves the original intact', () => {
  const main = makeTempDir('pignolo-state-');
  const first = store.writeEntry({ main, kind: 'work', id: '2026-09-30-a', fields: { status: 'open' }, body: 'original\n' });
  assert.strictEqual(first.ok, true);
  const before = fs.readFileSync(first.file, 'utf8');
  const dup = store.writeEntry({ main, kind: 'work', id: '2026-09-30-a', fields: { status: 'closed' }, body: 'otro\n' });
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.refused, 'exists');
  assert.strictEqual(fs.readFileSync(first.file, 'utf8'), before);
});

test('writeEntry refuses invalid kind, id and status with the structured reason', () => {
  const main = makeTempDir('pignolo-state-');
  const kind = store.writeEntry({ main, kind: 'plans', id: '2026-09-30-a', fields: { status: 'open' } });
  assert.deepStrictEqual([kind.ok, kind.refused], [false, 'invalid-kind']);
  const id = store.writeEntry({ main, kind: 'work', id: 'Foo bar', fields: { status: 'open' } });
  assert.deepStrictEqual([id.ok, id.refused], [false, 'invalid-id']);
  const status = store.writeEntry({ main, kind: 'decisions', id: '2026-09-30-a', fields: { status: 'closed' } });
  assert.deepStrictEqual([status.ok, status.refused], [false, 'invalid-status']);
  assert.match(status.reason, /decided/);
  assert.ok(!fs.existsSync(store.stateDir(main, 'work')) || fs.readdirSync(store.stateDir(main, 'work')).length === 0);
});

test('writeEntry is atomic: a failed rename leaves no .tmp and no entry', () => {
  const main = makeTempDir('pignolo-state-');
  const real = fs.renameSync;
  fs.renameSync = () => { const e = new Error('simulated'); e.code = 'EPERM'; throw e; };
  try {
    assert.throws(() => store.writeEntry({ main, kind: 'work', id: '2026-09-30-a', fields: { status: 'open' }, body: 'x\n' }), /simulated/);
  } finally { fs.renameSync = real; }
  const names = fs.readdirSync(store.stateDir(main, 'work'));
  assert.deepStrictEqual(names, []);
});

test('setStatus changes only the status line; the rest of the file is byte for byte the same', () => {
  const main = makeTempDir('pignolo-state-');
  write(main, 'work', '2026-09-30-fix-lock', FULL);
  const r = store.setStatus({ main, kind: 'work', id: '2026-09-30-fix-lock', status: 'closed' });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const after = fs.readFileSync(path.join(store.stateDir(main, 'work'), '2026-09-30-fix-lock.md'), 'utf8');
  assert.strictEqual(after, FULL.replace('status: open', 'status: closed'));
  const sup = store.setStatus({ main, kind: 'work', id: '2026-09-30-fix-lock', status: 'closed', supersededBy: '2026-10-01-x' });
  assert.strictEqual(sup.ok, true);
  const text = fs.readFileSync(sup.file, 'utf8');
  assert.ok(text.includes('\nsuperseded_by: 2026-10-01-x\n'));
  assert.strictEqual(text.split('superseded_by').length, 2);
});

test('setStatus: accepted and rejected are terminal; a missing id and an invalid status are refused', () => {
  const main = makeTempDir('pignolo-state-');
  write(main, 'learnings/accepted', '2026-09-30-a', withId('2026-09-30-a').replace('status: open', 'status: accepted'));
  const r = store.setStatus({ main, kind: 'learnings/accepted', id: '2026-09-30-a', status: 'proposed' });
  assert.deepStrictEqual([r.ok, r.refused], [false, 'terminal']);
  const same = store.setStatus({ main, kind: 'learnings/accepted', id: '2026-09-30-a', status: 'accepted' });
  assert.strictEqual(same.ok, true);
  const missing = store.setStatus({ main, kind: 'work', id: '2026-09-30-nope', status: 'closed' });
  assert.deepStrictEqual([missing.ok, missing.refused], [false, 'missing']);
  const bad = store.setStatus({ main, kind: 'work', id: '2026-09-30-nope', status: 'decided' });
  assert.deepStrictEqual([bad.ok, bad.refused], [false, 'invalid-status']);
});
