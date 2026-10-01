'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const REQUEST = 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.';
const CARD = (added = '- none') => `# T

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
${added}

## Out of scope
- x

## Reserved decisions
- none

## Cost estimate
- x
`;
const NOW = '2026-09-30T10:00:00.000Z';

function fresh() {
  const main = makeTempDir('pignolo-plan-');
  const r = ps.newPlan({ main, plan: 'p1', request: REQUEST, spec: 'docs/specs/x.md', now: NOW });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return main;
}
const to = (main, stage, extra = {}) => ps.advance({ main, plan: 'p1', to: stage, now: NOW, ...extra });
const get = (main) => ps.readPlan({ main, plan: 'p1' }).plan;

test('STAGES is the closed ordered list', () => {
  assert.deepStrictEqual(ps.STAGES, ['spec', 'claims', 'spec-review', 'scope-card', 'plan-written', 'audited', 'executing', 'validating', 'final-review', 'closed']);
});

test('newPlan validates the slug and refuses duplicates', () => {
  const main = makeTempDir('pignolo-plan-');
  const bad = ps.newPlan({ main, plan: 'Foo', request: REQUEST, spec: 's', now: NOW });
  assert.strictEqual(bad.ok, false);
  assert.ok(ps.newPlan({ main, plan: 'foo', request: REQUEST, spec: 's', now: NOW }).ok);
  const dup = ps.newPlan({ main, plan: 'foo', request: REQUEST, spec: 's', now: NOW });
  assert.strictEqual(dup.ok, false);
  assert.match(dup.error, /exists/);
  assert.deepStrictEqual(ps.listPlans(main), ['foo']);
  const p = ps.readPlan({ main, plan: 'foo' }).plan;
  assert.strictEqual(p.v, 1);
  assert.strictEqual(p.stage, 'spec');
  assert.strictEqual(p.request, REQUEST);
});

test('claims: gates between stages', () => {
  const main = fresh();
  assert.strictEqual(ps.setClaims({ main, plan: 'p1', claims: [] }).ok, false, 'empty without reason');
  assert.strictEqual(to(main, 'audited').ok, false, 'cannot skip');
  const pf = path.join(makeTempDir(), 'plan.md');
  fs.writeFileSync(pf, '#');
  assert.strictEqual(to(main, 'plan-written', { planFile: pf }).ok, false, 'skip with a valid file');
  assert.ok(to(main, 'claims').ok);
  assert.ok(ps.setClaims({ main, plan: 'p1', claims: [{ id: 'K1', text: 'a', system: 's' }, { id: 'K2', text: 'b', system: 's' }] }).ok);
  const e = to(main, 'spec-review');
  assert.strictEqual(e.ok, false);
  assert.match(e.error, /K1/);
  assert.ok(ps.resolveClaim({ main, plan: 'p1', id: 'K1', status: 'corroborated', source: 's', by: 'me' }).ok);
  assert.ok(ps.resolveClaim({ main, plan: 'p1', id: 'K2', status: 'refuted', source: 's', by: 'me' }).ok);
  const e2 = to(main, 'spec-review');
  assert.strictEqual(e2.ok, false, 'refuted without superseded');
  assert.match(e2.error, /K2/);
  assert.deepStrictEqual(ps.claimsOpen(get(main)), [{ id: 'K2', status: 'refuted' }]);
  assert.ok(ps.resolveClaim({ main, plan: 'p1', id: 'K2', status: 'hypothesis' }).ok);
  assert.ok(to(main, 'spec-review').ok);
});

test('claims: refuted with superseded passes', () => {
  const main = fresh();
  assert.ok(to(main, 'claims').ok);
  assert.ok(ps.setClaims({ main, plan: 'p1', claims: [{ id: 'K1', text: 'a', system: 's' }] }).ok);
  assert.ok(ps.resolveClaim({ main, plan: 'p1', id: 'K1', status: 'refuted', superseded: true }).ok);
  assert.ok(to(main, 'spec-review').ok);
});

test('claims: none needs a reason', () => {
  const main = fresh();
  assert.ok(to(main, 'claims').ok);
  assert.strictEqual(ps.setClaims({ main, plan: 'p1', claims: [], noneReason: '' }).ok, false);
  assert.ok(ps.setClaims({ main, plan: 'p1', claims: [], noneReason: 'spec sin supuestos sobre sistemas' }).ok);
  assert.ok(to(main, 'spec-review').ok);
});

function untilScopeCard(main) {
  assert.ok(to(main, 'claims').ok);
  assert.ok(ps.setClaims({ main, plan: 'p1', claims: [], noneReason: 'n/a' }).ok);
  assert.ok(to(main, 'spec-review').ok);
}

test('scope card: save, approve, change, re-save', () => {
  const main = fresh();
  untilScopeCard(main);
  assert.strictEqual(to(main, 'scope-card').ok, false, 'needs a saved card');
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'none');
  const bad = ps.saveScopeCard({ main, plan: 'p1', text: CARD().replace('una tarjeta de alcance', 'otra cosa') });
  assert.strictEqual(bad.ok, false);
  assert.ok(ps.saveScopeCard({ main, plan: 'p1', text: CARD() }).ok);
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'draft');
  assert.ok(to(main, 'scope-card').ok);
  assert.strictEqual(ps.approveScopeCard({ main, plan: 'p1', quote: '', now: NOW }).ok, false);
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'draft');
  assert.ok(ps.approveScopeCard({ main, plan: 'p1', quote: 'dale, aprobada', now: NOW }).ok);
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'approved');
  assert.strictEqual(get(main).scopeCard.approved.quote, 'dale, aprobada');
  const file = path.join(ps.planDir(main, 'p1'), 'scope-card.md');
  fs.appendFileSync(file, '\nextra\n');
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'changed');
  assert.ok(ps.saveScopeCard({ main, plan: 'p1', text: CARD() }).ok);
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'draft');
  assert.strictEqual(get(main).scopeCard.approved, undefined);
});

