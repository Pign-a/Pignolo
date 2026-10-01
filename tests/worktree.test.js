'use strict';
// Worktrees por tarea desde el contrato y tag de contrato (lib/worktrees.js, scripts/worktree.js). Repos reales.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const W = require('../plugins/pignolo/lib/worktrees');

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'worktree.js');
const cli = (cwd, args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').pop()) : undefined, stderr: r.stderr };
};
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const same = (a, b) => assert.strictEqual(fs.realpathSync(a).toLowerCase(), fs.realpathSync(b).toLowerCase());

// main con project.md (deps-install opcional), int/p con un commit más que contract/p/v1.
function fixture({ deps } = {}) {
  const main = makeRepo();
  write(main, '.pignolo/project.md', `---\ntype: code-tested\ngates:\n  on-done: npm test\n${deps ? 'deps-install: "node deps.js"\n' : ''}---\n`);
  if (deps === 'ok') write(main, 'deps.js', "require('fs').writeFileSync('deps-cwd.txt', process.cwd());\n");
  if (deps === 'fail') write(main, 'deps.js', 'console.error("boom"); process.exit(1);\n');
  git(['add', '-f', '-A'], main);
  git(['commit', '-q', '-m', 'project'], main);
  git(['branch', 'int/p'], main);
  git(['tag', 'contract/p/v1'], main);
  git(['checkout', '-q', 'int/p'], main);
  write(main, 'extra.txt', 'x\n');
  git(['add', 'extra.txt'], main);
  git(['commit', '-q', '-m', 'adelantado'], main);
  git(['checkout', '-q', 'main'], main);
  return { main, tagSha: git(['rev-parse', 'contract/p/v1'], main), intSha: git(['rev-parse', 'int/p'], main) };
}

test('create nace del tag de contrato (no de int/p), con la rama y la ruta de §11.1', () => {
  const { main, tagSha, intSha } = fixture();
  assert.notStrictEqual(tagSha, intSha);
  const r = W.createTaskWorktree({ main, plan: 'p', nn: '03', slug: 'cola', depsInstall: false });
  assert.strictEqual(r.base, tagSha);
  assert.strictEqual(r.branch, 'task/p/03-cola');
  same(path.dirname(r.worktree), path.join(main, '.pignolo', 'worktrees'));
  assert.strictEqual(path.basename(r.worktree), 'p-03-cola');
  assert.strictEqual(git(['rev-parse', 'HEAD'], r.worktree), tagSha);
  git(['merge-base', '--is-ancestor', 'contract/p/v1', 'HEAD'], r.worktree); // lanza si no
  assert.strictEqual(W.MECHANISM, 'B');
});

