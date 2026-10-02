'use strict';
// I7 (fix pass 7a): el repo alcanzado por una junction / enlace simbólico. git informa rutas reales; la cola y el listado de
// worktrees comparaban texto de path.resolve y no reconocían las suyas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const Q = require(path.join(PLUGIN_ROOT, 'lib', 'queue.js'));
const W = require(path.join(PLUGIN_ROOT, 'lib', 'worktrees.js'));
const C = require(path.join(PLUGIN_ROOT, 'lib', 'branch-cleanup.js'));
const { realPath, realNorm } = require(path.join(PLUGIN_ROOT, 'lib', 'real-path.js'));

const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

function linked() {
  const real = makeRepo();
  write(real, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  write(real, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n');
  write(real, '.pignolo/state/plans/p/plan.json', `${JSON.stringify({ v: 1, plan: 'p', created: new Date().toISOString(), stage: 'closed', request: 'x', claims: [] }, null, 2)}\n`);
  git(['add', '-f', '-A'], real);
  git(['commit', '-q', '-m', 'base'], real);
  git(['branch', 'int/p'], real);
  const link = path.join(makeTempDir('pignolo-link-'), 'link');
  try { fs.symlinkSync(real, link, 'junction'); } catch (e) { return { skip: `sin permiso para crear enlaces (${e.code})` }; }
  return { real, link };
}

test('realPath / realNorm: resuelven la junction y un camino que todavía no existe', () => {
  const l = linked();
  if (l.skip) return;
  assert.strictEqual(realNorm(l.link), realNorm(l.real));
  assert.strictEqual(realNorm(path.join(l.link, 'no', 'existe')), realNorm(path.join(l.real, 'no', 'existe')));
  assert.strictEqual(realPath(path.join(l.real, 'x')), path.join(realPath(l.real), 'x'));
});

test('syncQueue por una junction: la segunda entrada reconoce la worktree de la cola (no queue-path-occupied)', () => {
  const l = linked();
  if (l.skip) return;
  const a = Q.syncQueue({ main: l.link, plan: 'p' });
  const b = Q.syncQueue({ main: l.link, plan: 'p' });
  assert.strictEqual(realNorm(a.worktree), realNorm(b.worktree));
});

test('listTaskWorktrees por una junction lista la worktree de la tarea', () => {
  const l = linked();
  if (l.skip) return;
  const made = W.createTaskWorktree({ main: l.link, plan: 'p', nn: '01', slug: 'a', depsInstall: false });
  const viaLink = W.listTaskWorktrees({ main: l.link }).map((x) => x.branch);
  const viaReal = W.listTaskWorktrees({ main: l.real }).map((x) => x.branch);
  assert.deepStrictEqual(viaLink, ['task/p/01-a'], made.worktree);
  assert.deepStrictEqual(viaReal, viaLink);
});

test('cleanup por una junction: la worktree de una rama unida se reconoce y se propone con su worktree', () => {
  const l = linked();
  if (l.skip) return;
  const made = W.createTaskWorktree({ main: l.link, plan: 'p', nn: '01', slug: 'a', depsInstall: false });
  write(made.worktree, 'a.txt', 'x\n');
  git(['add', '-A'], made.worktree);
  git(['commit', '-q', '-m', 'tarea'], made.worktree);
  git(['merge', '-q', '--no-ff', '-m', 'm', 'task/p/01-a'], l.real); // HEAD en main; la rama queda unida a main, no a int/p
  git(['checkout', '-q', 'int/p'], l.real);
  git(['merge', '-q', '--no-ff', '-m', 'm', 'task/p/01-a'], l.real);
  git(['checkout', '-q', 'main'], l.real);
  const c = C.findCandidates({ main: l.link });
  const hit = c.merged.find((m) => m.name === 'task/p/01-a');
  assert.ok(hit, JSON.stringify(c));
  assert.ok(hit.worktree, 'trae su worktree');
});
