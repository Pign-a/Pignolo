'use strict';
// Carriles trivial y daily de punta a punta por los scripts, en el orden exacto que
// prescriben las skills (hito 3b): lo que el hilo principal ejecuta, sin agentes. Los
// escritores se simulan escribiendo los archivos; su cierre pasa por el launcher real.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, runLauncher, git, PLUGIN_ROOT } = require('./helpers');

const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
const HOME = process.env.PIGNOLO_HOME;
// Sin NODE_TEST_CONTEXT: si no, un `node --test` hijo (la compuerta, el rojo) le reporta al
// runner de esta suite y sale 0 aunque sus tests fallen.
const ENV = { ...process.env, PIGNOLO_HOME: HOME, PIGNOLO_DISABLED: '' };
delete ENV.NODE_TEST_CONTEXT;

function put(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
function script(name, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], {
    cwd, encoding: 'utf8', env: ENV, timeout: 60000,
  });
  let json;
  try { json = JSON.parse(r.stdout); } catch (_) { json = undefined; }
  return { status: r.status, json, stderr: r.stderr };
}
let n = 0;
const stop = (wt, agent) => {
  n += 1;
  return runLauncher('handback-gate', {
    hook_event_name: 'SubagentStop', agent_type: agent, agent_id: `a-${n}`,
    last_assistant_message: 'informe\nDONE', stop_hook_active: false, cwd: wt,
  }, { PIGNOLO_HOME: HOME });
};

function project() {
  const main = makeRepo();
  put(main, '.pignolo/project.md', [
    '---', 'type: code-tested', 'gates:', '  on-done: node --test', 'test-paths:', '  - tests/', '---', '',
  ].join('\n'));
  put(main, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a - b;\n}\nmodule.exports = sum;\n");
  put(main, 'tests/base.test.js', "'use strict';\nrequire('node:test')('base', () => {});\n");
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'C0'], main);
  return main;
}

test('trivial: start, risk --files-from, cambio, gate on-done, risk --diff HEAD, commit, end', () => {
  const main = project();
  assert.strictEqual(script('run.js', ['start', '--flow', 'trivial', '--cwd', main], main).status, 0);
  put(main, '.pignolo/tmp/files.txt', 'src/sum.js\n');
  const before = script('risk.js', ['--files-from', path.join(main, '.pignolo/tmp/files.txt'), '--cwd', main], main);
  assert.strictEqual(before.status, 0, before.stderr);
  assert.strictEqual(before.json.laneFloor, 'trivial');
  put(main, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a + b;\n}\nmodule.exports = sum;\n");
  const gate = script('gate.js', ['--level', 'on-done', '--cwd', main], main);
  assert.strictEqual(gate.status, 0, gate.stderr);
  assert.strictEqual(gate.json.status, 'PASS');
  const after = script('risk.js', ['--diff', 'HEAD', '--cwd', main], main);
  assert.strictEqual(after.status, 0, after.stderr);
  assert.deepStrictEqual([after.json.level, after.json.laneFloor, after.json.reserved], ['low', 'trivial', false], JSON.stringify(after.json));
  git(['add', 'src/sum.js'], main);
  git(['commit', '-q', '-m', 'fix: suma'], main);
  assert.strictEqual(script('run.js', ['end', '--cwd', main], main).status, 0);
});

