'use strict';
// Re-revisión RR-01 a RR-07 de core/preguntas-y-tope-auditoria (núcleo 0.24.0).
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

function run(script, cwd, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env } });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stderr: r.stderr };
}
const audit = (cwd, args) => run(AUDIT, cwd, args);
function file(text, name = 'f.md') {
  const p = path.join(makeTempDir('plan-audit-rr-'), name);
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

const IMPORTANT = { severity: 'IMPORTANT', plan: 'Task 1', code: 'lib/a.js:1', text: 'falta algo', evidence: 'leí lib/a.js' };
// Una afirmación que las sondas fijas no cierran: queda para el modo verify.
const OPEN_CLAIM = { id: 'C2', task: 'T1', claim: 'the helper returns the list sorted', how: 'run it' };
const edit = (planFile) => fs.writeFileSync(planFile, `${fs.readFileSync(planFile, 'utf8')}\n- Arreglo: linea nueva del arreglo\n`);
const beginReview = (repo, planFile) => audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
const reviewDone = (repo, report) => audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J(report))]);

// Vuelta 1 con un importante y la afirmación C2; `verify` da el informe de 2b y dice si se anota el experimento.
function roundOneWithOpenClaim(repo, main, planFile, { verdict, experiment }) {
  assert.strictEqual(beginReview(repo, planFile).status, 0);
  assert.strictEqual(reviewDone(repo, { findings: [IMPORTANT], claims: [OPEN_CLAIM] }).status, 0);
  assert.deepStrictEqual(audit(repo, ['probes', '--plan', 'p1']).out.remaining, ['C2']);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  if (experiment) pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c2.js' }); // lo que anota el hook por cada Bash
  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(J([{ id: 'C2', verdict, experiment: 'scratch/c2.js', evidence: 'x' }]))]);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(fin.out.round, 1);
}
// La re-auditoría acotada como la pide la skill: sin hallazgos y solo afirmaciones NUEVAS (ninguna).
function cleanRoundTwo(repo, planFile) {
  edit(planFile);
  const br = beginReview(repo, planFile);
  assert.strictEqual(br.out.reaudit, true);
  assert.strictEqual(reviewDone(repo, { findings: [], claims: [] }).status, 0);
  assert.strictEqual(audit(repo, ['probes', '--plan', 'p1']).status, 0);
  return audit(repo, ['finish', '--plan', 'p1']);
}


const OTHER = { severity: 'IMPORTANT', plan: 'Task 2', code: 'lib/a.js:2', text: 'otra', evidence: 'x' };
const MINOR = { severity: 'MINOR', plan: 'Task 1', code: 'lib/a.js:1', text: 'feo', evidence: 'x' };
const advance = (repo, planFile) => run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status;
function round(repo, planFile, report, extra) {
  const args = ['begin-review', '--plan', 'p1', '--plan-file', planFile, ...(extra ? ['--extra-round'] : [])];
  const br = audit(repo, args);
  if (br.status !== 0) return { br };
  reviewDone(repo, report);
  audit(repo, ['probes', '--plan', 'p1']);
  return { br, fin: audit(repo, ['finish', '--plan', 'p1']) };
}
const roundFile = (main) => path.join(pa.auditDir(main, 'p1'), 'round.json');
const patchRound = (main, patch) => fs.writeFileSync(roundFile(main), JSON.stringify({ ...JSON.parse(fs.readFileSync(roundFile(main), 'utf8')), ...patch }));

test('RR-01: repetir review-done + finish sin begin-review no convierte un no-APPROVE en APPROVE (vuelta 1)', () => {
  const { repo, planFile } = setup();
  assert.strictEqual(round(repo, planFile, { findings: [IMPORTANT], claims: [] }).fin.out.verdict, 'REQUEST_CHANGES');
  reviewDone(repo, { findings: [], claims: [] });
  const fin = audit(repo, ['finish', '--plan', 'p1']);
  assert.notStrictEqual(fin.out && fin.out.verdict, 'APPROVE');
  assert.strictEqual(advance(repo, planFile), 1);
});
test('RR-01: tras ESCALATE reaudit-findings, repetir review-done + finish no da APPROVE', () => {
  const { repo, planFile } = setup();
  round(repo, planFile, { findings: [IMPORTANT], claims: [] });
  edit(planFile);
  const r2 = round(repo, planFile, { findings: [OTHER], claims: [], closed: ['R1-1'] });
  assert.strictEqual(r2.fin.out.verdict, 'ESCALATE');
  reviewDone(repo, { findings: [], claims: [], closed: ['R1-1'] });
  const fin = audit(repo, ['finish', '--plan', 'p1']);
  assert.notStrictEqual(fin.out && fin.out.verdict, 'APPROVE');
  assert.doesNotMatch(fin.stderr, /\n\s+at /);
  assert.strictEqual(advance(repo, planFile), 1);
});

