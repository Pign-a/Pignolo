import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeRunId, initRun } from '../lib/run-init.mjs';
import { makeTempDir } from './helpers.mjs';

function makeRepo() {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  return dir;
}
const NOW = new Date('2026-09-30T14:05:00Z');
const DAY = 24 * 3600 * 1000;
function oldDir(dir, days) {
  fs.mkdirSync(dir, { recursive: true });
  const t = new Date(NOW.getTime() - days * DAY);
  fs.utimesSync(dir, t, t);
}

test('makeRunId builds the stamp and sanitizes the slug', () => {
  assert.equal(makeRunId({ now: NOW, command: 'audit', slug: 'Cuenta Mensual!' }), '2026-09-30-1405-audit-cuenta-mensual');
  assert.throws(() => makeRunId({ now: NOW, command: 'build', slug: 'x' }));
  assert.ok(makeRunId({ now: NOW, command: 'new', slug: 'a'.repeat(100) }).length <= 16 + 4 + 40);
});

test('initRun leaves the repo clean, writes run.json, and keeps .gitignore even on failure', () => {
  const repo = makeRepo();
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-qm', 'x'], { cwd: repo });
  assert.throws(() => initRun({ project: repo, command: 'audit', slug: '!!!', now: NOW }));
  assert.equal(fs.readFileSync(path.join(repo, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  const { run, runId, pruned } = initRun({ project: repo, command: 'audit', slug: 'inicio', now: NOW, meta: { url: 'http://localhost:3000' } });
  const info = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8'));
  assert.equal(info.command, 'audit');
  assert.equal(info.design, null);
  assert.equal(info.url, 'http://localhost:3000');
  assert.equal(path.resolve(info.project), path.resolve(repo));
  assert.equal(runId, '2026-09-30-1405-audit-inicio');
  assert.deepEqual(pruned, []);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), '');
});

test('prune deletes runs older than 14 days and nothing else', () => {
  const repo = makeRepo();
  const runs = path.join(repo, '.pignolo-ui', 'runs');
  oldDir(path.join(runs, 'r15'), 15);
  oldDir(path.join(runs, 'r20'), 20);
  oldDir(path.join(runs, 'r13'), 13);
  fs.writeFileSync(path.join(runs, 'suelto.txt'), 'x');
  oldDir(path.join(repo, '.pignolo-ui', 'otra'), 20);
  const { pruned } = initRun({ project: repo, command: 'new', slug: 'x', now: NOW });
  assert.deepEqual(pruned.sort(), ['r15', 'r20']);
  assert.ok(fs.existsSync(path.join(runs, 'r13')));
  assert.ok(fs.existsSync(path.join(runs, 'suelto.txt')));
  assert.ok(fs.existsSync(path.join(repo, '.pignolo-ui', 'otra')));
});

test('prune never follows a link out of runs/', (t) => {
  const repo = makeRepo();
  const runs = path.join(repo, '.pignolo-ui', 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const outside = makeTempDir();
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'x');
  oldDir(outside, 20);
  const link = path.join(runs, 'enlace');
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (e) {
    t.skip(`no se pudo crear el enlace: ${e.code}`);
    return;
  }
  const t20 = new Date(NOW.getTime() - 20 * DAY);
  try { fs.lutimesSync(link, t20, t20); } catch { /* best effort */ }
  const { pruned } = initRun({ project: repo, command: 'new', slug: 'x', now: NOW });
  assert.deepEqual(pruned, []);
  assert.ok(fs.existsSync(path.join(outside, 'keep.txt')));
  assert.ok(fs.existsSync(link));
});

// C-1: a link (junction on Windows, symlink elsewhere) at .pignolo-ui or .pignolo-ui/runs must
// never let the prune (or any write) reach outside the real runs folder.
function link(target, at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
}
function victim() {
  const v = makeTempDir();
  const thesis = path.join(v, 'old-work', 'thesis.txt');
  fs.mkdirSync(path.dirname(thesis), { recursive: true });
  fs.writeFileSync(thesis, 'mi tesis\n');
  oldDir(path.join(v, 'old-work'), 30);
  return { v, thesis };
}

test('C-1: initRun refuses and deletes nothing when .pignolo-ui/runs is a link to another folder', () => {
  const repo = makeRepo();
  const { v, thesis } = victim();
  link(v, path.join(repo, '.pignolo-ui', 'runs'));
  assert.throws(() => initRun({ project: repo, command: 'audit', slug: 'x', now: NOW }), /enlace/);
  assert.equal(fs.readFileSync(thesis, 'utf8'), 'mi tesis\n');
  assert.deepEqual(fs.readdirSync(v), ['old-work']);
});

test('C-1: initRun refuses and deletes nothing when .pignolo-ui itself is a link', () => {
  const repo = makeRepo();
  const outside = makeTempDir();
  const { v, thesis } = victim();
  fs.mkdirSync(path.join(outside, 'runs'), { recursive: true });
  fs.renameSync(path.join(v, 'old-work'), path.join(outside, 'runs', 'old-work'));
  link(outside, path.join(repo, '.pignolo-ui'));
  assert.throws(() => initRun({ project: repo, command: 'audit', slug: 'x', now: NOW }), /enlace/);
  assert.ok(fs.existsSync(path.join(outside, 'runs', 'old-work', 'thesis.txt')));
  assert.equal(fs.existsSync(thesis), false);
});

test('C-1: run.mjs init exits 2 over a linked runs folder and keeps the user files', async () => {
  const { runScript } = await import('./helpers.mjs');
  const repo = makeRepo();
  const { v, thesis } = victim();
  link(v, path.join(repo, '.pignolo-ui', 'runs'));
  const r = runScript('run.mjs', ['init', '--project', repo, '--command', 'audit', '--slug', 'x']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /enlace/);
  assert.equal(fs.readFileSync(thesis, 'utf8'), 'mi tesis\n');
});
