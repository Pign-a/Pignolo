// Apply without breaking (lib/batch-files.mjs, spec §9), in process, in temporary git repos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree } from './helpers.mjs';
import { saveBatch, verifyBatch, restoreBatch, parsePorcelainZ, cleanRel, BatchError } from '../lib/batch-files.mjs';

function repo(extra = {}) {
  const dir = writeTree(makeTempDir(), { 'src/page.tsx': 'a\nb\n', 'src/other.tsx': 'o\n', '.pignolo-ui/.gitignore': '*\n', ...extra });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const write = (dir, rel, text) => writeTree(dir, { [rel]: text });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const batchOf = (dir) => path.join(dir, '.pignolo-ui', 'runs', 'r1', 'batch-1');
const PAGE = { path: 'src/page.tsx', exists: true, change: 'structure' };
const NEW = { path: 'src/New.tsx', exists: false, change: 'structure' };

test('parsePorcelainZ keeps spaces, accents and renames', () => {
  const out = ' M a b.txt\0R  new name.txt\0old.txt\0?? dir/ñ.txt\0';
  assert.deepEqual(parsePorcelainZ(out), [
    { code: ' M', path: 'a b.txt' }, { code: 'R ', path: 'new name.txt', from: 'old.txt' }, { code: '??', path: 'dir/ñ.txt' },
  ]);
});

test('cleanRel refuses paths outside the project and reserved folders', () => {
  assert.equal(cleanRel('src\\a.tsx'), 'src/a.tsx');
  assert.equal(cleanRel('./src/../src/a.tsx'), 'src/a.tsx');
  for (const bad of ['../x', '/etc/x', 'C:/x', '.git/config', '.pignolo-ui/runs/x', '', '.']) assert.equal(cleanRel(bad), null, bad);
});

test('§16.1: a dirty tree with changes outside the list is not reverted', () => {
  const dir = repo();
  write(dir, 'src/other.tsx', 'user wip\n');
  write(dir, 'notes.txt', 'mine\n');
  const s = saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE, NEW] });
  assert.equal(s.ok, true, JSON.stringify(s.problems));
  write(dir, 'src/page.tsx', 'a\nb\nc\n');
  write(dir, 'src/New.tsx', 'n\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, true, JSON.stringify(v.unexpected));
  assert.deepEqual(v.files.map((f) => [f.path, f.existed, f.changed]), [['src/page.tsx', true, true], ['src/New.tsx', false, true]]);
  assert.equal(v.lines, 2); // +1 in page.tsx, 1 line in New.tsx
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual([r.ok, r.restored, r.deleted, r.blocked], [true, ['src/page.tsx'], ['src/New.tsx'], []]);
  assert.equal(read(dir, 'src/page.tsx'), 'a\nb\n');
  assert.equal(read(dir, 'src/other.tsx'), 'user wip\n'); // the user's changes stay
  assert.equal(read(dir, 'notes.txt'), 'mine\n');
});

test('§16.1: an unexpected new file is reported and removed by restore', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'z\n');
  write(dir, 'src/stray/Extra.tsx', 'x\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, false);
  assert.deepEqual(v.unexpected.map((u) => [u.path, u.code, u.wasDirty]), [['src/stray/Extra.tsx', '??', false]]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, true, JSON.stringify(r.blocked));
  assert.equal(exists(dir, 'src/stray/Extra.tsx'), false);
  assert.equal(read(dir, 'src/page.tsx'), 'a\nb\n');
});

test('§16.1: a created file edited by hand afterwards is BLOCKED and never deleted', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW] });
  write(dir, 'src/New.tsx', 'n\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  write(dir, 'src/New.tsx', 'n edited by hand\n');
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked, [{ path: 'src/New.tsx', problem: 'changed-after-the-batch' }]);
  assert.equal(read(dir, 'src/New.tsx'), 'n edited by hand\n');
});

