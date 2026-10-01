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

test('the findings of check reach the verdict: all experiments hold but a path does not exist', () => {
  const { repo, planFile } = setup();
  const badPlan = file('### Task T1: x\n\n**Files:**\n- Modify: `lib/zz.js`\n', 'bad.md');
  assert.strictEqual(audit(repo, ['check', '--plan', 'p1', '--plan-file', badPlan, '--root', repo]).out.findings.length, 1);
  const review = J({ findings: [], claims: [claim('C1', 'the helper returns the list sorted')] });
  assert.strictEqual(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]).status, 0);
  assert.strictEqual(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(review)]).status, 0);
  audit(repo, ['probes', '--plan', 'p1']);
  audit(repo, ['begin-verify', '--plan', 'p1']);
  const holds = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }]);
  const fin = audit(repo, ['finish', '--plan', 'p1', '--report-file', file(holds)]);
  assert.strictEqual(fin.out.verdict, 'REQUEST_CHANGES');
  assert.ok(fin.out.findings.some((f) => f.kind === 'missing-path'));
});
