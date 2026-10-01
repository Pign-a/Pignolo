'use strict';
// Cierre de la sesión en la sombra (spec §11.6, R-6 del hito 6): gc con heurística, poda con la
// clave de sesión resuelta, un solo lock, sin plazo para el gc, sesiones vivas (F16).
// Todo con PIGNOLO_HOME temporal (helpers.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { snapshotWip, seedShadow, closeShadow, backupRefs } = require('../plugins/pignolo/lib/git-backup');
const shadow = require('../plugins/pignolo/lib/shadow');
const { withDeadline, gitRun } = require('../plugins/pignolo/lib/git');

const T = 60000;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms);
const envWith = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') });
const shadowDir = (env, repo) => path.join(env.PIGNOLO_HOME, 'shadow', `${shadow.repoIdForGitDir(path.join(repo, '.git'))}.git`);
const sg = (dir, args) => git(['--git-dir', dir, ...args], process.cwd());
const refsOf = (dir) => sg(dir, ['for-each-ref', '--format=%(objectname) %(refname)', 'refs/pignolo/']).split('\n').filter(Boolean).sort();
const write = (repo, c) => fs.writeFileSync(path.join(repo, 'a.txt'), `${c}\n`);
const wipRefs = (dir) => sg(dir, ['for-each-ref', '--format=%(refname)', 'refs/pignolo/wip/']).split('\n').filter(Boolean);
const contents = (dir) => wipRefs(dir).map((r) => sg(dir, ['show', `${r}:a.txt`])).sort();

function seeded(sessionId = 's', snaps = 3) {
  const repo = makeRepo();
  const env = envWith();
  write(repo, 'base');
  seedShadow({ cwd: repo, env, sessionId, now: new Date(NOW) });
  for (let i = 0; i < snaps; i += 1) {
    write(repo, `cambio ${i}`);
    snapshotWip({ cwd: repo, env, sessionId, now: new Date(NOW + i + 1), timeoutMs: T });
  }
  const dir = shadowDir(env, repo);
  const info = { top: repo, commonDir: path.join(repo, '.git'), id: shadow.repoIdForGitDir(path.join(repo, '.git')) };
  const key = shadow.sessionKey(sessionId, repo);
  const p = shadow.shadowPaths(env, info, key);
  return { repo, env, dir, info, key, p };
}
const runFor = (repo) => withDeadline(repo, T);
const gcFor = (repo) => (args, opts = {}) => gitRun(args, repo, { ...opts, timeout: 0 });

test('needsGc: table', () => {
  const h = 60 * 60 * 1000;
  assert.deepStrictEqual(shadow.needsGc({ loose: 2001, lastGcAt: new Date(NOW - h).toISOString(), now: NOW }), { run: true, reason: 'loose' });
  assert.deepStrictEqual(shadow.needsGc({ loose: 2000, lastGcAt: new Date(NOW - 25 * h).toISOString(), now: NOW }), { run: true, reason: 'age' });
  assert.deepStrictEqual(shadow.needsGc({ loose: 10, lastGcAt: new Date(NOW - h).toISOString(), now: NOW }), { run: false, reason: 'none' });
  assert.deepStrictEqual(shadow.needsGc({ loose: 10, now: NOW }), { run: true, reason: 'age' });
  assert.deepStrictEqual(shadow.needsGc({ loose: 6, lastGcAt: new Date(NOW - h).toISOString(), now: NOW, looseLimit: 5 }), { run: true, reason: 'loose' });
});

test('session key (F1): CLAUDE_CODE_SESSION_ID resolves the session and the gc runs; without any key it refuses and touches nothing', () => {
  const { repo, env, dir } = seeded('s');
  const before = refsOf(dir);
  const r = closeShadow({ cwd: repo, env: { ...env, CLAUDE_CODE_SESSION_ID: 's' }, now: new Date(NOW + 10) });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.gc.ran, true, JSON.stringify(r.gc));
  assert.deepStrictEqual(refsOf(dir), before);
  const { repo: repo2, env: env2, dir: dir2 } = seeded('s');
  const before2 = [refsOf(dir2), fs.readdirSync(path.join(dir2, 'pignolo')).sort()];
  const no = closeShadow({ cwd: repo2, env: { ...env2, CLAUDE_CODE_SESSION_ID: '' }, now: new Date(NOW + 10) });
  assert.deepStrictEqual([no.ok, no.refused, no.pruned, no.gc], [false, 'no-session', null, null]);
  assert.deepStrictEqual([refsOf(dir2), fs.readdirSync(path.join(dir2, 'pignolo')).sort()], before2);
  assert.ok(!fs.existsSync(path.join(dir2, 'pignolo', 'last-gc')));
  assert.strictEqual(closeShadow({ cwd: makeTempDir('pignolo-norepo-'), env, sessionId: 's' }), null);
});