test('unexpected changes to tracked or previously dirty files are BLOCKED, not touched', () => {
  const dir = repo();
  write(dir, 'notes.txt', 'mine\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/other.tsx', 'agent touched\n');
  write(dir, 'notes.txt', 'agent touched my wip\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(v.unexpected.map((u) => [u.path, u.wasDirty]).sort(), [['notes.txt', true], ['src/other.tsx', false]]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked.map((b) => b.path).sort(), ['notes.txt', 'src/other.tsx']);
  assert.equal(read(dir, 'src/other.tsx'), 'agent touched\n');
});

test('save refuses what §9 forbids, and writes nothing', async (t) => {
  const dir = repo();
  write(dir, 'src/page.tsx', 'dirty\n');
  const CASES = [
    ['uncommitted expected file', [PAGE], 'uncommitted-changes'],
    ['path outside', [{ path: '../x', exists: false, change: 'tokens' }], 'bad-path'],
    ['git folder', [{ path: '.git/config', exists: true, change: 'tokens' }], 'bad-path'],
    ['declared new but exists', [{ path: 'src/other.tsx', exists: false, change: 'tokens' }], 'declared-new-but-exists'],
    ['declared existing but missing', [{ path: 'src/nope.tsx', exists: true, change: 'tokens' }], 'declared-existing-but-missing'],
    ['bad change', [{ path: 'src/x.tsx', exists: false, change: 'both' }], 'bad-change'],
    ['duplicate', [NEW, { ...NEW, path: 'src/new.tsx' }], 'duplicate'],
    ['more than 5 files', Array.from({ length: 6 }, (_, i) => ({ path: `src/n${i}.tsx`, exists: false, change: 'tokens' })), 'too-many-files'],
    ['empty list', [], 'empty-list'],
  ];
  for (const [name, expected, problem] of CASES) {
    await t.test(name, () => {
      const batch = path.join(dir, '.pignolo-ui', 'runs', 'r1', name.replace(/\s+/g, '-'));
      const s = saveBatch({ project: dir, batch, expected });
      assert.equal(s.ok, false);
      assert.ok(s.problems.some((p) => p.problem === problem), JSON.stringify(s.problems));
      assert.equal(fs.existsSync(path.join(batch, 'files.json')), false);
    });
  }
});

test('a second save on the same batch is refused; restore needs verify first', () => {
  const dir = repo();
  assert.equal(saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] }).ok, true);
  const again = saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  assert.ok(again.problems.some((p) => p.problem === 'batch-exists'));
  assert.throws(() => restoreBatch({ project: dir, batch: batchOf(dir) }), BatchError);
});

test('copies are byte exact: CRLF and a BOM come back unchanged', () => {
  const original = '\uFEFFa\r\nb\r\n';
  const dir = repo({ 'src/crlf.css': original });
  saveBatch({ project: dir, batch: batchOf(dir), expected: [{ path: 'src/crlf.css', exists: true, change: 'tokens' }] });
  write(dir, 'src/crlf.css', 'changed\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(restoreBatch({ project: dir, batch: batchOf(dir) }).ok, true);
  assert.equal(read(dir, 'src/crlf.css'), original);
});

test('more than 200 changed lines is reported, not refused', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW] });
  write(dir, 'src/New.tsx', 'x\n'.repeat(201));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, true);
  assert.equal(v.overLineLimit, true);
});

test('§16.1: an expected file edited by hand after verify is BLOCKED and never overwritten', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'agent\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  write(dir, 'src/page.tsx', 'agent, then edited by hand\n');
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.blocked, [{ path: 'src/page.tsx', problem: 'changed-after-the-batch' }]);
  assert.equal(read(dir, 'src/page.tsx'), 'agent, then edited by hand\n');
});

test('restore recomputes the delta: a change that appeared after verify is BLOCKED, not touched', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'z\n');
  assert.equal(verifyBatch({ project: dir, batch: batchOf(dir) }).ok, true);
  write(dir, 'src/late.tsx', 'written after verify\n');
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.restored, ['src/page.tsx']);
  assert.deepEqual(r.blocked, [{ path: 'src/late.tsx', problem: 'not-verified' }]);
  assert.equal(read(dir, 'src/late.tsx'), 'written after verify\n');
});

// A junction needs no privilege on Windows; elsewhere it is a directory symlink.
const linkDir = (target, at) => fs.symlinkSync(target, at, 'junction');

