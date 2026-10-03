'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git } = require('./helpers');

const A = require('../plugins/pignolo/lib/init-actions');
const { gitRun } = require('../plugins/pignolo/lib/git');
const { setReflogPolicy } = require('../plugins/pignolo/lib/git-backup');
const { PIGNOLO_IGNORED } = require('../plugins/pignolo/lib/pignolo-gitignore');

const RUN_JS = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'run.js');
const tracking = () => {
  const calls = [];
  const run = (args, cwd) => { calls.push(args); return gitRun(args, cwd); };
  return { calls, run };
};
const homeEnv = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-ihome-') });
const porcelain = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const cfg = (repo, key) => { try { return git(['config', '--local', '--get', key], repo); } catch (_) { return ''; } };

test('applyReflog: sets both keys with --local only, then skips; one key set -> both end as never', () => {
  const repo = makeRepo();
  const { calls, run } = tracking();
  const s = A.applyReflog({ root: repo, run });
  assert.equal(s.status, 'done');
  assert.equal(cfg(repo, 'gc.reflogExpire'), 'never');
  assert.equal(cfg(repo, 'gc.reflogExpireUnreachable'), 'never');
  assert.ok(calls.length > 0);
  assert.ok(calls.some((a) => JSON.stringify(a) === JSON.stringify(['config', '--local', 'gc.reflogExpire', 'never'])));
  assert.ok(calls.some((a) => JSON.stringify(a) === JSON.stringify(['config', '--local', 'gc.reflogExpireUnreachable', 'never'])));
  assert.ok(!calls.some((a) => a.includes('--global') || a.includes('--system')));
  assert.equal(A.applyReflog({ root: repo }).reason, 'already-set');
  const half = makeRepo();
  git(['config', '--local', 'gc.reflogExpire', 'never'], half);
  assert.equal(A.applyReflog({ root: half }).status, 'done');
  assert.equal(cfg(half, 'gc.reflogExpireUnreachable'), 'never');
});

test('setReflogPolicy uses the injected run and keeps its default', () => {
  const seen = [];
  setReflogPolicy({ cwd: '/x', run: (a, c) => { seen.push([a, c]); } });
  assert.equal(seen.length, 2);
  assert.equal(seen[0][1], '/x');
  const repo = makeRepo();
  setReflogPolicy({ cwd: repo });
  assert.equal(cfg(repo, 'gc.reflogExpire'), 'never');
});

test('reflog policy is visible from a linked worktree', () => {
  const repo = makeRepo();
  A.applyReflog({ root: repo });
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wt-branch'], repo);
  assert.equal(git(['config', '--get', 'gc.reflogExpire'], wt), 'never');
});

test('applyGitattributes: create, append keeping bytes, CRLF, already-set, conflict; backups live outside the repo', () => {
  const env = homeEnv();
  const fresh = makeRepo();
  assert.equal(A.applyGitattributes({ root: fresh, env }).status, 'done');
  assert.equal(fs.readFileSync(path.join(fresh, '.gitattributes'), 'utf8'), '.pignolo/** text eol=lf\n');

  const withOther = makeRepo();
  fs.writeFileSync(path.join(withOther, '.gitattributes'), '* text=auto\n');
  const r = A.applyGitattributes({ root: withOther, env });
  assert.equal(r.status, 'done');
  assert.equal(fs.readFileSync(path.join(withOther, '.gitattributes'), 'utf8'), '* text=auto\n.pignolo/** text eol=lf\n');
  assert.ok(r.backup.startsWith(env.PIGNOLO_HOME));
  assert.equal(fs.readFileSync(r.backup, 'utf8'), '* text=auto\n');
  assert.ok(!porcelain(withOther).match(/init-backup|pignolo-bak/));

  const crlf = makeRepo();
  fs.writeFileSync(path.join(crlf, '.gitattributes'), '* text=auto\r\n');
  A.applyGitattributes({ root: crlf, env });
  assert.equal(fs.readFileSync(path.join(crlf, '.gitattributes'), 'utf8'), '* text=auto\r\n.pignolo/** text eol=lf\r\n');

  const again = A.applyGitattributes({ root: withOther, env });
  assert.equal(again.status, 'skipped');
  assert.equal(again.backup, undefined);

  const conflict = makeRepo();
  fs.writeFileSync(path.join(conflict, '.gitattributes'), '.pignolo/** -text\n');
  const c = A.applyGitattributes({ root: conflict, env });
  assert.equal(c.status, 'refused');
  assert.equal(c.reason, 'conflicting-rule');
  assert.equal(c.line, '.pignolo/** -text');
  assert.equal(fs.readFileSync(path.join(conflict, '.gitattributes'), 'utf8'), '.pignolo/** -text\n');
});

test('applyIgnores: creates, completes a tracked file, is idempotent; tracked is false in a new repo', () => {
  const repo = makeRepo();
  const s = A.applyIgnores({ root: repo });
  assert.equal(s.status, 'done');
  assert.deepEqual(s.added, ['.gitignore', 'run.json', '.disabled', 'tmp/', 'worktrees/', 'panel-state.json']);
  assert.equal(s.tracked, false);
  assert.throws(() => git(['add', '.pignolo/.gitignore'], repo), 'git add of the self-ignored file fails (C-07)');
  assert.deepEqual(A.applyIgnores({ root: repo }).added, []);

  const tracked = makeRepo();
  fs.mkdirSync(path.join(tracked, '.pignolo'));
  fs.writeFileSync(path.join(tracked, '.pignolo', '.gitignore'), '.gitignore\nrun.json\n.disabled\n');
  git(['add', '-f', '.pignolo/.gitignore'], tracked);
  git(['commit', '-q', '-m', 'ign'], tracked);
  const t = A.applyIgnores({ root: tracked });
  assert.deepEqual(t.added, ['tmp/', 'worktrees/', 'panel-state.json']);
  assert.equal(t.tracked, true);
  assert.equal(t.trackedModified, true);
});

