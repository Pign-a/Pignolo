'use strict';
// run.json v2 con varias tareas (hito 7a, Task 2): validateRun, readRun, run.js task|task-end|status|end.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const { validateRun, readRun, taskList, taskById } = require('../plugins/pignolo/lib/project');
const { writeCounter, counterPath } = require('../plugins/pignolo/lib/handback-counter');

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const envOf = (home) => ({ ...process.env, PIGNOLO_HOME: home });
function run(cwd, args, home = process.env.PIGNOLO_HOME) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 60000, env: envOf(home) });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').pop()) : undefined, stderr: r.stderr };
}
const runFile = (repo) => path.join(repo, '.pignolo', 'run.json');
const readRunFile = (repo) => JSON.parse(fs.readFileSync(runFile(repo), 'utf8'));
const homeWith = (config) => {
  const home = path.join(makeTempDir('pignolo-home-'), '.pignolo');
  if (config) { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config)); }
  return home;
};

function fixture() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n');
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'project.md'], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', `t-${Date.now()}`, wt], repo);
  return { repo, base, wt };
}
const addTask = (repo, wt, base, id, home, extra = []) => run(repo, ['task', '--id', id, '--worktree', wt, '--base', base, ...extra], home);

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const T = (over = {}) => ({ id: 'a', worktree: path.resolve('/tmp/wt-a'), base: 'a'.repeat(40), files: ['a.js'], agents: ['pignolo:implementer'], ...over });
const head = { flow: 'daily', started: '2026-09-29T11:00:00.000Z', expires: '2026-09-29T13:00:00.000Z' };
const readWith = (content) => {
  const main = makeTempDir();
  fs.mkdirSync(path.join(main, '.pignolo'));
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify(content));
  return readRun(main, NOW);
};

test('validateRun: v1 con task, v2 con tasks, y los cruces son errores', () => {
  assert.deepStrictEqual(validateRun({ v: 1, ...head, task: T() }), []);
  assert.deepStrictEqual(validateRun({ v: 2, ...head, tasks: { a: T() } }), []);
  assert.deepStrictEqual(validateRun({ v: 2, ...head, tasks: {} }), []);
  assert.ok(validateRun({ v: 2, ...head, task: T(), tasks: {} }).length > 0, 'v2 con task');
  assert.ok(validateRun({ v: 1, ...head, tasks: { a: T() } }).length > 0, 'v1 con tasks');
  assert.ok(validateRun({ v: 2, ...head, tasks: { b: T() } }).length > 0, 'clave distinta de task.id');
  assert.ok(validateRun({ v: 2, ...head, tasks: [] }).length > 0, 'tasks es una lista');
  assert.ok(validateRun({ v: 2, ...head }).length > 0, 'v2 sin tasks');
  assert.ok(validateRun({ v: 3, ...head, tasks: {} }).length > 0, 'v3');
});

test('readRun: un v1 de hoy se lee igual, con run.tasks de una entrada y run.task intacto; v2 con una tarea tiene el alias', () => {
  const v1 = readWith({ v: 1, ...head, task: T() });
  assert.deepStrictEqual(Object.keys(v1.run.tasks), ['a']);
  assert.strictEqual(v1.run.task.id, 'a');
  const v2 = readWith({ v: 2, ...head, tasks: { a: T() } });
  assert.strictEqual(v2.run.task.id, 'a');
  assert.ok(!Object.keys(v2.run).includes('task'), 'el alias no es enumerable: no se escribe nunca');
  assert.strictEqual(readWith({ v: 2, ...head, tasks: { a: T(), b: T({ id: 'b' }) } }).run.task, undefined, 'con dos no hay alias');
  assert.strictEqual(readWith({ v: 2, ...head, tasks: {} }).run.task, undefined);
  const two = readWith({ v: 2, ...head, tasks: { a: T(), b: T({ id: 'b' }) } }).run;
  assert.deepStrictEqual(taskList(two).map((t) => t.id), ['a', 'b']);
  assert.strictEqual(taskById(two, 'b').id, 'b');
  assert.strictEqual(taskById(two, 'zz'), undefined);
});

