'use strict';
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
const claim = (id, text, how = 'run it') => ({ id, task: 'T1', claim: text, how });

function run(script, cwd, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env } });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stderr: r.stderr };
}
const audit = (cwd, args) => run(AUDIT, cwd, args);
function file(text, name = 'f.md') {
  const p = path.join(makeTempDir('plan-audit-cli-'), name);
  fs.writeFileSync(p, text);
  return p;
}

// Un repo con un plan registrado hasta la etapa plan-written y el archivo del plan en tarjetas.
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

const REVIEW = J({
  findings: [],
  claims: [
    claim('C1', '`git apply --numstat` proves the patch applies'),
    claim('C2', 'the helper returns the list sorted'),
    claim('C3', 'the registry is written atomically'),
  ],
});
const VERIFY_FALSE = J([
  { id: 'C2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'sorted' },
  { id: 'C3', verdict: 'false', experiment: 'scratch/c3.js', evidence: 'torn write' },
]);

test('the full recipe from files: check, review, probes, verify, finish; a REQUEST_CHANGES does not open audited', () => {
  const { repo, main, planFile } = setup();
  const checked = audit(repo, ['check', '--plan', 'p1', '--plan-file', planFile, '--root', repo]);
  assert.strictEqual(checked.status, 0, checked.stderr);
  assert.strictEqual(checked.out.applies, true);
  assert.deepStrictEqual(checked.out.findings, []);

  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(br.status, 0, br.stderr);
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).mode, 'review');
  assert.ok(fs.existsSync(path.join(pa.auditDir(main, 'p1'), 'mode.json')));

  const rd = audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(REVIEW)]);
  assert.strictEqual(rd.status, 0, rd.stderr);
  assert.ok(fs.existsSync(path.join(pa.auditDir(main, 'p1'), 'review.json')));

  const pr = audit(repo, ['probes', '--plan', 'p1']);
  assert.strictEqual(pr.status, 0, pr.stderr);
  assert.deepStrictEqual(pr.out.closed, ['C1']);
  assert.deepStrictEqual(pr.out.remaining, ['C2', 'C3']);

  const bv = audit(repo, ['begin-verify', '--plan', 'p1']);
  assert.strictEqual(bv.status, 0, bv.stderr);
  assert.deepStrictEqual(bv.out.remaining, ['C2', 'C3']);
  assert.ok(fs.statSync(bv.out.scratch).isDirectory());
  const m = pa.readMode({ main, now: Date.now() });
  assert.strictEqual(m.mode, 'verify');
  assert.deepStrictEqual(m.claims.map((c) => c.id), ['C2', 'C3']);

  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(VERIFY_FALSE)]);
  assert.strictEqual(fin.status, 0, fin.stderr);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.deepStrictEqual(pa.readMode({ main, now: Date.now() }), { active: false }, 'the mode is gone');
  const rec = ps.readPlan({ main, plan: 'p1' }).plan.audit;
  assert.strictEqual(rec.verdict, 'REQUEST_CHANGES');
  assert.ok(rec.findings.some((f) => f.kind === 'probe git-apply-numstat'));
  assert.ok(rec.findings.some((f) => f.kind === 'experiment-false'));
  assert.notStrictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  const adv = run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]);
  assert.strictEqual(adv.status, 1);
});

test('an APPROVE with the current plan opens audited; with the plan changed it does not', () => {
  const { repo, main, planFile } = setup();
  const review = J({ findings: [], claims: [claim('C1', 'the helper returns the list sorted')] });
  const holds = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }]);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(review)]).status, 0);
  assert.deepStrictEqual(audit(repo, ['probes', '--plan', 'p1']).out.remaining, ['C1']);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c1.js' });
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]).out.verdict, 'APPROVE');
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  fs.appendFileSync(planFile, '\nmás\n');
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 1, 'stale');
  fs.writeFileSync(planFile, fs.readFileSync(planFile, 'utf8').replace('\nmás\n', ''));
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 0);
});

