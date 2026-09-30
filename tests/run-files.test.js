'use strict';
// run.js task: --file normalizado y archivos por rol (hito 3b).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const run = (cwd, args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
};

// Repo con project.md commiteado (test-paths: tests/, protected-test-config: check.js),
// flujo daily y una worktree de tarea.
function setup() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'),
    '---\ntype: code-tested\ngates:\n  on-done: node check.js\ntest-paths:\n  - tests/\nprotected-test-config:\n  - check.js\n---\n');
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'project.md'], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  assert.strictEqual(run(repo, ['start', '--flow', 'daily']).status, 0);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'task/daily/2026-09-30-demo', wt], repo);
  return { repo, wt, base };
}
const task = (s, ...extra) => run(s.repo, ['task', '--id', 'demo', '--worktree', s.wt, '--base', s.base, ...extra]);

test('--file con barras invertidas y ./ se guarda con barras normales', () => {
  const s = setup();
  const r = task(s, '--file', 'tests\\a.test.js', '--file', './tests/b.test.js', '--agent', 'pignolo:test-writer');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.out.run.task.files, ['tests/a.test.js', 'tests/b.test.js']);
});

test('--file absoluta o con .. → exit 2', () => {
  const s = setup();
  assert.strictEqual(task(s, '--file', path.join(s.wt, 'src', 'a.js'), '--agent', 'pignolo:implementer').status, 2);
  assert.strictEqual(task(s, '--file', 'src/../../x.js', '--agent', 'pignolo:implementer').status, 2);
  assert.strictEqual(task(s, '--file', '/src/a.js', '--agent', 'pignolo:implementer').status, 2);
});

test('test-writer con un archivo fuera de test-paths o protegido → exit 1 con Alternativa', () => {
  const s = setup();
  const out = task(s, '--file', 'tests/a.test.js', '--file', 'src/a.js', '--agent', 'pignolo:test-writer');
  assert.strictEqual(out.status, 1);
  assert.match(out.stderr, /src\/a\.js/);
  assert.match(out.stderr, /Alternativa/);
  assert.strictEqual(task(s, '--file', 'check.js', '--agent', 'pignolo:test-writer').status, 1);
});

test('implementer o fixer con un test sin --test-authorization → exit 1; con autorización → 0', () => {
  const s = setup();
  assert.strictEqual(task(s, '--file', 'src/a.js', '--file', 'tests/a.test.js', '--agent', 'pignolo:implementer').status, 1);
  assert.strictEqual(task(s, '--file', 'check.js', '--agent', 'pignolo:fixer').status, 1);
  const ok = task(s, '--file', 'src/a.js', '--file', 'tests/a.test.js', '--agent', 'pignolo:implementer', '--test-authorization');
  assert.strictEqual(ok.status, 0, ok.stderr);
});

test('start agrega .gitignore, tmp/ y worktrees/ al .gitignore de .pignolo, y git no los ve', () => {
  const repo = makeRepo();
  assert.strictEqual(run(repo, ['start', '--flow', 'trivial']).status, 0);
  const gi = fs.readFileSync(path.join(repo, '.pignolo', '.gitignore'), 'utf8').split('\n');
  assert.ok(gi.includes('.gitignore') && gi.includes('tmp/') && gi.includes('worktrees/'));
  fs.mkdirSync(path.join(repo, '.pignolo', 'tmp'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'tmp', 'x.json'), '{}');
  assert.ok(!git(['status', '--porcelain', '--untracked-files=all'], repo).includes('.pignolo/'), 'ni tmp/ ni el propio .gitignore');
});

test('--file relativa a una unidad (C:foo) → exit 2', () => {
  const s = setup();
  assert.strictEqual(task(s, '--file', 'C:foo', '--agent', 'pignolo:implementer').status, 2);
  assert.strictEqual(task(s, '--file', 'c:src/a.js', '--agent', 'pignolo:implementer').status, 2);
});
