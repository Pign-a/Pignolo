'use strict';
// Quién escribe el registro del panel (R-P5): los scripts existentes lo refrescan al terminar, sin cambiar su salida.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const S = (name) => path.join(PLUGIN_ROOT, 'scripts', `${name}.js`);
const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;
const cli = (name, args, cwd) => spawnSync(process.execPath, [S(name), ...args], { cwd, encoding: 'utf8', env: ENV, timeout: 120000 });
const file = (dir) => path.join(dir, '.pignolo', 'panel-state.json');
const write = (cwd, rel, text) => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

const A_TEST = "const t = require('node:test');\nconst assert = require('node:assert');\nt('a', () => assert.strictEqual(require('../src/a.js')(), 1));\n";
function project() {
  const cwd = makeRepo();
  write(cwd, 'src/a.js', 'module.exports = () => 1;\n');
  write(cwd, 'tests/a.test.js', A_TEST);
  write(cwd, '.gitignore', '.pignolo/\n');
  write(cwd, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-edit: node --test tests/a.test.js\n  on-done: node --test tests/a.test.js\n---\n# p\n');
  git(['add', '-A'], cwd);
  git(['add', '-f', '.pignolo/project.md'], cwd);
  git(['commit', '-q', '-m', 'base'], cwd);
  return cwd;
}
const state = (dir) => JSON.parse(fs.readFileSync(file(dir), 'utf8'));
const REQ = (dir) => { const f = path.join(dir, 'req.txt'); fs.writeFileSync(f, 'Quiero algo concreto y verificable.'); return f; };

test('writers: plan.js advance, run.js start, queue.js pre-merge and gate.js each leave panel-state.json refreshed', () => {
  // plan.js new + advance
  let dir = project();
  assert.ok(!fs.existsSync(file(dir)));
  let r = cli('plan', ['new', '--plan', 'mi-plan', '--request-file', REQ(dir), '--spec', 'una spec'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(state(dir).plan.slug, 'mi-plan');
  r = cli('plan', ['advance', '--plan', 'mi-plan', '--to', 'claims'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(state(dir).plan.stage, 'claims');
  // run.js start
  dir = project();
  r = cli('run', ['start', '--flow', 'daily'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(state(dir).schema, panel.SCHEMA);
  // queue.js (aunque la cola no tenga nada que hacer, termina y refresca)
  dir = project();
  cli('queue', ['sync', '--plan', 'p1'], dir);
  assert.equal(state(dir).schema, panel.SCHEMA);
  // gate.js
  dir = project();
  r = cli('gate', ['--level', 'on-done'], dir);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(state(dir).schema, panel.SCHEMA);
  // un verbo de solo lectura no crea el registro
  dir = project();
  cli('plan', ['list'], dir);
  cli('run', ['status'], dir);
  assert.ok(!fs.existsSync(file(dir)));
});

test('writers: sabotage.js records the red line and gate.js the green line for the card of the task', () => {
  const dir = project();
  const base = git(['rev-parse', 'HEAD'], dir);
  fs.writeFileSync(path.join(dir, '.pignolo', 'run.json'), JSON.stringify({
    v: 2, flow: 'plan', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), plan: 'p1',
    tasks: { t1: { id: 't1', worktree: dir, base, files: [], agents: ['pignolo:implementer'] } },
  }));
  const g = cli('gate', ['--level', 'on-done', '--task', '--id', 't1'], dir);
  assert.equal(g.status, 0, g.stderr + g.stdout);
  assert.equal(state(dir).cards.find((c) => c.id === 't1').green, 'verde (on-done)');
  // sabotaje: un parche que rompe src/a.js
  const before = fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8');
  write(dir, 'src/a.js', 'module.exports = () => 2;\n');
  const diff = spawnSync('git', ['diff', '--', 'src/a.js'], { cwd: dir, encoding: 'utf8' }).stdout;
  fs.writeFileSync(path.join(dir, 'src/a.js'), before);
  const patch = path.join(makeTempDir('pignolo-patch-'), 'p.diff');
  fs.writeFileSync(patch, diff);
  const s = cli('sabotage', ['--patch', patch, '--cwd', dir], dir);
  assert.equal(s.status, 0, s.stderr + s.stdout);
  const c = state(dir).cards.find((x) => x.id === 't1');
  assert.match(c.red, /^falla: /);
  assert.ok(c.red.length <= 80 && !/[A-Za-z]:[\\/]/.test(c.red));
  assert.equal(c.green, 'verde (on-done)'); // lo verde anterior se conserva
});

test('writers: a card closed during executing shows done after run.js task-end', () => {
  const dir = project();
  ps.newPlan({ main: dir, plan: 'mi-plan', request: 'hacer algo' });
  ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 't1' }, { id: 't2' }] });
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.stage = 'executing'; return null; });
  const base = git(['rev-parse', 'HEAD'], dir);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 't-wt', wt], dir);
  assert.equal(cli('run', ['start', '--flow', 'plan', '--plan', 'mi-plan'], dir).status, 0);
  const t = cli('run', ['task', '--id', 't1', '--worktree', wt, '--base', base], dir);
  assert.equal(t.status, 0, t.stderr + t.stdout);
  assert.deepEqual(state(dir).cards.map((c) => [c.id, c.status]), [['t1', 'running'], ['t2', 'todo']]);
  const e = cli('run', ['task-end', '--id', 't1'], dir);
  assert.equal(e.status, 0, e.stderr + e.stdout);
  assert.deepEqual(state(dir).cards.map((c) => [c.id, c.status]), [['t1', 'done'], ['t2', 'todo']]);
});

test('writers: a broken panel-state.json does not change the exit code of plan.js advance', () => {
  const run = (broken) => {
    const dir = project();
    cli('plan', ['new', '--plan', 'mi-plan', '--request-file', REQ(dir), '--spec', 'una spec'], dir);
    if (broken) fs.writeFileSync(file(dir), Buffer.from([0xff, 0xfe, 0x7b, 0x00]));
    if (broken === 'lock') { fs.mkdirSync(path.join(dir, '.pignolo', 'tmp'), { recursive: true }); fs.writeFileSync(panel.lockOf(dir), '1\n'); }
    const r = cli('plan', ['advance', '--plan', 'mi-plan', '--to', 'claims'], dir);
    return { status: r.status, stdout: r.stdout.replace(/"created":"[^"]*"/g, '') };
  };
  const good = run(false);
  assert.equal(good.status, 0);
  for (const broken of [true, 'lock']) {
    const r = run(broken);
    assert.deepEqual(r, good, String(broken));
  }
});