test('check on prose: applies false, exit 0; a bad path in a card plan is a finding', () => {
  const repo = makeRepo();
  const prose = audit(repo, ['check', '--plan-file', file('# Plan\n\nHacé algo con `lib/zz.js`.\n'), '--root', repo]);
  assert.strictEqual(prose.status, 0);
  assert.deepStrictEqual(prose.out, { applies: false });
  const bad = audit(repo, ['check', '--plan-file', file('### Task T1: x\n\n**Files:**\n- Modify: `lib/zz.js`\n'), '--root', repo]);
  assert.strictEqual(bad.status, 0);
  assert.strictEqual(bad.out.applies, true);
  assert.ok(bad.out.findings.some((f) => f.kind === 'missing-path'));
});

test('begin-verify without review.json is exit 1; usage errors are exit 2; nothing to verify skips 2b', () => {
  const { repo, main, planFile } = setup();
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 1);
  assert.strictEqual(audit(repo, []).status, 2);
  assert.strictEqual(audit(repo, ['nada']).status, 2);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1']).status, 2);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1']).status, 2);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'A b', '--report-file', 'x']).status, 2);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file('sin bloque json')]).status, 1);
  const only = J({ findings: [], claims: [claim('C1', '`git apply --numstat` proves the patch applies')] });
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(only)]).status, 0);
  assert.deepStrictEqual(audit(repo, ['probes', '--plan', 'p1']).out.remaining, []);
  const bv = audit(repo, ['begin-verify', '--plan', 'p1']);
  assert.strictEqual(bv.status, 0);
  assert.strictEqual(bv.out.skipped, true);
  const fin = audit(repo, ['finish', '--plan', 'p1']);
  assert.strictEqual(fin.status, 0, fin.stderr);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES', 'the probe finding decides');
  assert.ok(main);
});

test('finish respects the incomplete mark the hook left in stops.log: ESCALATE, never APPROVE', () => {
  const { repo, main, planFile } = setup();
  const review = J({ findings: [], claims: [claim('C1', 'the helper returns the list sorted')] });
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(review)]).status, 0);
  audit(repo, ['probes', '--plan', 'p1']);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  pa.markIncomplete({ main, plan: 'p1' });
  const holds = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }]);
  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]);
  assert.strictEqual(fin.status, 0, fin.stderr);
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.strictEqual(fin.out.incomplete, true);
  assert.strictEqual(ps.readPlan({ main, plan: 'p1' }).plan.audit.incomplete, true);
});

test('end removes the mode and is idempotent', () => {
  const { repo, main, planFile } = setup();
  audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).active, true);
  assert.strictEqual(audit(repo, ['end', '--plan', 'p1']).status, 0);
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).active, false);
  assert.strictEqual(audit(repo, ['end', '--plan', 'p1']).status, 0);
});

test('the findings of check reach the verdict only through the reviewer: kept in its findings they block, discarded they do not', () => {
  const { repo, main, planFile } = setup();
  const badPlan = file('### Task T1: x\n\n**Files:**\n- Modify: `lib/zz.js`\n', 'bad.md');
  const checked = audit(repo, ['check', '--plan', 'p1', '--plan-file', badPlan, '--root', repo]);
  assert.strictEqual(checked.out.findings.length, 1);
  assert.ok(!fs.existsSync(path.join(pa.auditDir(main, 'p1'), 'check.json')), 'check leaves no file for finish to add');
  const kept = J({ findings: [checked.out.findings[0]], claims: [claim('C1', 'the helper returns the list sorted')] });
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(kept)]).status, 0);
  audit(repo, ['probes', '--plan', 'p1']);
  audit(repo, ['begin-verify', '--plan', 'p1']);
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c1.js' });
  const holds = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }]);
  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.ok(fin.out.findings.some((f) => f.kind === 'missing-path'));
});

test('finish: holds in the report with fewer experiments than claims is ESCALATE, never APPROVE (M-1)', () => {
  const { repo, main, planFile } = setup();
  const review = J({ findings: [], claims: [claim('C1', 'the helper returns the list sorted'), claim('C2', 'the registry is written atomically')] });
  const holds = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }, { id: 'C2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'ok' }]);
  const go = () => {
    assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
    assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(review)]).status, 0);
    audit(repo, ['probes', '--plan', 'p1']);
    assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).status, 0);
  };
  go();
  const none = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]);
  assert.strictEqual(none.out.verdict, 'ESCALATE');
  assert.strictEqual(none.out.incomplete, true);
  go();
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c1.js' });
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]).out.verdict, 'ESCALATE', 'one experiment for two claims is still short');
  go();
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c1.js' });
  pa.recordExperiment({ main, plan: 'p1', command: 'node scratch/c2.js' });
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]).out.verdict, 'APPROVE');
});