test('daily: worktree en .pignolo/worktrees, test-writer, rojo, implementer, gate, handback, ledger, merge', () => {
  const main = project();
  assert.strictEqual(script('run.js', ['start', '--flow', 'daily', '--cwd', main], main).status, 0);
  const wt = path.join(main, '.pignolo', 'worktrees', 'sum-fix');
  git(['worktree', 'add', '-q', '-b', 'task/daily/2026-09-30-sum-fix', wt, 'HEAD'], main);
  assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], main).includes('.pignolo/worktrees'), false);
  const base = git(['rev-parse', 'HEAD'], wt);

  // 1. Registro del test-writer (barras invertidas: el script las normaliza).
  let r = script('run.js', ['task', '--id', 'sum-fix', '--worktree', wt, '--base', base, '--file', 'tests\\sum.test.js', '--agent', 'pignolo:test-writer', '--cwd', main], main);
  assert.strictEqual(r.status, 0, r.stderr);
  put(wt, 'tests/sum.test.js', "'use strict';\nconst assert = require('node:assert');\nconst sum = require('../src/sum');\nrequire('node:test')('sum', () => { assert.strictEqual(sum(2, 3), 5); });\n");
  assert.strictEqual(stop(wt, 'pignolo:test-writer').status, 0);
  r = script('run.js', ['status', '--cwd', main], main);
  assert.strictEqual(r.json.handback.accepted, true);

  // 2. Rojo demostrado por el orquestador y commit T.
  const red = spawnSync(process.execPath, ['--test'], { cwd: wt, encoding: 'utf8', env: ENV });
  assert.notStrictEqual(red.status, 0);
  git(['add', 'tests/sum.test.js'], wt);
  git(['commit', '-q', '-m', 'test: suma'], wt);
  const T = git(['rev-parse', 'HEAD'], wt);

  // 3. Implementer: registro con --test-ref, cambio, gate con --task, handback.
  r = script('run.js', ['task', '--id', 'sum-fix', '--test-ref', T, '--file', 'src/sum.js', '--agent', 'pignolo:implementer', '--cwd', main], main);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(stop(wt, 'pignolo:implementer').status, 2, 'sin sello no pasa');
  put(wt, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a + b;\n}\nmodule.exports = sum;\n");
  const gate = script('gate.js', ['--level', 'on-done', '--task', '--cwd', wt], wt);
  assert.strictEqual(gate.status, 0, gate.stderr);
  assert.strictEqual(stop(wt, 'pignolo:implementer').status, 0);
  r = script('run.js', ['status', '--cwd', main], main);
  assert.strictEqual(r.json.handback.accepted, true);

  // 4. Piso de riesgo sobre el diff real.
  const risk = script('risk.js', ['--diff', base, '--cwd', wt], wt);
  assert.strictEqual(risk.json.reserved, false);

  // 5. Commit y revisión: congelado, ledger (vacío en riesgo bajo) y guardado.
  git(['add', 'src/sum.js'], wt);
  git(['commit', '-q', '-m', 'fix: suma'], wt);
  const sha = git(['rev-parse', 'HEAD'], wt);
  assert.strictEqual(script('ledger.js', ['frozen', '--cwd', wt, '--sha', sha], wt).status, 0);
  put(main, '.pignolo/tmp/lens-empty.json', '[]');
  const ledger = path.join(main, '.pignolo/tmp/ledger.json');
  r = script('ledger.js', ['build', '--sha', sha, '--level', risk.json.level, '--out', ledger, path.join(main, '.pignolo/tmp/lens-empty.json')], main);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(script('ledger.js', ['next', '--ledger', ledger], main).json.next, 'done');
  const saved = script('ledger.js', ['save', '--ledger', ledger, '--cwd', wt], main);
  assert.strictEqual(saved.status, 0, saved.stderr);
  assert.ok(fs.existsSync(saved.json.file));

  // 6. Merge a la rama de origen, fin del flujo, worktree fuera (limpia).
  put(main, '.pignolo/tmp/merge-msg.txt', 'merge: suma\n');
  git(['merge', '-q', '--no-ff', '-F', path.join(main, '.pignolo/tmp/merge-msg.txt'), 'task/daily/2026-09-30-sum-fix'], main);
  assert.strictEqual(git(['log', '-1', '--format=%s'], main), 'merge: suma');
  assert.strictEqual(script('run.js', ['end', '--cwd', main], main).status, 0);
  git(['worktree', 'remove', wt], main);
  assert.strictEqual(fs.readFileSync(path.join(main, 'src/sum.js'), 'utf8').includes('a + b'), true);
  assert.strictEqual(git(['status', '--porcelain'], main).includes('src/'), false);
});

// Hito 5b, Task 16: el carril plan ya existe.
const { readSkill: readSkill5b } = require('./skill-forms');

test('entry: el carril plan entrega a pignolo:plan y ya no dice que no existe', () => {
  const { text } = readSkill5b('entry');
  assert.doesNotMatch(text, /Plan mode is not built yet/);
  assert.match(text, /`plan`: [^\n]*pignolo:plan/);
  assert.match(text, /`pignolo:plan` skill with/);
});

test('daily paso 11: con laneFloor plan ofrece pasar a pignolo:plan', () => {
  const step = readSkill5b('daily').text.split('\n').find((l) => l.startsWith('11. '));
  assert.ok(step);
  assert.match(step, /`laneFloor` `plan`: [^\n]*pignolo:plan/);
  assert.doesNotMatch(step, /not built/);
});
