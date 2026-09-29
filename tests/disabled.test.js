'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, makeRepo, git } = require('./helpers');
const { readState, flagPaths } = require('../plugins/pignolo/lib/disabled');

test('everything on by default', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const s = readState({ env, cwd: makeTempDir() });
  assert.deepStrictEqual(s, { guardOff: false, hooksOff: false, globalFlag: false, projectFlag: false });
});

test('project flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(flagPaths({ env, cwd }).project, 'x');
  const s = readState({ env, cwd });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('global flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  fs.writeFileSync(flagPaths({ env, cwd: '.' }).global, 'x');
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('PIGNOLO_DISABLED=1 turns everything off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '1' };
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.guardOff, true);
  assert.strictEqual(s.hooksOff, true);
});

test('PIGNOLO_DISABLED with any other value does not turn the guard off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: 'true' };
  assert.strictEqual(readState({ env, cwd: makeTempDir() }).guardOff, false);
});

// Checklist manual del hito 2: /pignolo:off con el cwd de la sesión en un subdirectorio
// (el cd persiste) dejó el flag en <sub>/.pignolo/.disabled y la allowlist lo ignoró.
test('the project flag resolves to the project root from a subdirectory', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.git'));
  const sub = path.join(root, '.claude', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  assert.strictEqual(flagPaths({ env, cwd: sub }).project, path.join(root, '.pignolo', '.disabled'));
  fs.mkdirSync(path.join(root, '.pignolo'));
  fs.writeFileSync(path.join(root, '.pignolo', '.disabled'), 'x');
  assert.strictEqual(readState({ env, cwd: sub }).hooksOff, true);
});

test('a directory with .pignolo/project.md is the root even without git', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const root = makeTempDir();
  fs.mkdirSync(path.join(root, '.pignolo'));
  fs.writeFileSync(path.join(root, '.pignolo', 'project.md'), '# p\n');
  const sub = path.join(root, 'src');
  fs.mkdirSync(sub);
  assert.strictEqual(flagPaths({ env, cwd: sub }).project, path.join(root, '.pignolo', '.disabled'));
});

test("the project flag of a linked worktree is the main checkout one", () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const main = makeRepo();
  const wt = path.join(makeTempDir("pignolo-wt-"), "wt");
  git(["worktree", "add", "-q", "-b", "rama", wt], main);
  assert.strictEqual(path.resolve(flagPaths({ env, cwd: wt }).project), path.resolve(main, ".pignolo", ".disabled"));
  const bare = makeTempDir();
  assert.strictEqual(flagPaths({ env, cwd: bare }).project, path.join(bare, ".pignolo", ".disabled"));
  fs.mkdirSync(path.join(main, ".pignolo"));
  fs.writeFileSync(flagPaths({ env, cwd: wt }).project, "x");
  assert.strictEqual(readState({ env, cwd: main }).projectFlag, true);
});
