'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir, runLauncher, git } = require('./helpers');
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

// Checklist manual del hito 2: negar general-purpose sugiriendo pignolo:explorer no servía.
for (const [t, alt] of [['Explore', /pignolo:explorer/], ['Plan', /pignolo:explorer/], ['general-purpose', /conversación principal.*\/pignolo:off/], ['fork', /conversación principal.*\/pignolo:off/]]) {
  test(`the alternative for ${t} fits the request`, () => {
    const { r } = call(repo, t);
    assert.match(r.stderr, alt);
    if (t === 'general-purpose' || t === 'fork') assert.doesNotMatch(r.stderr, /pignolo:explorer/);
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

// Hallazgo I4 de la revisión final: el proyecto activo se busca subiendo desde el cwd
// con fs, sin git. Antes, sin git (o con rev-parse vencido) root = cwd y un cwd en un
// subdirectorio dejaba pasar Explore.
test('a cwd in a subdirectory of an active project denies Explore, also without git', () => {
  const r0 = activeRepo();
  const sub = path.join(r0, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const plain = makeTempDir('pignolo-plain-');
  fs.mkdirSync(path.join(plain, '.pignolo'));
  fs.writeFileSync(path.join(plain, '.pignolo', 'project.md'), '# proyecto\n');
  fs.mkdirSync(path.join(plain, 'sub'));
  const savedPath = process.env.PATH;
  try {
    for (const noGit of [false, true]) {
      if (noGit) process.env.PATH = '';
      for (const cwd of [sub, path.join(plain, 'sub')]) {
        const { r, calls } = call(cwd, 'Explore');
        assert.strictEqual(r.exit, 2, `${cwd} sin git: ${noGit}`);
        assert.strictEqual(calls.snapshot + calls.backupRefs, 0);
      }
    }
  } finally {
    process.env.PATH = savedPath;
  }
});

test('the search for project.md stops at the first directory with .git', () => {
  const outer = activeRepo();
  const inner = path.join(outer, 'vendor', 'otro');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
  const { r } = call(inner, 'Explore');
  assert.strictEqual(r.exit, 0);
});

// Hallazgo C1: el gate reparte el plazo del launcher (ctx.deadline). Si la instantánea
// se come el presupuesto, el respaldo de refs se saltea con aviso y el despacho pasa.
test('a slow snapshot that eats the budget skips the refs backup with a warning and the dispatch passes', () => {
  const seen = { refs: 0 };
  const deadline = Date.now() + 1500;
  const sleepUntil = (t) => { const left = t - Date.now(); if (left > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, left); };
  const r = gate.run({ tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:explorer' }, cwd: repo, session_id: 's' }, {
    env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') },
    deadline,
    snapshot: (o) => { assert.ok(o.timeoutMs <= deadline - Date.now()); sleepUntil(deadline - 100); return null; },
    backupRefs: () => { seen.refs += 1; return null; },
  });
  assert.ok(Date.now() < deadline, 'el gate terminó antes del plazo');
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(seen.refs, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /respaldo de refs/);
});

test('the refs backup gets the remaining budget and only branches', () => {
  const seen = {};
  const deadline = Date.now() + 3000;
  gate.run({ tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:explorer' }, cwd: repo }, {
    env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') },
    deadline,
    snapshot: () => null,
    backupRefs: (o) => { seen.refs = { ...o, at: Date.now() }; return null; },
  });
  assert.ok(seen.refs.timeoutMs > 0 && seen.refs.at + seen.refs.timeoutMs < deadline, JSON.stringify(seen.refs));
  assert.strictEqual(seen.refs.tags, false);
});

// C1 por el launcher: un repo sin pignolo con miles de tags. Antes el respaldo de refs
// copiaba todos los tags antes de cada despacho y el launcher negaba por plazo (exit 2).
test('launcher: Explore in a repo with 4000 tags and no project.md passes (exit 0 within the 3 s deadline)', () => {
  const big = makeRepo();
  const sha = git(['rev-parse', 'HEAD'], big);
  const input = Array.from({ length: 4000 }, (_, i) => `create refs/tags/t${String(i).padStart(5, '0')} ${sha}\n`).join('');
  execFileSync('git', ['update-ref', '--stdin'], { cwd: big, input, stdio: ['pipe', 'ignore', 'pipe'] });
  const t0 = Date.now();
  const res = runLauncher('agent-gate', { tool_name: 'Agent', tool_input: { subagent_type: 'Explore' }, cwd: big, session_id: 's' });
  const ms = Date.now() - t0;
  assert.strictEqual(res.status, 0, `${res.stderr} (${ms} ms)`);
  assert.ok(ms < 3000, `${ms} ms`);
});
