'use strict';
// .pignolo/project.md ignorado por git: init lo detecta y corrige la regla, verify/status/SessionStart avisan, la tarea explica el rechazo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git, runLauncher } = require('./helpers');

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const RUN = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const PROJECT_MD = '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n';

const env0 = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-pi-home-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-pi-cfg-') });
function cli(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [INIT, ...args], { cwd, env: env || env0(), encoding: 'utf8', timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stderr: r.stderr, json };
}
function planFile(approved = ['ignores']) {
  const f = path.join(makeTempDir('pignolo-pi-plan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify({ v: 1, approved, answers: {}, proposal: {} }));
  return f;
}
const ignored = (repo, rel) => {
  try { git(['check-ignore', '-q', rel], repo); return true; } catch (e) { if (e.status === 1) return false; throw e; }
};
const giFile = (repo) => path.join(repo, '.gitignore');
const stepOf = (r) => r.json.steps.find((s) => s.id === 'ignores');
function repoWith(gitignore) {
  const repo = makeRepo();
  fs.writeFileSync(giFile(repo), gitignore);
  return repo;
}
const L1 = (b) => Buffer.from(b, 'latin1');

test('preview lists the change; apply makes it: project.md is no longer ignored, the rest of .pignolo still is; a second apply changes nothing', () => {
  const repo = repoWith('node_modules/\n.pignolo/\n*.log\n');
  const env = env0();
  assert.equal(ignored(repo, '.pignolo/project.md'), true);
  const before = fs.readFileSync(giFile(repo));
  const p = cli(['preview', '--plan', planFile(), '--cwd', repo], { env });
  assert.equal(p.status, 0, p.stderr);
  assert.equal(stepOf(p).status, 'would-do');
  assert.equal(stepOf(p).projectMdIgnored.status, 'would-do');
  assert.deepEqual(stepOf(p).projectMdIgnored.with, ['**/.pignolo/*', '!.pignolo/project.md', '!.pignolo/.gitignore']);
  assert.deepEqual(fs.readFileSync(giFile(repo)), before, 'preview does not write');
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo], { env });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(stepOf(a).projectMdIgnored.status, 'done');
  assert.ok(stepOf(a).projectMdIgnored.backup, 'the old file is backed up outside the repo');
  assert.equal(ignored(repo, '.pignolo/project.md'), false);
  assert.equal(ignored(repo, '.pignolo/tmp/x'), true);
  assert.equal(ignored(repo, '.pignolo/run.json'), true);
  assert.equal(ignored(repo, '.pignolo/other/file.txt'), true);
  const after = fs.readFileSync(giFile(repo));
  const again = cli(['apply', '--plan', planFile(), '--cwd', repo], { env });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(stepOf(again).status, 'skipped');
  assert.equal(stepOf(again).projectMdIgnored, undefined);
  assert.deepEqual(fs.readFileSync(giFile(repo)), after);
});

for (const [name, rule, expectRule] of [
  ['without slash', '.pignolo', '**/.pignolo/*'],
  ['rooted', '/.pignolo/', '.pignolo/*'],
]) {
  test(`rule "${rule}" (${name}) is replaced and every other line stays byte-identical, with CRLF and a non-UTF-8 byte`, () => {
    const eol = '\r\n';
    const head = `node_modules/${eol}\xFF\xFE-latin1-line${eol}`;
    const tail = `*.log${eol}# \xE9${eol}last-line-without-eol`;
    const repo = repoWith('');
    fs.writeFileSync(giFile(repo), L1(`${head}${rule}${eol}${tail}`));
    const a = cli(['apply', '--plan', planFile(), '--cwd', repo]);
    assert.equal(a.status, 0, a.stderr);
    const want = L1(`${head}${expectRule}${eol}!.pignolo/project.md${eol}!.pignolo/.gitignore${eol}${tail}`);
    assert.deepEqual(fs.readFileSync(giFile(repo)), want);
    assert.equal(ignored(repo, '.pignolo/project.md'), false);
    assert.equal(ignored(repo, '.pignolo/run.json'), true);
  });
}

test('a rule that already covers only the content (.pignolo/*) just gets the two negations after it', () => {
  const repo = repoWith('a\n.pignolo/*\nb\n');
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fs.readFileSync(giFile(repo), 'utf8'), 'a\n.pignolo/*\n!.pignolo/project.md\n!.pignolo/.gitignore\nb\n');
  assert.equal(ignored(repo, '.pignolo/project.md'), false);
});

test('a rule in .git/info/exclude: no file is edited and the note says where the rule is', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.git', 'info', 'exclude'), '.pignolo/\n');
  const excludeBefore = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(stepOf(a).projectMdIgnored.status, 'external');
  assert.ok(a.json.notes.some((n) => /\.git\/info\/exclude/.test(n) && /no la toca/.test(n)), JSON.stringify(a.json.notes));
  assert.equal(fs.existsSync(giFile(repo)), false);
  assert.equal(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8'), excludeBefore);
  assert.equal(ignored(repo, '.pignolo/project.md'), true);
});