test('finish (I3 of 5b) does not add the plan-check findings: the reviewer took the report as evidence and kept what is real', () => {
  const { repo, main } = setup();
  const planFile = file('### Task T1: x\n\n**Files:**\n- Modify: `lib/made-by-another-plan.js`\n', 'plan2.md');
  const checked = audit(repo, ['check', '--plan', 'p1', '--plan-file', planFile, '--root', repo]);
  assert.strictEqual(checked.status, 0, checked.stderr);
  assert.strictEqual(checked.out.findings.length, 1, 'check must see the missing path');
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  const review = J({ findings: [], claims: [] });
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(review)]).status, 0);
  assert.deepStrictEqual(audit(repo, ['probes', '--plan', 'p1']).out.remaining, []);
  assert.strictEqual(audit(repo, ['begin-verify', '--plan', 'p1']).out.skipped, true);
  const fin = audit(repo, ['finish', '--plan', 'p1']);
  assert.strictEqual(fin.status, 0, fin.stderr);
  assert.strictEqual(fin.out.verdict, 'APPROVE', JSON.stringify(fin.out));
  assert.deepStrictEqual(fin.out.findings, []);
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  // y un hallazgo que el revisor sí confirma sigue bloqueando
  const { repo: repo2 } = setup();
  assert.strictEqual(audit(repo2, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  const confirmed = J({ findings: [{ severity: 'IMPORTANT', plan: 'Task T1', code: 'lib/made-by-another-plan.js', text: 'does not exist', evidence: 'ls' }], claims: [] });
  assert.strictEqual(audit(repo2, ['review-done', '--plan', 'p1', '--report-file', file(confirmed)]).status, 0);
  assert.strictEqual(audit(repo2, ['probes', '--plan', 'p1']).status, 0);
  assert.strictEqual(audit(repo2, ['finish', '--plan', 'p1']).out.verdict, 'REQUEST_CHANGES');
});

// ---- Tope de vueltas (D-2): una auditoría, una re-auditoría acotada, después el humano ----
const NO_CLAIMS = (findings, closed) => J({ findings, claims: [], ...(closed ? { closed } : {}) });
const IMPORTANT = { severity: 'IMPORTANT', plan: 'Task 1', code: 'lib/a.js:1', text: 'falta algo', evidence: 'leí lib/a.js' };
const MINOR = { severity: 'MINOR', plan: 'Task 1', code: 'lib/a.js:1', text: 'nombre feo', evidence: 'leí lib/a.js' };
// Corre begin-review + review-done + probes + finish para un informe sin afirmaciones.
function round(repo, planFile, findings, closed) {
  const br = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(br.status, 0, br.stderr);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(NO_CLAIMS(findings, closed))]).status, 0);
  assert.strictEqual(audit(repo, ['probes', '--plan', 'p1']).status, 0);
  return { br, fin: audit(repo, ['finish', '--plan', 'p1']) };
}
const edit = (planFile) => fs.writeFileSync(planFile, `${fs.readFileSync(planFile, 'utf8')}\n- Arreglo: linea nueva del arreglo\n`);

test('round 1 with an important: REQUEST_CHANGES; begin-review with the plan changed opens round 2 with a diff and the findings', () => {
  const { repo, planFile } = setup();
  const { br, fin } = round(repo, planFile, [IMPORTANT, MINOR]);
  assert.strictEqual(br.out.round, 1);
  assert.strictEqual(br.out.reaudit, undefined);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(fin.out.round, 1);
  assert.strictEqual(fin.out.findings.length, 1);
  assert.strictEqual(fin.out.minors.length, 1);
  edit(planFile);
  const b2 = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(b2.status, 0, b2.stderr);
  assert.strictEqual(b2.out.reaudit, true);
  assert.strictEqual(b2.out.round, 2);
  assert.ok(fs.readFileSync(b2.out.diff, 'utf8').includes('+ - Arreglo: linea nueva del arreglo'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(b2.out.findings, 'utf8')).map((f) => f.text), ['falta algo']);
});

