// files CLI (scripts/files.mjs) in a subprocess: exit codes 0/1/2 and the run folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

function repo() {
  const dir = writeTree(makeTempDir(), { 'src/a.css': '.a {}\n' });
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const porcelain = (dir) => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' });

test('save, verify and restore with exit codes 0 and 1; the run folder never shows in git status', () => {
  const dir = repo();
  const batch = '.pignolo-ui/runs/r1/batch-1';
  writeTree(path.join(dir, '.pignolo-ui', 'runs', 'r1'), { 'expected.json': JSON.stringify([{ path: 'src/a.css', exists: true, change: 'tokens' }]) });
  const save = runScript('files.mjs', ['save', '--project', dir, '--batch', batch, '--expected', '.pignolo-ui/runs/r1/expected.json'], { cwd: dir });
  assert.equal(save.status, 0, save.stderr);
  assert.equal(save.json.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  assert.equal(porcelain(dir), '');
  writeTree(dir, { 'src/a.css': '.a { color: red; }\n', 'src/x.js': 'x\n' });
  const verify = runScript('files.mjs', ['verify', '--project', dir, '--batch', batch], { cwd: dir });
  assert.equal(verify.status, 1);
  assert.deepEqual(verify.json.unexpected.map((u) => u.path), ['src/x.js']);
  const restore = runScript('files.mjs', ['restore', '--project', dir, '--batch', batch], { cwd: dir });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(restore.json.status, 'restored');
  assert.equal(porcelain(dir), '');
});

test('usage errors exit 2 with a Spanish message and no stack', async (t) => {
  const dir = repo();
  const sub = path.join(dir, 'src');
  const CASES = [
    ['no subcommand', [], /subcomando desconocido/],
    ['unknown option', ['verify', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b', '--force'], /opción desconocida --force/],
    ['missing option', ['verify', '--project', dir], /faltan --batch/],
    ['batch outside .pignolo-ui', ['verify', '--project', dir, '--batch', 'tmp/b'], /--batch debe estar dentro de \.pignolo-ui/],
    ['project not the repo root', ['verify', '--project', sub, '--batch', path.join(dir, '.pignolo-ui/runs/r1/b')], /raíz de un repo git/],
    ['verify without save', ['verify', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b'], /corré save primero/],
    ['unreadable expected list', ['save', '--project', dir, '--batch', '.pignolo-ui/runs/r1/b', '--expected', 'nope.json'], /no se pudo leer --expected/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('files.mjs', args, { cwd: dir });
      assert.equal(r.status, 2, r.stdout);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
    });
  }
});
