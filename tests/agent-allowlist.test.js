'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, runLauncher } = require('./helpers');
const gate = require('../plugins/pignolo/hooks/handlers/agent-gate');

function activeRepo() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '# proyecto\n');
  return repo;
}
const call = (repo, subagent, extra = {}) => {
  const calls = { snapshot: 0, backupRefs: 0 };
  const ctx = {
    env: { PIGNOLO_HOME: makeTempDir('pignolo-home-'), ...(extra.env || {}) },
    snapshot: extra.snapshot || (() => { calls.snapshot += 1; return null; }),
    backupRefs: extra.backupRefs || (() => { calls.backupRefs += 1; return null; }),
  };
  const toolInput = subagent === undefined ? {} : { subagent_type: subagent };
  return { r: gate.run({ tool_name: 'Agent', tool_input: toolInput, cwd: repo, session_id: 's' }, ctx), calls };
};

const repo = activeRepo();

for (const t of ['pignolo:implementer', 'pignolo:review-risk', 'pignolo-ui:ui-option', 'pignolo-ui:ui-auditor']) {
  test(`allows ${t}`, () => {
    const { r } = call(repo, t);
    assert.deepStrictEqual({ exit: r.exit, stdout: r.stdout || '', stderr: r.stderr || '' }, { exit: 0, stdout: '', stderr: '' });
  });
}

for (const t of ['general-purpose', 'Explore', 'Plan', 'ui-option', 'pignolo-ui-x:ui-option', 'pignolo-ui:other', 'pignolo:', 'PIGNOLO:implementer', 'other:implementer', 'fork', '', undefined, 42]) {
  test(`denies ${JSON.stringify(t)}`, () => {
    const { r, calls } = call(repo, t);
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /Alternativa:/);
    assert.strictEqual(calls.snapshot + calls.backupRefs, 0);
  });
}

test('without project.md any agent passes silently', () => {
  const plain = makeRepo();
  for (const t of ['Explore', 'general-purpose']) {
    const { r } = call(plain, t);
    assert.deepStrictEqual({ exit: r.exit, stdout: r.stdout || '' }, { exit: 0, stdout: '' });
  }
});

test('/pignolo:off turns the allowlist off but backups still run', () => {
  const r0 = activeRepo();
  fs.writeFileSync(path.join(r0, '.pignolo', '.disabled'), '');
  const { r, calls } = call(r0, 'Explore');
  assert.strictEqual(r.exit, 0);
  assert.deepStrictEqual(calls, { snapshot: 1, backupRefs: 1 });
});

test('PIGNOLO_DISABLED=1 turns off allowlist and backups', () => {
  const { r, calls } = call(repo, 'Explore', { env: { PIGNOLO_DISABLED: '1' } });
  assert.strictEqual(r.exit, 0);
  assert.deepStrictEqual(calls, { snapshot: 0, backupRefs: 0 });
});

test('canary skips backups', () => {
  const { r, calls } = call(repo, 'pignolo:explorer', { env: { PIGNOLO_CANARY: '1' } });
  assert.strictEqual(r.exit, 0);
  assert.deepStrictEqual(calls, { snapshot: 0, backupRefs: 0 });
});

test('an allowed dispatch runs both backups with the expected arguments', () => {
  const seen = {};
  call(repo, 'pignolo:explorer', {
    snapshot: (o) => { seen.snap = o; return null; },
    backupRefs: (o) => { seen.refs = o; return null; },
  });
  assert.strictEqual(seen.snap.reason, 'antes-de-despacho');
  assert.strictEqual(seen.snap.timeoutMs, 2000);
  assert.strictEqual(seen.refs.outside, false);
});

test('a failing backup lets the dispatch through with a systemMessage', () => {
  const boom = () => { throw new Error('boom'); };
  for (const extra of [{ snapshot: boom }, { backupRefs: boom }]) {
    const { r } = call(repo, 'pignolo:explorer', extra);
    assert.strictEqual(r.exit, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /boom/);
  }
});

test('launcher smoke: Explore is denied in an active project', () => {
  const res = runLauncher('agent-gate', { tool_name: 'Agent', tool_input: { subagent_type: 'Explore' }, cwd: repo });
  assert.strictEqual(res.status, 2);
  assert.match(res.stderr, /Alternativa:/);
});