test('save refuses a path whose folder is a link that leaves the project', () => {
  const dir = repo();
  const outside = writeTree(makeTempDir(), { 'x.tsx': 'outside\n' });
  linkDir(outside, path.join(dir, 'src', 'out'));
  for (const item of [{ path: 'src/out/x.tsx', exists: true, change: 'tokens' }, { path: 'src/out/new/y.tsx', exists: false, change: 'tokens' }]) {
    const s = saveBatch({ project: dir, batch: batchOf(dir), expected: [item] });
    assert.deepEqual(s.problems, [{ path: item.path, problem: 'not-in-project' }]);
  }
  assert.equal(fs.existsSync(path.join(batchOf(dir), 'files.json')), false);
});

test('restore never writes through a folder swapped for a link after save', () => {
  const dir = repo({ 'src/sub/page.tsx': 'p\n' });
  const outside = writeTree(makeTempDir(), { 'page.tsx': 'outside\n' });
  saveBatch({ project: dir, batch: batchOf(dir), expected: [{ path: 'src/sub/page.tsx', exists: true, change: 'tokens' }] });
  fs.renameSync(path.join(dir, 'src', 'sub'), path.join(dir, 'src', 'sub-old'));
  linkDir(outside, path.join(dir, 'src', 'sub'));
  verifyBatch({ project: dir, batch: batchOf(dir) }); // records the outside file as what the batch left
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.ok(r.blocked.some((b) => b.path === 'src/sub/page.tsx' && b.problem === 'not-in-project'), JSON.stringify(r.blocked));
  assert.equal(fs.readFileSync(path.join(outside, 'page.tsx'), 'utf8'), 'outside\n');
});

test('restore never writes through a file swapped for a symlink after save', (t) => {
  const dir = repo();
  const outside = writeTree(makeTempDir(), { 'page.tsx': 'outside\n' });
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  fs.rmSync(path.join(dir, 'src', 'page.tsx'));
  try {
    fs.symlinkSync(path.join(outside, 'page.tsx'), path.join(dir, 'src', 'page.tsx'), 'file');
  } catch (e) {
    if (e.code === 'EPERM') return t.skip('file symlinks need a privilege on this system');
    throw e;
  }
  verifyBatch({ project: dir, batch: batchOf(dir) });
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.ok(r.blocked.some((b) => b.path === 'src/page.tsx' && b.problem === 'not-in-project'), JSON.stringify(r.blocked));
  assert.equal(fs.readFileSync(path.join(outside, 'page.tsx'), 'utf8'), 'outside\n');
  return undefined;
});

const caseInsensitive = (() => {
  const d = writeTree(makeTempDir(), { 'a.txt': '' });
  return fs.existsSync(path.join(d, 'A.TXT'));
})();

test('a path whose letters differ from the disk only in case is refused', { skip: !caseInsensitive && 'case-sensitive file system' }, () => {
  const dir = repo();
  for (const item of [{ path: 'src/Page.tsx', exists: true, change: 'tokens' }, { path: 'SRC/New.tsx', exists: false, change: 'tokens' }]) {
    const s = saveBatch({ project: dir, batch: batchOf(dir), expected: [item] });
    assert.deepEqual(s.problems, [{ path: item.path, problem: 'case-mismatch' }]);
  }
});

test('git that fails or takes too long is a BatchError with a Spanish message', () => {
  const plain = makeTempDir();
  assert.throws(() => saveBatch({ project: plain, batch: path.join(plain, '.pignolo-ui', 'runs', 'r1', 'b'), expected: [NEW] }), (e) => e instanceof BatchError && /^git status falló: /.test(e.message));
  const dir = repo();
  assert.throws(() => saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW], gitTimeoutMs: 1 }), (e) => e instanceof BatchError && /git status no terminó en 0\.001 s/.test(e.message));
});

// ---- final review of hito 2b: restore never deletes what existed before save ---------------
const gitIn = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });

