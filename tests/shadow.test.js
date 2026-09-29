'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { snapshotWip, seedShadow, backupRefs } = require('../plugins/pignolo/lib/git-backup');
const { repoIdForGitDir } = require('../plugins/pignolo/lib/shadow');

// Los tests que no prueban el plazo le dan a la instantánea uno holgado: el de 2 s
// es el que usa el hook de la guardia y, con la suite corriendo en paralelo, una
// máquina cargada lo vence de a ratos.
const T = 60000;

const SESSION = 'sesion-de-prueba';
const envWith = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') });
const shadowDir = (env, repo) => path.join(env.PIGNOLO_HOME, 'shadow', `${repoIdForGitDir(path.join(repo, '.git'))}.git`);
const sg = (dir, args) => git(['--git-dir', dir, ...args], process.cwd());
const refsIn = (repo, prefix) => git(['for-each-ref', '--format=%(refname)', prefix], repo).split('\n').filter(Boolean);

function listTree(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else out.push(`${path.relative(dir, f)} ${fs.statSync(f).mtimeMs}`);
    }
  })(dir);
  return out.sort();
}

test('seeding creates a bare shadow outside the repo without touching .git', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), 'local-exclude.txt\n');
  const before = listTree(path.join(repo, '.git'));
  const env = envWith();
  const r = seedShadow({ cwd: repo, env, sessionId: SESSION });
  const dir = shadowDir(env, repo);
  assert.strictEqual(r.gitDir, dir);
  assert.strictEqual(sg(dir, ['rev-parse', '--is-bare-repository']), 'true');
  assert.strictEqual(sg(dir, ['config', 'core.autocrlf']), 'false');
  assert.throws(() => sg(dir, ['config', 'core.worktree']), 'no persisted core.worktree');
  assert.ok(!fs.existsSync(path.join(dir, 'objects', 'info', 'alternates')), 'own object store');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'local-exclude.txt\n');
  assert.deepStrictEqual(listTree(path.join(repo, '.git')), before, 'the user .git is only read');
});

test('after seeding, snapshots go to the shadow (not the repo)', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo valioso\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'sin seguimiento\n');
  const statusBefore = git(['status', '--porcelain'], repo);
  const snap = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.strictEqual(snap.store, 'shadow');
  assert.strictEqual(snap.gitDir, shadowDir(env, repo));
  assert.strictEqual(sg(snap.gitDir, ['show', `${snap.ref}:a.txt`]), 'trabajo valioso');
  assert.strictEqual(sg(snap.gitDir, ['show', `${snap.ref}:nuevo.txt`]), 'sin seguimiento');
  assert.deepStrictEqual(refsIn(repo, 'refs/pignolo/wip'), [], 'nothing written inside the repo');
  assert.strictEqual(git(['status', '--porcelain'], repo), statusBefore, 'tree and index untouched');
});

test('another session without its own seed falls back to the repo', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo, env, sessionId: 'otra-sesion', timeoutMs: T });
  assert.strictEqual(snap.store, 'repo');
  assert.strictEqual(refsIn(repo, 'refs/pignolo/wip').length, 1);
});

test('the shadow snapshot does not capture ignored files (.gitignore and info/exclude)', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'secreto.env\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'ignore'], repo);
  fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), 'local.txt\n');
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'secreto.env'), 'CLAVE=x\n');
  fs.writeFileSync(path.join(repo, 'local.txt'), 'x\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.strictEqual(sg(snap.gitDir, ['show', `${snap.ref}:a.txt`]), 'cambio');
  assert.throws(() => sg(snap.gitDir, ['show', `${snap.ref}:secreto.env`]));
  assert.throws(() => sg(snap.gitDir, ['show', `${snap.ref}:local.txt`]));
});

test('an unchanged tree reuses the last shadow snapshot', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const first = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  const second = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.strictEqual(first.reused, false);
  assert.strictEqual(second.reused, true);
  assert.strictEqual(second.sha, first.sha);
});

test('the shadow stores bytes as-is (no CRLF conversion)', () => {
  const repo = makeRepo();
  git(['config', 'core.autocrlf', 'true'], repo);
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'crlf.txt'), 'uno\r\ndos\r\n');
  const snap = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  const blob = require('node:child_process').execFileSync('git', ['--git-dir', snap.gitDir, 'cat-file', 'blob', `${snap.ref}:crlf.txt`]);
  assert.strictEqual(blob.toString('binary'), 'uno\r\ndos\r\n');
});

