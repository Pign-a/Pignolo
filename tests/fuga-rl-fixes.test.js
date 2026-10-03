'use strict';
// Pasada de arreglos de la fuga de leak-values: formas del commit que la compuerta tiene que ver (RL-02 a RL-05).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runGuard, makeRepo, git } = require('./helpers');

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
const put = (repo, rel, text = '["SECRETO-XYZ"]\n') => {
  const f = path.join(repo, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const LEAK = '.pignolo-ui/runs/r1/leak-values.json';
const privateRepo = () => {
  const repo = makeRepo();
  put(repo, '.pignolo-ui/.gitignore', '*\n');
  put(repo, LEAK);
  return repo;
};

test('RL-02: add -A; commit y add -f . && commit se frenan; un add de código y commit pasa', () => {
  const repo = privateRepo();
  assert.strictEqual(runGuard(bash('git add -A; git commit -m x', repo)).status, 0, 'sin -f el ignorado no entra al add');
  assert.strictEqual(runGuard(bash('git add -f .pignolo-ui; git commit -m x', repo)).status, 2);
  assert.strictEqual(runGuard(bash('git add -f . && git commit -m x', repo)).status, 2);
  put(repo, 'a.txt', 'a\n');
  assert.strictEqual(runGuard(bash('git add a.txt && git commit -m x', repo)).status, 0);
});

test('RL-03: git stage -f en el hilo principal también cuenta como add antes del commit', () => {
  const repo = privateRepo();
  assert.strictEqual(runGuard(bash('git stage -f .pignolo-ui && git commit -m x', repo)).status, 2);
});

test('RL-04: commit --only con rutas no lleva lo indexado; con -i sí', () => {
  const repo = privateRepo();
  git(['add', '-f', LEAK], repo);
  put(repo, 'b.txt', 'b\n');
  git(['add', 'b.txt'], repo);
  assert.strictEqual(runGuard(bash('git commit -m x b.txt', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git commit -i -m x b.txt', repo)).status, 2);
});

test('RL-05: git commit --dry-run no se frena y sacar del índice (restore --staged, rm --cached) nunca se frena', () => {
  const repo = privateRepo();
  git(['add', '-f', LEAK], repo);
  assert.strictEqual(runGuard(bash('git commit --dry-run', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git restore --staged -- .pignolo-ui', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git rm -r --cached -- .pignolo-ui', repo)).status, 0);
});
