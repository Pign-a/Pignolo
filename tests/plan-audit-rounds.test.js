'use strict';
// Vueltas de la auditoría del plan, segunda parte (R-7 a R-11, RQ-06): ids de hallazgos, vuelta extra con su
// flag, afirmaciones que pasan de vuelta, plan sin cambios y `round` inválido. Todo por los scripts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));

const AUDIT = path.join(PLUGIN_ROOT, 'scripts', 'plan-audit.js');
const PLAN = path.join(PLUGIN_ROOT, 'scripts', 'plan.js');
const REQUEST = 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.';
const CARD = `# T

## Goal
Una tarjeta.

## Acceptance examples
- Con "una tarjeta de alcance" queda registrada
- Con "tres ejemplos de aceptacion" valida
- Con "no agregar nada sin avisar" lista lo agregado

## Request to spec
- x

## Not included or reinterpreted
- none

## Added without being asked
- none

## Out of scope
- x

## Reserved decisions
- none

## Cost estimate
- x
`;
const J = (obj) => `informe\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\n`;
const IMPORTANT = { severity: 'IMPORTANT', plan: 'Task 1', code: 'lib/a.js:1', text: 'falta algo', evidence: 'leí lib/a.js' };
const OTHER = { severity: 'IMPORTANT', plan: 'Task 2', code: 'lib/a.js:2', text: 'falta otra cosa', evidence: 'leí lib/a.js' };
const MINOR = { severity: 'MINOR', plan: 'Task 1', code: 'lib/a.js:1', text: 'nombre feo', evidence: 'leí lib/a.js' };
const OPEN_CLAIM = { id: 'C2', task: 'T1', claim: 'the helper returns the list sorted', how: 'run it' };

function run(script, cwd, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env } });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stderr: r.stderr };
}
const audit = (cwd, args) => run(AUDIT, cwd, args);
function file(text, name = 'f.md') {
  const p = path.join(makeTempDir('plan-audit-rounds-'), name);
  fs.writeFileSync(p, text);
  return p;
}
function setup() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'lib'));
  fs.writeFileSync(path.join(repo, 'lib', 'a.js'), 'module.exports = 1;\n');
  const planFile = file('### Task T1: x\n\n**Files:**\n- Modify: `lib/a.js`\n', 'plan.md');
  const main = repo;
  assert.ok(ps.newPlan({ main, plan: 'p1', request: REQUEST, spec: 's', now: '2026-09-30T10:00:00.000Z' }).ok);
  assert.ok(ps.advance({ main, plan: 'p1', to: 'claims' }).ok);
  assert.ok(ps.setClaims({ main, plan: 'p1', claims: [], noneReason: 'n/a' }).ok);
  assert.ok(ps.advance({ main, plan: 'p1', to: 'spec-review' }).ok);
  assert.ok(ps.saveScopeCard({ main, plan: 'p1', text: CARD }).ok);
  assert.ok(ps.advance({ main, plan: 'p1', to: 'scope-card' }).ok);
  assert.ok(ps.advance({ main, plan: 'p1', to: 'plan-written', planFile }).ok);
  return { repo, main, planFile };
}
let n = 0;
const edit = (planFile) => { n += 1; fs.writeFileSync(planFile, `${fs.readFileSync(planFile, 'utf8')}\n- Arreglo ${n}: linea nueva del arreglo\n`); };
// begin-review + review-done + probes + finish de un informe sin afirmaciones.
function round(repo, planFile, findings, closed, extraFlag) {
  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, ...(extraFlag ? ['--extra-round'] : [])]);
  assert.strictEqual(br.status, 0, br.stderr);
  const report = { findings, claims: [], ...(closed ? { closed } : {}) };
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J(report))]).status, 0);
  assert.strictEqual(audit(repo, ['probes', '--plan', 'p1']).status, 0);
  return { br, fin: audit(repo, ['finish', '--plan', 'p1']) };
}
const advance = (repo, planFile) => run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status;

// ---- R-11 ----
test('R-11: each blocking finding gets an id; minors do not block and get none', () => {
  const { repo, planFile } = setup();
  const { fin } = round(repo, planFile, [IMPORTANT, OTHER, MINOR]);
  assert.deepStrictEqual(fin.out.findings.map((f) => f.id), ['R1-1', 'R1-2']);
  assert.strictEqual(fin.out.minors.length, 1);
});

test('R-11: the re-audit brief carries the ids; an id the report does not list as closed blocks (ESCALATE, audited closed)', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT, OTHER]);
  edit(planFile);
  const { br, fin } = round(repo, planFile, [], ['R1-1']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(br.out.findings, 'utf8')).map((f) => f.id), ['R1-1', 'R1-2']);
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.strictEqual(fin.out.reason, 'reaudit-findings');
  assert.deepStrictEqual(fin.out.findings.map((f) => f.id), ['R1-2']);
  assert.notStrictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  assert.strictEqual(advance(repo, planFile), 1);
});

