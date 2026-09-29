'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runLauncher, runGuard, makeRepo, makeTempDir, git } = require('./helpers');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
const wipRefs = (repo) => git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/wip'], repo).split('\n').filter(Boolean);

test('blocks a destructive command through the launcher (exit 2, alternative in stderr)', () => {
  const r = runLauncher('guard', bash('git reset --hard', makeRepo()));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /pignolo bloqueó el comando: .*Alternativa:/);
});

test('asks for push through the launcher', () => {
  const r = runLauncher('guard', bash('git push origin x', makeRepo()));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('allows a harmless command with empty output', () => {
  const r = runGuard(bash('git status', makeRepo()));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('guard handler outside a repo does not fail', () => {
  const r = runGuard(bash('ls', makeTempDir()));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('takes a WIP snapshot before an allowed shell command in a dirty repo', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'sin commitear\n');
  runGuard(bash('npm test', repo));
  assert.strictEqual(wipRefs(repo).length, 1);
});

test('a blocked command takes no snapshot (H7)', () => {
  let calls = 0;
  const r = guard.run(bash('git reset --hard', makeRepo()), { env: {}, snapshot: () => { calls += 1; } });
  assert.strictEqual(r.exit, 2);
  assert.strictEqual(calls, 0);
});

test('the snapshot deadline leaves room inside the 3 s launcher deadline (H7)', () => {
  let got = null;
  guard.run(bash('npm test', makeRepo()), { env: {}, snapshot: (o) => { got = o; } });
  assert.ok(got && got.timeoutMs > 0 && got.timeoutMs <= 2000, JSON.stringify(got));
});

test('snapshot failure on an allowed command is reported with systemMessage, exit 0 (H7)', () => {
  const failing = () => { throw new Error('timeout simulado'); };
  const r = guard.run(bash('git status', makeRepo()), { env: {}, snapshot: failing });
  assert.strictEqual(r.exit, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /instantánea WIP falló \(timeout simulado\)/);
  const ask = guard.run(bash('git push', makeRepo()), { env: {}, snapshot: failing });
  const out = JSON.parse(ask.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.systemMessage, /timeout simulado/);
});

test('PIGNOLO_DISABLED=1 lets everything through', () => {
  const r = runLauncher('guard', bash('git reset --hard', makeRepo()), { PIGNOLO_DISABLED: '1' });
  assert.strictEqual(r.status, 0);
});

test('/pignolo:off project flag does NOT disable the guard', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), 'x');
  assert.strictEqual(runLauncher('guard', bash('git reset --hard', repo)).status, 2);
});

test('powershell tool name uses the powershell rules, in any case (H13)', () => {
  for (const tool_name of ['PowerShell', 'powershell', 'POWERSHELL']) {
    const r = guard.run({ tool_name, tool_input: { command: 'git stash' }, cwd: makeTempDir() }, { env: {}, snapshot: () => null });
    assert.strictEqual(r.exit, 2, tool_name);
  }
});

test('missing, empty or non-string command exits 2 (H13)', () => {
  const repo = makeRepo();
  for (const ti of [undefined, {}, { command: '' }, { command: '  ' }, { command: ['git', 'reset', '--hard'] }, { command: 42 }]) {
    const r = runLauncher('guard', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: ti, cwd: repo });
    assert.strictEqual(r.status, 2, JSON.stringify(ti));
  }
});

test('merge while on main asks (branch read from the repo)', () => {
  const r = runLauncher('guard', bash('git merge feature', makeRepo()));
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('merge asks when the branch cannot be read (detached HEAD), instead of failing open', () => {
  const repo = makeRepo();
  git(['checkout', '-q', '--detach'], repo);
  const r = runLauncher('guard', bash('git merge feature', repo));
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('checkout of a file that exists in cwd is blocked (cwd reaches the evaluator)', () => {
  assert.strictEqual(runLauncher('guard', bash('git checkout a.txt', makeRepo())).status, 2);
});

// spec §15 `backup`: un comando que la guardia permite pero destruye trabajo
// sin commitear se recupera desde la instantánea tomada antes de correrlo.
test('work destroyed by an allowed command is recoverable from refs/pignolo/wip', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'tools'));
  fs.writeFileSync(path.join(repo, 'tools', 'pisar.js'), "require('fs').writeFileSync('a.txt', 'pisado\\n');\n");
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo valioso\n');
  const command = 'node tools/pisar.js';
  const r = runGuard(bash(command, repo));
  assert.strictEqual(r.status, 0, 'the guard allows it');
  spawnSync(process.execPath, ['tools/pisar.js'], { cwd: repo }); // el comando corre
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'pisado\n');
  const [ref] = wipRefs(repo);
  assert.strictEqual(git(['show', `${ref}:a.txt`], repo), 'trabajo valioso');
});

