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

const backupSets = (repo) => {
  const bases = git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/backup'], repo).split('\n').filter(Boolean)
    .map((r) => r.split('/').slice(0, 4).join('/'));
  return [...new Set(bases)];
};

test('backupRefs does not create a new set when refs are unchanged', () => {
  const repo = makeRepo();
  const first = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:00Z'), outside: false });
  assert.strictEqual(first.count, 1);
  const second = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:05Z'), outside: false });
  assert.deepStrictEqual({ base: second.base, count: second.count, reused: second.reused }, { base: null, count: 0, reused: first.base });
  assert.strictEqual(backupSets(repo).length, 1);
  fs.writeFileSync(path.join(repo, 'b.txt'), 'dos\n');
  git(['add', 'b.txt'], repo);
  git(['commit', '-q', '-m', 'segundo'], repo);
  const third = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:10Z'), outside: false });
  assert.strictEqual(third.count, 1);
  assert.strictEqual(backupSets(repo).length, 2);
});

test('backupRefs with outside still mirrors to the shadow when the repo set is reused', () => {
  const repo = makeRepo();
  const env = { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  const { seedShadow } = require('../plugins/pignolo/lib/git-backup');
  seedShadow({ cwd: repo, env, sessionId: 's1', timeoutMs: T });
  const first = backupRefs({ cwd: repo, env, now: new Date('2026-09-26T10:00:00Z'), timeoutMs: T });
  assert.ok(first.shadow);
  const second = backupRefs({ cwd: repo, env, now: new Date('2026-09-26T10:00:05Z'), timeoutMs: T });
  assert.strictEqual(second.reused, first.base);
  assert.ok(second.shadow && second.shadow.count >= 1, 'mirror ran');
});

test('backupRefs treats an already existing ref with the same sha as success', () => {
  const repo = makeRepo();
  const now = new Date('2026-09-26T10:00:00Z');
  const sha = git(['rev-parse', 'HEAD'], repo);
  const { stamp } = require('../plugins/pignolo/lib/shadow');
  git(['update-ref', `refs/pignolo/backup/${stamp(now)}/heads/main`, sha], repo);
  // Un juego posterior con otro contenido: el último no coincide, así que no se
  // deduplica y el create choca de verdad con la ref que ya existe (camino del catch).
  git(['update-ref', `refs/pignolo/backup/${stamp(new Date(now.getTime() + 1000))}/heads/otra`, sha], repo);
  const r = backupRefs({ cwd: repo, now, outside: false });
  assert.deepStrictEqual({ base: r.base, count: r.count }, { base: `refs/pignolo/backup/${stamp(now)}`, count: 1 });
});

// Hallazgo I1: con muchos juegos, listar todos para hallar el último pasaba el buffer
// de 1 MB (ENOBUFS) y desde ahí ningún despacho se respaldaba.
test('backupRefs keeps working with many previous sets', () => {
  const repo = makeRepo();
  const sha = git(['rev-parse', 'HEAD'], repo);
  const { stamp } = require('../plugins/pignolo/lib/shadow');
  const lines = ['# pack-refs with: peeled fully-peeled'];
  for (let s = 0; s < 100; s += 1) {
    const base = `refs/pignolo/backup/${stamp(new Date(Date.UTC(2026, 8, 1, 0, 0, s)))}`;
    for (let b = 0; b < 250; b += 1) lines.push(`${sha} ${base}/heads/rama-con-nombre-largo-${String(b).padStart(4, '0')}`);
  }
  fs.writeFileSync(path.join(repo, '.git', 'packed-refs'), lines.join('\n') + '\n');
  const r = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:00Z'), outside: false });
  assert.strictEqual(r.count, 1);
  const again = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:05Z'), outside: false });
  assert.strictEqual(again.reused, r.base);
});

// Hallazgo C1: el plazo cubre también las llamadas dentro del repo, y tags: false
// respalda solo las ramas (el hook de Agent; los tags quedan para SessionStart).
test('backupRefs honors its deadline in the repo and tags: false backs up only branches', () => {
  const repo = makeRepo();
  git(['tag', 'v1'], repo);
  assert.throws(() => backupRefs({ cwd: repo, timeoutMs: 0, outside: false }), /plazo/);
  assert.deepStrictEqual(backupSets(repo), []);
  const r = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:00Z'), timeoutMs: T, outside: false, tags: false });
  assert.strictEqual(r.count, 1);
  assert.deepStrictEqual(git(['for-each-ref', '--format=%(refname)', r.base], repo).split('\n'),[`${r.base}/heads/main`]);
  // con las mismas ramas, el hook reusa el juego aunque SessionStart haya copiado tags
  const full = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:05Z'), outside: false });
  assert.strictEqual(full.count, 2);
  const hook = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:10Z'), outside: false, tags: false });
  assert.strictEqual(hook.reused, full.base);
});