test('R-11: all ids closed and nothing new is APPROVE; a report with no closed list at all is not', () => {
  const a = setup();
  round(a.repo, a.planFile, [IMPORTANT, OTHER]);
  edit(a.planFile);
  assert.strictEqual(round(a.repo, a.planFile, [], ['R1-1', 'R1-2']).fin.out.verdict, 'APPROVE');
  assert.strictEqual(advance(a.repo, a.planFile), 0);
  const b = setup();
  round(b.repo, b.planFile, [IMPORTANT]);
  edit(b.planFile);
  assert.strictEqual(round(b.repo, b.planFile, []).fin.out.verdict, 'ESCALATE');
});

test('R-11: an id listed as closed but also returned as a MINOR counts as not closed', () => {
  const { repo, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const { fin } = round(repo, planFile, [{ ...MINOR, id: 'R1-1' }], ['R1-1']);
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.deepStrictEqual(fin.out.findings.map((f) => f.id), ['R1-1']);
  assert.strictEqual(advance(repo, planFile), 1);
});

test('R-11: a previous finding returned as still open (blocking, with its id) blocks once, not twice', () => {
  const { repo, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const { fin } = round(repo, planFile, [{ ...IMPORTANT, id: 'R1-1' }]);
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.strictEqual(fin.out.findings.length, 1);
  assert.strictEqual(fin.out.findings[0].ref, 'R1-1');
});

test('R-11: a closed list that is not a list of ids fails closed with a message', () => {
  const { repo, planFile } = setup();
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  const bad = audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [], closed: 'R1-1' }))]);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /closed/);
  assert.doesNotMatch(bad.stderr, /\n\s+at /);
});

test('R-11: findings of an old round.json (no ids) get L1, L2 in the re-audit brief', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  const rf = path.join(pa.auditDir(main, 'p1'), 'round.json');
  const old = JSON.parse(fs.readFileSync(rf, 'utf8'));
  old.findings = old.findings.map(({ id, ...f }) => f);
  fs.writeFileSync(rf, JSON.stringify(old));
  edit(planFile);
  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(br.status, 0, br.stderr);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(br.out.findings, 'utf8')).map((f) => f.id), ['L1']);
});

// ---- R-9 ----
test('R-9: a plan that only changed its line endings (LF to CRLF) does not open round 2', () => {
  const { repo, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  fs.writeFileSync(planFile, fs.readFileSync(planFile, 'utf8').replace(/\n/g, '\r\n'));
  const again = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /el plan no cambió/);
  assert.doesNotMatch(again.stderr, /\n\s+at /);
});

test('R-9: review-done after finish (no mode.json) still stores the audited sha; with no begin-review at all it refuses', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [IMPORTANT], claims: [] }))]).status, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'review.json'), 'utf8')).planSha256, ps.sha256(fs.readFileSync(planFile)));
  const lone = setup();
  const r = audit(lone.repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [] }))]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /begin-review/);
});

// ---- R-8 ----
function roundOneWithOpenClaim(repo, main, planFile) {
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [IMPORTANT], claims: [OPEN_CLAIM] }))]).status, 0);
  audit(repo, ['probes', '--plan', 'p1']);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c2.js' });
  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(J([{ id: 'C2', verdict: 'inconclusive', experiment: 'scratch/c2.js', evidence: 'x' }]))]);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.deepStrictEqual(fin.out.carried, ['C2']);
}

test('R-8: the carried claim joins round 2, is verified there and only then APPROVE; if it stays inconclusive, ESCALATE claims-not-verified', () => {
  const { repo, main, planFile } = setup();
  roundOneWithOpenClaim(repo, main, planFile);
  edit(planFile);
  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.deepStrictEqual(br.out.carried, ['C2']);
  const rd = audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [], closed: ['R1-1'] }))]);
  assert.strictEqual(rd.out.claims, 1);
  assert.deepStrictEqual(audit(repo, ['probes', '--plan', 'p1']).out.remaining, ['C2']);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c2.js' });
  const holds = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(J([{ id: 'C2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'ok' }]))]);
  assert.strictEqual(holds.out.verdict, 'APPROVE');
  assert.strictEqual(advance(repo, planFile), 0);
  // el mismo camino con la afirmación aún inconclusa
  const b = setup();
  roundOneWithOpenClaim(b.repo, b.main, b.planFile);
  edit(b.planFile);
  audit(b.repo, ['begin-review', '--plan', 'p1', '--plan-file', b.planFile]);
  audit(b.repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [], closed: ['R1-1'] }))]);
  audit(b.repo, ['probes', '--plan', 'p1']);
  audit(b.repo, ['begin-verify', '--plan', 'p1']);
  pa.recordExperiment({ main: b.main, plan: 'p1', command: 'node scratch/c2.js' });
  const still = audit(b.repo, ['finish', '--plan', 'p1', '--report-file', file(J([{ id: 'C2', verdict: 'inconclusive', experiment: 'scratch/c2.js', evidence: 'x' }]))]);
  assert.strictEqual(still.out.verdict, 'ESCALATE');
  assert.strictEqual(still.out.reason, 'claims-not-verified');
  assert.strictEqual(advance(b.repo, b.planFile), 1);
});

