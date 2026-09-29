'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeRepo, makeTempDir, git } = require('./helpers');
const seals = require('../plugins/pignolo/lib/seals');

const TREE = 'a'.repeat(40);
const mk = (over = {}) => ({
  v: 1, repoId: 'r1', sha: 'b'.repeat(40), treeHash: TREE, treeAfter: TREE, level: 'on-done',
  command: 'npm test', exit: 0, status: 'PASS', logHash: '', time: '2026-09-29T10:00:00.000Z',
  task: 't1', noTestsReason: null,
  checks: { scope: [], emptied: [], integrity: [], envDetect: [] }, ...over,
});
const env = () => ({ PIGNOLO_HOME: makeTempDir('pignolo-home-') });

test('writeSeal then findSeal round-trips by tree and level', () => {
  const e = env();
  const { file, logHash } = seals.writeSeal({ env: e, repoId: 'r1', seal: mk(), log: 'salida\n' });
  assert.ok(fs.existsSync(file));
  assert.deepStrictEqual(seals.findSeal({ env: e, repoId: 'r1', treeHash: TREE, level: 'on-done' }), { ...mk(), logHash });
  assert.strictEqual(seals.findSeal({ env: e, repoId: 'r1', treeHash: 'c'.repeat(40), level: 'on-done' }), null);
  assert.strictEqual(seals.findSeal({ env: e, repoId: 'r1', treeHash: TREE, level: 'pre-merge' }), null);
  assert.strictEqual(seals.findSeal({ env: e, repoId: 'other', treeHash: TREE, level: 'on-done' }), null);
});

test('the log is stored under its sha256 and logHash matches', () => {
  const e = env();
  const { logHash } = seals.writeSeal({ env: e, repoId: 'r1', seal: mk(), log: 'contenido' });
  assert.strictEqual(logHash, crypto.createHash('sha256').update('contenido').digest('hex'));
  assert.strictEqual(fs.readFileSync(path.join(seals.sealDir(e, 'r1'), 'logs', `${logHash}.log`), 'utf8'), 'contenido');
});

test('two seals for the same tree: the newest wins; corrupt or invalid files are ignored', () => {
  const e = env();
  seals.writeSeal({ env: e, repoId: 'r1', seal: mk({ time: '2026-09-29T10:00:00.000Z', command: 'viejo' }), log: 'a' });
  seals.writeSeal({ env: e, repoId: 'r1', seal: mk({ time: '2026-09-29T11:00:00.000Z', command: 'nuevo' }), log: 'b' });
  const dir = seals.sealDir(e, 'r1');
  fs.writeFileSync(path.join(dir, `${TREE}-on-done-zzz.json`), '{roto');
  fs.writeFileSync(path.join(dir, `${TREE}-on-done-yyy.json`), JSON.stringify({ ...mk({ time: '2030-01-01T00:00:00.000Z' }), status: 'MAGIC' }));
  assert.strictEqual(seals.findSeal({ env: e, repoId: 'r1', treeHash: TREE, level: 'on-done' }).command, 'nuevo');
});

test('validateSeal', () => {
  const ok = { ...mk(), logHash: 'f'.repeat(64) };
  const cases = [
    ['valid', ok, true],
    ['null exit and task', { ...ok, exit: null, task: null }, true],
    ['wrong version', { ...ok, v: 2 }, false],
    ['unknown status', { ...ok, status: 'OK' }, false],
    ['exit as string', { ...ok, exit: '0' }, false],
    ['missing checks', { ...ok, checks: undefined }, false],
    ['checks.scope not a list', { ...ok, checks: { ...ok.checks, scope: 'x' } }, false],
    ['bad envDetect item', { ...ok, checks: { ...ok.checks, envDetect: [{ path: 'a' }] } }, false],
    ['not an object', null, false],
  ];
  for (const [name, obj, valid] of cases) {
    assert.strictEqual(seals.validateSeal(obj).length === 0, valid, name);
  }
});

test('repoIdFor of a linked worktree equals the main checkout id', () => {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'rama', wt], repo);
  const a = seals.repoIdFor({ cwd: repo, timeoutMs: 20000 });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.strictEqual(seals.repoIdFor({ cwd: wt, timeoutMs: 20000 }), a);
});