test('PIGNOLO_IGNORED is the former run.js list and run.js start does not touch an init-ed .gitignore', () => {
  assert.deepEqual([...PIGNOLO_IGNORED], ['.gitignore', 'run.json', '.disabled', 'tmp/', 'worktrees/', 'panel-state.json']);
  const repo = makeRepo();
  A.applyIgnores({ root: repo });
  git(['add', '-f', '.pignolo/.gitignore'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  const r = spawnSync(process.execPath, [RUN_JS, 'start', '--flow', 'trivial', '--cwd', repo], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(porcelain(repo), '');
});

test('applySecurityMd: creates, skips when any SECURITY.md exists, refuses injected structure, no leftover markers', () => {
  const tpl = '# {{project}}\n\nSoporte: {{supported}}\n\nCanal: {{channel}}\n';
  const repo = makeRepo();
  const s = A.applySecurityMd({ root: repo, template: tpl, answers: { project: 'demo', channel: 'seguridad@example.invalid' } });
  assert.equal(s.status, 'done');
  const text = fs.readFileSync(path.join(repo, 'SECURITY.md'), 'utf8');
  assert.match(text, /# demo/);
  assert.match(text, /seguridad@example\.invalid/);
  assert.doesNotMatch(text, /\{\{/);

  const gh = makeRepo();
  fs.mkdirSync(path.join(gh, '.github'));
  fs.writeFileSync(path.join(gh, '.github', 'SECURITY.md'), 'x');
  const k = A.applySecurityMd({ root: gh, template: tpl });
  assert.equal(k.reason, 'exists');
  assert.equal(fs.existsSync(path.join(gh, 'SECURITY.md')), false);

  const bad = makeRepo();
  const b = A.applySecurityMd({ root: bad, template: tpl, answers: { channel: 'a\n## Inyectado' } });
  assert.equal(b.status, 'refused');
  assert.equal(b.reason, 'invalid-answer');
  assert.equal(fs.existsSync(path.join(bad, 'SECURITY.md')), false);

  const def = makeRepo();
  A.applySecurityMd({ root: def, template: tpl });
  const d = fs.readFileSync(path.join(def, 'SECURITY.md'), 'utf8');
  assert.match(d, /Security → Report a vulnerability/);
  assert.doesNotMatch(d, /\{\{/);
});

test('backupFile: unique names, never overwrites, lives under PIGNOLO_HOME', () => {
  const env = homeEnv();
  const repo = makeRepo();
  const f = path.join(repo, 'a.txt');
  const now = new Date('2026-10-01T10:00:00.000Z');
  const one = A.backupFile({ file: f, main: repo, env, now });
  const two = A.backupFile({ file: f, main: repo, env, now });
  assert.notEqual(one, two);
  assert.ok(one.startsWith(env.PIGNOLO_HOME));
  assert.ok(!one.startsWith(repo));
  assert.equal(fs.readFileSync(one, 'utf8'), 'uno\n');
});

test('no step runs commit, add or push', () => {
  const repo = makeRepo();
  const { calls, run } = tracking();
  const env = homeEnv();
  A.applyReflog({ root: repo, run });
  A.applyIgnores({ root: repo, run });
  A.applyGitattributes({ root: repo, env });
  A.applySecurityMd({ root: repo, template: 'x {{project}}' });
  assert.ok(calls.length > 0);
  assert.ok(!calls.some((a) => ['commit', 'add', 'push'].includes(a[0])));
});

test('dry runs report would-do and write nothing', () => {
  const repo = makeRepo();
  const env = homeEnv();
  const before = porcelain(repo);
  assert.equal(A.applyReflog({ root: repo, dry: true }).status, 'would-do');
  assert.equal(A.applyIgnores({ root: repo, dry: true }).status, 'would-do');
  assert.equal(A.applyGitattributes({ root: repo, env, dry: true }).status, 'would-do');
  assert.equal(A.applySecurityMd({ root: repo, template: 'x', dry: true }).status, 'would-do');
  assert.equal(porcelain(repo), before);
  assert.equal(cfg(repo, 'gc.reflogExpire'), '');
});

// Protects: m-4 · Breaks if: ensureIgnored agrega en LF a un .pignolo/.gitignore con finales CRLF.
test('ensureIgnored keeps the CRLF endings of an existing .pignolo/.gitignore', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  const f = path.join(repo, '.pignolo', '.gitignore');
  fs.writeFileSync(f, '.gitignore\r\nrun.json\r\n');
  A.applyIgnores({ root: repo });
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(!/[^\r]\n/.test(text), JSON.stringify(text));
  assert.ok(text.includes('.disabled\r\n'));
  const noFinal = makeRepo();
  fs.mkdirSync(path.join(noFinal, '.pignolo'));
  fs.writeFileSync(path.join(noFinal, '.pignolo', '.gitignore'), 'a\r\nb');
  A.applyIgnores({ root: noFinal });
  assert.ok(!/[^\r]\n/.test(fs.readFileSync(path.join(noFinal, '.pignolo', '.gitignore'), 'utf8')));
});
