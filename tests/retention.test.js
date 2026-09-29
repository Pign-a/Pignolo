'use strict';
// Retención (spec §11.6): una sola regla de 14 días para las instantáneas de la
// sombra y refs/pignolo/wip/*; siempre se conserva la última instantánea de cada
// una de las 3 sesiones previas; las wip del repo se importan antes de podarlas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, runLauncher } = require('./helpers');
const { snapshotWip, seedShadow } = require('../plugins/pignolo/lib/git-backup');
const shadow = require('../plugins/pignolo/lib/shadow');
const { withDeadline } = require('../plugins/pignolo/lib/git');

// Los tests que no prueban el plazo le dan a la instantánea uno holgado: el de 2 s
// es el que usa el hook de la guardia y, con la suite corriendo en paralelo, una
// máquina cargada lo vence de a ratos.
const T = 60000;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (d) => new Date(NOW - d * DAY);
const envWith = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') });
const shadowDir = (env, repo) => path.join(env.PIGNOLO_HOME, 'shadow', `${shadow.repoIdForGitDir(path.join(repo, '.git'))}.git`);

function write(repo, content) {
  fs.writeFileSync(path.join(repo, 'a.txt'), `${content}\n`);
}

// Contenido de a.txt de cada instantánea que queda, ordenado.
function remaining(gitArgs, repo) {
  const refs = git([...gitArgs, 'for-each-ref', '--format=%(refname)', 'refs/pignolo/wip/'], repo).split('\n').filter(Boolean);
  return refs.map((r) => git([...gitArgs, 'show', `${r}:a.txt`], repo)).sort();
}

test('shadow: >14 days is pruned except the last snapshot of each of the 3 previous sessions', () => {
  const repo = makeRepo();
  const env = envWith();
  const seed = (s, d, c) => { write(repo, c); seedShadow({ cwd: repo, env, sessionId: s, now: ago(d) }); };
  const snap = (s, d, c) => { write(repo, c); snapshotWip({ cwd: repo, env, sessionId: s, now: ago(d), timeoutMs: T }); };
  seed('A', 30, 'a1'); snap('A', 29, 'a2');
  seed('B', 25, 'b1');
  seed('C', 21, 'c1'); snap('C', 20, 'c2');
  seed('D', 18, 'd1');
  seed('E', 5, 'e1'); snap('E', 4, 'e2');
  seed('ACTUAL', 0, 'actual');
  assert.deepStrictEqual(remaining(['--git-dir', shadowDir(env, repo)], repo), ['actual', 'c2', 'd1', 'e1', 'e2']);
});

test('shadow: nothing younger than 14 days is pruned, however many sessions', () => {
  const repo = makeRepo();
  const env = envWith();
  const want = [];
  for (let d = 10; d >= 1; d -= 1) {
    write(repo, `s${d}`);
    seedShadow({ cwd: repo, env, sessionId: `S${d}`, now: ago(d) });
    want.push(`s${d}`);
  }
  assert.deepStrictEqual(remaining(['--git-dir', shadowDir(env, repo)], repo), want.sort());
});

test('in-repo wip refs are imported into the shadow and pruned by the same rule', () => {
  const repo = makeRepo();
  const env = envWith();
  const fallback = (s, d, c) => { write(repo, c); assert.strictEqual(snapshotWip({ cwd: repo, env, sessionId: s, now: ago(d), timeoutMs: T }).store, 'repo'); };
  fallback('P', 30, 'p'); fallback('Q', 25, 'q'); fallback('R', 22, 'r'); fallback('S', 20, 's'); fallback('T', 1, 't');
  write(repo, 'actual');
  seedShadow({ cwd: repo, env, sessionId: 'ACTUAL', now: new Date(NOW) });
  assert.deepStrictEqual(remaining([], repo), ['r', 's', 't']);
  assert.deepStrictEqual(remaining(['--git-dir', shadowDir(env, repo)], repo), ['actual', 'r', 's', 't']);
});

test('an in-repo wip ref that the shadow does not have is never pruned (no single copy is deleted)', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: 'ACTUAL', now: new Date(NOW) });
  for (const [s, d] of [['W1', 30], ['W2', 29], ['W3', 28], ['W4', 27]]) {
    write(repo, s);
    snapshotWip({ cwd: repo, env, sessionId: s, now: ago(d), timeoutMs: T }); // otra sesión sin sembrar → en el repo
  }
  const run = withDeadline(repo, 60000);
  const info = shadow.repoInfo(run);
  const key = shadow.sessionKey('ACTUAL', info.top);
  const r = shadow.prune({ run, p: shadow.shadowPaths(env, info, key), key, now: new Date(NOW) });
  assert.strictEqual(r.repoWip, 0);
  assert.deepStrictEqual(remaining([], repo), ['W1', 'W2', 'W3', 'W4']);
});

test('ref sets in the shadow: >14 days pruned except the 3 previous sets', () => {
  const repo = makeRepo();
  const env = envWith();
  for (const d of [40, 30, 20, 16, 3, 0]) {
    git(['branch', `rama-${d}`], repo); // cambia las refs: juego nuevo
    seedShadow({ cwd: repo, env, sessionId: `S${d}`, now: ago(d) });
  }
  const sets = [...new Set(git(['--git-dir', shadowDir(env, repo), 'for-each-ref', '--format=%(refname)', 'refs/pignolo/refs/'], repo)
    .split('\n').map((r) => r.split('/')[3]))].sort();
  assert.deepStrictEqual(sets, [ago(20), ago(16), ago(3), ago(0)].map(shadow.stamp));
});