test('a held lock on the session index does not block the snapshot (parallel commands)', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  const idx = fs.readdirSync(path.join(shadowDir(env, repo), 'pignolo')).find((f) => f.startsWith('index-'));
  fs.writeFileSync(path.join(shadowDir(env, repo), 'pignolo', `${idx}.lock`), '');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  assert.strictEqual(snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T }).store, 'shadow');
});

test('nested repos stay untouched and are stored as a gitlink', () => {
  const repo = makeRepo();
  const nested = path.join(repo, 'anidado');
  fs.mkdirSync(nested);
  git(['init', '-q'], nested);
  git(['-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '--allow-empty', '-m', 'x'], nested);
  const before = listTree(path.join(nested, '.git'));
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: SESSION });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.match(sg(snap.gitDir, ['ls-tree', snap.ref, 'anidado']), /^160000 commit /);
  assert.deepStrictEqual(listTree(path.join(nested, '.git')), before);
});

test('a failed seed makes fallback snapshots carry a warning and is logged', () => {
  const repo = makeRepo();
  const env = envWith();
  // Una sombra que no es un repo git hace fallar la siembra.
  fs.mkdirSync(path.join(shadowDir(env, repo), 'pignolo'), { recursive: true });
  fs.writeFileSync(path.join(shadowDir(env, repo), 'HEAD'), 'basura\n');
  assert.throws(() => seedShadow({ cwd: repo, env, sessionId: SESSION }));
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.strictEqual(snap.store, 'repo');
  assert.match(snap.warning, /no se pudo sembrar.*NO sobreviven a borrar \.git/);
  assert.match(fs.readFileSync(path.join(env.PIGNOLO_HOME, 'logs', 'backup-failures.log'), 'utf8'), /"what":"siembra"/);
});

test('a failed snapshot is logged before it is rethrown', () => {
  const repo = makeRepo();
  const env = envWith();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  assert.throws(() => snapshotWip({ cwd: repo, env, timeoutMs: 0 }), /plazo/);
  assert.match(fs.readFileSync(path.join(env.PIGNOLO_HOME, 'logs', 'backup-failures.log'), 'utf8'), /"what":"instantánea".*plazo/);
});

test('seeding copies every branch and tag out of the repo; unchanged refs are not copied again', () => {
  const repo = makeRepo();
  git(['checkout', '-q', '-b', 'feature'], repo);
  fs.writeFileSync(path.join(repo, 'f.txt'), 'rama\n');
  git(['add', 'f.txt'], repo);
  git(['commit', '-q', '-m', 'feature'], repo);
  git(['tag', 'v1'], repo);
  git(['checkout', '-q', 'main'], repo);
  const env = envWith();
  const r = seedShadow({ cwd: repo, env, sessionId: SESSION });
  assert.strictEqual(r.refs.count, 4); // main, feature, v1, HEAD
  const dir = r.gitDir;
  assert.strictEqual(sg(dir, ['show', `${r.refs.base}/heads/feature:f.txt`]), 'rama');
  assert.strictEqual(sg(dir, ['rev-parse', `${r.refs.base}/tags/v1`]), git(['rev-parse', 'v1'], repo));
  assert.strictEqual(sg(dir, ['rev-parse', `${r.refs.base}/HEAD`]), git(['rev-parse', 'main'], repo));
  const again = backupRefs({ cwd: repo, env });
  assert.strictEqual(again.shadow.reused, true);
  git(['branch', 'otra'], repo);
  assert.strictEqual(backupRefs({ cwd: repo, env }).shadow.reused, false);
});

test('in-repo fallback snapshots are imported into the shadow at seed time', () => {
  const repo = makeRepo();
  const env = envWith();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'antes de sembrar\n');
  const early = snapshotWip({ cwd: repo, env, sessionId: SESSION, timeoutMs: T });
  assert.strictEqual(early.store, 'repo');
  const r = seedShadow({ cwd: repo, env, sessionId: SESSION });
  assert.strictEqual(r.imported, 1);
  assert.strictEqual(sg(r.gitDir, ['show', `${early.ref}:a.txt`]), 'antes de sembrar');
});

test('a second seeder while one holds the lock does nothing', () => {
  const repo = makeRepo();
  const env = envWith();
  const lock = path.join(env.PIGNOLO_HOME, 'shadow', `${repoIdForGitDir(path.join(repo, '.git'))}.lock`);
  fs.mkdirSync(lock, { recursive: true });
  assert.deepStrictEqual(seedShadow({ cwd: repo, env, sessionId: SESSION }), { busy: true });
});

test('outside a repo, seeding and snapshots are no-ops', () => {
  const env = envWith();
  assert.strictEqual(seedShadow({ cwd: makeTempDir(), env }), null);
  assert.strictEqual(snapshotWip({ cwd: makeTempDir(), env, timeoutMs: T }), null);
});