test('R-8: a new claim of the reviewer that reuses a carried id keeps both (renamed), never one hiding the other', () => {
  const { repo, main, planFile } = setup();
  roundOneWithOpenClaim(repo, main, planFile);
  edit(planFile);
  audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  const rd = audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [{ ...OPEN_CLAIM, claim: 'a different claim' }], closed: ['R1-1'] }))]);
  assert.strictEqual(rd.out.claims, 2);
  const review = JSON.parse(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'review.json'), 'utf8'));
  assert.deepStrictEqual(review.claims.map((c) => c.id), ['C2', 'C2-new']);
});

// ---- RQ-06 ----
test('RQ-06: a round.json whose round is not exactly 1 or 2 fails closed with a message (no trace), and end clears it', () => {
  const { repo, main, planFile } = setup();
  const rf = path.join(pa.auditDir(main, 'p1'), 'round.json');
  fs.mkdirSync(path.dirname(rf), { recursive: true });
  for (const bad of [0, 3, 99, '2', null, [2]]) {
    fs.writeFileSync(rf, JSON.stringify({ round: bad, phase: 'done', verdict: 'ESCALATE' }));
    assert.match(pa.readRound({ main, plan: 'p1' }).error, /round inválido/, JSON.stringify(bad));
    const r = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
    assert.strictEqual(r.status, 1, JSON.stringify(bad));
    assert.doesNotMatch(r.stderr, /\n\s+at /);
    assert.strictEqual(audit(repo, ['finish', '--plan', 'p1']).status, 1);
  }
  fs.writeFileSync(rf, JSON.stringify({ round: 2, extra: -1 }));
  assert.match(pa.readRound({ main, plan: 'p1' }).error, /extra inválido/);
  assert.strictEqual(audit(repo, ['end', '--plan', 'p1']).status, 0);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
});

// ---- R-7 ----
const twoRounds = (repo, planFile) => {
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const { fin } = round(repo, planFile, [OTHER], ['R1-1']);
  assert.strictEqual(fin.out.reason, 'reaudit-findings');
  return fin;
};

test('R-7: without --extra-round the third begin-review is still refused, even with the plan changed', () => {
  const { repo, planFile } = setup();
  twoRounds(repo, planFile);
  edit(planFile);
  const third = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(third.status, 1);
  assert.match(third.stderr, /ya tuvo su re-auditoría; decide el humano/);
  assert.match(third.stderr, /--extra-round/);
});

test('R-7: with --extra-round a bounded round opens, with the diff against the previous round and its blocking ids', () => {
  const { repo, planFile } = setup();
  twoRounds(repo, planFile);
  edit(planFile);
  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, '--extra-round']);
  assert.strictEqual(br.status, 0, br.stderr);
  assert.strictEqual(br.out.round, 2);
  assert.strictEqual(br.out.reaudit, true);
  assert.strictEqual(br.out.extra, 1);
  const diff = fs.readFileSync(br.out.diff, 'utf8');
  assert.match(diff, /Arreglo \d+: linea nueva/);
  assert.strictEqual((diff.match(/Arreglo \d+:/g) || []).length, 1, 'the diff is against the previous round, not round 1');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(br.out.findings, 'utf8')).map((f) => f.id), ['R2-1']);
});

test('R-7: an extra round needs its own flag, an unchanged plan is refused, and a clean extra round is the only way to APPROVE', () => {
  const { repo, planFile } = setup();
  twoRounds(repo, planFile);
  const same = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, '--extra-round']);
  assert.strictEqual(same.status, 1);
  assert.match(same.stderr, /el plan no cambió/);
  edit(planFile);
  const fin = round(repo, planFile, [{ ...OTHER, text: 'sigue' }], ['R2-1'], true).fin;
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.deepStrictEqual(fin.out.findings.map((f) => f.id), ['R2x1-1']);
  edit(planFile);
  const noFlag = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(noFlag.status, 1, 'the second extra round needs its own flag');
  const ok = round(repo, planFile, [], ['R2x1-1'], true).fin;
  assert.strictEqual(ok.out.verdict, 'APPROVE');
  assert.strictEqual(ok.out.extra, 2);
  assert.strictEqual(advance(repo, planFile), 0);
});

test('R-7: --extra-round outside a re-audit that ended in ESCALATE reaudit-findings is refused with a message', () => {
  const { repo, planFile } = setup();
  const fresh = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, '--extra-round']);
  assert.strictEqual(fresh.status, 1);
  assert.match(fresh.stderr, /--extra-round solo vale/);
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const r1 = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, '--extra-round']);
  assert.strictEqual(r1.status, 1);
  assert.doesNotMatch(r1.stderr, /\n\s+at /);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile, '--nada']).status, 2);
});