test('gcShadow packs the loose objects and keeps every refs/pignolo/* with the same sha; another live session makes it fall back', () => {
  const { repo, env, dir, key, p } = seeded('s', 4);
  const before = refsOf(dir);
  assert.ok(before.length >= 5, before.join('\n'));
  const r = shadow.gcShadow({ run: runFor(repo), runGc: gcFor(repo), p, key, now: new Date(NOW + 10), looseLimit: 5 });
  assert.strictEqual(r.ran, true, JSON.stringify(r));
  assert.ok(r.looseBefore > 5 && r.looseAfter < r.looseBefore, JSON.stringify(r));
  assert.deepStrictEqual(refsOf(dir), before);
  assert.match(fs.readFileSync(path.join(p.own, 'last-gc'), 'utf8'), /^\d{4}-\d{2}-\d{2}T/);
  const none = shadow.gcShadow({ run: runFor(repo), runGc: gcFor(repo), p, key, now: new Date(NOW + 20), looseLimit: 5 });
  assert.deepStrictEqual([none.ran, none.reason], [false, 'none']);

  const other = seeded('s', 4);
  const otherIdx = path.join(other.p.own, 'index-abc123');
  fs.writeFileSync(otherIdx, '');
  fs.utimesSync(otherIdx, new Date(NOW - 60000), new Date(NOW - 60000));
  const spy = [];
  const run2 = runFor(other.repo);
  const spied = (args, opts) => { spy.push(args); return run2(args, opts); };
  const b2 = refsOf(other.dir);
  const r2 = shadow.gcShadow({ run: spied, runGc: gcFor(other.repo), p: other.p, key: other.key, now: new Date(NOW + 10), looseLimit: 5 });
  assert.deepStrictEqual([r2.ran, r2.reason], [false, 'other-session-active']);
  assert.ok(spy.some((a) => a.includes('--auto')), 'cae a gc --auto');
  assert.deepStrictEqual(refsOf(other.dir), b2);
});

test('closeSession with the lock held by another process does nothing and reports busy', () => {
  const { repo, env, info, key, p, dir } = seeded('s');
  fs.mkdirSync(p.lock, { recursive: true });
  const before = refsOf(dir);
  const spy = [];
  const run = runFor(repo);
  const r = shadow.closeSession({ run: (a, o) => { spy.push(a); return run(a, o); }, runGc: gcFor(repo), env, info, key, now: new Date(NOW + 10) });
  assert.deepStrictEqual(r, { pruned: null, gc: { ran: false, reason: 'busy' } });
  assert.deepStrictEqual(spy, []);
  assert.deepStrictEqual(refsOf(dir), before);
  assert.ok(fs.existsSync(p.lock), 'el lock ajeno no se toca');
});

test('no collision with a background gc (F2): closeSession emits no gc --auto before the full gc and every gc has autoDetach=false', () => {
  const { repo, env, info, key } = seeded('s');
  const calls = [];
  const run = runFor(repo);
  const spyRun = (a, o) => { calls.push({ args: a, opts: o || {} }); return run(a, o); };
  const spyGc = (a, o) => { calls.push({ args: a, opts: o || {}, gc: true }); return gcFor(repo)(a, o); };
  const r = shadow.closeSession({ run: spyRun, runGc: spyGc, env, info, key, now: new Date(NOW + 10) });
  assert.strictEqual(r.gc.ran, true, JSON.stringify(r));
  assert.ok(r.pruned && typeof r.pruned.shadowWip === 'number');
  const gcs = calls.filter((c) => c.args.includes('gc'));
  assert.strictEqual(gcs.length, 1, JSON.stringify(gcs.map((c) => c.args)));
  assert.ok(!gcs[0].args.includes('--auto'));
  for (const c of gcs) assert.ok(c.args.includes('gc.autoDetach=false'), c.args.join(' '));
});

test('short prune by object age (F3, C4): a dangling object older than a day goes; a recent one and a reachable old one stay', () => {
  const { repo, env, dir, key, p } = seeded('s', 1);
  const G = ['--git-dir', dir];
  const dangling = (content) => {
    const blob = gitRun([...G, 'hash-object', '-w', '--stdin'], repo, { input: content });
    const tree = gitRun([...G, 'mktree'], repo, { input: `100644 blob ${blob}\tx.txt\n` });
    const commit = gitRun([...G, 'commit-tree', tree, '-m', 'colgado'], repo, { env: { ...process.env, ...shadow.IDENTITY } });
    return { blob, tree, commit };
  };
  const objFile = (sha) => path.join(dir, 'objects', sha.slice(0, 2), sha.slice(2));
  const age = (sha, ms) => { assert.ok(fs.existsSync(objFile(sha)), `suelto ${sha}`); fs.utimesSync(objFile(sha), new Date(NOW - ms), new Date(NOW - ms)); };
  const old = dangling('viejo sin ref\n');
  for (const s of Object.values(old)) age(s, 2 * DAY);
  const fresh = dangling('reciente sin ref\n');
  for (const s of Object.values(fresh)) age(s, 5 * 60 * 1000);
  const kept = dangling('alcanzable viejo\n');
  for (const s of Object.values(kept)) age(s, 2 * DAY);
  sg(dir, ['update-ref', `refs/pignolo/wip/${key}/2000-01-01T00-00-00-000Z-1`, kept.commit]);
  const r = shadow.gcShadow({ run: runFor(repo), runGc: gcFor(repo), p, key, now: new Date(NOW), looseLimit: 1 });
  assert.strictEqual(r.ran, true, JSON.stringify(r));
  assert.throws(() => sg(dir, ['cat-file', '-e', old.commit]), 'el colgado viejo se fue');
  sg(dir, ['cat-file', '-e', fresh.commit]);
  sg(dir, ['cat-file', '-e', kept.commit]);
  sg(dir, ['cat-file', '-e', kept.blob]);
});