test('begin-review after a REQUEST_CHANGES with the plan unchanged is refused', () => {
  const { repo, main, planFile } = setup();
  assert.strictEqual(round(repo, planFile, [IMPORTANT]).fin.out.verdict, 'REQUEST_CHANGES');
  const again = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /el plan no cambió/);
  assert.strictEqual(pa.readRound({ main, plan: 'p1' }).round, 1, 'the round did not advance');
});

test('round 2 with an important is ESCALATE reaudit-findings, never REQUEST_CHANGES, and audited stays closed', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const { fin } = round(repo, planFile, [IMPORTANT], ['R1-1']);
  assert.strictEqual(fin.out.verdict, 'ESCALATE');
  assert.strictEqual(fin.out.reason, 'reaudit-findings');
  assert.strictEqual(fin.out.round, 2);
  assert.strictEqual(fin.out.findings.length, 1);
  assert.notStrictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 1);
});

test('round 2 clean is APPROVE and advance --to audited passes with the sha256 of the new plan; with the plan edited after, it does not', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const { fin } = round(repo, planFile, [MINOR], ['R1-1']);
  assert.strictEqual(fin.out.verdict, 'APPROVE');
  assert.strictEqual(fin.out.minors.length, 1);
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  assert.strictEqual(ps.readPlan({ main, plan: 'p1' }).plan.audit.planSha256, ps.sha256(fs.readFileSync(planFile)));
  const audited = fs.readFileSync(planFile);
  edit(planFile);
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 1, 'plan changed after the audit');
  fs.writeFileSync(planFile, audited);
  assert.strictEqual(run(PLAN, repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]).status, 0);
});

test('a third begin-review without end is refused; after end it is round 1 again', () => {
  const { repo, main, planFile } = setup();
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  round(repo, planFile, [IMPORTANT]);
  edit(planFile);
  const third = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(third.status, 1);
  assert.match(third.stderr, /ya tuvo su re-auditoría; decide el humano/);
  assert.strictEqual(audit(repo, ['end', '--plan', 'p1']).status, 0);
  assert.strictEqual(pa.readRound({ main, plan: 'p1' }).round, 0);
  const fresh = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(fresh.status, 0, fresh.stderr);
  assert.strictEqual(fresh.out.round, 1);
  assert.strictEqual(fresh.out.reaudit, undefined);
});

test('an old audit state (no round.json, or one without round) reads as round 1 and does not throw; a broken one fails closed with a message', () => {
  const { repo, main, planFile } = setup();
  const dir = pa.auditDir(main, 'p1');
  // estado viejo: un begin-review de antes de 0.24 no dejó round.json; finish lee la vuelta 1
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  fs.rmSync(path.join(dir, 'round.json'));
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(NO_CLAIMS([IMPORTANT]))]).status, 0);
  const fin = audit(repo, ['finish', '--plan', 'p1']);
  assert.strictEqual(fin.status, 0, fin.stderr);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(fin.out.round, 1);
  // round.json sin `round`: vuelta 1
  fs.writeFileSync(path.join(dir, 'round.json'), JSON.stringify({ verdict: 'APPROVE' }));
  assert.strictEqual(pa.readRound({ main, plan: 'p1' }).round, 1);
  const ok = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(ok.out.round, 1);
  // JSON roto: sale con 1 y el motivo, sin traza; end lo limpia
  fs.writeFileSync(path.join(dir, 'round.json'), '{roto');
  const broken = audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]);
  assert.strictEqual(broken.status, 1);
  assert.match(broken.stderr, /round\.json no parsea/);
  assert.doesNotMatch(broken.stderr, /\n\s+at /);
  assert.strictEqual(audit(repo, ['finish', '--plan', 'p1']).status, 1);
  assert.strictEqual(audit(repo, ['end', '--plan', 'p1']).status, 0);
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
});

test('lineDiff: marks the changed lines and nothing else', () => {
  assert.strictEqual(pa.lineDiff('a\nb\nc', 'a\nB\nc'), '- b\n+ B\n');
  assert.strictEqual(pa.lineDiff('a', 'a'), '\n');
});

test('the plan skill names reaudit, sonnet, reaudit-findings and AskUserQuestion (D-2)', () => {
  const t = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'plan', 'SKILL.md'), 'utf8');
  for (const re of [/reaudit/, /sonnet/, /reaudit-findings/, /AskUserQuestion/]) assert.match(t, re);
});
