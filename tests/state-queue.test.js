'use strict';
// §15 `state-queue`: el estado de .pignolo/state/ entra a int/<plan> solo por commits del hilo principal ENTRE merges, y
// un commit de estado no rompe el avance --ff-only de la cola.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const Q = require('../plugins/pignolo/lib/queue');

const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
// Sin -f global: forzaría el alta de las worktrees ignoradas (la de la cola vive en .pignolo/worktrees/); el estado va con su -f propio.
const commitAll = (dir, msg, force = []) => { git(['add', '-A'], dir); if (force.length) git(['add', '-f', '--', ...force], dir); git(['commit', '-q', '-m', msg], dir); return git(['rev-parse', 'HEAD'], dir); };
const sha = (main, ref) => git(['rev-parse', ref], main);

function fixture() {
  const main = makeRepo();
  write(main, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  pre-merge: "node gate.js"\ntest-paths:\n  - tests/\n---\n');
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n'); // como lo deja run.js start
  write(main, 'gate.js', 'process.exit(0);\n');
  write(main, 'src/s.js', 'module.exports = 1;\n');
  commitAll(main, 'base');
  git(['branch', 'int/p'], main);
  const env = { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  return { main, env, run: (task, o = {}) => Q.integrate({ main, plan: 'p', task, env, timeoutMs: 60000, ...o }) };
}
function task(main, name, files) {
  git(['checkout', '-q', '-b', name, 'int/p'], main);
  for (const [f, t] of Object.entries(files)) write(main, f, t);
  commitAll(main, `tarea ${name}\n\nAgent: pignolo:implementer\nGates: on-done PASS`, Object.keys(files).filter((f) => f.startsWith('.pignolo/')));
  git(['checkout', '-q', 'main'], main);
}
// El hilo principal commitea el estado sobre int/p SIN tenerla sacada (en una worktree temporal que se quita).
function stateCommitOffCheckout(main, text = '{"stage":"executing"}\n') {
  const tmp = path.join(makeTempDir('pignolo-st-'), 'wt');
  git(['worktree', 'add', '-q', tmp, 'int/p'], main);
  write(tmp, '.pignolo/state/plans/p/plan.json', text);
  git(['add', '-f', '.pignolo/state/plans/p/plan.json'], tmp);
  git(['commit', '-q', '-m', 'estado del plan entre merges'], tmp);
  const c = git(['rev-parse', 'HEAD'], tmp);
  git(['worktree', 'remove', tmp], main);
  return c;
}
const kindOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('state-queue: integrar A, commitear estado en int/p, integrar B: --ff-only anda, el estado sigue en la historia y cp/p/2 apunta a la punta', () => {
  const { main, run } = fixture();
  task(main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  task(main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const a = run('task/p/01-a');
  const state = stateCommitOffCheckout(main);
  assert.strictEqual(sha(main, 'int/p'), state);
  const b = run('task/p/02-b');
  assert.strictEqual(b.ok, true);
  assert.strictEqual(sha(main, 'cp/p/2'), sha(main, 'int/p'));
  assert.strictEqual(sha(main, 'int/p'), b.merged);
  assert.strictEqual(sha(main, 'int/p^1'), state, 'el merge de B cuelga del commit de estado: no se perdió');
  assert.match(git(['log', '--format=%s', 'int/p'], main), /estado del plan entre merges/);
  assert.strictEqual(git(['show', 'int/p:.pignolo/state/plans/p/plan.json'], main), '{"stage":"executing"}');
  assert.ok(git(['merge-base', '--is-ancestor', a.merged, 'int/p'], main) === '');
});

test('state-queue: lo mismo con int/p EN USO en el checkout principal: el merge se hace allí', () => {
  const { main, run } = fixture();
  task(main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  task(main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  git(['checkout', '-q', 'int/p'], main);
  run('task/p/01-a');
  write(main, '.pignolo/state/plans/p/plan.json', '{"stage":"executing"}\n');
  const state = commitAll(main, 'estado del plan entre merges', ['.pignolo/state/plans/p/plan.json']);
  const b = run('task/p/02-b');
  assert.strictEqual(git(['rev-parse', 'HEAD'], main), b.merged, 'el checkout principal avanzó con --ff-only');
  assert.strictEqual(sha(main, 'int/p^1'), state);
  assert.strictEqual(git(['status', '--porcelain', '-uno'], main), '');
  assert.strictEqual(sha(main, 'cp/p/2'), b.merged);
});

test('state-queue: una TAREA que toca .pignolo/state/ se rechaza (state-change) y int/ queda quieto', () => {
  const { main, run } = fixture();
  task(main, 'task/p/01-st', { '.pignolo/state/plans/p/plan.json': '{"stage":"closed"}\n' });
  const before = sha(main, 'int/p');
  const e = kindOf(() => run('task/p/01-st'));
  assert.strictEqual(e.kind, 'state-change');
  assert.deepStrictEqual(e.files, ['.pignolo/state/plans/p/plan.json']);
  assert.strictEqual(sha(main, 'int/p'), before);
  assert.strictEqual(git(['tag', '--list', 'cp/*'], main), '');
});

test('state-queue: un estado commiteado DURANTE la compuerta da int-moved y el reintento pasa', () => {
  const { main, run } = fixture();
  task(main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const e = kindOf(() => run('task/p/01-a', { opts: { beforeAdvance: () => stateCommitOffCheckout(main) } }));
  assert.strictEqual(e.kind, 'int-moved');
  const moved = sha(main, 'int/p');
  assert.match(git(['log', '-1', '--format=%s', moved], main), /estado del plan/);
  const r = run('task/p/01-a');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(sha(main, 'int/p^1'), moved);
});
