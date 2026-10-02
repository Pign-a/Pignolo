'use strict';
// Compuertas, sellos y handback-gate de punta a punta (spec §15 `gates`): el código real,
// sin inyecciones, por los scripts y el launcher (un subproceso por paso).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, runLauncher, git, PLUGIN_ROOT } = require('./helpers');
const { runGate } = require('../plugins/pignolo/lib/gate');
const { workingTree } = require('../plugins/pignolo/lib/changes');
const { repoIdFor, writeSeal } = require('../plugins/pignolo/lib/seals');

const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
const HOME = process.env.PIGNOLO_HOME;

const projectMd = ({ type, onDone }) => [
  '---',
  `type: ${type}`,
  'gates:',
  `  on-done: ${onDone}`,
  'test-paths:',
  '  - tests/',
  'protected-test-config:',
  '  - check.js',
  '---',
  '',
].join('\n');

function put(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function script(name, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: HOME, PIGNOLO_DISABLED: '' }, timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const runJs = (main, args) => script('run.js', [...args, '--cwd', main], main);

let agentN = 0;
// Cierre de un escritor por el launcher: PreToolUse sobre SubagentHandback (siempre verifica).
function handback(wt, agent, msg = 'listo\nDONE') {
  agentN += 1;
  return runLauncher('handback-gate', {
    hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', tool_input: { message: msg },
    agent_type: agent, agent_id: `agent-${agentN}`, cwd: wt,
  }, { PIGNOLO_HOME: HOME });
}
function stopHook(wt, agent) {
  agentN += 1;
  return runLauncher('handback-gate', {
    hook_event_name: 'SubagentStop', agent_type: agent, agent_id: `agent-${agentN}`,
    last_assistant_message: 'listo\nDONE', stop_hook_active: false, cwd: wt,
  }, { PIGNOLO_HOME: HOME });
}

// Sello PASS forjado para el árbol actual: deja que el handler solo frene por integridad.
function forgeSeal(wt, status) {
  const treeHash = workingTree({ cwd: wt });
  const repoId = repoIdFor({ cwd: wt });
  writeSeal({
    env: { PIGNOLO_HOME: HOME }, repoId, log: 'ok\n',
    seal: {
      v: 1, repoId, sha: null, treeHash, treeAfter: treeHash, level: 'on-done', command: 'node check.js',
      exit: status === 'PASS' ? 0 : 1, status, logHash: '', time: new Date().toISOString(), task: 'demo',
      noTestsReason: null, checks: { scope: [], emptied: [], integrity: [], envDetect: [] },
    },
  });
}

test('§15 gates: flujo daily de punta a punta', async (t) => {
  const main = makeRepo();
  put(main, '.pignolo/project.md', projectMd({ type: 'code-tested', onDone: 'node check.js' }));
  put(main, 'check.js', 'process.exit(0);\n');
  put(main, 'src/a.js', 'module.exports = 0;\n');
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'C0'], main);
  const c0 = git(['rev-parse', 'HEAD'], main);

  assert.strictEqual(runJs(main, ['start', '--flow', 'daily']).status, 0);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  const day = new Date().toISOString().slice(0, 10);
  git(['worktree', 'add', '-q', '-b', `task/daily/${day}-demo`, wt, c0], main);
  const reg = runJs(main, ['task', '--id', 'demo', '--worktree', wt, '--base', c0, '--file', 'tests/a.test.js', '--agent', 'pignolo:test-writer']);
  assert.strictEqual(reg.status, 0, reg.stderr);

  await t.test('test-writer DONE with only tests/a.test.js changed -> 0', () => {
    put(wt, 'tests/a.test.js', "require('../src/a');\n");
    const r = stopHook(wt, 'pignolo:test-writer');
    assert.strictEqual(r.status, 0, r.stderr);
  });

  git(['add', '-A'], wt);
  git(['commit', '-q', '-m', 'C1 tests'], wt);
  const c1 = git(['rev-parse', 'HEAD'], wt);
  assert.notStrictEqual(c1, c0);
  const reg2 = runJs(main, ['task', '--id', 'demo', '--test-ref', c1, '--file', 'src/a.js', '--agent', 'pignolo:implementer']);
  assert.strictEqual(reg2.status, 0, reg2.stderr);
  const task = JSON.parse(fs.readFileSync(path.join(main, '.pignolo', 'run.json'), 'utf8')).tasks.demo;
  assert.strictEqual(task.testRef, c1);
  assert.strictEqual(task.base, c0);

  await t.test('change in src/a.js after C1 -> gate PASS (not SCOPE) and handback 0', () => {
    put(wt, 'src/a.js', 'module.exports = 1;\n');
    const g = script('gate.js', ['--level', 'on-done', '--task'], wt);
    assert.strictEqual(g.status, 0, g.stderr);
    assert.strictEqual(JSON.parse(g.stdout).status, 'PASS');
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout, '');
  });

  await t.test('another change without re-sealing -> 2 (seal of another tree-hash)', () => {
    put(wt, 'src/a.js', 'module.exports = 2;\n');
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 2, r.stderr);
    assert.match(r.stderr, /sello/);
    assert.match(r.stderr, /Alternativa:/);
  });

  await t.test('protected test altered -> gate INTEGRITY (1) and handback 2', () => {
    put(wt, 'tests/a.test.js', '// vaciado\n');
    const g = script('gate.js', ['--level', 'on-done', '--task'], wt);
    assert.strictEqual(g.status, 1);
    assert.strictEqual(JSON.parse(g.stdout).status, 'INTEGRITY');
    assert.strictEqual(handback(wt, 'pignolo:implementer').status, 2);
    // El handler solo, con un sello PASS forjado para ese árbol: la integridad lo frena igual.
    forgeSeal(wt, 'PASS');
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 2, r.stderr);
    assert.match(r.stderr, /tests\/a\.test\.js/);
    git(['checkout', '--', 'tests/a.test.js'], wt);
  });

  await t.test('protected config (check.js) changed -> handback 2', () => {
    put(wt, 'check.js', 'process.exit(0); // toqueteado\n');
    forgeSeal(wt, 'PASS');
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 2, r.stderr);
    assert.match(r.stderr, /check\.js/);
    git(['checkout', '--', 'check.js'], wt);
  });

  await t.test('run.js end -> handback 0 (no flow, no gate)', () => {
    assert.strictEqual(runJs(main, ['end']).status, 0);
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 0, r.stderr);
  });
});

