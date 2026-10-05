'use strict';
// run.js task en una corrida de un plan: el id es el de una tarea del plan (T01), no uno inventado (t01-tooling).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const ps = require('../plugins/pignolo/lib/plan-state');

const RUN = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const run = (cwd, args) => {
  const r = spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

// Repo con project.md commiteado, una worktree y, si se pide, un plan `p1` con tareas registradas.
function setup({ flow = 'plan', tasks = [{ id: 'T01' }, { id: 'T02' }] } = {}) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n');
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'project.md'], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const wt = path.join(makeTempDir('pignolo-pt-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tb', wt], repo);
  if (flow === 'plan') {
    assert.equal(ps.newPlan({ main: repo, plan: 'p1', request: 'pedido', spec: '' }).ok, true);
    if (tasks) assert.equal(ps.setTasks({ main: repo, plan: 'p1', tasks }).ok, true);
    assert.equal(run(repo, ['start', '--flow', 'plan', '--plan', 'p1']).status, 0);
  } else {
    assert.equal(run(repo, ['start', '--flow', flow]).status, 0);
  }
  return { repo, wt, base };
}
const reg = ({ repo, wt, base }, id) => run(repo, ['task', '--id', id, '--worktree', wt, '--base', base]);

test('a plan with tasks T01 and T02: the plan id is accepted (uppercase included)', () => {
  const s = setup();
  const r = reg(s, 'T01');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).run.tasks.T01 || JSON.stringify(JSON.parse(r.stdout)).includes('T01'));
});

test('t01-tooling is refused; the message names T01 and the exit is 1 without a stack trace', () => {
  const s = setup();
  const r = reg(s, 't01-tooling');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /T01/);
  assert.match(r.stderr, /Quisiste decir T01/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
  assert.equal(JSON.parse(r.stdout).kind, 'not-a-plan-task');
  assert.equal(JSON.parse(r.stdout).suggest, 'T01');
});

test('X9 is refused and the message lists the valid ids (at most 10)', () => {
  const tasks = Array.from({ length: 12 }, (_, i) => ({ id: `T${String(i + 1).padStart(2, '0')}` }));
  const s = setup({ tasks });
  const r = reg(s, 'X9');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /T01, T02, T03/);
  assert.match(r.stderr, /T10/);
  assert.doesNotMatch(r.stderr, /T11/);
  assert.match(r.stderr, /2 más/);
  assert.doesNotMatch(r.stderr, /Quisiste decir/);
});

test('a retry or fix id built from a plan id (T01-fix2) is accepted', () => {
  const s = setup();
  const r = reg(s, 'T01-fix2');
  assert.equal(r.status, 0, r.stderr);
});

test('a daily run accepts any id, and so does a plan without registered tasks', () => {
  const d = setup({ flow: 'daily' });
  assert.equal(reg(d, 'cualquier-cosa').status, 0);
  const p = setup({ tasks: null });
  assert.equal(reg(p, 't01-tooling').status, 0);
});

test('task-end accepts the plan id too', () => {
  const s = setup();
  assert.equal(reg(s, 'T01').status, 0);
  const e = run(s.repo, ['task-end', '--id', 'T01']);
  assert.equal(e.status, 0, e.stderr);
});

test('--id still rejects anything outside letters, digits and hyphen', () => {
  const s = setup();
  assert.equal(reg(s, 'T01_x').status, 2);
  assert.equal(reg(s, '-T01').status, 2);
});