test('deadline and lock (F5, C5): the gc runs without a deadline and the lock mtime is in the future meanwhile', () => {
  const { repo, env, info, key, p } = seeded('s');
  let seen = null;
  const spyGc = (a, o) => {
    seen = { opts: o, lockMtime: fs.statSync(p.lock).mtimeMs };
    return gcFor(repo)(a, o);
  };
  const r = shadow.closeSession({ run: runFor(repo), runGc: spyGc, env, info, key, now: new Date(NOW) });
  assert.strictEqual(r.gc.ran, true, JSON.stringify(r));
  assert.strictEqual(seen.opts.timeout, 0);
  assert.ok(seen.lockMtime > NOW + 60 * 60 * 1000, `lock mtime ${seen.lockMtime} vs now ${NOW}`);
  assert.ok(!fs.existsSync(p.lock), 'el lock se suelta al terminar');
});

test('closeSession: a failing gc does not stop the prune; the error is in the result and in backup-failures.log; an unseeded shadow is not created', () => {
  const { repo, env, info, key } = seeded('s');
  const r = shadow.closeSession({ run: runFor(repo), runGc: () => { throw new Error('gc roto a propósito'); }, env, info, key, now: new Date(NOW) });
  assert.ok(r.pruned && typeof r.pruned.shadowWip === 'number', JSON.stringify(r));
  assert.deepStrictEqual([r.gc.ran, r.gc.reason], [false, 'error']);
  assert.match(r.gc.error, /gc roto/);
  const log = fs.readFileSync(path.join(env.PIGNOLO_HOME, 'logs', 'backup-failures.log'), 'utf8');
  assert.match(log, /"what":"gc".*gc roto/);
  const plain = makeRepo();
  const env2 = envWith();
  const r2 = closeShadow({ cwd: plain, env: env2, sessionId: 'nueva', now: new Date(NOW) });
  assert.deepStrictEqual([r2.ok, r2.pruned, r2.gc], [true, null, null]);
  assert.ok(!fs.existsSync(shadowDir(env2, plain)), 'no siembra');
});

test('retention at close: current + 3 previous sessions kept, older ones pruned, a backup ref the shadow lacks is never deleted; a live session keeps its ref (F16)', () => {
  const repo = makeRepo();
  const env = envWith();
  const seed = (s, days, c) => { write(repo, c); seedShadow({ cwd: repo, env, sessionId: s, now: ago(days * DAY) }); };
  // Respaldo de refs dentro del repo con un commit que la sombra nunca ve.
  git(['checkout', '-q', '-b', 'efimera'], repo);
  write(repo, 'solo acá');
  git(['commit', '-q', '-am', 'efímero'], repo);
  const lost = git(['rev-parse', 'HEAD'], repo);
  git(['checkout', '-q', 'main'], repo);
  backupRefs({ cwd: repo, env, now: ago(30 * DAY), outside: false });
  git(['branch', '-q', '-D', 'efimera'], repo);
  seed('S1', 16, 's1'); seed('S2', 15, 's2'); seed('S3', 10, 's3'); seed('S4', 9, 's4'); seed('S5', 8, 's5');
  const dir = shadowDir(env, repo);
  assert.deepStrictEqual(contents(dir), ['s1', 's2', 's3', 's4', 's5'], 'nada se podó todavía (la última de cada sesión)');
  // S1 sigue viva: su índice se tocó hoy aunque su única ref tenga 16 días. S2 no.
  const idx1 = path.join(dir, 'pignolo', `index-${shadow.sessionKey('S1', repo)}`);
  fs.utimesSync(idx1, new Date(NOW), new Date(NOW));
  write(repo, 'actual');
  seedShadow({ cwd: repo, env, sessionId: 'ACTUAL', now: new Date(NOW) });
  const r = closeShadow({ cwd: repo, env, sessionId: 'ACTUAL', now: new Date(NOW) });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.deepStrictEqual(contents(dir), ['actual', 's1', 's3', 's4', 's5']);
  const old = `refs/pignolo/backup/${shadow.stamp(ago(30 * DAY))}`;
  assert.ok(git(['for-each-ref', '--format=%(objectname) %(refname)', old], repo).includes(`${lost} ${old}/heads/efimera`), 'la única copia sigue en el repo');
});
