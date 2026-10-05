'use strict';
// Varias tareas a la vez (hito 7a, Task 7): gate.js --id y handback-gate con `Task: <id>` (R-3).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const gate = require('../plugins/pignolo/hooks/handlers/handback-gate');
const { workingTree } = require('../plugins/pignolo/lib/changes');
const { repoIdFor, writeSeal } = require('../plugins/pignolo/lib/seals');
const { readCounter, NOTASK } = require('../plugins/pignolo/lib/handback-counter');

const PROJECT_MD = '---\ntype: code-tested\ngates:\n  on-done: node check.js\ntest-paths:\n  - tests/\n---\n';
const GATE_CLI = path.join(PLUGIN_ROOT, 'scripts', 'gate.js');

// main con project.md y check.js, run.json v2 con las tareas dadas (cada una en su worktree real).
function flow(ids = ['a', 'b']) {
  const main = makeRepo();
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(main, rel)), { recursive: true }); fs.writeFileSync(path.join(main, rel), text); };
  write('.pignolo/project.md', PROJECT_MD);
  write('.pignolo/.gitignore', 'run.json\ntmp/\n');
  write('check.js', 'process.exit(0);\n');
  write('src/a.js', 'module.exports = 1;\n');
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'base'], main);
  const base = git(['rev-parse', 'HEAD'], main);
  const tasks = {};
  for (const id of ids) {
    const wt = path.join(makeTempDir('pignolo-wt-'), `wt-${id}`);
    git(['worktree', 'add', '-q', '-b', `task/${id}`, wt], main);
    tasks[id] = { id, worktree: wt, base, files: [`src/${id}.js`], agents: ['pignolo:implementer'] };
  }
  const run = { v: 2, flow: 'daily', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), tasks };
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify(run));
  return { main, tasks, env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') } };
}
const edit = (fx, id, rel, text) => { fs.writeFileSync(path.join(fx.tasks[id].worktree, rel), text); };

function seal(fx, id, status = 'PASS') {
  const wt = fx.tasks[id].worktree;
  const treeHash = workingTree({ cwd: wt });
  const repoId = repoIdFor({ cwd: wt });
  writeSeal({
    env: fx.env, repoId, log: 'ok\n',
    seal: {
      v: 1, repoId, sha: null, treeHash, treeAfter: treeHash, level: 'on-done', command: 'node check.js', exit: status === 'PASS' ? 0 : 1, status,
      logHash: '', time: new Date().toISOString(), task: id, noTestsReason: null, checks: { scope: [], emptied: [], integrity: [], envDetect: [] },
    },
  });
}

const payload = (fx, id, { msg, agent = 'pignolo:implementer', agentId = 'a1', via = 'stop' } = {}) => {
  const cwd = id ? fx.tasks[id].worktree : fx.main;
  if (via === 'handback') return { hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', tool_input: { message: msg }, agent_type: agent, agent_id: agentId, cwd };
  return { hook_event_name: 'SubagentStop', agent_type: agent, agent_id: agentId, last_assistant_message: msg, stop_hook_active: false, cwd };
};
const call = (fx, id, o = {}) => {
  const r = gate.run(payload(fx, id, o), { env: fx.env });
  return { exit: r.exit, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const counter = (fx, key) => readCounter(fx.env, fx.main, key);

test('Task: a con el sello válido de a pasa; el mismo informe con solo el sello de b bloquea', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  edit(fx, 'b', 'src/b.js', 'module.exports = 3;\n');
  seal(fx, 'b');
  const noSealA = call(fx, 'a', { msg: 'Task: a\nlisto\nDONE' });
  assert.strictEqual(noSealA.exit, 2, 'a no tiene sello de su árbol');
  assert.match(noSealA.stderr, /Alternativa:/);
  seal(fx, 'a');
  assert.strictEqual(call(fx, 'a', { msg: 'Task: a\nlisto\nDONE', agentId: 'a2' }).exit, 0);
});

test('un id ajeno solo acepta si el sello de ESA tarea vale para su árbol: nada que la compuerta no abriera', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(fx, 'a');
  // el informe dice ser de b, pero b no tiene sello (el árbol de a no sirve): bloquea
  assert.strictEqual(call(fx, 'a', { msg: 'Task: b\nDONE' }).exit, 2);
});

test('sin la línea Task: con dos tareas bloquea y cuenta bajo _notask; con una sola, como hoy', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(fx, 'a');
  const r = call(fx, 'a', { msg: 'listo\nDONE' });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Task: <id>/);
  assert.strictEqual(counter(fx, NOTASK).count, 1);
  assert.strictEqual(counter(fx, 'a').count, 0, 'no se cuenta en una tarea');

  const one = flow(['a']);
  edit(one, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(one, 'a');
  assert.strictEqual(call(one, 'a', { msg: 'listo\nDONE' }).exit, 0, 'una tarea: la falta de la línea no bloquea (guarda de regresión)');
});

test('Task: zz desconocido bloquea con la lista de ids válidos; BLOCKED y NEEDS_CONTEXT pasan sin línea', () => {
  const fx = flow();
  const r = call(fx, 'a', { msg: 'Task: zz\nDONE' });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /zz/);
  assert.match(r.stderr, /a, b/);
  assert.strictEqual(call(fx, 'a', { msg: 'no puedo\nBLOCKED' }).exit, 0);
  assert.strictEqual(call(fx, 'a', { msg: 'falta algo\nNEEDS_CONTEXT' }).exit, 0);
  const one = flow(['a']);
  assert.strictEqual(call(one, 'a', { msg: 'Task: zz\nDONE' }).exit, 2, 'también con una tarea: un id ajeno no se acepta');
});

