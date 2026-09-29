'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { withDeadline } = require('../plugins/pignolo/lib/git');
const changes = require('../plugins/pignolo/lib/changes');

const put = (repo, name, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
  fs.writeFileSync(path.join(repo, name), text);
};
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const opts = (cwd) => ({ cwd, timeoutMs: 20000 });
const tempIndexes = (repo) => fs.readdirSync(path.join(repo, '.git')).filter((f) => /^pignolo-.*index/.test(f));

test('a clean working tree hashes to HEAD^{tree}', () => {
  const repo = makeRepo();
  assert.strictEqual(changes.workingTree(opts(repo)), git(['rev-parse', 'HEAD^{tree}'], repo));
});

test('an uncommitted edit changes the tree and leaves the real index alone', () => {
  const repo = makeRepo();
  put(repo, 'a.txt', 'dos\n');
  const before = git(['status', '--porcelain'], repo);
  const indexBefore = fs.readFileSync(path.join(repo, '.git', 'index'));
  const tree = changes.workingTree(opts(repo));
  assert.notStrictEqual(tree, git(['rev-parse', 'HEAD^{tree}'], repo));
  assert.strictEqual(git(['status', '--porcelain'], repo), before);
  assert.ok(fs.readFileSync(path.join(repo, '.git', 'index')).equals(indexBefore));
});

test('changedFiles: new non-ignored is A, ignored is absent, deleted is D, emptied is flagged', () => {
  const repo = makeRepo();
  put(repo, '.gitignore', '*.log\n');
  put(repo, 'gone.txt', 'x\n');
  put(repo, 'full.txt', 'hay algo\n');
  commitAll(repo);
  const base = changes.headSha(opts(repo));
  put(repo, 'new.txt', 'n\n');
  put(repo, 'skip.log', 'l\n');
  fs.rmSync(path.join(repo, 'gone.txt'));
  put(repo, 'full.txt', '');
  const tree = changes.workingTree(opts(repo));
  const got = Object.fromEntries(changes.changedFiles({ ...opts(repo), base, tree }).map((f) => [f.path, f]));
  assert.deepStrictEqual(Object.keys(got).sort(), ['full.txt', 'gone.txt', 'new.txt']);
  assert.strictEqual(got['new.txt'].status, 'A');
  assert.strictEqual(got['gone.txt'].status, 'D');
  assert.strictEqual(got['full.txt'].status, 'M');
  assert.deepStrictEqual([got['full.txt'].emptied, got['new.txt'].emptied, got['gone.txt'].emptied], [true, false, false]);
});

test('changedFiles with sizes:false never calls ls-tree and reports emptied:null', () => {
  const repo = makeRepo();
  const base = changes.headSha(opts(repo));
  put(repo, 'a.txt', '');
  const tree = changes.workingTree(opts(repo));
  const calls = [];
  const real = withDeadline(repo, 20000);
  const run = (args, o) => { calls.push(args); return real(args, o); };
  const got = changes.changedFiles({ cwd: repo, base, tree, run, sizes: false });
  assert.deepStrictEqual(got, [{ path: 'a.txt', status: 'M', emptied: null }]);
  assert.ok(!calls.some((a) => a.includes('ls-tree')));
});

test('addedLines gives sign and line number on the matching side', () => {
  const repo = makeRepo();
  put(repo, 'f.js', 'uno\ndos\n');
  commitAll(repo);
  const base = changes.headSha(opts(repo));
  put(repo, 'f.js', 'UNO\ndos\nexport function f(a, b) {}\n');
  const tree = changes.workingTree(opts(repo));
  assert.deepStrictEqual(changes.addedLines({ ...opts(repo), base, tree }), [
    { path: 'f.js', line: 1, text: 'uno', sign: '-' },
    { path: 'f.js', line: 1, text: 'UNO', sign: '+' },
    { path: 'f.js', line: 3, text: 'export function f(a, b) {}', sign: '+' },
  ]);
});

test('addedLines omits binary files', () => {
  const repo = makeRepo();
  const base = changes.headSha(opts(repo));
  fs.writeFileSync(path.join(repo, 'b.bin'), Buffer.from([0, 1, 2, 0, 255, 0]));
  const tree = changes.workingTree(opts(repo));
  assert.deepStrictEqual(changes.addedLines({ ...opts(repo), base, tree }), []);
});

test('outside a git repo workingTree throws', () => {
  assert.throws(() => changes.workingTree(opts(makeTempDir())), /no es un repo git/);
});

test('no temporary index (or its .lock) survives a failure in the middle', () => {
  const repo = makeRepo();
  put(repo, 'a.txt', 'dos\n');
  const real = withDeadline(repo, 20000);
  let sawTemp = false;
  const run = (args, o) => {
    if (args.includes('write-tree')) {
      sawTemp = tempIndexes(repo).length > 0;
      throw new Error('boom');
    }
    return real(args, o);
  };
  assert.throws(() => changes.workingTree({ cwd: repo, run }), /boom/);
  assert.ok(sawTemp, 'the temporary index must exist when write-tree runs');
  assert.deepStrictEqual(tempIndexes(repo), []);
});
