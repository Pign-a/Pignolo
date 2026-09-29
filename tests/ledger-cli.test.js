'use strict';
// Verbos de ledger.js que usan las skills review y judgment (hito 3b).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'ledger.js');
const cli = (args, opts = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
};
const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const finding = (id, lens, location, severity, extra = {}) => ({
  id, lens, location, severity, evidence: 'observado', ...(severity === 'BLOCKER' || severity === 'CRITICAL' ? { repro: 'x' } : {}), ...extra,
});
const writeJson = (dir, name, obj) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function built(dir, reports, extra = []) {
  const files = reports.map((r, i) => writeJson(dir, `r${i}.json`, r));
  const out = path.join(dir, 'ledger.json');
  const r = cli(['build', '--sha', SHA, '--level', 'high', '--profile', 'max', '--out', out, ...extra, ...files]);
  assert.strictEqual(r.status, 0, r.stderr);
  return out;
}

test('build: prefija el id con la lente, deja todo open y valida', () => {
  const dir = makeTempDir();
  const out = built(dir, [[finding('1', 'reliability', 'src/a.js:3', 'CRITICAL')], [finding('1', 'risk', 'src/b.js:9', 'WARNING')]]);
  const l = read(out);
  assert.deepStrictEqual(l.findings.map((f) => [f.id, f.status]), [['reliability-1', 'open'], ['risk-1', 'open']]);
  assert.strictEqual(l.round, 0);
  assert.strictEqual(cli(['validate', out]).status, 0);
});

test('build: un informe vacío da un ledger válido sin hallazgos (§12: se persiste vacío)', () => {
  const dir = makeTempDir();
  const l = read(built(dir, [[]]));
  assert.deepStrictEqual(l.findings, []);
});

test('build: un hallazgo inválido (CRITICAL sin repro) → exit 1 y no escribe', () => {
  const dir = makeTempDir();
  const bad = writeJson(dir, 'bad.json', [{ id: '1', lens: 'risk', location: 'a.js:1', severity: 'CRITICAL', evidence: 'e' }]);
  const out = path.join(dir, 'ledger.json');
  const r = cli(['build', '--sha', SHA, '--level', 'high', '--profile', 'max', '--out', out, bad]);
  assert.strictEqual(r.status, 1);
  assert.ok(!fs.existsSync(out));
});

test('build --judgment: fix open, suspect suspect, conflictos open con el id del otro', () => {
  const dir = makeTempDir();
  const a = [finding('1', 'judge-a', 'src/a.js:10', 'BLOCKER'), finding('2', 'judge-a', 'src/c.js:1', 'WARNING'), finding('3', 'judge-a', 'src/d.js:5', 'BLOCKER')];
  const b = [finding('1', 'judge-b', 'src/a.js:12', 'CRITICAL'), finding('2', 'judge-b', 'src/d.js:5', 'SUGGESTION')];
  const j = cli(['judgment', writeJson(dir, 'a.json', a), writeJson(dir, 'b.json', b)]).out;
  const out = built(dir, [], ['--judgment', writeJson(dir, 'j.json', j)]);
  const byId = Object.fromEntries(read(out).findings.map((f) => [f.id, f]));
  assert.strictEqual(byId['judge-a-1'].status, 'open');
  assert.strictEqual(byId['judge-a-2'].status, 'suspect');
  assert.strictEqual(byId['judge-a-3'].conflict, 'judge-b-2');
  assert.strictEqual(byId['judge-b-2'].conflict, 'judge-a-3');
});

test('repro: CRITICAL con rojo → confirmed; sin rojo → WARNING unreproduced', () => {
  const dir = makeTempDir();
  const out = built(dir, [[finding('1', 'reliability', 'src/a.js:3', 'CRITICAL'), finding('2', 'risk', 'src/b.js:3', 'BLOCKER')]]);
  assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'reliability-1', '--red']).status, 0);
  assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'risk-2', '--no-red']).status, 0);
  const [f1, f2] = read(out).findings;
  assert.deepStrictEqual([f1.status, f1.severity], ['confirmed', 'CRITICAL']);
  assert.deepStrictEqual([f2.status, f2.severity], ['unreproduced', 'WARNING']);
  assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'nope', '--red']).status, 1);
  assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'risk-2']).status, 2);
});

test('refute --ledger: con max hacen falta 2 REFUTED de 3; INCONCLUSIVE y faltantes quedan en pie', () => {
  const dir = makeTempDir();
  const out = built(dir, [[finding('1', 'risk', 'a.js:1', 'CRITICAL'), finding('2', 'risk', 'b.js:1', 'CRITICAL'), finding('3', 'risk', 'c.js:1', 'WARNING')]]);
  const v = writeJson(dir, 'v.json', { 'risk-1': ['REFUTED', 'REFUTED', 'CONFIRMED'], 'risk-2': ['REFUTED', 'INCONCLUSIVE'] });
  const r = cli(['refute', '--ledger', out, v]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.out.results, { 'risk-1': 'refuted', 'risk-2': 'stands' });
  assert.deepStrictEqual(read(out).findings.map((f) => f.status), ['refuted', 'open', 'open']);
});

