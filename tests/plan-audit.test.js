'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));

const J = (obj) => `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
const claim = (id, over = {}) => ({ id, task: 'T1', claim: `claim ${id}`, how: `how ${id}`, ...over });
const T0 = Date.parse('2026-09-30T10:00:00.000Z');

test('constants', () => {
  assert.strictEqual(pa.MAX_CLAIMS, 8);
  assert.strictEqual(pa.MAX_BLOCKS, 2);
  assert.strictEqual(pa.TTL_MIN, 30);
  assert.strictEqual(pa.auditDir('/m', 'p1'), path.join('/m', '.pignolo', 'tmp', 'plan-audit', 'p1'));
});

test('parseReview takes the last json block and validates it', () => {
  const first = J({ findings: [], claims: [claim('X9')] });
  const last = J({ findings: [{ task: 'T1', kind: 'k', evidence: 'e' }], claims: [claim('C1'), claim('C2')] });
  const ok = pa.parseReview(`informe\n${first}\ntexto\n${last}\n`);
  assert.strictEqual(ok.error, undefined);
  assert.deepStrictEqual(ok.claims.map((c) => c.id), ['C1', 'C2']);
  assert.strictEqual(ok.findings.length, 1);
  assert.ok(pa.parseReview(J({ findings: [] })).error, 'no claims');
  assert.ok(pa.parseReview(J({ findings: [], claims: Array.from({ length: 9 }, (_, i) => claim(`C${i}`)) })).error, '9 claims');
  assert.ok(pa.parseReview(J({ findings: [], claims: [claim('C1'), claim('C1')] })).error, 'same id');
  assert.ok(pa.parseReview(J({ findings: [], claims: [claim('C1', { how: '' })] })).error, 'empty how');
  assert.ok(pa.parseReview('sin bloque').error, 'no block');
});

test('parseVerification reports the claims without a valid entry', () => {
  const claims = [claim('C1'), claim('C2'), claim('C3')];
  const e = (id, over = {}) => ({ id, verdict: 'holds', experiment: `ran ${id}`, evidence: 'ok', ...over });
  const r = pa.parseVerification(J([e('C1'), e('C3')]), claims);
  assert.deepStrictEqual(r.missing, ['C2']);
  assert.strictEqual(r.entries.length, 2);
  assert.deepStrictEqual(pa.parseVerification(J([e('C1'), e('C2', { experiment: '' }), e('C3')]), claims).missing, ['C2']);
  assert.deepStrictEqual(pa.parseVerification(J([e('C1'), e('C2', { verdict: 'maybe' }), e('C3')]), claims).missing, ['C2']);
  const none = pa.parseVerification('nada', claims);
  assert.ok(none.error);
  assert.deepStrictEqual(none.missing, ['C1', 'C2', 'C3']);
});

test('mode: active inside the window, inactive after 30 min, broken file inactive', () => {
  const main = makeTempDir('pignolo-audit-');
  const m = pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')], planSha256: 'abc', now: T0 });
  assert.strictEqual(m.mode, 'verify');
  assert.strictEqual(m.experiments, 0);
  assert.strictEqual(m.blocks, 0);
  assert.strictEqual(m.incomplete, false);
  const file = path.join(pa.auditDir(main, 'p1'), 'mode.json');
  assert.ok(fs.existsSync(file));
  const act = pa.readMode({ main, now: T0 + 5 * 60000 });
  assert.strictEqual(act.active, true);
  assert.strictEqual(act.plan, 'p1');
  assert.deepStrictEqual(pa.readMode({ main, now: T0 + 31 * 60000 }), { active: false });
  fs.writeFileSync(file, '{ roto');
  assert.deepStrictEqual(pa.readMode({ main, now: T0 + 1000 }), { active: false });
  assert.deepStrictEqual(pa.readMode({ main: makeTempDir(), now: T0 }), { active: false });
});

test('countExperiment adds one call and logs the command; endMode is idempotent', () => {
  const main = makeTempDir('pignolo-audit-');
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1'), claim('C2')], planSha256: 'abc', now: Date.now() });
  pa.countExperiment({ main, command: 'node scratch/a.js' });
  pa.countExperiment({ main, command: 'node scratch/b.js' });
  const m = pa.readMode({ main, now: Date.now() });
  assert.strictEqual(m.experiments, 2);
  const log = fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'bash-calls.log'), 'utf8');
  assert.match(log, /node scratch\/a\.js/);
  assert.match(log, /node scratch\/b\.js/);
  pa.endMode({ main, plan: 'p1' });
  pa.endMode({ main, plan: 'p1' });
  assert.deepStrictEqual(pa.readMode({ main, now: Date.now() }), { active: false });
  assert.strictEqual(pa.countExperiment({ main, command: 'x' }), null);
});

function verifyMode(over = {}) {
  return { v: 1, plan: 'p1', mode: 'verify', experiments: 1, blocks: 0, incomplete: false, claims: [claim('C1'), claim('C2'), claim('C3')], scratch: '/m/scratch', ...over };
}
const entries = (ids) => J(ids.map((id) => ({ id, verdict: 'holds', experiment: 'ran it', evidence: 'ok' })));

test('stopDecision in verify: blocks with the number and ids, at most twice', () => {
  const mode = verifyMode();
  const d = pa.stopDecision({ mode, lastMessage: 'listo' });
  assert.strictEqual(d.block, true);
  assert.match(d.reason, /You ran 1 experiment\(s\) for 3 claim\(s\): 2 still missing/);
  assert.match(d.reason, /C1/);
  assert.match(d.reason, /\/m\/scratch/);
  assert.strictEqual(mode.blocks, 1);
  assert.ok(pa.stopDecision({ mode, lastMessage: 'listo' }).block);
  assert.strictEqual(mode.blocks, 2);
  assert.strictEqual(pa.stopDecision({ mode, lastMessage: 'listo' }), null);
  assert.strictEqual(mode.incomplete, true);
  assert.strictEqual(mode.blocks, 2);
});

test('stopDecision in verify: enough experiments but no entries still blocks; complete passes untouched', () => {
  const m1 = verifyMode({ experiments: 3 });
  assert.strictEqual(pa.stopDecision({ mode: m1, lastMessage: 'sin entradas' }).block, true);
  const m2 = verifyMode({ experiments: 3 });
  assert.strictEqual(pa.stopDecision({ mode: m2, lastMessage: entries(['C1', 'C2', 'C3']) }), null);
  assert.strictEqual(m2.blocks, 0);
  assert.strictEqual(m2.incomplete, false);
});

test('stopDecision in review: needs a valid json block', () => {
  const mode = { mode: 'review', blocks: 0, incomplete: false, claims: [] };
  assert.strictEqual(pa.stopDecision({ mode, lastMessage: 'sin bloque' }).block, true);
  assert.strictEqual(pa.stopDecision({ mode, lastMessage: J({ findings: [], claims: [claim('C1')] }) }), null);
});

test('buildAudit', () => {
  const review = { findings: [], claims: [claim('C1'), claim('C2')] };
  const holds = (id) => ({ id, verdict: 'holds', experiment: 'x', evidence: 'ok' });
  const ver = (list) => ({ entries: list, missing: review.claims.map((c) => c.id).filter((id) => !list.some((e) => e.id === id)) });
  const base = { review, probe: { closed: [], findings: [] }, planCheck: null, mode: { incomplete: false } };

  assert.strictEqual(pa.buildAudit({ ...base, verification: ver([holds('C1'), holds('C2')]) }).verdict, 'APPROVE');

  const f = pa.buildAudit({ ...base, verification: ver([holds('C1'), { id: 'C2', verdict: 'false', experiment: 'x', evidence: 'boom' }]) });
  assert.strictEqual(f.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(f.findings.filter((x) => x.kind === 'experiment-false').length, 1);
  assert.strictEqual(f.findings.find((x) => x.kind === 'experiment-false').task, 'T1');

  const inc = pa.buildAudit({ ...base, verification: ver([holds('C1'), { id: 'C2', verdict: 'inconclusive', experiment: 'x', evidence: '?' }]) });
  assert.strictEqual(inc.verdict, 'ESCALATE');
  assert.strictEqual(inc.reason, 'claims-not-verified');

  const miss = pa.buildAudit({ ...base, verification: ver([holds('C1')]) });
  assert.strictEqual(miss.verdict, 'ESCALATE');

  const incomplete = pa.buildAudit({ ...base, mode: { incomplete: true }, verification: ver([holds('C1'), holds('C2')]) });
  assert.strictEqual(incomplete.verdict, 'ESCALATE');
  assert.strictEqual(incomplete.incomplete, true);

  const mixed = pa.buildAudit({ ...base, mode: { incomplete: true }, review: { findings: [{ task: 'T1', kind: 'k', evidence: 'e' }], claims: review.claims }, verification: ver([holds('C1')]) });
  assert.strictEqual(mixed.verdict, 'REQUEST_CHANGES');

  const pc = pa.buildAudit({
    ...base, verification: ver([holds('C1'), holds('C2')]),
    planCheck: { refs: [{ task: 'T1', kind: 'path', value: 'lib/zz.js', ok: false, why: 'no existe' }], blocks: [], tests: null },
  });
  assert.strictEqual(pc.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(pc.findings[0].kind, 'missing-path');

  // una afirmación cerrada por una sonda no necesita experimento
  const probed = pa.buildAudit({
    ...base, probe: { closed: ['C2'], findings: [{ task: 'T1', kind: 'probe x', evidence: 'e', keywords: [] }] }, verification: ver([holds('C1')]),
  });
  assert.strictEqual(probed.verdict, 'REQUEST_CHANGES');
});
