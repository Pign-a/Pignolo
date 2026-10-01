'use strict';
// Decisiones de diseño del autor (D-<n>) en .pignolo/state/decisions/ (verbo `plan.js decision`)
// y el status de las decisiones de aprobados visuales. Protege que una decisión lleve la cita
// literal del autor y que lo que escribe cada camino sea un status que state-store reconoce.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
const ap = require(path.join(PLUGIN_ROOT, 'lib', 'approved.js'));

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'plan.js');
const REQUEST = 'Quiero un lienzo por proyecto.';

function plan(cwd, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stderr: r.stderr };
}
function file(text, name = 'f.txt') {
  const p = path.join(makeTempDir('decisions-'), name);
  fs.writeFileSync(p, text);
  return p;
}
function repoWithPlan() {
  const repo = makeRepo();
  assert.strictEqual(plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST)]).status, 0);
  return repo;
}
const add = (repo, id, text, quote, extra = []) => plan(repo, ['decision', 'add', '--plan', 'p1', '--id', id, '--text-file', file(text), '--quote-file', file(quote), '--date', '2026-10-01', ...extra]);

test('decision add writes a decided entry with the quote, and decision list reads it back', () => {
  const repo = repoWithPlan();
  const r = add(repo, 'D-1', 'Un solo lienzo por proyecto, que crece.', 'sí, un solo lienzo y que crezca');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.out.ok, true);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'state', 'decisions', '2026-10-01-p1-d-1.md')));
  const read = store.readEntries({ main: repo, kind: 'decisions' });
  assert.deepStrictEqual(read.errors, []);
  assert.strictEqual(read.entries[0].status, 'decided');
  const l = plan(repo, ['decision', 'list', '--plan', 'p1']);
  assert.strictEqual(l.status, 0, l.stderr);
  assert.deepStrictEqual(l.out.decisions.map((d) => [d.id, d.text, d.quote]), [['D-1', 'Un solo lienzo por proyecto, que crece.', 'sí, un solo lienzo y que crezca']]);
});

test('decision add refuses an empty or blank quote, an empty text, a bad id and a repeated id', () => {
  const repo = repoWithPlan();
  assert.strictEqual(add(repo, 'D-1', 'algo', '').status, 1);
  assert.strictEqual(add(repo, 'D-1', 'algo', ' \n ').status, 1);
  assert.strictEqual(add(repo, 'D-1', '  ', 'dale').status, 1);
  assert.strictEqual(add(repo, 'decision-1', 'algo', 'dale').status, 1);
  assert.strictEqual(add(repo, 'D-1', 'algo', 'dale').status, 0);
  const again = add(repo, 'D-1', 'otra cosa', 'dale');
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /ya existe/);
  assert.strictEqual(plan(repo, ['decision', 'list', '--plan', 'p1']).out.decisions.length, 1);
});

test('decision add needs an existing plan and list shows only that plan', () => {
  const repo = repoWithPlan();
  const r = plan(repo, ['decision', 'add', '--plan', 'nope', '--id', 'D-1', '--text-file', file('x'), '--quote-file', file('dale')]);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(plan(repo, ['new', '--plan', 'p2', '--request-file', file(REQUEST)]).status, 0);
  add(repo, 'D-1', 'de p1', 'dale');
  const p2 = plan(repo, ['decision', 'add', '--plan', 'p2', '--id', 'D-1', '--text-file', file('de p2'), '--quote-file', file('listo'), '--date', '2026-10-01']);
  assert.strictEqual(p2.status, 0, p2.stderr);
  assert.deepStrictEqual(plan(repo, ['decision', 'list', '--plan', 'p1']).out.decisions.map((d) => d.text), ['de p1']);
});

test('a multi-line quote is kept on one line and the text keeps its lines', () => {
  const repo = repoWithPlan();
  add(repo, 'D-2', 'linea uno\nlinea dos', 'dale\n  con todo');
  const d = plan(repo, ['decision', 'list', '--plan', 'p1']).out.decisions[0];
  assert.strictEqual(d.quote, 'dale con todo');
  assert.strictEqual(d.text, 'linea uno\nlinea dos');
});

test('the status of an approved-visual decision is one that state-store knows (closable and archivable)', () => {
  const root = makeTempDir('decisions-ap-');
  const r = ap.recordDecision({ projectRoot: root, path: 'design/approved/checkout', manifestSha256: 'a'.repeat(64), quote: 'dale', date: '2026-09-30' });
  assert.ok(r.file, r.error);
  const entry = store.readEntries({ main: root, kind: 'decisions' }).entries[0];
  assert.ok(store.STATUSES.decisions.includes(entry.status), `status ${entry.status}`);
  assert.strictEqual(store.setStatus({ main: root, kind: 'decisions', id: entry.id, status: 'superseded' }).ok, true);
});