test('round: sha nuevo, round + 1, los fixed pasan a fixed, suma lo nuevo; tope en 2', () => {
  const dir = makeTempDir();
  const out = built(dir, [[finding('1', 'reliability', 'a.js:1', 'CRITICAL')]]);
  cli(['repro', '--ledger', out, '--id', 'reliability-1', '--red']);
  assert.strictEqual(cli(['next', '--ledger', out]).out.next, 'fix');
  const fresh = writeJson(dir, 'n.json', [finding('1', 'reliability', 'a.js:7', 'WARNING')]);
  let r = cli(['round', '--ledger', out, '--sha', SHA2, '--fixed', 'reliability-1', fresh]);
  assert.strictEqual(r.status, 0, r.stderr);
  const l = read(out);
  assert.strictEqual(l.sha, SHA2);
  assert.strictEqual(l.round, 1);
  assert.deepStrictEqual(l.findings.map((f) => [f.id, f.status]), [['reliability-1', 'fixed'], ['r1-reliability-1', 'open']]);
  assert.strictEqual(cli(['next', '--ledger', out]).out.next, 'done');
  r = cli(['round', '--ledger', out, '--sha', SHA]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(cli(['round', '--ledger', out, '--sha', SHA2]).status, 1);
});

test('round --judgment: la re-revisión de Judgment Day se vuelve a emparejar (de uno solo → suspect)', () => {
  const dir = makeTempDir();
  const out = built(dir, [], ['--judgment', writeJson(dir, 'j0.json', { fix: [], suspect: [], conflicts: [] })]);
  const a = [finding('1', 'judge-a', 'src/a.js:10', 'CRITICAL'), finding('2', 'judge-a', 'src/c.js:1', 'WARNING'), finding('3', 'judge-a', 'src/d.js:5', 'BLOCKER')];
  const b = [finding('1', 'judge-b', 'src/a.js:11', 'BLOCKER'), finding('2', 'judge-b', 'src/d.js:6', 'SUGGESTION')];
  const j = cli(['judgment', writeJson(dir, 'a.json', a), writeJson(dir, 'b.json', b)]).out;
  const r = cli(['round', '--ledger', out, '--sha', SHA2, '--judgment', writeJson(dir, 'j.json', j)]);
  assert.strictEqual(r.status, 0, r.stderr);
  const byId = Object.fromEntries(read(out).findings.map((f) => [f.id, f]));
  assert.strictEqual(byId['r1-judge-a-1'].status, 'open');
  assert.strictEqual(byId['r1-judge-a-2'].status, 'suspect');
  assert.strictEqual(byId['r1-judge-a-3'].conflict, 'r1-judge-b-2');
  assert.strictEqual(byId['r1-judge-b-2'].conflict, 'r1-judge-a-3');
  assert.strictEqual(cli(['validate', out]).status, 0);
});

test('next: round 2 con un confirmado abierto → escalate', () => {
  const dir = makeTempDir();
  const l = { v: 1, sha: SHA, level: 'high', profile: 'max', round: 2, findings: [{ ...finding('x', 'risk', 'a.js:1', 'CRITICAL'), status: 'confirmed' }] };
  assert.strictEqual(cli(['next', '--ledger', writeJson(dir, 'l.json', l)]).out.next, 'escalate');
});

test('frozen: HEAD limpio → 0; otro sha o cambio sin commitear → 1 con el motivo', () => {
  const repo = makeRepo();
  const head = git(['rev-parse', 'HEAD'], repo);
  assert.strictEqual(cli(['frozen', '--cwd', repo, '--sha', head]).status, 0);
  const other = cli(['frozen', '--cwd', repo, '--sha', SHA]);
  assert.strictEqual(other.status, 1);
  assert.match(other.out.reason, /HEAD es/);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const dirty = cli(['frozen', '--cwd', repo, '--sha', head]);
  assert.strictEqual(dirty.status, 1);
  assert.match(dirty.out.reason, /sin commitear/);
});

test('save: guarda el ledger en ~/.pignolo/reviews/<repo-id>/<sha>-<kind>.json; inválido → 1', () => {
  const repo = makeRepo();
  const dir = makeTempDir();
  const out = built(dir, [[]]);
  const r = cli(['save', '--ledger', out, '--cwd', repo]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.out.file.startsWith(path.join(process.env.PIGNOLO_HOME, 'reviews')));
  assert.ok(r.out.file.endsWith(`${SHA}-review.json`));
  const j = cli(['save', '--ledger', out, '--cwd', repo, '--kind', 'judgment']);
  assert.ok(j.out.file.endsWith(`${SHA}-judgment.json`));
  assert.strictEqual(cli(['save', '--ledger', out, '--cwd', repo, '--kind', 'x']).status, 2);
  assert.deepStrictEqual(read(r.out.file), read(out));
  const bad = writeJson(dir, 'bad.json', { v: 1 });
  assert.strictEqual(cli(['save', '--ledger', bad, '--cwd', repo]).status, 1);
});

test('plan sin --profile usa el perfil de la config del usuario (balanced por defecto)', () => {
  const r = cli(['plan', '--level', 'high']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.out, { lenses: ['risk', 'resilience', 'readability', 'reliability', 'testability'], refuters: 1, judgmentDay: false });
});
