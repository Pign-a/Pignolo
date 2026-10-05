'use strict';
// Hallazgos de la revisión de core/preguntas-y-tope-auditoria (núcleo 0.24.0): tests que fallan
// hasta el arreglo. No editar: el que arregla cambia el código, no estos tests.
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
  const p = path.join(makeTempDir('plan-audit-review2-'), name);
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

// RQ-01. Causa: round.json guarda solo los hallazgos de la vuelta 1; una afirmación que quedó `inconclusive` (tapada por el REQUEST_CHANGES) no pasa a la vuelta 2 y nadie la verifica.
test('RQ-01: una afirmación inconclusa de la vuelta 1 no desaparece en la vuelta 2 (no hay APPROVE sin verificarla)', () => {
  const { repo, main, planFile } = setup();
  roundOneWithOpenClaim(repo, main, planFile, { verdict: 'inconclusive', experiment: true });
  const fin = cleanRoundTwo(repo, planFile);
  assert.notStrictEqual(fin.out.verdict, 'APPROVE', 'C2 nunca se verificó y la vuelta 2 aprobó');
  assert.notStrictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 1);
});

// RQ-01. Causa: la misma; el `incomplete: true` de la vuelta 1 (un `holds` de palabra, sin ningún experimento corrido) tampoco pasa a la vuelta 2.
test('RQ-01: una vuelta 1 incompleta (afirmación sin experimento) no queda aprobada por una vuelta 2 limpia', () => {
  const { repo, main, planFile } = setup();
  roundOneWithOpenClaim(repo, main, planFile, { verdict: 'holds', experiment: false });
  assert.strictEqual(ps.readPlan({ main, plan: 'p1' }).plan.audit.incomplete, true, 'la vuelta 1 quedó incompleta');
  const fin = cleanRoundTwo(repo, planFile);
  assert.notStrictEqual(fin.out.verdict, 'APPROVE', 'C2 se dio por buena sin experimento y la vuelta 2 aprobó');
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 1);
});

// RQ-02. Causa: "el plan no cambió" compara contra el sha de review.json, y un review-done repetido después de finish (ya sin mode.json) lo deja vacío: el plan sin tocar entra a la vuelta 2 con un diff vacío.
test('RQ-02: begin-review con el plan sin cambiar se niega también tras repetir review-done y finish', () => {
  const { repo, planFile } = setup();
  const report = { findings: [IMPORTANT], claims: [] };
  assert.strictEqual(beginReview(repo, planFile).status, 0);
  assert.strictEqual(reviewDone(repo, report).status, 0);
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1']).out.verdict, 'REQUEST_CHANGES');
  // el orquestador repite los dos últimos pasos (un reintento): finish ya borró mode.json
  assert.strictEqual(reviewDone(repo, report).status, 0);
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1']).out.verdict, 'REQUEST_CHANGES');
  const again = beginReview(repo, planFile);
  assert.strictEqual(again.status, 1, `abrió la vuelta ${again.out && again.out.round} con el plan sin cambiar`);
  assert.match(again.stderr, /el plan no cambió/);
});