test('RR-02: el renombrado <id>-new de una afirmación arrastrada no choca con un id del revisor', () => {
  const { repo, main, planFile } = setup();
  assert.strictEqual(beginReview(repo, planFile).status, 0);
  reviewDone(repo, { findings: [IMPORTANT], claims: [OPEN_CLAIM] });
  audit(repo, ['probes', '--plan', 'p1']);
  audit(repo, ['begin-verify', '--plan', 'p1']);
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c2.js' });
  audit(repo, ['finish', '--plan', 'p1', '--report-file', file(J([{ id: 'C2', verdict: 'inconclusive', experiment: 'c2.js', evidence: 'x' }]))]);
  edit(planFile);
  beginReview(repo, planFile);
  reviewDone(repo, { findings: [], closed: ['R1-1'], claims: [{ ...OPEN_CLAIM, claim: 'otra distinta' }, { ...OPEN_CLAIM, id: 'C2-new', claim: 'una tercera' }] });
  const ids = JSON.parse(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'review.json'), 'utf8')).claims.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, `ids duplicados: ${ids}`);
  assert.strictEqual(ids.length, 3);
});

test('RR-03: un id cerrado y devuelto como MINOR con otro espacio o mayúsculas no queda cerrado', () => {
  for (const id of ['R1-1 ', 'r1-1']) {
    const { repo, planFile } = setup();
    round(repo, planFile, { findings: [IMPORTANT], claims: [] });
    edit(planFile);
    const r2 = round(repo, planFile, { findings: [{ ...MINOR, id }], claims: [], closed: ['R1-1'] });
    assert.notStrictEqual(r2.fin.out.verdict, 'APPROVE', `id ${JSON.stringify(id)}`);
    assert.strictEqual(advance(repo, planFile), 1);
  }
});

test('RR-04: el revisor no fija el id de un not-closed ni repite un id existente', () => {
  const { repo, planFile } = setup();
  round(repo, planFile, { findings: [IMPORTANT], claims: [] });
  edit(planFile);
  const r2 = round(repo, planFile, { findings: [{ ...OTHER, kind: 'not-closed', id: 'R2-1' }, { ...OTHER, text: 'tercera' }], claims: [], closed: ['R1-1'] });
  const ids = r2.fin.out.findings.map((f) => f.id);
  assert.strictEqual(new Set(ids).size, ids.length, `ids duplicados: ${ids}`);
  edit(planFile);
  const r3 = round(repo, planFile, { findings: [], claims: [], closed: ['R2-1'] }, true);
  assert.notStrictEqual(r3.fin && r3.fin.out.verdict, 'APPROVE');
  assert.strictEqual(advance(repo, planFile), 1);
});

test('RR-05: un cambio de solo BOM, espacio al final o línea en blanco al final no abre la vuelta 2', () => {
  const variants = { BOM: (t) => `\uFEFF${t}`, 'espacio al final': (t) => t.replace('x\n', 'x \n'), 'línea en blanco': (t) => `${t}\n` };
  for (const [label, fn] of Object.entries(variants)) {
    const { repo, planFile } = setup();
    round(repo, planFile, { findings: [IMPORTANT], claims: [] });
    fs.writeFileSync(planFile, fn(fs.readFileSync(planFile, 'utf8')));
    const br = beginReview(repo, planFile);
    assert.strictEqual(br.status, 1, label);
    assert.match(br.stderr, /el plan no cambió/);
  }
});

test('RR-06: findings o carry de round.json que no son lista fallan cerrado con mensaje', () => {
  for (const patch of [{ findings: 'x' }, { carry: 'x' }]) {
    const { repo, main, planFile } = setup();
    round(repo, planFile, { findings: [IMPORTANT], claims: [] });
    edit(planFile);
    patchRound(main, patch);
    const br = beginReview(repo, planFile);
    assert.strictEqual(br.status, 1, JSON.stringify(patch));
    assert.match(br.stderr, /no es una lista/);
    assert.doesNotMatch(br.stderr, /\n\s+at /);
  }
});

test('RR-07: un null en carry da un mensaje claro, no el texto crudo de un TypeError', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, { findings: [IMPORTANT], claims: [] });
  edit(planFile);
  patchRound(main, { carry: [null] });
  const br = beginReview(repo, planFile);
  assert.strictEqual(br.status, 1);
  assert.match(br.stderr, /carry/);
  assert.doesNotMatch(br.stderr, /TypeError|Cannot read/);
});
