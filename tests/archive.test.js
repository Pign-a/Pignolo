'use strict';
// lib/archive.js: elegibilidad, movimiento (git mv o rename) y operación de git en curso (F8).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const A = require(path.join(PLUGIN_ROOT, 'lib', 'archive.js'));
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const day = (d) => new Date(NOW - d * DAY).toISOString().slice(0, 10);
const id = (d, slug) => `${day(d)}-${slug}`;
function put(main, kind, d, slug, status) {
  const r = store.writeEntry({ main, kind, id: id(d, slug), fields: { status, created: day(d) }, body: `# ${slug}\n\nx\n` });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return r.file;
}
const where = (main, kind, d, slug) => fs.existsSync(path.join(store.stateDir(main, kind), `${id(d, slug)}.md`));

test('archive moves only a closed work entry older than 14 days; open, recent, rejected and accepted stay (and dry-run moves nothing)', () => {
  const main = makeTempDir('pignolo-arch-');
  put(main, 'work', 20, 'old-closed', 'closed');
  put(main, 'work', 3, 'recent-closed', 'closed');
  put(main, 'work', 40, 'old-open', 'open');
  put(main, 'learnings/rejected', 60, 'rej', 'rejected');
  put(main, 'learnings/accepted', 60, 'acc', 'accepted');
  const dry = A.archiveEntries({ main, days: 14, now: NOW, dryRun: true });
  assert.deepStrictEqual(dry.moved.map((m) => m.id), [id(20, 'old-closed')]);
  assert.ok(where(main, 'work', 20, 'old-closed') && !where(main, 'archive', 20, 'old-closed'), 'dry-run no mueve');
  const r = A.archiveEntries({ main, days: 14, now: NOW });
  assert.deepStrictEqual(r.moved.map((m) => [m.id, m.how]), [[id(20, 'old-closed'), 'rename']]);
  assert.deepStrictEqual(r.refused, []);
  assert.ok(where(main, 'archive', 20, 'old-closed') && !where(main, 'work', 20, 'old-closed'));
  assert.ok(where(main, 'work', 3, 'recent-closed'));
  assert.ok(where(main, 'work', 40, 'old-open'));
  assert.ok(where(main, 'learnings/rejected', 60, 'rej'));
  assert.ok(where(main, 'learnings/accepted', 60, 'acc'));
  const arch = store.readEntries({ main, kind: 'archive' });
  assert.strictEqual(arch.entries.length, 1);
  assert.strictEqual(arch.entries[0].status, 'closed');
  assert.ok(!fs.readdirSync(store.stateDir(main, 'archive')).some((n) => !n.endsWith('.md')), 'destino plano, sin subcarpetas');
});

test('decided decisions and closed issues are eligible; a duplicate destination and an unreadable entry go to refused and the rest moves', () => {
  const main = makeTempDir('pignolo-arch-');
  put(main, 'decisions', 30, 'd', 'decided');
  put(main, 'issues', 30, 'i', 'closed');
  put(main, 'archive', 30, 'd', 'decided');
  fs.mkdirSync(store.stateDir(main, 'work'), { recursive: true });
  fs.writeFileSync(path.join(store.stateDir(main, 'work'), `${id(30, 'broken')}.md`), '---\nid: x');
  const r = A.archiveEntries({ main, days: 14, now: NOW });
  assert.deepStrictEqual(r.moved.map((m) => m.id), [id(30, 'i')]);
  assert.deepStrictEqual(r.refused.map((x) => [x.id, x.reason]).sort(), [[id(30, 'broken'), 'unreadable'], [id(30, 'd'), 'exists']]);
  assert.ok(where(main, 'decisions', 30, 'd'), 'el original no se pierde');
});

test('a versioned entry moves with git mv (R in status); an uncommitted one with rename; no git at all with rename', () => {
  const repo = makeRepo();
  put(repo, 'work', 20, 'tracked', 'closed');
  git(['add', '.pignolo'], repo);
  git(['commit', '-q', '-m', 'estado'], repo);
  put(repo, 'work', 20, 'fresh', 'closed');
  const r = A.archiveEntries({ main: repo, days: 14, now: NOW });
  const how = Object.fromEntries(r.moved.map((m) => [m.id, m.how]));
  assert.strictEqual(how[id(20, 'tracked')], 'git-mv');
  assert.strictEqual(how[id(20, 'fresh')], 'rename');
  const status = git(['status', '--porcelain'], repo);
  assert.match(status, new RegExp(`^R\\s+\\.pignolo/state/work/${id(20, 'tracked')}\\.md -> \\.pignolo/state/archive/`, 'm'));
  assert.ok(!status.split('\n').some((l) => /^[RDAM]/.test(l) && l.includes(id(20, 'fresh'))), 'la no versionada no toca el índice de git (queda como ?? en su destino)');
  const plain = makeTempDir('pignolo-arch-');
  put(plain, 'work', 20, 'nogit', 'closed');
  assert.strictEqual(A.archiveEntries({ main: plain, days: 14, now: NOW }).moved[0].how, 'rename');
});

test('gitOperationInProgress sees a real merge, cherry-pick and stopped rebase in the main checkout, and nothing otherwise', () => {
  const repo = makeRepo();
  assert.strictEqual(A.gitOperationInProgress(repo), null);
  assert.strictEqual(A.gitOperationInProgress(makeTempDir('pignolo-nogit-')), null);
  const conflict = (branch) => {
    git(['checkout', '-q', '-b', branch], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), `${branch}\n`);
    git(['commit', '-q', '-am', branch], repo);
    git(['checkout', '-q', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), `main-${branch}\n`);
    git(['commit', '-q', '-am', `main ${branch}`], repo);
  };
  conflict('m');
  assert.throws(() => git(['merge', '--no-commit', 'm'], repo));
  assert.strictEqual(A.gitOperationInProgress(repo), 'merge');
  git(['merge', '--abort'], repo);
  assert.strictEqual(A.gitOperationInProgress(repo), null);
  assert.throws(() => git(['cherry-pick', 'm'], repo));
  assert.strictEqual(A.gitOperationInProgress(repo), 'cherry-pick');
  git(['cherry-pick', '--abort'], repo);
  assert.throws(() => git(['rebase', 'm'], repo));
  assert.strictEqual(A.gitOperationInProgress(repo), 'rebase');
  git(['rebase', '--abort'], repo);
  assert.strictEqual(A.gitOperationInProgress(repo), null);
});

test('declared limit: a merge in another linked worktree is not seen from the main checkout', () => {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'side', wt], repo);
  git(['checkout', '-q', '-b', 'other'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'other\n');
  git(['commit', '-q', '-am', 'other'], repo);
  git(['checkout', '-q', 'main'], repo);
  fs.writeFileSync(path.join(wt, 'a.txt'), 'side\n');
  git(['commit', '-q', '-am', 'side'], wt);
  assert.throws(() => git(['merge', '--no-commit', 'other'], wt));
  assert.strictEqual(A.gitOperationInProgress(wt), 'merge');
  assert.strictEqual(A.gitOperationInProgress(repo), null);
});