test('CRITICAL: an ignored file that stops being ignored during the batch is never deleted', () => {
  const dir = repo({ '.gitignore': 'secret.txt\nbuild/\n' });
  write(dir, 'secret.txt', 'USER DATA\n');
  write(dir, 'build/out/app.js', 'user build\n');
  assert.equal(saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] }).ok, true);
  write(dir, 'src/page.tsx', 'agent\n');
  write(dir, '.gitignore', '');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  const byPath = Object.fromEntries(v.unexpected.map((u) => [u.path, u]));
  assert.equal(byPath['secret.txt'].existedBefore, true);
  assert.equal(byPath['build/out/app.js'].existedBefore, true);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.deleted, []);
  assert.ok(r.blocked.some((b) => b.path === 'secret.txt' && b.problem === 'existed-before-the-batch'), JSON.stringify(r.blocked));
  assert.ok(r.blocked.some((b) => b.path === 'build/out/app.js' && b.problem === 'existed-before-the-batch'), JSON.stringify(r.blocked));
  assert.equal(read(dir, 'secret.txt'), 'USER DATA\n');
  assert.equal(read(dir, 'build/out/app.js'), 'user build\n');
});

test('a tracked file removed from the index during the batch is never deleted', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'agent\n');
  gitIn(dir, 'rm', '-q', '--cached', 'src/other.tsx'); // `D  src/other.tsx` and `?? src/other.tsx`
  verifyBatch({ project: dir, batch: batchOf(dir) });
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.ok(r.blocked.some((b) => b.path === 'src/other.tsx' && b.problem === 'existed-before-the-batch'), JSON.stringify(r.blocked));
  assert.equal(read(dir, 'src/other.tsx'), 'o\n');
});

test('a file that was in HEAD at save and shows as untracked after a commit is never deleted', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  gitIn(dir, 'rm', '-q', '--cached', 'src/other.tsx');
  gitIn(dir, 'commit', '-q', '-m', 'untrack');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.ok(r.blocked.some((b) => b.path === 'src/other.tsx' && b.problem === 'existed-before-the-batch'), JSON.stringify(r.blocked));
  assert.equal(read(dir, 'src/other.tsx'), 'o\n');
});

test('restore never reports restored while a created path it cannot read is still there', () => {
  const dir = repo();
  saveBatch({ project: dir, batch: batchOf(dir), expected: [NEW] });
  write(dir, 'src/New.tsx', 'n\n');
  verifyBatch({ project: dir, batch: batchOf(dir) });
  fs.rmSync(path.join(dir, 'src', 'New.tsx'));
  fs.mkdirSync(path.join(dir, 'src', 'New.tsx')); // an empty folder: git does not list it, and it has no sha256
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.ok(r.blocked.some((b) => b.path === 'src/New.tsx' && b.problem === 'unreadable'), JSON.stringify(r.blocked));
});

test('verify warns when an expected file is reached through a link that leaves the project', () => {
  const dir = repo({ 'src/sub/page.tsx': 'p\n' });
  const outside = writeTree(makeTempDir(), { 'page.tsx': 'outside\n' });
  saveBatch({ project: dir, batch: batchOf(dir), expected: [{ path: 'src/sub/page.tsx', exists: true, change: 'tokens' }] });
  fs.renameSync(path.join(dir, 'src', 'sub'), path.join(dir, 'src', 'sub-old'));
  linkDir(outside, path.join(dir, 'src', 'sub'));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, false);
  assert.deepEqual(v.problems, [{ path: 'src/sub/page.tsx', problem: 'not-in-project' }]);
});

// R1/R2: the only copy of a file moved or copied by the agent is never deleted (source-moved).
const blockedAs = (r, rel) => r.blocked.find((b) => b.path === rel)?.problem;

test('IMPORTANT: an ignored file renamed by the agent is never deleted (source-moved)', () => {
  const dir = repo({ '.gitignore': 'secret.txt\n' });
  write(dir, 'secret.txt', 'ONLY COPY\n');
  assert.equal(saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] }).ok, true);
  write(dir, 'src/page.tsx', 'agent\n');
  fs.renameSync(path.join(dir, 'secret.txt'), path.join(dir, 'secret-moved.txt'));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(v.ok, false);
  assert.deepEqual(v.warnings, [{ path: 'secret.txt', problem: 'source-moved' }]);
  assert.match(v.note, /no toques el proyecto entre save y restore/);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.deleted, []);
  assert.deepEqual(r.restored, ['src/page.tsx']);
  assert.equal(blockedAs(r, 'secret-moved.txt'), 'source-moved', JSON.stringify(r.blocked));
  assert.deepEqual(r.sourcesChanged, ['secret.txt']);
  assert.equal(read(dir, 'secret-moved.txt'), 'ONLY COPY\n');
});

