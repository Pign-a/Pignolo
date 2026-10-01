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
const add = (repo, id, text, quote, extra = []) => plan(repo, ['decision', 'add', '--plan', 'p1', '--id', id, '--text-file', file(text), '--quote-file', file(quote), ...(extra.includes('--date') ? [] : ['--date', '2026-10-01']), ...extra]);

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

// Protects: spec §4.5 (solo una decisión vigente, humana y de ESTE plan respalda una cita) · Breaks if:
// backingDecisions deja de filtrar status/source/plan (una reemplazada o abierta volvería a respaldar citas).
test('only a current, human, same-plan decision backs a quote: superseded, open and non-human entries do not', () => {
  const repo = repoWithPlan();
  const dec = require(path.join(PLUGIN_ROOT, 'lib', 'decisions.js'));
  add(repo, 'D-1', 'vieja', 'cita de la vieja');
  add(repo, 'D-2', 'vigente', 'cita de la vigente');
  assert.strictEqual(store.setStatus({ main: repo, kind: 'decisions', id: '2026-10-01-p1-d-1', status: 'superseded' }).ok, true);
  const forged = (id, status, source) => store.writeEntry({ main: repo, kind: 'decisions', id: `2026-10-01-p1-${id}`, fields: { status, source, plan: 'p1', decision: id.toUpperCase(), created: '2026-10-01' }, body: `# ${id}\n\n- quote: cita ${id}\n\ntexto\n` });
  assert.ok(forged('d-3', 'open', 'human').ok);
  assert.ok(forged('d-4', 'decided', 'agent').ok);
  assert.deepStrictEqual(dec.backingDecisions({ main: repo, plan: 'p1' }).map((d) => d.id), ['D-2']);
  const card = (q) => plan(repo, ['scope-card', 'save', '--plan', 'p1', '--file', file(`# T\n\n## Goal\ng\n\n## Acceptance examples\n- Con "${REQUEST.slice(0, 12)}" a\n- Con "${REQUEST.slice(6, 20)}" b\n- Con "${q}" c\n\n## Request to spec\n- x\n\n## Not included or reinterpreted\n- none\n\n## Added without being asked\n- none\n\n## Out of scope\n- x\n\n## Reserved decisions\n- none\n\n## Cost estimate\n- x\n`)]).status;
  assert.strictEqual(card('cita de la vieja'), 1, 'reemplazada');
  assert.strictEqual(card('cita d-3'), 1, 'abierta');
  assert.strictEqual(card('cita d-4'), 1, 'no humana');
  assert.strictEqual(card('cita de la vigente'), 0, 'vigente');
});

// Protects: spec §4.5 (el archivado no deja sin respaldo a un plan vivo) · Breaks if: listDecisions
// vuelve a leer solo decisions/ y no archive/.
test('an archived decision still backs its quote and still blocks re-adding its id', () => {
  const repo = repoWithPlan();
  assert.strictEqual(add(repo, 'D-1', 'Un lienzo por proyecto', 'sí, un solo lienzo por proyecto', ['--date', '2026-09-01']).status, 0);
  const { archiveEntries } = require(path.join(PLUGIN_ROOT, 'lib', 'archive.js'));
  const moved = archiveEntries({ main: repo, days: 14, now: Date.parse('2026-10-01') });
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'state', 'archive', '2026-09-01-p1-d-1.md')), JSON.stringify(moved));
  assert.deepStrictEqual(require(path.join(PLUGIN_ROOT, 'lib', 'decisions.js')).backingDecisions({ main: repo, plan: 'p1' }).map((d) => d.id), ['D-1']);
  const again = add(repo, 'D-1', 'otro texto', 'otra cita', ['--date', '2026-10-02']);
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /ya existe/);
});

// Protects: M2 de la revisión · Breaks if: DECISION_ID_RE vuelve a aceptar D-01 / D-0.
test('decision ids have no leading zero: D-01 and D-0 are refused', () => {
  const repo = repoWithPlan();
  assert.strictEqual(add(repo, 'D-1', 'a', 'dale').status, 0);
  assert.strictEqual(add(repo, 'D-01', 'b', 'dale').status, 1);
  assert.strictEqual(add(repo, 'D-0', 'b', 'dale').status, 1);
});

// Protects: la mutación "control de duplicado apagado" · Breaks if: addDecision no mira las ya registradas
// (con otra fecha el nombre de archivo cambia, así que writeEntry no lo frena solo).
test('repeating an id with another date is refused by the duplicate check, not by the file name', () => {
  const repo = repoWithPlan();
  assert.strictEqual(add(repo, 'D-1', 'a', 'dale').status, 0);
  const r = add(repo, 'D-1', 'b', 'dale', ['--date', '2026-10-05']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /ya existe la decisión D-1/);
});