test('stale session indexes and orphaned temporaries are removed; the current index stays', () => {
  const repo = makeRepo();
  const env = envWith();
  seedShadow({ cwd: repo, env, sessionId: 'VIEJA', now: ago(20) });
  const own = path.join(shadowDir(env, repo), 'pignolo');
  const old = fs.readdirSync(own).find((f) => f.startsWith('index-'));
  const past = (NOW - 20 * DAY) / 1000;
  fs.utimesSync(path.join(own, old), past, past);
  fs.writeFileSync(path.join(own, 'index-abc123.tmp-999'), '');
  fs.utimesSync(path.join(own, 'index-abc123.tmp-999'), past, past);
  seedShadow({ cwd: repo, env, sessionId: 'ACTUAL', now: new Date(NOW) });
  const left = fs.readdirSync(own).filter((f) => f.startsWith('index-'));
  assert.deepStrictEqual(left, [`index-${shadow.sessionKey('ACTUAL', repo)}`]);
});

test('a shadow over the size limit is reported at SessionStart with the heaviest files', () => {
  const repo = makeRepo();
  const env = envWith();
  fs.writeFileSync(path.join(repo, 'pesado.bin'), Buffer.alloc(2 * 1024 * 1024, 7));
  const r = seedShadow({ cwd: repo, env, sessionId: 'S', sizeLimit: 1024 });
  assert.match(r.warnings[0], /ocupa .*candidatos a \.gitignore\): pesado\.bin \(2\.0 MB\)/);
  const ss = runLauncher('session-start', { source: 'resume', cwd: repo, session_id: 'S' }, { PIGNOLO_HOME: env.PIGNOLO_HOME });
  assert.match(JSON.parse(ss.stdout).systemMessage, /⚠ pignolo: el repo sombra de este repo ocupa/);
});

test('under the limit there is no size warning', () => {
  const repo = makeRepo();
  assert.deepStrictEqual(seedShadow({ cwd: repo, env: envWith(), sessionId: 'S' }).warnings, []);
});

// Decisión técnica 2026-09-28: refs/pignolo/backup/* (dentro del repo) siguen la misma
// regla que los demás respaldos. Cada juego (un arranque) es su propia unidad.
const { backupRefs } = require('../plugins/pignolo/lib/git-backup');
const backupSets = (repo) => [...new Set(git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/backup/'], repo)
  .split('\n').filter(Boolean).map((r) => r.split('/')[3]))].sort();

// Protects: retención de refs/pignolo/backup/* · Breaks if: se acumulan sin poda, o se poda
// lo reciente o los 3 juegos previos.
test('in-repo ref backups: >14 days pruned except the 3 previous sets', () => {
  const repo = makeRepo();
  const env = envWith();
  for (const d of [40, 30, 20, 16, 3, 0]) {
    git(['branch', `rama-${d}`], repo);
    backupRefs({ cwd: repo, env, now: ago(d), outside: false });
    seedShadow({ cwd: repo, env, sessionId: `S${d}`, now: ago(d) });
  }
  assert.deepStrictEqual(backupSets(repo), [ago(20), ago(16), ago(3), ago(0)].map(shadow.stamp));
});

// Protects: nunca borrar la única copia · Breaks if: se borra un respaldo de refs cuyo
// commit la sombra no tiene (rama borrada antes de que la sombra la viera).
test('an expired in-repo ref backup whose commit the shadow does not keep is not pruned', () => {
  const repo = makeRepo();
  const env = envWith();
  git(['checkout', '-q', '-b', 'efimera'], repo);
  write(repo, 'solo acá');
  git(['commit', '-q', '-am', 'efímero'], repo);
  const lost = git(['rev-parse', 'HEAD'], repo);
  git(['checkout', '-q', 'main'], repo);
  backupRefs({ cwd: repo, env, now: ago(30), outside: false });
  git(['branch', '-q', '-D', 'efimera'], repo);
  for (const d of [20, 16, 3, 0]) {
    git(['branch', `rama-${d}`], repo);
    backupRefs({ cwd: repo, env, now: ago(d), outside: false });
    seedShadow({ cwd: repo, env, sessionId: `S${d}`, now: ago(d) });
  }
  const old = `refs/pignolo/backup/${shadow.stamp(ago(30))}`;
  assert.strictEqual(git(['for-each-ref', '--format=%(objectname) %(refname)', old], repo), `${lost} ${old}/heads/efimera`);
});

// Protects: nunca la única copia, también cuando la copia de la sombra vence en la
// misma poda · Breaks if: el repo decide contra la sombra de antes de podarla.
test('an in-repo ref backup whose only shadow copy expires in the same run is kept', () => {
  const repo = makeRepo();
  const env = envWith();
  git(['checkout', '-q', '-b', 'efimera'], repo);
  write(repo, 'solo acá');
  git(['commit', '-q', '-am', 'efímero'], repo);
  const lost = git(['rev-parse', 'HEAD'], repo);
  git(['checkout', '-q', 'main'], repo);
  backupRefs({ cwd: repo, env, now: ago(30), outside: false });
  seedShadow({ cwd: repo, env, sessionId: 'S30', now: ago(30) }); // la sombra la ve una sola vez
  git(['branch', '-q', '-D', 'efimera'], repo);
  for (const d of [20, 16, 3, 0]) {
    git(['branch', `rama-${d}`], repo);
    backupRefs({ cwd: repo, env, now: ago(d), outside: false });
    seedShadow({ cwd: repo, env, sessionId: `S${d}`, now: ago(d) });
  }
  const old = `refs/pignolo/backup/${shadow.stamp(ago(30))}`;
  assert.strictEqual(git(['for-each-ref', '--format=%(objectname) %(refname)', old], repo), `${lost} ${old}/heads/efimera`);
});