test('IMPORTANT: an ignored file copied and then removed by the agent is never deleted', () => {
  const dir = repo({ '.gitignore': '.env\n' });
  write(dir, '.env', 'TOKEN=only-copy\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  fs.copyFileSync(path.join(dir, '.env'), path.join(dir, '.env.example'));
  fs.rmSync(path.join(dir, '.env'));
  verifyBatch({ project: dir, batch: batchOf(dir) });
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.equal(blockedAs(r, '.env.example'), 'source-moved', JSON.stringify(r.blocked));
  assert.equal(read(dir, '.env.example'), 'TOKEN=only-copy\n');
});

test('an ignored file changed in place (same path) also blocks every unexpected deletion', () => {
  const dir = repo({ '.gitignore': 'local.db\n' });
  write(dir, 'local.db', 'v1\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'local.db', 'v2 longer\n');
  write(dir, 'src/stray.tsx', 'x\n');
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(v.warnings, [{ path: 'local.db', problem: 'source-moved' }]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.equal(blockedAs(r, 'src/stray.tsx'), 'source-moved');
  assert.equal(exists(dir, 'src/stray.tsx'), true);
});

test('an ignored folder that disappears blocks every unexpected deletion; one that stays does not', () => {
  const dir = repo({ '.gitignore': 'build/\n' });
  write(dir, 'build/app.js', 'user build\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  fs.renameSync(path.join(dir, 'build'), path.join(dir, 'out'));
  verifyBatch({ project: dir, batch: batchOf(dir) });
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.equal(blockedAs(r, 'out/app.js'), 'source-moved');
  assert.equal(read(dir, 'out/app.js'), 'user build\n');

  const dir2 = repo({ '.gitignore': 'build/\n' });
  write(dir2, 'build/app.js', 'user build\n');
  saveBatch({ project: dir2, batch: batchOf(dir2), expected: [PAGE] });
  write(dir2, 'build/app.js', 'rebuilt, bigger than before\n'); // inside a collapsed folder: not watched
  write(dir2, 'src/stray.tsx', 'x\n');
  const v2 = verifyBatch({ project: dir2, batch: batchOf(dir2) });
  assert.deepEqual(v2.warnings, []);
  const r2 = restoreBatch({ project: dir2, batch: batchOf(dir2) });
  assert.deepEqual([r2.ok, r2.deleted], [true, ['src/stray.tsx']]);
});

test('IMPORTANT: an untracked file of the initial state renamed by the agent is never deleted', () => {
  const dir = repo();
  write(dir, 'notes.md', 'mine\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  write(dir, 'src/page.tsx', 'agent\n');
  fs.renameSync(path.join(dir, 'notes.md'), path.join(dir, 'notes2.md'));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(v.warnings, [{ path: 'notes.md', problem: 'source-moved' }]);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.deepEqual(r.restored, ['src/page.tsx']);
  assert.notEqual(blockedAs(r, 'notes2.md'), undefined, JSON.stringify(r.blocked));
  assert.equal(read(dir, 'notes2.md'), 'mine\n');
  // the output says exactly what happened: restored one, deleted none, left the rest
  assert.equal(r.summary, `restaurados 1 (src/page.tsx); borrados 0; sin tocar ${r.blocked.length} (${r.blocked.map((b) => b.path).join(', ')})`);
});

test('an unexpected untracked file with the sha256 of an initial entry existed before the batch', () => {
  const dir = repo();
  write(dir, 'notes.md', 'mine\n');
  saveBatch({ project: dir, batch: batchOf(dir), expected: [PAGE] });
  fs.copyFileSync(path.join(dir, 'notes.md'), path.join(dir, 'notes-copy.md'));
  const v = verifyBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(v.warnings, []);
  assert.equal(v.unexpected.find((u) => u.path === 'notes-copy.md').existedBefore, true);
  const r = restoreBatch({ project: dir, batch: batchOf(dir) });
  assert.deepEqual(r.deleted, []);
  assert.equal(blockedAs(r, 'notes-copy.md'), 'existed-before-the-batch');
});
