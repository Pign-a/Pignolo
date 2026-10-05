'use strict';
// El panel con el plan: los títulos de las tarjetas vienen con las tareas (plan.js tasks set) y una tarea en curso
// registrada con otro id (t01-tooling) marca la tarjeta del plan (T01) en vez de sumar una suelta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const PLAN_JS = path.join(PLUGIN_ROOT, 'scripts', 'plan.js');

function project(tasks) {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  assert.equal(ps.newPlan({ main: dir, plan: 'mi-plan', request: 'hacer algo' }).ok, true);
  if (tasks) assert.equal(ps.setTasks({ main: dir, plan: 'mi-plan', tasks }).ok, true);
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.stage = 'executing'; return null; });
  return dir;
}
const writeRun = (dir, ids) => fs.writeFileSync(path.join(dir, '.pignolo', 'run.json'), JSON.stringify({
  v: 2, flow: 'plan', started: '2026-10-03T10:00:00Z', expires: '2099-01-01T00:00:00Z', plan: 'mi-plan',
  tasks: Object.fromEntries(ids.map((id) => [id, { id, worktree: path.join(dir, 'wt', id), base: 'a'.repeat(40), files: [], agents: [] }])),
}));
const view = (s) => s.cards.map((c) => [c.id, c.status]);

// ---- T3: títulos ----

test('tasks with titles: the cards carry them after a refresh', () => {
  const dir = project([{ id: 'T01', title: 'Herramientas de build' }, { id: 'T02', title: 'Parser' }]);
  const s = panel.refresh(dir);
  assert.deepEqual(s.cards.map((c) => [c.id, c.title]), [['T01', 'Herramientas de build'], ['T02', 'Parser']]);
});

test('a title with a newline, control characters or 500 characters is cleaned and cut, and the write never breaks', () => {
  const dir = project([
    { id: 'T01', title: 'línea uno\nlínea dos\r\n\tcon\u0007control\u0000 y separador' },
    { id: 'T02', title: 'x'.repeat(500) },
  ]);
  const plan = ps.readPlan({ main: dir, plan: 'mi-plan' }).plan;
  assert.equal(plan.tasks[0].title, 'línea uno línea dos con control y separador');
  assert.ok(plan.tasks[1].title.length <= 120);
  const s = panel.refresh(dir);
  assert.equal(s.cards[0].title, 'línea uno línea dos con control y separador');
  assert.ok(s.cards[1].title.length <= 120 && s.cards[1].title.endsWith('…'));
  assert.equal(panel.read(dir).problems.length, 0);
});

test('a task without title gives an empty title and does not throw; a title that is not text is refused with a message', () => {
  const dir = project([{ id: 'T01' }]);
  assert.equal(panel.refresh(dir).cards[0].title, '');
  assert.deepEqual(ps.readPlan({ main: dir, plan: 'mi-plan' }).plan.tasks, [{ id: 'T01', added: [] }]);
  const bad = ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T01', title: 7 }] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /title debe ser un texto/);
});

test('an old plan.json whose tasks have no title is read as before', () => {
  const dir = project(null);
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.tasks = [{ id: 'T1', added: [] }, { id: 'T2' }]; return null; });
  const s = panel.refresh(dir);
  assert.deepEqual(s.cards.map((c) => [c.id, c.title]), [['T1', ''], ['T2', '']]);
});

test('a title loaded by hand (panel.js evidence --title) is not overwritten by an empty one, nor by a refresh', () => {
  const dir = project([{ id: 'T01' }]);
  panel.refresh(dir);
  panel.evidence(dir, { card: 'T01', title: 'a mano' });
  assert.equal(panel.refresh(dir).cards[0].title, 'a mano');
  ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T01', title: '' }] });
  assert.equal(panel.refresh(dir).cards[0].title, 'a mano');
});

test('plan.js tasks set stores the title end to end (CLI)', () => {
  const dir = project(null);
  const f = path.join(makeTempDir('pignolo-ct-'), 'tasks.json');
  fs.writeFileSync(f, JSON.stringify([{ id: 'T01', title: 'Uno' }, { id: 'T02' }]));
  const r = spawnSync(process.execPath, [PLAN_JS, 'tasks', 'set', '--plan', 'mi-plan', '--file', f, '--cwd', dir], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const s = panel.read(dir).state;
  assert.deepEqual(s.cards.map((c) => [c.id, c.title]), [['T01', 'Uno'], ['T02', '']]);
});

// ---- T4: la tarea en curso con otro id ----

test('run task t01-tooling with plan tasks T01 and T02: card T01 running, no loose card', () => {
  const dir = project([{ id: 'T01' }, { id: 'T02' }]);
  writeRun(dir, ['t01-tooling']);
  assert.deepEqual(view(panel.refresh(dir)), [['T01', 'running'], ['T02', 'todo']]);
});

test('the exact id still works; so does another capitalization', () => {
  const dir = project([{ id: 'T01' }, { id: 'T02' }]);
  writeRun(dir, ['T02']);
  assert.deepEqual(view(panel.refresh(dir)), [['T01', 'todo'], ['T02', 'running']]);
  const dir2 = project([{ id: 'T01' }, { id: 'T02' }]);
  writeRun(dir2, ['t01']);
  assert.deepEqual(view(panel.refresh(dir2)), [['T01', 'running'], ['T02', 'todo']]);
});

test('run task t0 (a prefix that is not up to a separator) stays a loose card; both plan cards stay todo', () => {
  const dir = project([{ id: 'T01' }, { id: 'T02' }]);
  writeRun(dir, ['t0']);
  assert.deepEqual(view(panel.refresh(dir)), [['T01', 'todo'], ['T02', 'todo'], ['t0', 'running']]);
});

test('an ambiguous match (two candidates) stays loose', () => {
  const dir = project([{ id: 'T01' }, { id: 'T01-b' }]);
  writeRun(dir, ['T01-b-fix2']);
  assert.deepEqual(view(panel.refresh(dir)), [['T01', 'todo'], ['T01-b', 'todo'], ['T01-b-fix2', 'running']]);
});

test('a run task that matches nothing in the plan is still a loose card (old behavior)', () => {
  const dir = project([{ id: 'T01' }]);
  writeRun(dir, ['otra-cosa']);
  assert.deepEqual(view(panel.refresh(dir)), [['T01', 'todo'], ['otra-cosa', 'running']]);
});
