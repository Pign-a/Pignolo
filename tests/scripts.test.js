'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');

function runScript(name, args) {
  const r = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', `${name}.js`), ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
}

test('wip-snapshot saves the dirty tree of --cwd under refs/pignolo/wip', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const r = runScript('wip-snapshot', ['--cwd', repo, '--reason', 'manual-test']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.out.ref, /^refs\/pignolo\/wip\//);
  assert.strictEqual(git(['show', `${r.out.ref}:a.txt`], repo), 'cambio');
  assert.match(git(['log', '-1', '--format=%s', r.out.ref], repo), /manual-test/);
});

test('wip-snapshot prints null outside a repo', () => {
  const r = runScript('wip-snapshot', ['--cwd', makeTempDir()]);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.out, null);
});

test('backup-ref copies the refs of --cwd', () => {
  const repo = makeRepo();
  const r = runScript('backup-ref', ['--cwd', repo]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.out.count, 1);
  assert.ok(git(['for-each-ref', '--format=%(refname)', r.out.base], repo).includes('/heads/main'));
});
