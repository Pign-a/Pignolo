'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');

const { expandSeed, seedCommand, SEED_ARGS } = require('../plugins/pignolo/lib/init-seed');
const { runGate } = require('../plugins/pignolo/lib/gate');
const { validateSeal } = require('../plugins/pignolo/lib/seals');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');

function repoWithGate(gate, extra = '') {
  const cwd = makeRepo();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(path.join(cwd, '.pignolo', 'project.md'), `---\ntype: code-tested\ngates:\n  on-done: ${JSON.stringify(gate)}\n${extra}---\n`);
  fs.mkdirSync(path.join(cwd, 'tests'));
  fs.writeFileSync(path.join(cwd, 'tests', 'a.test.js'), '// Protects: nada\n');
  git(['add', '-A'], cwd);
  git(['commit', '-q', '-m', 'base'], cwd);
  return cwd;
}
const okExec = (seen) => (command, o) => { seen.push({ command, env: o.env }); fs.appendFileSync(o.logFile, 'ok\n'); return { exit: 0 }; };

test('expandSeed replaces every {seed} and nothing else', () => {
  assert.equal(expandSeed('vitest run --sequence.seed={seed} {seed}', 42), 'vitest run --sequence.seed=42 42');
  assert.equal(expandSeed('npm test', 42), 'npm test');
  assert.equal(expandSeed('x {Seed} {seeds}', 42), 'x {Seed} {seeds}');
});

test('runGate expands {seed} before exec, records seedInCommand and keeps PIGNOLO_TEST_SEED', () => {
  const seen = [];
  const s = runGate({ cwd: repoWithGate('echo {seed}'), level: 'on-done', seed: 7, exec: okExec(seen) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].command, 'echo 7');
  assert.equal(seen[0].env.PIGNOLO_TEST_SEED, '7');
  assert.equal(s.seedOffered, 7);
  assert.equal(s.seedInCommand, true);
  assert.equal(s.command, 'echo {seed}');
});

test('a gate without the marker is unchanged (regression guard)', () => {
  const seen = [];
  const s = runGate({ cwd: repoWithGate('echo hola'), level: 'on-done', seed: 7, exec: okExec(seen) });
  assert.equal(seen[0].command, 'echo hola');
  assert.equal(s.seedInCommand, false);
  assert.equal(seen[0].env.PIGNOLO_TEST_SEED, '7');
});

test('same expansion through the real shell (cmd.exe here, sh elsewhere)', () => {
  const cwd = repoWithGate('node show.js {seed}');
  fs.writeFileSync(path.join(cwd, 'show.js'), 'console.log("SEED=" + process.argv[2]);');
  git(['add', '-A'], cwd);
  git(['commit', '-q', '-m', 'show'], cwd);
  const s = runGate({ cwd, level: 'on-done', seed: 123 });
  assert.match(s.logTail, /SEED=123/);
  assert.equal(s.status === 'PASS' || s.status === 'NO_TESTS', true);
});

test('seedCommand: verified rows apply, unverified and absent ones do not', () => {
  assert.equal(SEED_ARGS.vitest.verified, true);
  const v = seedCommand('npm run test', 'vitest');
  assert.equal(v.command, 'npm run test -- --sequence.shuffle --sequence.seed={seed}');
  assert.equal(v.seedPlan, 'applied');
  assert.equal(seedCommand('pnpm run test', 'vitest').command, 'pnpm run test --sequence.shuffle --sequence.seed={seed}');
  assert.equal(seedCommand('yarn run test', 'jest').command, 'yarn run test --randomize --seed={seed}');
  const unverified = seedCommand('go test ./...', 'go');
  assert.equal(unverified.seedPlan, 'unused');
  assert.equal(unverified.command, 'go test ./...');
  assert.match(unverified.reason, /no verificado/);
  assert.equal(seedCommand('cargo test', 'cargo').seedPlan, 'unused');
  assert.equal(seedCommand('npm run test', 'vitest', { testScript: 'vitest run && playwright test' }).reason, 'script-not-runner');
  assert.equal(seedCommand('npm run test', 'vitest', { testScript: 'vitest run' }).seedPlan, 'applied');
  assert.equal(seedCommand('python -m pytest -q', 'pytest').command, 'python -m pytest -q --randomly-seed={seed}');
});

test('project-config: {seed} in a gate is fine, in deps-install or gates.mutation it warns and is kept', () => {
  const cwd = makeTempDir('pignolo-seedcfg-');
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  const read = (fm) => { fs.writeFileSync(path.join(cwd, '.pignolo', 'project.md'), `---\n${fm}---\n`); return readProjectConfig({ root: cwd }); };
  const ok = read('type: code-tested\ntest-paths: tests/\ngates:\n  on-done: x --seed {seed}\n');
  assert.deepEqual(ok.warnings, []);
  const bad = read('type: code-tested\ntest-paths: tests/\ndeps-install: ci {seed}\ngates:\n  on-done: x\n  mutation: m {seed}\n');
  assert.equal(bad.warnings.length, 2);
  assert.equal(bad.gates.mutation, 'm {seed}');
  assert.equal(bad.depsInstall, 'ci {seed}');
});

test('seals: seedInCommand must be boolean; a seal without it stays valid', () => {
  const base = { v: 1, repoId: 'r', sha: null, treeHash: 'a'.repeat(40), treeAfter: null, level: 'on-done', command: 'x', exit: 0, status: 'PASS', logHash: 'b'.repeat(64), time: '2026-10-01T00:00:00.000Z', task: null, noTestsReason: null, checks: { scope: [], emptied: [], integrity: [], envDetect: [] } };
  assert.deepEqual(validateSeal(base), []);
  assert.deepEqual(validateSeal({ ...base, seedInCommand: true }), []);
  assert.equal(validateSeal({ ...base, seedInCommand: 'yes' }).length, 1);
});