test('sin contrato nace de int/p; con from explícito, de ese ref; el contrato más alto es el numérico', () => {
  const main = makeRepo();
  git(['branch', 'int/p'], main);
  git(['checkout', '-q', 'int/p'], main);
  write(main, 'e.txt', '1\n');
  git(['add', 'e.txt'], main);
  git(['commit', '-q', '-m', 'e'], main);
  git(['checkout', '-q', 'main'], main);
  const intSha = git(['rev-parse', 'int/p'], main);
  assert.strictEqual(W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a', depsInstall: false }).base, intSha);
  const first = git(['rev-parse', 'main'], main);
  assert.strictEqual(W.createTaskWorktree({ main, plan: 'p', nn: '02', slug: 'b', from: 'main', depsInstall: false }).base, first);
  git(['tag', 'contract/p/v2', 'main'], main);
  git(['tag', 'contract/p/v10', 'int/p'], main);
  assert.strictEqual(W.createTaskWorktree({ main, plan: 'p', nn: '03', slug: 'c', depsInstall: false }).base, intSha, 'v10 gana a v2');
});

test('create dos veces con el mismo nn/slug: exists y la primera no se toca', () => {
  const { main } = fixture();
  const a = W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a', depsInstall: false });
  write(a.worktree, 'trabajo.txt', 'mío\n');
  assert.throws(() => W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a', depsInstall: false }), (e) => e.kind === 'exists');
  assert.strictEqual(fs.readFileSync(path.join(a.worktree, 'trabajo.txt'), 'utf8'), 'mío\n');
  const r = cli(main, ['create', '--plan', 'p', '--nn', '01', '--slug', 'a', '--no-deps']);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.out.kind, 'exists');
  assert.match(r.stderr, /Alternativa:/);
});

test('deps-install que falla: deps-failed, la worktree sigue ahí (partial) y el mensaje trae la ruta', () => {
  const { main } = fixture({ deps: 'fail' });
  let err;
  try { W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a' }); } catch (e) { err = e; }
  assert.ok(err, 'tenía que fallar');
  assert.strictEqual(err.kind, 'deps-failed');
  assert.strictEqual(err.partial, true);
  assert.ok(fs.existsSync(err.worktree), 'no se borró');
  assert.ok(err.message.includes(err.worktree));
  const r = cli(main, ['create', '--plan', 'p', '--nn', '02', '--slug', 'b']);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.out.kind, 'deps-failed');
  assert.strictEqual(r.out.partial, true);
});

test('deps-install corre con el cwd de la worktree', () => {
  const { main } = fixture({ deps: 'ok' });
  const r = W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a' });
  same(fs.readFileSync(path.join(r.worktree, 'deps-cwd.txt'), 'utf8'), r.worktree);
});

test('list: sucia true, limpia false; ni la principal ni la de la cola (_queue/) salen como de tarea', () => {
  const { main } = fixture();
  const a = W.createTaskWorktree({ main, plan: 'p', nn: '01', slug: 'a', depsInstall: false });
  const b = W.createTaskWorktree({ main, plan: 'p', nn: '02', slug: 'b', depsInstall: false });
  write(a.worktree, 'sucio.txt', 'x\n');
  git(['worktree', 'add', '-q', '-b', 'queue/p', path.join(main, '.pignolo', 'worktrees', '_queue', 'p'), 'int/p'], main);
  const list = W.listTaskWorktrees({ main });
  assert.deepStrictEqual(list.map((w) => w.branch).sort(), ['task/p/01-a', 'task/p/02-b']);
  const byBranch = Object.fromEntries(list.map((w) => [w.branch, w]));
  assert.strictEqual(byBranch['task/p/01-a'].dirty, true);
  assert.strictEqual(byBranch['task/p/02-b'].dirty, false);
  assert.deepStrictEqual([byBranch['task/p/01-a'].plan, byBranch['task/p/01-a'].nn, byBranch['task/p/01-a'].slug], ['p', '01', 'a']);
  assert.strictEqual(byBranch['task/p/02-b'].head, git(['rev-parse', 'HEAD'], b.worktree));
  const viaCli = cli(main, ['list']);
  assert.strictEqual(viaCli.out.worktrees.length, 2);
});

test('tag-contract: sin v1 pide v1; sin cp/ en la punta, no-cp; en orden crea; repetir falla y no mueve el tag', () => {
  const main = makeRepo();
  git(['branch', 'int/p'], main);
  assert.throws(() => W.tagContract({ main, plan: 'p', n: 2 }), (e) => e.kind === 'contract-order');
  assert.throws(() => W.tagContract({ main, plan: 'p', n: 1 }), (e) => e.kind === 'no-cp');
  git(['tag', 'cp/p/1', 'int/p'], main);
  const t = W.tagContract({ main, plan: 'p', n: 1 });
  assert.strictEqual(t.tag, 'contract/p/v1');
  assert.strictEqual(t.sha, git(['rev-parse', 'int/p'], main));
  // int/p avanza (otro commit) sin cp/: v2 pide el cp/ de la nueva punta
  git(['checkout', '-q', 'int/p'], main);
  write(main, 'n.txt', '1\n');
  git(['add', 'n.txt'], main);
  git(['commit', '-q', '-m', 'n'], main);
  git(['checkout', '-q', 'main'], main);
  assert.throws(() => W.tagContract({ main, plan: 'p', n: 2 }), (e) => e.kind === 'no-cp');
  git(['tag', 'cp/p/2', 'int/p'], main);
  const before = git(['rev-parse', 'contract/p/v1'], main);
  assert.throws(() => W.tagContract({ main, plan: 'p', n: 1 }), (e) => e.kind === 'contract-order');
  assert.strictEqual(git(['rev-parse', 'contract/p/v1'], main), before, 'el tag no se movió');
  assert.strictEqual(W.tagContract({ main, plan: 'p', n: 2 }).tag, 'contract/p/v2');
  const r = cli(main, ['tag-contract', '--plan', 'p', '--n', '2']);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.out.kind, 'contract-order');
});

test('resolveWorktree: la de ruta más larga que sea prefijo; wt-a y wt-ab no se confunden; el principal es null', () => {
  const root = path.resolve(path.sep, 'tmp-h7');
  const tasks = [{ id: 'a', worktree: path.join(root, 'wt-a') }, { id: 'ab', worktree: path.join(root, 'wt-ab') }];
  const f = (p) => W.resolveWorktree({ main: path.join(root, 'main'), filePath: p, tasks });
  assert.strictEqual(f(path.join(root, 'wt-a', 'src', 'x.js')).task.id, 'a');
  assert.strictEqual(f(path.join(root, 'wt-ab', 'src', 'x.js')).task.id, 'ab');
  assert.strictEqual(f(path.join(root, 'main', 'src', 'x.js')), null);
  assert.strictEqual(f(path.join(root, 'wt-a')), null, 'la raíz misma no es un archivo');
  const nested = [...tasks, { id: 'n', worktree: path.join(root, 'wt-a', 'nested') }];
  assert.strictEqual(W.resolveWorktree({ main: root, filePath: path.join(root, 'wt-a', 'nested', 'y.js'), tasks: nested }).task.id, 'n');
  if (process.platform === 'win32') assert.strictEqual(f(path.join(root.toUpperCase(), 'WT-A', 'x.js')).task.id, 'a', 'win32 no distingue mayúsculas');
  assert.strictEqual(W.resolveWorktree({ main: root, filePath: '', tasks }), null);
});
