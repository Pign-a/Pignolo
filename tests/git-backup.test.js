'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { snapshotWip, backupRefs, setReflogPolicy } = require('../plugins/pignolo/lib/git-backup');
const { isRepo, currentBranch } = require('../plugins/pignolo/lib/git');

// Los tests que no prueban el plazo le dan a la instantánea uno holgado: el de 2 s
// es el que usa el hook de la guardia y, con la suite corriendo en paralelo, una
// máquina cargada lo vence de a ratos.
const T = 60000;

const wipRefs = (repo) => git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/wip'], repo).split('\n').filter(Boolean);

test('isRepo and currentBranch', () => {
  const repo = makeRepo();
  assert.strictEqual(isRepo(repo), true);
  assert.strictEqual(isRepo(makeTempDir()), false);
  assert.strictEqual(currentBranch(repo), 'main');
});

test('clean tree produces no snapshot', () => {
  assert.strictEqual(snapshotWip({ cwd: makeRepo(), timeoutMs: T }), null);
});

test('non-repo or missing directory produces no snapshot', () => {
  assert.strictEqual(snapshotWip({ cwd: makeTempDir(), timeoutMs: T }), null);
  assert.strictEqual(snapshotWip({ cwd: path.join(makeTempDir(), 'no-existe'), timeoutMs: T }), null);
});

test('snapshot captures modified, deleted and untracked files without touching the tree or index', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'b.txt'), 'dos\n');
  git(['add', 'b.txt'], repo);
  git(['commit', '-q', '-m', 'b'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'modificado\n');
  fs.rmSync(path.join(repo, 'b.txt'));
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'sin seguimiento\n');
  const statusBefore = git(['status', '--porcelain'], repo);

  const snap = snapshotWip({ cwd: repo, reason: 'test', timeoutMs: T });
  assert.ok(snap && snap.ref.startsWith('refs/pignolo/wip/'), JSON.stringify(snap));
  assert.strictEqual(git(['status', '--porcelain'], repo), statusBefore, 'tree and index untouched');
  assert.strictEqual(git(['show', `${snap.sha}:a.txt`], repo), 'modificado');
  assert.strictEqual(git(['show', `${snap.sha}:nuevo.txt`], repo), 'sin seguimiento');
  assert.throws(() => git(['show', `${snap.sha}:b.txt`], repo), 'the deletion is captured');
});

test('the snapshot survives a destructive command', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo valioso\n');
  const snap = snapshotWip({ cwd: repo, reason: 'antes-de-destruir', timeoutMs: T });
  git(['checkout', '--', 'a.txt'], repo); // simula el comando que la guardia no detectó
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'uno\n');
  assert.strictEqual(git(['show', `${snap.ref}:a.txt`], repo), 'trabajo valioso');
});

test('ignored files are not captured', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'secreto.env\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'ignore'], repo);
  fs.writeFileSync(path.join(repo, 'secreto.env'), 'CLAVE=x\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo, timeoutMs: T });
  assert.throws(() => git(['show', `${snap.sha}:secreto.env`], repo));
});

test('an unchanged dirty tree does not create a second ref (H15)', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const first = snapshotWip({ cwd: repo, timeoutMs: T });
  const second = snapshotWip({ cwd: repo, timeoutMs: T });
  assert.strictEqual(second.reused, true);
  assert.strictEqual(second.sha, first.sha);
  assert.deepStrictEqual(wipRefs(repo), [first.ref]);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'otro cambio\n');
  assert.strictEqual(snapshotWip({ cwd: repo, timeoutMs: T }).reused, false);
  assert.strictEqual(wipRefs(repo).length, 2);
});

// Un repo anidado sin commits hace abortar a `git add -A` entero; el resto se captura igual.
test('a nested repo without commits does not abort the snapshot', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'anidado'));
  git(['init', '-q'], path.join(repo, 'anidado'));
  fs.writeFileSync(path.join(repo, 'anidado', 'x.txt'), 'x\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo valioso\n');
  const snap = snapshotWip({ cwd: repo, timeoutMs: T });
  assert.strictEqual(git(['show', `${snap.sha}:a.txt`], repo), 'trabajo valioso');
  assert.ok(fs.existsSync(path.join(repo, 'anidado', '.git')), 'the nested .git is untouched');
});

test('a stale lock of the temporary index is removed even when git fails', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const lock = path.join(repo, '.git', `pignolo-wip-index-${process.pid}.lock`);
  fs.writeFileSync(lock, '');
  assert.throws(() => snapshotWip({ cwd: repo, timeoutMs: T }));
  assert.strictEqual(fs.existsSync(lock), false);
  assert.ok(snapshotWip({ cwd: repo, timeoutMs: T }).sha);
});

test('the snapshot respects its total deadline', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  assert.throws(() => snapshotWip({ cwd: repo, timeoutMs: 0 }), /plazo/);
  assert.deepStrictEqual(wipRefs(repo), []);
});

test('backupRefs copies branches and tags', () => {
  const repo = makeRepo();
  git(['branch', 'feature'], repo);
  git(['tag', 'v1'], repo);
  const b = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:00Z') });
  assert.strictEqual(b.count, 3);
  const listed = git(['for-each-ref', '--format=%(refname)', b.base], repo).split('\n');
  assert.ok(listed.includes(`${b.base}/heads/main`));
  assert.ok(listed.includes(`${b.base}/heads/feature`));
  assert.ok(listed.includes(`${b.base}/tags/v1`));
});

test('setReflogPolicy writes never for both keys', () => {
  const repo = makeRepo();
  setReflogPolicy({ cwd: repo });
  assert.strictEqual(git(['config', '--local', 'gc.reflogExpire'], repo), 'never');
  assert.strictEqual(git(['config', '--local', 'gc.reflogExpireUnreachable'], repo), 'never');
});
