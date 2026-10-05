'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
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

test('mode: active inside the window, inactive after 30 min, broken file inactive; mode.json has no counters', () => {
  const main = makeTempDir('pignolo-audit-');
  const m = pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')], planSha256: 'abc', now: T0 });
  assert.strictEqual(m.mode, 'verify');
  const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'mode.json'), 'utf8'))).sort();
  assert.deepStrictEqual(keys, ['claims', 'expires', 'mode', 'plan', 'planSha256', 'started', 'v']);
  const act = pa.readMode({ main, now: T0 + 5 * 60000 });
  assert.strictEqual(act.active, true);
  assert.strictEqual(act.plan, 'p1');
  assert.strictEqual(act.mode, 'verify');
  assert.strictEqual(act.dir, pa.auditDir(main, 'p1'));
  assert.strictEqual(act.planSha256, 'abc');
  assert.deepStrictEqual([act.experiments, act.attempts, act.incomplete], [0, 0, false]);
  assert.deepStrictEqual(pa.readMode({ main, now: T0 + 31 * 60000 }), { active: false });
  fs.writeFileSync(path.join(pa.auditDir(main, 'p1'), 'mode.json'), '{ roto');
  assert.deepStrictEqual(pa.readMode({ main, now: T0 + 1000 }), { active: false });
  assert.deepStrictEqual(pa.readMode({ main: makeTempDir(), now: T0 }), { active: false });
});

test('two mode folders: the live one wins; two live: the latest started; unreadable beside a live one', () => {
  const main = makeTempDir('pignolo-audit-');
  pa.beginMode({ main, plan: 'p2', mode: 'verify', claims: [], planSha256: 'x', now: T0 - 60 * 60000 });
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [], planSha256: 'x', now: T0 });
  assert.strictEqual(pa.readMode({ main, now: T0 + 1000 }).plan, 'p1');
  pa.beginMode({ main, plan: 'p3', mode: 'review', claims: [], planSha256: 'x', now: T0 + 2000 });
  assert.strictEqual(pa.readMode({ main, now: T0 + 3000 }).plan, 'p3');
  fs.mkdirSync(pa.auditDir(main, 'p4'), { recursive: true });
  fs.writeFileSync(path.join(pa.auditDir(main, 'p4'), 'mode.json'), 'roto');
  assert.strictEqual(pa.readMode({ main, now: T0 + 3000 }).plan, 'p3');
});

test('counters are append-only logs: 5 concurrent processes count 5; recordStop returns 1, 2, 3', async () => {
  const main = makeTempDir('pignolo-audit-');
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1'), claim('C2')], planSha256: 'abc', now: Date.now() });
  const script = path.join(makeTempDir('pignolo-audit-script-'), 'rec.js');
  fs.writeFileSync(script, "const pa = require(process.argv[2]);\npa.recordExperiment({ main: process.argv[3], plan: 'p1', command: 'node scratch/' + process.argv[4] + '.js' });\n");
  const lib = path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js');
  await Promise.all([1, 2, 3, 4, 5].map((i) => new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [script, lib, main, String(i)], { stdio: 'ignore' });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  })));
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).experiments, 5);
  const log = fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'bash-calls.log'), 'utf8');
  assert.strictEqual(log.trim().split('\n').length, 5);
  assert.match(log, /node scratch\/3\.js/);
  assert.deepStrictEqual([1, 2, 3].map(() => pa.recordStop({ main, plan: 'p1' })), [1, 2, 3]);
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).attempts, 3);
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).incomplete, false);
  pa.markIncomplete({ main, plan: 'p1' });
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).incomplete, true);
  const stored = JSON.parse(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'mode.json'), 'utf8'));
  assert.strictEqual('experiments' in stored, false, 'mode.json is not rewritten by the counters');
});

test('a multi-line command is logged on one line; endMode is idempotent', () => {
  const main = makeTempDir('pignolo-audit-');
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')], planSha256: 'abc', now: Date.now() });
  pa.recordExperiment({ main, plan: 'p1', command: 'echo a\necho b' });
  assert.strictEqual(pa.readMode({ main, now: Date.now() }).experiments, 1);
  pa.endMode({ main, plan: 'p1' });
  pa.endMode({ main, plan: 'p1' });
  assert.deepStrictEqual(pa.readMode({ main, now: Date.now() }), { active: false });
});

test('beginMode starts a fresh count', () => {
  const main = makeTempDir('pignolo-audit-');
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [], planSha256: 'a', now: Date.now() });
  pa.recordExperiment({ main, plan: 'p1', command: 'x' });
  pa.recordStop({ main, plan: 'p1' });
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [], planSha256: 'a', now: Date.now() });
  const m = pa.readMode({ main, now: Date.now() });
  assert.deepStrictEqual([m.experiments, m.attempts], [0, 0]);
});

const vmode = (over = {}) => ({ active: true, plan: 'p1', mode: 'verify', experiments: 1, attempts: 1, incomplete: false, claims: [claim('C1'), claim('C2'), claim('C3')], dir: '/m/audit', ...over });
const entries = (ids) => J(ids.map((id) => ({ id, verdict: 'holds', experiment: 'ran it', evidence: 'ok' })));