test('§15 gates: an empty gate is never green', async (t) => {
  const main = makeRepo();
  const commit = (msg, md) => {
    put(main, '.pignolo/project.md', md);
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', msg], main);
    return git(['rev-parse', 'HEAD'], main);
  };
  const p1 = commit('untested, empty gate', projectMd({ type: 'code-untested', onDone: '""' }));
  const p2 = commit('gate declared', projectMd({ type: 'code-untested', onDone: 'node check.js' }));
  const p3 = commit('gate removed', projectMd({ type: 'code-untested', onDone: '""' }));
  assert.strictEqual(runJs(main, ['start', '--flow', 'daily']).status, 0);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'task/daily/x-demo', wt, p3], main);

  await t.test('run.js task on a base with empty gates.on-done -> 1', () => {
    const r = runJs(main, ['task', '--id', 'demo', '--worktree', wt, '--base', p1, '--file', 'src/a.js', '--agent', 'pignolo:implementer']);
    assert.strictEqual(r.status, 1, r.stdout);
  });
  await t.test('gate command removed in a later commit used as testRef -> 1', () => {
    const r = runJs(main, ['task', '--id', 'demo', '--worktree', wt, '--base', p2, '--test-ref', p3, '--file', 'src/a.js', '--agent', 'pignolo:implementer']);
    assert.strictEqual(r.status, 1, r.stdout);
  });
  await t.test('lib/gate on that base -> NO_GATE, and a NO_GATE seal does not let DONE through', () => {
    const now = Date.now();
    const run = {
      v: 1, flow: 'daily', started: new Date(now).toISOString(), expires: new Date(now + 3600e3).toISOString(),
      task: { id: 'demo', worktree: wt, base: p3, files: ['src/a.js'], agents: ['pignolo:implementer'] },
    };
    fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify(run));
    put(wt, 'src/a.js', 'module.exports = 1;\n');
    const s = runGate({ cwd: wt, level: 'on-done', env: { PIGNOLO_HOME: HOME }, task: run.task });
    assert.strictEqual(s.status, 'NO_GATE');
    const r = handback(wt, 'pignolo:implementer');
    assert.strictEqual(r.status, 2, r.stderr);
    assert.match(r.stderr, /NO_GATE/);
  });
});
