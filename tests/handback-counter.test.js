'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git } = require('./helpers');
const hc = require('../plugins/pignolo/lib/handback-counter');

const INITIAL = { count: 0, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] };

function repoWithWorktree() {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'rama', wt], repo);
  const sub = path.join(repo, 'src');
  fs.mkdirSync(sub);
  return { repo, wt, sub };
}

test('counterKey is the same from a worktree, the main checkout and a subdirectory; differs per repo', () => {
  const { repo, wt, sub } = repoWithWorktree();
  const k = hc.counterKey(repo);
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.strictEqual(hc.counterKey(wt), k);
  assert.strictEqual(hc.counterKey(sub), k);
  assert.notStrictEqual(hc.counterKey(makeRepo()), k);
});

test('counterKey needs no git: it resolves with an empty PATH', () => {
  const { repo, wt, sub } = repoWithWorktree();
  const code = 'const h=require(process.argv[1]);process.stdout.write(JSON.stringify(process.argv.slice(2).map(h.counterKey)));';
  const r = spawnSync(process.execPath, ['-e', code, require.resolve('../plugins/pignolo/lib/handback-counter'), wt, repo, sub], {
    encoding: 'utf8', env: { PATH: '', SystemRoot: process.env.SystemRoot || '' },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const k = hc.counterKey(repo);
  assert.deepStrictEqual(JSON.parse(r.stdout), [k, k, k]);
});

test('counter file: initial value, round trip, corrupt, clear', () => {
  const { repo } = repoWithWorktree();
  const env = { PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  assert.deepStrictEqual(hc.readCounter(env, repo, 't1'), INITIAL);
  const c = { count: 3, accepted: false, acceptedAgentId: null, blocked: false, lastReason: 'sin sello', stopHookActive: [true, false] };
  hc.writeCounter(env, repo, 't1', c);
  assert.deepStrictEqual(hc.readCounter(env, repo, 't1'), c);
  assert.strictEqual(hc.counterPath(env, repo, 't1'), path.join(env.PIGNOLO_HOME, 'handback', hc.counterKey(repo), 't1.json'));
  fs.writeFileSync(hc.counterPath(env, repo, 't1'), '{roto');
  assert.deepStrictEqual(hc.readCounter(env, repo, 't1'), INITIAL);
  hc.writeCounter(env, repo, '_malformed', c);
  hc.clearCounter(env, repo, '_malformed');
  assert.strictEqual(fs.existsSync(hc.counterPath(env, repo, '_malformed')), false);
  hc.clearCounter(env, repo, 'nunca-existio');
});

test('a task id cannot escape the counter directory', () => {
  const env = { PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  const cwd = makeTempDir();
  const dir = path.dirname(hc.counterPath(env, cwd, 'ok'));
  for (const id of ['../x', '..', 'a/b', 'a\\b']) {
    assert.strictEqual(path.dirname(hc.counterPath(env, cwd, id)), dir, id);
  }
});