test('stopDecision in verify: blocks with the number and ids; the third attempt is incomplete', () => {
  const d = pa.stopDecision({ mode: vmode(), lastMessage: 'listo', attempt: 1 });
  assert.strictEqual(d.block, true);
  assert.match(d.reason, /You ran 1 experiment\(s\) for 3 claim\(s\): 2 still missing/);
  assert.match(d.reason, /C1/);
  assert.match(d.reason, /audit/);
  assert.strictEqual(pa.stopDecision({ mode: vmode(), lastMessage: 'listo', attempt: 2 }).block, true);
  assert.deepStrictEqual(pa.stopDecision({ mode: vmode(), lastMessage: 'listo', attempt: 3 }), { block: false, incomplete: true });
});

test('stopDecision in verify: enough experiments but no entries still blocks; complete passes, even at attempt 3', () => {
  assert.strictEqual(pa.stopDecision({ mode: vmode({ experiments: 3 }), lastMessage: 'sin entradas', attempt: 1 }).block, true);
  assert.strictEqual(pa.stopDecision({ mode: vmode({ experiments: 3 }), lastMessage: entries(['C1', 'C2', 'C3']), attempt: 1 }), null);
  assert.strictEqual(pa.stopDecision({ mode: vmode({ experiments: 3 }), lastMessage: entries(['C1', 'C2', 'C3']), attempt: 3 }), null);
});

test('stopDecision in review: needs a valid json block; it is pure', () => {
  const mode = { active: true, plan: 'p1', mode: 'review', experiments: 0, attempts: 0, incomplete: false, claims: [], dir: '/m/audit' };
  const copy = JSON.stringify(mode);
  assert.strictEqual(pa.stopDecision({ mode, lastMessage: 'sin bloque', attempt: 1 }).block, true);
  assert.strictEqual(pa.stopDecision({ mode, lastMessage: J({ findings: [], claims: [claim('C1')] }), attempt: 1 }), null);
  assert.deepStrictEqual(pa.stopDecision({ mode, lastMessage: 'sin bloque', attempt: 3 }), { block: false, incomplete: true });
  assert.strictEqual(JSON.stringify(mode), copy);
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

  // los hallazgos de plan-check no entran por su cuenta (I3 de la revisión final de 5b): son
  // evidencia para el revisor, que repite en sus findings lo que confirma
  const pc = pa.buildAudit({
    ...base, verification: ver([holds('C1'), holds('C2')]),
    planCheck: { refs: [{ task: 'T1', kind: 'path', value: 'lib/zz.js', ok: false, why: 'no existe' }], blocks: [], tests: null },
  });
  assert.strictEqual(pc.verdict, 'APPROVE');
  assert.deepStrictEqual(pc.findings, []);

  // una afirmación cerrada por una sonda no necesita experimento
  const probed = pa.buildAudit({
    ...base, probe: { closed: ['C2'], findings: [{ task: 'T1', kind: 'probe x', evidence: 'e', keywords: [] }] }, verification: ver([holds('C1')]),
  });
  assert.strictEqual(probed.verdict, 'REQUEST_CHANGES');
});

test('buildAudit: gravedad (MINOR no frena; ausente o desconocida frena; experiment-false frena)', () => {
  const claims = [claim('C1')];
  const noClaims = { review: { findings: [], claims: [] }, probe: { closed: [], findings: [] }, verification: { entries: [], missing: [] }, mode: { incomplete: false } };
  const fnd = (severity) => ({ ...(severity === undefined ? {} : { severity }), plan: 'Task 1', code: 'lib/x.js:1', text: 't', evidence: 'e' });
  const withFindings = (list) => pa.buildAudit({ ...noClaims, review: { findings: list, claims: [] } });

  const onlyMinor = withFindings([fnd('MINOR')]);
  assert.strictEqual(onlyMinor.verdict, 'APPROVE');
  assert.strictEqual(onlyMinor.minors.length, 1);
  assert.strictEqual(onlyMinor.findings.length, 0);

  const mixed = withFindings([fnd('MINOR'), fnd('IMPORTANT')]);
  assert.strictEqual(mixed.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(mixed.findings.length, 1);
  assert.strictEqual(mixed.minors.length, 1);

  for (const sev of [undefined, 'LOW', 'minor ', 'minor', null, 3]) {
    const r = withFindings([fnd(sev)]);
    assert.strictEqual(r.verdict, 'REQUEST_CHANGES', String(sev));
    assert.strictEqual(r.minors.length, 0);
  }
  assert.strictEqual(withFindings([null]).verdict, 'REQUEST_CHANGES');
  assert.strictEqual(withFindings([fnd('CRITICAL')]).verdict, 'REQUEST_CHANGES');

  // un menor con afirmaciones abiertas sigue la regla de siempre
  const open = pa.buildAudit({ ...noClaims, review: { findings: [fnd('MINOR')], claims }, verification: { entries: [], missing: ['C1'] } });
  assert.strictEqual(open.verdict, 'ESCALATE');

  // las sondas fijas cuentan siempre como importantes, aunque traigan severity MINOR
  const probe = pa.buildAudit({ ...noClaims, probe: { closed: [], findings: [{ ...fnd('MINOR'), kind: 'probe x' }] } });
  assert.strictEqual(probe.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(probe.findings.length, 1);

  // un experiment-false frena aunque el revisor no haya dado hallazgos
  const ef = pa.buildAudit({
    ...noClaims, review: { findings: [], claims }, verification: { entries: [{ id: 'C1', verdict: 'false', experiment: 'x', evidence: 'boom' }], missing: [] },
  });
  assert.strictEqual(ef.verdict, 'REQUEST_CHANGES');
  assert.strictEqual(ef.findings[0].kind, 'experiment-false');
});