test('protect-paths blocks the project flag', () => {
  const cwd = makeTempDir();
  const r = protect.run({ tool_name: 'Write', tool_input: { file_path: path.join(cwd, '.pignolo', '.disabled') }, cwd }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 2);
});

// cwd distinto a la ruta: solo la normalización de barras puede detectarlo (H11).
test('protect-paths backslash', () => {
  const r = protect.run({ tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\.pignolo\\.disabled' }, cwd: 'C:\\otro' }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 2);
});

test('protect-paths normalizes Windows suffixes and mixed forms (H12)', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  for (const file_path of ['C:\\repo\\.pignolo\\.disabled.', 'C:\\repo\\.pignolo\\.disabled ', 'C:\\repo\\.pignolo\\.disabled::$DATA',
    'C:\\repo\\.pignolo\\.disabled:x', 'C:/repo\\.PIGNOLO/.DISABLED', 'sub/../.pignolo/.disabled']) {
    const r = protect.run({ tool_name: 'Write', tool_input: { file_path }, cwd: 'C:\\otro' }, { env });
    assert.strictEqual(r.exit, 2, file_path);
  }
});

test('protect-paths blocks the global flag', () => {
  const home = makeTempDir();
  const r = protect.run({ tool_name: 'Write', tool_input: { file_path: path.join(home, 'disabled') }, cwd: makeTempDir() }, { env: { PIGNOLO_HOME: home } });
  assert.strictEqual(r.exit, 2);
});

test('protect-paths allows normal files and rejects a non-string path', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  assert.strictEqual(protect.run({ tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, cwd: makeTempDir() }, { env }).exit, 0);
  assert.strictEqual(protect.run({ tool_name: 'Write', tool_input: { file_path: ['x'] }, cwd: makeTempDir() }, { env }).exit, 2);
});

// M3: solo el hilo principal opera el flujo; un subagente (payload con agent_id) no invoca
// scripts/run.js de pignolo. Sin fricción fuera de eso.
test('a subagent cannot run pignolo scripts/run.js; the main thread and other scripts can', async (t) => {
  const { PLUGIN_ROOT } = require('./helpers');
  const repo = makeRepo();
  const runJs = path.join(PLUGIN_ROOT, 'scripts', 'run.js').split(path.sep).join('/');
  const call = (command, agentId) => guard.run({ ...bash(command, repo), ...(agentId ? { agent_id: agentId } : {}) }, { snapshot: () => null });
  for (const [name, command, agentId, exit] of [
    ['subagent run.js end', `node "${runJs}" end`, 'a1', 2],
    ['subagent run.js task --test-authorization via CLAUDE_PLUGIN_ROOT', 'node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" task --id t1 --test-authorization', 'a1', 2],
    ['subagent start --replace from the plugin dir', `cd "${PLUGIN_ROOT.split(path.sep).join('/')}" && node scripts/run.js start --flow daily --replace`, 'a1', 2],
    ['main thread run.js end', `node "${runJs}" end`, undefined, 0],
    ['subagent gate.js', `node "${PLUGIN_ROOT.split(path.sep).join('/')}/scripts/gate.js" --level on-done --task t1`, 'a1', 0],
    ['subagent project scripts/run.js', 'node scripts/run.js', 'a1', 0],
  ]) {
    await t.test(name, () => {
      const r = call(command, agentId);
      assert.strictEqual(r.exit, exit, r.stderr);
      if (exit === 2) assert.match(r.stderr, /Alternativa:/);
    });
  }
});
