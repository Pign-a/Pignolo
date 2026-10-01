'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');

const { configDir, memorySlug, locateAutoMemory } = require('../plugins/pignolo/lib/auto-memory');

function memoryFor(cfg, main, files) {
  const dir = path.join(cfg, 'projects', memorySlug(main), 'memory');
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c);
  return dir;
}
const envWith = (cfg, extra = {}) => ({ ...process.env, CLAUDE_CONFIG_DIR: cfg, ...extra });

test('memorySlug table, 200-character cap and hash (A8-14)', () => {
  assert.equal(memorySlug('D:\\pignolo'), 'D--pignolo');
  assert.equal(memorySlug('C:\\Users\\a b\\p'), 'C--Users-a-b-p');
  assert.equal(memorySlug('/home/a/p'), '-home-a-p');
  assert.equal(memorySlug('C:/tmp/a b/ñandú'), 'C--tmp-a-b--and-');
  const long = `/${'a'.repeat(249)}`;
  assert.equal(memorySlug(long), `-${'a'.repeat(199)}-wkpu26`);
  assert.equal(memorySlug(`/${'a'.repeat(199)}`), `-${'a'.repeat(199)}`);
  assert.equal(memorySlug(`/${'a'.repeat(199)}`).length, 200);
});

test('configDir is one directory: CLAUDE_CONFIG_DIR, else ~/.claude (A8-10)', () => {
  const cfg = makeTempDir('pignolo-cfg-');
  assert.equal(configDir({ CLAUDE_CONFIG_DIR: cfg }), cfg);
  assert.equal(configDir({ HOME: '/h', USERPROFILE: '/h' }), path.join('/h', '.claude'));
  const repo = makeRepo();
  const home = process.env.HOME;
  memoryFor(cfg, repo, { 'a.md': 'x' });
  memoryFor(path.join(home, '.claude'), repo, { 'a.md': 'x', 'b.md': 'y', 'c.md': 'z' });
  const r = locateAutoMemory({ main: repo, env: envWith(cfg) });
  assert.equal(r.files, 1);
  assert.ok(r.dir.startsWith(cfg));
  assert.ok(r.tried.every((t) => !t.startsWith(path.join(home, '.claude'))));
  const e = { ...process.env };
  delete e.CLAUDE_CONFIG_DIR;
  assert.equal(locateAutoMemory({ main: repo, env: e }).files, 3);
});

test('locate: counts .md without MEMORY.md; absent folder is reported, not assumed', () => {
  const cfg = makeTempDir('pignolo-cfg-');
  const repo = makeRepo();
  const dir = memoryFor(cfg, repo, { 'MEMORY.md': 'i', 'a.md': 'x', 'b.md': 'y', 'c.md': 'z', 'note.txt': 'n' });
  const r = locateAutoMemory({ main: repo, env: envWith(cfg) });
  assert.equal(r.files, 3);
  assert.equal(r.dir, dir);
  const none = locateAutoMemory({ main: makeRepo(), env: envWith(cfg) });
  assert.equal(none.dir, null);
  assert.equal(none.files, 0);
  assert.ok(none.tried.length > 0);
});

test('locate from a linked worktree or a subdirectory uses the main checkout slug (C-01)', () => {
  const cfg = makeTempDir('pignolo-cfg-');
  const repo = makeRepo();
  memoryFor(cfg, repo, { 'a.md': 'x' });
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wtb'], repo);
  assert.equal(locateAutoMemory({ main: wt, env: envWith(cfg) }).files, 1);
  fs.mkdirSync(path.join(repo, 'sub', 'deep'), { recursive: true });
  assert.equal(locateAutoMemory({ main: path.join(repo, 'sub', 'deep'), env: envWith(cfg) }).files, 1);
});

test('autoMemoryDirectory in settings.local.json wins over the slug; env overrides are noted', () => {
  const cfg = makeTempDir('pignolo-cfg-');
  const repo = makeRepo();
  memoryFor(cfg, repo, { 'a.md': 'x' });
  const other = makeTempDir('pignolo-mem-');
  fs.writeFileSync(path.join(other, 'p.md'), 'x');
  fs.writeFileSync(path.join(other, 'q.md'), 'x');
  fs.mkdirSync(path.join(repo, '.claude'));
  fs.writeFileSync(path.join(repo, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: other }));
  const r = locateAutoMemory({ main: repo, env: envWith(cfg, { CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: '/x' }) });
  assert.equal(r.dir, other);
  assert.equal(r.tried[0], other);
  assert.equal(r.files, 2);
  assert.ok(r.notes.includes('env-override'));
});

test('locate never opens a memory file (R-14); a planted token never reaches the result', () => {
  const cfg = makeTempDir('pignolo-cfg-');
  const repo = makeRepo();
  const token = `ghp_${'a'.repeat(36)}`;
  const dir = memoryFor(cfg, repo, { 'a.md': token, 'b.md': 'y' });
  fs.mkdirSync(path.join(repo, '.claude'));
  fs.writeFileSync(path.join(repo, '.claude', 'settings.local.json'), '{}');
  const reads = [];
  const spy = {
    ...fs,
    readFileSync: (f, ...r) => { reads.push(String(f)); return fs.readFileSync(f, ...r); },
    readFile: (f, ...r) => { reads.push(String(f)); return fs.readFile(f, ...r); },
    openSync: (f, ...r) => { reads.push(String(f)); return fs.openSync(f, ...r); },
  };
  const r = locateAutoMemory({ main: repo, env: envWith(cfg), fs: spy });
  assert.ok(reads.some((f) => f.endsWith('settings.local.json')), 'the spy saw the settings read');
  assert.ok(!reads.some((f) => f.startsWith(dir)), 'no memory file was read');
  assert.equal(JSON.stringify(r).includes(token), false);
});