function untilAudited(main, planFile) {
  untilScopeCard(main);
  assert.ok(ps.saveScopeCard({ main, plan: 'p1', text: CARD() }).ok);
  assert.ok(to(main, 'scope-card').ok);
  fs.writeFileSync(planFile, '# plan\n');
}

test('audit state and gates to plan-written / audited / executing', () => {
  const main = fresh();
  const planFile = path.join(makeTempDir(), 'plan.md');
  untilAudited(main, planFile);
  assert.strictEqual(to(main, 'plan-written', { planFile: path.join(main, 'nope.md') }).ok, false);
  assert.ok(to(main, 'plan-written', { planFile }).ok);
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'none');
  assert.strictEqual(to(main, 'audited', { planFile }).ok, false);
  const sha = require('node:crypto').createHash('sha256').update(fs.readFileSync(planFile)).digest('hex');
  ps.recordAudit({ main, plan: 'p1', audit: { verdict: 'APPROVE', at: NOW, planSha256: sha, incomplete: false, findings: [] } });
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  fs.appendFileSync(planFile, 'x');
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'stale');
  assert.strictEqual(to(main, 'audited', { planFile }).ok, false);
  fs.writeFileSync(planFile, '# plan\n');
  ps.recordAudit({ main, plan: 'p1', audit: { verdict: 'ESCALATE', at: NOW, planSha256: sha, incomplete: true, findings: [] } });
  assert.strictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'incomplete');
  ps.recordAudit({ main, plan: 'p1', audit: { verdict: 'REQUEST_CHANGES', at: NOW, planSha256: sha, incomplete: false, findings: [{}] } });
  assert.notStrictEqual(ps.auditState({ main, plan: 'p1', planFile }), 'ok');
  ps.recordAudit({ main, plan: 'p1', audit: { verdict: 'APPROVE', at: NOW, planSha256: sha, incomplete: false, findings: [] } });
  assert.ok(to(main, 'audited', { planFile }).ok);
  // executing exige la tarjeta aprobada
  assert.strictEqual(to(main, 'executing').ok, false, 'draft');
  assert.ok(ps.approveScopeCard({ main, plan: 'p1', quote: 'ok', now: NOW }).ok);
  fs.appendFileSync(path.join(ps.planDir(main, 'p1'), 'scope-card.md'), '\n');
  assert.strictEqual(to(main, 'executing').ok, false, 'changed');
  assert.ok(ps.saveScopeCard({ main, plan: 'p1', text: CARD() }).ok);
  assert.ok(ps.approveScopeCard({ main, plan: 'p1', quote: 'ok', now: NOW }).ok);
  assert.ok(to(main, 'executing').ok);
  assert.strictEqual(get(main).stage, 'executing');
});

test('reopen goes back and clears approval and audit', () => {
  const main = fresh();
  const planFile = path.join(makeTempDir(), 'plan.md');
  untilAudited(main, planFile);
  assert.ok(ps.approveScopeCard({ main, plan: 'p1', quote: 'ok', now: NOW }).ok);
  ps.recordAudit({ main, plan: 'p1', audit: { verdict: 'APPROVE', at: NOW, planSha256: 'x', incomplete: false, findings: [] } });
  assert.strictEqual(to(main, 'claims').ok, false, 'backwards needs reopen');
  assert.ok(to(main, 'claims', { reopen: true }).ok);
  const p = get(main);
  assert.strictEqual(p.stage, 'claims');
  assert.strictEqual(p.scopeCard.approved, undefined);
  assert.strictEqual(p.audit, undefined);
});

test('runnableBeforeApproval', () => {
  const plan = { tasks: [{ id: 'T1', added: [] }, { id: 'T2', added: ['A1'] }, { id: 'T3', added: [] }], scopeCard: { added: [{ id: 'A1', text: 'x' }] } };
  assert.deepStrictEqual(ps.runnableBeforeApproval(plan, { limit: 1 }).map((t) => t.id), ['T1']);
  assert.deepStrictEqual(ps.runnableBeforeApproval(plan, { limit: 5 }).map((t) => t.id), ['T1', 'T3']);
  assert.deepStrictEqual(ps.runnableBeforeApproval(plan, { limit: 0 }), []);
  assert.deepStrictEqual(ps.runnableBeforeApproval(plan, {}), []);
});

test('a truncated plan.json is not ok and not missing', () => {
  const main = fresh();
  const file = path.join(ps.planDir(main, 'p1'), 'plan.json');
  fs.writeFileSync(file, '{"v":1,"plan":');
  const r = ps.readPlan({ main, plan: 'p1' });
  assert.strictEqual(r.ok, false);
  assert.ok(!r.missing);
  assert.strictEqual(ps.readPlan({ main, plan: 'nada' }).missing, true);
  assert.strictEqual(ps.scopeCardState({ main, plan: 'p1' }), 'none');
});
