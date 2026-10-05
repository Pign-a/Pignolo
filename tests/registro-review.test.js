'use strict';
// Revisión de 0.24.1 (registro de tareas y project.md ignorado): cada test es un hallazgo importante y determinista.
// Todos fallan en 609d697.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const PI = require(path.join(PLUGIN_ROOT, 'lib', 'project-ignored.js'));

const RUN = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const PROJECT_MD = '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n';
const ignored = (repo, rel) => {
  try { git(['check-ignore', '-q', '--', rel], repo); return true; } catch (e) { if (e.status === 1) return false; throw e; }
};

// RG-01. Causa: `plan.js tasks set` acepta cualquier id no vacío (T1.1, T_02) pero `run.js task` exige TASK_ID_RE y, en un plan
// con tareas, un id del plan: con esos ids ninguna tarea del plan se puede registrar (antes de 0.24.1 valía un id inventado).
for (const id of ['T1.1', 'T_02']) {
  test(`RG-01: a plan task id that tasks set accepts (${id}) can be registered with run.js task, or tasks set refuses it`, () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
    git(['add', '-f', '.pignolo/project.md'], repo);
    git(['commit', '-q', '-m', 'project.md'], repo);
    const base = git(['rev-parse', 'HEAD'], repo);
    const wt = path.join(makeTempDir('pignolo-rg-wt-'), 'wt');
    git(['worktree', 'add', '-q', '-b', 'tb', wt], repo);
    assert.equal(ps.newPlan({ main: repo, plan: 'p1', request: 'pedido', spec: '' }).ok, true);
    const set = ps.setTasks({ main: repo, plan: 'p1', tasks: [{ id }, { id: 'T03' }] });
    if (!set.ok) return; // rechazarlo al registrar las tareas también cierra el hallazgo
    const go = (args) => spawnSync(process.execPath, [RUN, ...args], { cwd: repo, encoding: 'utf8', timeout: 20000 });
    assert.equal(go(['start', '--flow', 'plan', '--plan', 'p1']).status, 0);
    const r = go(['task', '--id', id, '--worktree', wt, '--base', base]);
    assert.equal(r.status, 0, `tasks set aceptó ${id} y run.js task lo rechaza: ${r.stderr}`);
  });
}

function planProject() {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
}
const openPlan = (dir, plan, tasks) => {
  assert.equal(ps.newPlan({ main: dir, plan, request: 'hacer algo' }).ok, true);
  assert.equal(ps.setTasks({ main: dir, plan, tasks }).ok, true);
  ps.update({ main: dir, plan }, (p) => { p.stage = 'executing'; return null; });
};

// RG-02a. Causa: `derive` hace `o.title || planTitle` con la tarjeta vieja del mismo id sin mirar `o.plan`: el título de la T01
// de un plan ya cerrado queda pegado a la T01 del plan siguiente.
test('RG-02a: the card T01 of a new plan shows the title of ITS task, not the one of the T01 of the previous plan', () => {
  const dir = planProject();
  openPlan(dir, 'plan-a', [{ id: 'T01', title: 'Título del plan A' }]);
  assert.equal(panel.refresh(dir).cards[0].title, 'Título del plan A');
  ps.update({ main: dir, plan: 'plan-a' }, (p) => { p.stage = 'closed'; return null; });
  openPlan(dir, 'plan-b', [{ id: 'T01', title: 'Título del plan B' }]);
  const s = panel.refresh(dir);
  assert.deepEqual(s.cards.map((c) => [c.id, c.plan, c.title]), [['T01', 'plan-b', 'Título del plan B']]);
});

// RG-02b. Causa: el título del plan se copia a la tarjeta en el primer refresh y desde ahí cuenta como "cargado a mano":
// un `tasks set` posterior con otro título (el plan vuelve al paso 5 tras REQUEST_CHANGES) nunca llega al panel.
test('RG-02b: tasks set with a new title for the same task reaches the card when nobody loaded a title by hand', () => {
  const dir = planProject();
  openPlan(dir, 'mi-plan', [{ id: 'T01', title: 'Título viejo' }]);
  assert.equal(panel.refresh(dir).cards[0].title, 'Título viejo');
  assert.equal(ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T01', title: 'Título nuevo' }] }).ok, true);
  assert.equal(panel.refresh(dir).cards[0].title, 'Título nuevo');
});

// RG-03. Causa: `planOf` empareja por prefijo cualquier tarea de run.json con las tarjetas del plan abierto sin comprobar que la
// corrida sea de ese plan: una tarea de un flujo daily (`t01-arreglo`) pone T01 en curso y, al terminar, la deja "done" para siempre.
test('RG-03: a task of a daily run (no plan) never marks a card of the open plan as running or done', () => {
  const dir = planProject();
  openPlan(dir, 'mi-plan', [{ id: 'T01' }, { id: 'T02' }]);
  const runFile = path.join(dir, '.pignolo', 'run.json');
  fs.writeFileSync(runFile, JSON.stringify({
    v: 2, flow: 'daily', started: '2026-10-03T10:00:00Z', expires: '2099-01-01T00:00:00Z',
    tasks: { 't01-arreglo': { id: 't01-arreglo', worktree: path.join(dir, 'wt'), base: 'a'.repeat(40), files: [], agents: [] } },
  }));
  const planCards = (s) => s.cards.filter((c) => c.id === 'T01' || c.id === 'T02').map((c) => [c.id, c.status]);
  assert.deepEqual(planCards(panel.refresh(dir)), [['T01', 'todo'], ['T02', 'todo']]);
  fs.rmSync(runFile);
  assert.deepEqual(planCards(panel.refresh(dir)), [['T01', 'todo'], ['T02', 'todo']]);
});

// RG-04. Causa: `planFix` cambia solo la línea que `git check-ignore` nombra (la última que coincide); con la regla repetida la
// primera sigue ignorando la carpeta, el cambio se revierte ("still-ignored") y el aviso manda a correr init otra vez, sin salida.
for (const [name, text] of [
  ['the same rule twice', 'node_modules/\n.pignolo/\n*.log\n.pignolo/\n'],
  ['two spellings of the rule', '.pignolo\n*.log\n/.pignolo/\n'],
]) {
  test(`RG-04: ${name} in the root .gitignore: after the fix git no longer ignores project.md and the rest stays ignored`, () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, '.gitignore'), text);
    assert.equal(ignored(repo, '.pignolo/project.md'), true);
    const r = PI.applyFix({ main: repo, env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-rg-home-') } });
    assert.equal(r.status, 'done', JSON.stringify(r));
    assert.equal(ignored(repo, '.pignolo/project.md'), false);
    assert.equal(ignored(repo, '.pignolo/run.json'), true);
    assert.equal(ignored(repo, '.pignolo/tmp/x'), true);
    assert.equal(ignored(repo, '.pignolo/state/decisions/d.md'), true);
    const lines = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8').split('\n');
    assert.ok(lines.includes('*.log') && lines.includes('node_modules/') === text.includes('node_modules/'), 'las demás líneas siguen');
  });
}