test('un v2 con una worktree relativa es ilegible (malformed) y cuenta como flujo en curso', () => {
  const r = readWith({ v: 2, ...head, tasks: { a: T({ worktree: 'wt' }) } });
  assert.strictEqual(r.malformed, true);
  assert.strictEqual(r.running, true);
});

test('task escribe v2 desde la primera tarea; el alias task apunta a ella; un id repetido actualiza sin duplicar', () => {
  const { repo, base, wt } = fixture();
  run(repo, ['start', '--flow', 'daily']);
  const r = addTask(repo, wt, base, 'a');
  assert.strictEqual(r.status, 0, r.stderr);
  const obj = readRunFile(repo);
  assert.strictEqual(obj.v, 2);
  assert.deepStrictEqual(Object.keys(obj.tasks), ['a']);
  assert.strictEqual(obj.task, undefined, 'el alias nunca se escribe');
  assert.strictEqual(readRun(repo).run.task.id, 'a');
  const home = process.env.PIGNOLO_HOME;
  writeCounter({ PIGNOLO_HOME: home }, repo, 'a', { count: 2, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] });
  assert.strictEqual(addTask(repo, wt, base, 'b').status, 0);
  const two = readRunFile(repo);
  assert.deepStrictEqual(Object.keys(two.tasks).sort(), ['a', 'b']);
  assert.ok(fs.existsSync(counterPath({ PIGNOLO_HOME: home }, repo, 'a')), 'el contador de a queda intacto');
  assert.strictEqual(run(repo, ['task', '--id', 'a', '--file', 'src/x.js', '--branch', 'task/p/01-a']).status, 0);
  const upd = readRunFile(repo);
  assert.deepStrictEqual(Object.keys(upd.tasks).sort(), ['a', 'b']);
  assert.deepStrictEqual(upd.tasks.a.files, ['src/x.js']);
  assert.strictEqual(upd.tasks.a.branch, 'task/p/01-a');
});

test('sobre un v1 existente, task --id b lo convierte a v2 conservando la tarea vieja', () => {
  const { repo, base, wt } = fixture();
  fs.writeFileSync(runFile(repo), JSON.stringify({ v: 1, flow: 'daily', started: new Date().toISOString(), expires: new Date(Date.now() + 3600000).toISOString(), task: { id: 'old', worktree: wt, base, files: [], agents: [] } }));
  assert.strictEqual(addTask(repo, wt, base, 'b').status, 0);
  const obj = readRunFile(repo);
  assert.strictEqual(obj.v, 2);
  assert.strictEqual(obj.task, undefined);
  assert.deepStrictEqual(Object.keys(obj.tasks).sort(), ['b', 'old']);
});

test('tope por perfil: economy 1, balanced 2, sin config balanced; too-many-tasks con Alternativa', () => {
  const { repo, base, wt } = fixture();
  run(repo, ['start', '--flow', 'daily']);
  const eco = homeWith({ profile: 'economy' });
  assert.strictEqual(addTask(repo, wt, base, 'a', eco).status, 0);
  const r = addTask(repo, wt, base, 'b', eco);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.out.kind, 'too-many-tasks');
  assert.strictEqual(r.out.limit, 1);
  assert.match(r.stderr, /Alternativa:/);
  assert.strictEqual(addTask(repo, wt, base, 'a', eco, ['--file', 'x.js']).status, 0, 'actualizar la existente no cuenta de más');

  const bal = homeWith({ profile: 'balanced' });
  assert.strictEqual(addTask(repo, wt, base, 'b', bal).status, 0);
  assert.strictEqual(addTask(repo, wt, base, 'c', bal).out.kind, 'too-many-tasks');

  const { repo: r2, base: b2, wt: w2 } = fixture();
  run(r2, ['start', '--flow', 'daily']);
  const none = homeWith(null);
  assert.strictEqual(addTask(r2, w2, b2, 'a', none).status, 0);
  assert.strictEqual(addTask(r2, w2, b2, 'b', none).status, 0);
  assert.strictEqual(addTask(r2, w2, b2, 'c', none).out.kind, 'too-many-tasks');
});