test('la línea Task: se toma de cualquier línea, con formato markdown, y la primera que cumple', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(fx, 'a');
  assert.strictEqual(call(fx, 'a', { msg: 'resumen\n**Task:** a\nDONE', agentId: 'x1' }).exit, 0);
  const fx2 = flow();
  assert.strictEqual(call(fx2, 'a', { msg: 'Task: Mayusculas\nDONE' }).exit, 2, 'un id con mayúsculas no cumple la expresión');
});

test('contadores independientes: 8 rechazos de a no cortan a b', () => {
  const fx = flow();
  let last;
  for (let i = 0; i < 8; i += 1) last = call(fx, 'a', { msg: 'Task: a\nDONE' });
  assert.strictEqual(last.exit, 0, 'al octavo rechazo la tarea queda BLOCKED y se deja pasar (sin bucle)');
  assert.strictEqual(counter(fx, 'a').blocked, true);
  const b = call(fx, 'b', { msg: 'Task: b\nDONE' });
  assert.strictEqual(b.exit, 2, 'b sigue rechazándose normalmente');
  assert.strictEqual(counter(fx, 'b').count, 1);
  assert.strictEqual(counter(fx, 'b').blocked, false);
});

test('un agent_type que no es el rol registrado para esa tarea bloquea (con varias tareas)', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(fx, 'a');
  const r = call(fx, 'a', { msg: 'Task: a\nDONE', agent: 'pignolo:fixer' });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /pignolo:implementer/);
});

test('el SubagentStop posterior a un handback aceptado del mismo agente pasa aunque su mensaje no traiga la línea', () => {
  const fx = flow();
  edit(fx, 'a', 'src/a.js', 'module.exports = 2;\n');
  seal(fx, 'a');
  assert.strictEqual(call(fx, 'a', { msg: 'Task: a\nDONE', via: 'handback', agentId: 'ag1' }).exit, 0);
  assert.strictEqual(call(fx, 'a', { msg: 'listo\nDONE', via: 'stop', agentId: 'ag1' }).exit, 0);
  assert.strictEqual(call(fx, 'a', { msg: 'listo\nDONE', via: 'stop', agentId: 'otro' }).exit, 2, 'otro agente se verifica');
});

test('PostToolUse avisa al hilo principal de la tarea que no pasó y del informe sin tarea', () => {
  const fx = flow();
  call(fx, 'b', { msg: 'Task: b\nDONE' });
  const post = () => gate.run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, cwd: fx.main }, { env: fx.env });
  const a = post();
  assert.match(JSON.parse(a.stdout).hookSpecificOutput.additionalContext, /tarea b/);
  const fx2 = flow();
  call(fx2, 'a', { msg: 'sin línea\nDONE' });
  const r = gate.run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, cwd: fx2.main }, { env: fx2.env });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /Task: <id>/);
  const fx3 = flow();
  assert.strictEqual(gate.run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, cwd: fx3.main }, { env: fx3.env }).stdout, undefined, 'callado sin rechazos');
});

test('gate.js --task con dos tareas: sin --id sale 2 con ambiguous-task; con --id b sella el árbol de b', () => {
  const fx = flow();
  edit(fx, 'b', 'src/b.js', 'module.exports = 3;\n');
  const run = (args) => spawnSync(process.execPath, [GATE_CLI, '--level', 'on-done', '--task', ...args], { cwd: fx.main, encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: fx.env.PIGNOLO_HOME }, timeout: 60000 });
  const amb = run([]);
  assert.strictEqual(amb.status, 2);
  assert.strictEqual(JSON.parse(amb.stdout.trim().split('\n').pop()).kind, 'ambiguous-task');
  assert.match(amb.stderr, /a, b/);
  assert.match(amb.stderr, /--id/);
  const b = run(['--id', 'b']);
  const sealB = JSON.parse(b.stdout);
  assert.strictEqual(sealB.task, 'b');
  assert.strictEqual(sealB.treeHash, workingTree({ cwd: fx.tasks.b.worktree }));
  const a = run(['--id', 'a']);
  const sealA = JSON.parse(a.stdout);
  assert.strictEqual(sealA.task, 'a');
  assert.notStrictEqual(sealA.treeHash, sealB.treeHash, 'el sello de a es de otro árbol');
  assert.strictEqual(run(['--id', 'zz']).status, 2);
  const noTask = spawnSync(process.execPath, [GATE_CLI, '--level', 'on-done', '--id', 'a'], { cwd: fx.main, encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(noTask.status, 2, '--id sin --task es un error de uso');
  // con una sola tarea, como hoy
  const one = flow(['a']);
  const r1 = spawnSync(process.execPath, [GATE_CLI, '--level', 'on-done', '--task'], { cwd: one.main, encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: one.env.PIGNOLO_HOME }, timeout: 60000 });
  assert.strictEqual(JSON.parse(r1.stdout).task, 'a');
});

test('Task: con el id de una tarea del plan en mayúsculas (T01) se resuelve a esa tarea', () => {
  const fx = flow(['T01', 'T02']);
  edit(fx, 'T01', 'src/T01.js', 'module.exports = 2;\n');
  seal(fx, 'T01');
  assert.strictEqual(call(fx, 'T01', { msg: 'Task: T01\nlisto\nDONE' }).exit, 0);
  const wrong = call(fx, 'T02', { msg: 'Task: T01\nlisto\nDONE' });
  assert.ok(!/no está registrada/.test(wrong.stderr), 'T01 existe: no es una tarea desconocida');
});