test('a .gitignore that is a symlink is never written through', (t) => {
  const repo = makeRepo();
  const real = path.join(makeTempDir('pignolo-pi-real-'), 'outside.txt');
  fs.writeFileSync(real, '.pignolo/\n');
  try { fs.symlinkSync(real, giFile(repo)); } catch (_) { t.skip('no se pueden crear symlinks aquí'); return; }
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fs.readFileSync(real, 'utf8'), '.pignolo/\n');
  assert.ok(fs.lstatSync(giFile(repo)).isSymbolicLink());
});

test('no ignoring rule: nothing is proposed and the step has no projectMdIgnored', () => {
  const repo = repoWith('node_modules/\n');
  const p = cli(['preview', '--plan', planFile(), '--cwd', repo]);
  assert.equal(p.status, 0, p.stderr);
  assert.equal(stepOf(p).projectMdIgnored, undefined);
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo]);
  assert.equal(fs.readFileSync(giFile(repo), 'utf8'), 'node_modules/\n');
  assert.equal(stepOf(a).projectMdIgnored, undefined);
});

test('a folder that is not a repo or a missing git never throws from the notice', () => {
  const PI = require('../plugins/pignolo/lib/project-ignored');
  const bare = makeTempDir('pignolo-pi-bare-');
  fs.mkdirSync(path.join(bare, '.pignolo'));
  fs.writeFileSync(path.join(bare, '.pignolo', 'project.md'), PROJECT_MD);
  assert.equal(PI.noticeLine({ main: bare }), '');
  const boom = () => { throw new Error('git ausente'); };
  assert.equal(PI.noticeLine({ main: bare, run: boom }), '');
  assert.deepEqual(PI.projectIgnored({ main: bare, run: boom }), { ignored: 'unknown' });
  assert.equal(PI.whyMissing({ main: bare, run: boom }), '');
});

test('verify prints the one line only when project.md exists and git ignores it', () => {
  const repo = repoWith('.pignolo/\n');
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  const env = env0();
  const v = cli(['verify', '--cwd', repo], { env });
  assert.equal(v.status, 0, v.stderr);
  const hits = v.json.notes.filter((n) => /git ignora \.pignolo\/project\.md/.test(n));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /\/pignolo:init/);
  const a = cli(['apply', '--plan', planFile(), '--cwd', repo], { env });
  assert.equal(a.status, 0, a.stderr);
  const v2 = cli(['verify', '--cwd', repo], { env });
  assert.equal(v2.json.notes.filter((n) => /git ignora/.test(n)).length, 0);
});

test('status (SessionStart) says it in one line only when ignored, and the exit stays 0', () => {
  const repo = repoWith('.pignolo/\n');
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  const home = makeTempDir('pignolo-pi-sshome-');
  const st = runLauncher('session-start', { source: 'status', cwd: repo }, { PIGNOLO_HOME: home });
  assert.equal(st.status, 0, st.stderr);
  const msg = JSON.parse(st.stdout).systemMessage;
  assert.equal(msg.split('\n').filter((l) => /git ignora \.pignolo\/project\.md/.test(l)).length, 1);
  const ok = repoWith('node_modules/\n');
  fs.mkdirSync(path.join(ok, '.pignolo'));
  fs.writeFileSync(path.join(ok, '.pignolo', 'project.md'), PROJECT_MD);
  const st2 = runLauncher('session-start', { source: 'status', cwd: ok }, { PIGNOLO_HOME: home });
  assert.equal(st2.status, 0, st2.stderr);
  assert.doesNotMatch(st2.stdout, /git ignora/);
});

test('task: a base without project.md names the cause and the fix when the main checkout has it ignored or uncommitted', () => {
  const repo = repoWith('.pignolo/\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'gi'], repo);
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  const base = git(['rev-parse', 'HEAD'], repo);
  const wt = path.join(makeTempDir('pignolo-pi-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tb', wt], repo);
  const go = (args) => spawnSync(process.execPath, [RUN, ...args], { cwd: repo, encoding: 'utf8', timeout: 20000 });
  assert.equal(go(['start', '--flow', 'daily']).status, 0);
  const a = go(['task', '--id', 'x', '--worktree', wt, '--base', base]);
  assert.equal(a.status, 1);
  assert.match(a.stderr, /ignorado por git/);
  assert.match(a.stderr, /\/pignolo:init/);
  // Sin la regla: existe pero no está commiteado.
  fs.writeFileSync(giFile(repo), '');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'gi2'], repo);
  const base2 = git(['rev-parse', 'HEAD'], repo);
  const wt2 = path.join(makeTempDir('pignolo-pi-wt-'), 'wt2');
  git(['worktree', 'add', '-q', '-b', 'tb2', wt2], repo);
  const b = go(['task', '--id', 'x', '--worktree', wt2, '--base', base2]);
  assert.equal(b.status, 1);
  assert.match(b.stderr, /no está commiteado/);
});