test('task-end saca una tarea y el archivo sigue en v2; la última deja tasks vacío; un id ajeno sale 1', () => {
  const { repo, base, wt } = fixture();
  run(repo, ['start', '--flow', 'daily']);
  addTask(repo, wt, base, 'a');
  addTask(repo, wt, base, 'b');
  const r = run(repo, ['task-end', '--id', 'a']);
  assert.strictEqual(r.status, 0, r.stderr);
  let obj = readRunFile(repo);
  assert.strictEqual(obj.v, 2);
  assert.deepStrictEqual(Object.keys(obj.tasks), ['b']);
  assert.strictEqual(run(repo, ['task-end', '--id', 'b']).status, 0);
  obj = readRunFile(repo);
  assert.strictEqual(obj.v, 2);
  assert.deepStrictEqual(obj.tasks, {});
  const miss = run(repo, ['task-end', '--id', 'zz']);
  assert.strictEqual(miss.status, 1);
  assert.strictEqual(miss.out.kind, 'no-such-task');
});

test('status trae tasks con los contadores de cada tarea y run.task con una sola; end limpia los de todas', () => {
  const { repo, base, wt } = fixture();
  const env = { PIGNOLO_HOME: process.env.PIGNOLO_HOME };
  run(repo, ['start', '--flow', 'daily']);
  addTask(repo, wt, base, 'a');
  const bump = (id, count) => writeCounter(env, repo, id, { count, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] });
  bump('a', 2);
  let st = run(repo, ['status']).out;
  assert.strictEqual(st.run.task.id, 'a');
  assert.strictEqual(st.tasks.a.handback.count, 2);
  assert.strictEqual(st.handback.count, 2);
  addTask(repo, wt, base, 'b');
  addTask(repo, wt, base, 'c', homeWith({ profile: 'max' }));
  bump('a', 1); bump('b', 4); bump('c', 5);
  st = run(repo, ['status']).out;
  assert.strictEqual(st.run.task, undefined);
  assert.deepStrictEqual([st.tasks.a.handback.count, st.tasks.b.handback.count, st.tasks.c.handback.count], [1, 4, 5]);
  assert.strictEqual(run(repo, ['end']).status, 0);
  for (const id of ['a', 'b', 'c']) assert.ok(!fs.existsSync(counterPath(env, repo, id)), id);
});

test('escrituras concurrentes (C-07): con el lock no se pierde ninguna tarea ni sale EPERM', async () => {
  const home = homeWith({ profile: 'max' }); // tope 3: de 8 procesos, exactamente 3 entran
  for (let round = 0; round < 2; round += 1) {
    const { repo, base, wt } = fixture();
    run(repo, ['start', '--flow', 'daily'], home);
    const procs = Array.from({ length: 8 }, (_, i) => new Promise((resolve) => {
      const p = spawn(process.execPath, [SCRIPT, 'task', '--id', `t${i}`, '--worktree', wt, '--base', base], { cwd: repo, env: envOf(home), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; let stderr = '';
      p.stdout.on('data', (d) => { stdout += d; });
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('close', (code) => resolve({ id: `t${i}`, code, stdout, stderr }));
    }));
    const res = await Promise.all(procs);
    for (const r of res) assert.ok(!/EPERM|EBUSY/.test(r.stderr), `ronda ${round}: ${r.stderr}`);
    const ok = res.filter((r) => r.code === 0).map((r) => r.id).sort();
    const full = res.filter((r) => r.code !== 0);
    assert.strictEqual(ok.length, 3, `ronda ${round}: entran justo los del tope (${ok.join(',')}) ${JSON.stringify(res.map((r) => [r.id, r.code, r.stderr.slice(0, 200)]))}`);
    for (const r of full) assert.ok(r.stdout.includes('too-many-tasks'), r.stderr);
    const run2 = readRun(repo);
    assert.ok(!run2.malformed, 'run.json legible');
    assert.deepStrictEqual(Object.keys(run2.run.tasks).sort(), ok, `ronda ${round}: ninguna tarea registrada se pierde`);
  }
});
