'use strict';
// Ciclo de vida de .pignolo/run.json (scripts/run.js) y ensureIgnored.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const { validateRun } = require('../plugins/pignolo/lib/project');
const { writeCounter, readCounter, counterPath } = require('../plugins/pignolo/lib/handback-counter');
const { ensureIgnored } = require('../plugins/pignolo/lib/pignolo-gitignore');

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const run = (cwd, args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
};
const runFile = (repo) => path.join(repo, '.pignolo', 'run.json');
const readRunFile = (repo) => JSON.parse(fs.readFileSync(runFile(repo), 'utf8'));

function commitProjectMd(repo, gates = 'gates:\n  on-done: npm test\n') {
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), `---\ntype: code-tested\n${gates}---\n`);
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'project.md'], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

function addWorktree(repo, name = 'wt') {
  const dir = path.join(makeTempDir('pignolo-wt-'), name);
  git(['worktree', 'add', '-q', '-b', `t-${name}-${Date.now()}`, dir], repo);
  return dir;
}

test('ensureIgnored creates the file, appends only missing lines and never duplicates', () => {
  const root = makeTempDir();
  ensureIgnored(root, ['run.json', '.disabled']);
  const gi = path.join(root, '.pignolo', '.gitignore');
  assert.strictEqual(fs.readFileSync(gi, 'utf8'), 'run.json\n.disabled\n');
  ensureIgnored(root, ['run.json', '.disabled']);
  assert.strictEqual(fs.readFileSync(gi, 'utf8'), 'run.json\n.disabled\n');
  const other = makeTempDir();
  fs.mkdirSync(path.join(other, '.pignolo'));
  fs.writeFileSync(path.join(other, '.pignolo', '.gitignore'), 'foo');
  ensureIgnored(other, ['run.json', '.disabled']);
  assert.strictEqual(fs.readFileSync(path.join(other, '.pignolo', '.gitignore'), 'utf8'), 'foo\nrun.json\n.disabled\n');
});

test('start writes a valid run.json and the gitignore, which hides it from git', () => {
  const repo = makeRepo();
  const r = run(repo, ['start', '--flow', 'daily']);
  assert.strictEqual(r.status, 0, r.stderr);
  const obj = readRunFile(repo);
  assert.deepStrictEqual(validateRun(obj), []);
  assert.strictEqual(obj.flow, 'daily');
  assert.strictEqual(obj.v, 2, 'start escribe siempre v2 (D-7-2, R-2)');
  assert.deepStrictEqual(obj.tasks, {});
  assert.ok(Date.parse(obj.expires) > Date.now());
  assert.strictEqual(fs.readFileSync(path.join(repo, '.pignolo', '.gitignore'), 'utf8'), '.gitignore\nrun.json\n.disabled\ntmp/\nworktrees/\n');
  assert.strictEqual(git(['status', '--porcelain'], repo).split('\n').filter((l) => l.includes('run.json')).length, 0);
});

test('start with a gitignore that already has lines keeps them', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', '.gitignore'), 'foo\n');
  run(repo, ['start', '--flow', 'plan', '--plan', 'p1']);
  run(repo, ['start', '--flow', 'plan', '--plan', 'p1', '--replace']);
  assert.strictEqual(fs.readFileSync(path.join(repo, '.pignolo', '.gitignore'), 'utf8'), 'foo\n.gitignore\nrun.json\n.disabled\ntmp/\nworktrees/\n');
});

test('start: a live flow needs --replace; an unreadable one names the path', () => {
  const repo = makeRepo();
  assert.strictEqual(run(repo, ['start', '--flow', 'daily']).status, 0);
  const again = run(repo, ['start', '--flow', 'review']);
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /ya hay un flujo en curso \(daily\)/);
  const rep = run(repo, ['start', '--flow', 'review', '--replace']);
  assert.strictEqual(rep.status, 0, rep.stderr);
  assert.strictEqual(readRunFile(repo).flow, 'review');

  fs.writeFileSync(runFile(repo), '{no es json');
  const bad = run(repo, ['start', '--flow', 'daily']);
  assert.strictEqual(bad.status, 1);
  assert.ok(bad.stderr.includes(runFile(repo)), bad.stderr);
  assert.match(bad.stderr, /--replace/);
  assert.strictEqual(run(repo, ['start', '--flow', 'daily', '--replace']).status, 0);
});

test('start: an expired flow is overwritten without --replace; bad usage is exit 2', () => {
  const repo = makeRepo();
  run(repo, ['start', '--flow', 'daily']);
  const o = readRunFile(repo);
  fs.writeFileSync(runFile(repo), JSON.stringify({ ...o, expires: new Date(Date.now() - 1000).toISOString() }));
  assert.strictEqual(run(repo, ['start', '--flow', 'review']).status, 0);
  assert.strictEqual(run(repo, ['start', '--flow', 'nada']).status, 2);
  assert.strictEqual(run(repo, ['bogus']).status, 2);
});

test('task: registers an absolute worktree from a real worktree', () => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  run(repo, ['start', '--flow', 'daily']);
  const r = run(repo, ['task', '--id', 'uno', '--worktree', wt, '--base', base, '--file', 'src/a.js', '--file', 'src/b.js', '--agent', 'pignolo:implementer']);
  assert.strictEqual(r.status, 0, r.stderr);
  const obj = readRunFile(repo);
  assert.deepStrictEqual(validateRun(obj), []);
  assert.strictEqual(obj.v, 2);
  const t = obj.tasks.uno;
  assert.ok(path.isAbsolute(t.worktree));
  assert.strictEqual(t.base, base);
  assert.deepStrictEqual(t.files, ['src/a.js', 'src/b.js']);
  assert.deepStrictEqual(t.agents, ['pignolo:implementer']);
  // Desde la worktree se resuelve el mismo run.json del principal.
  assert.strictEqual(run(wt, ['status']).out.run.task.id, 'uno');
});

test('task: rejections', async (t) => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  run(repo, ['start', '--flow', 'daily']);
  const other = makeRepo();
  const cases = [
    ['base that is not an ancestor', ['task', '--id', 'x', '--worktree', wt, '--base', (() => {
      git(['checkout', '-q', '--detach'], wt); fs.writeFileSync(path.join(wt, 'n.txt'), 'n'); git(['add', 'n.txt'], wt);
      git(['commit', '-q', '-m', 'adelante'], wt); const s = git(['rev-parse', 'HEAD'], wt); git(['reset', '-q', '--hard', base], wt); return s;
    })()], 1],
    ['invalid id', ['task', '--id', 'Bad_Id', '--worktree', wt, '--base', base], 2],
    ['worktree from another repo', ['task', '--id', 'x', '--worktree', other, '--base', base], 1],
    ['new id without worktree', ['task', '--id', 'nuevo', '--base', base], 2],
    ['missing worktree path', ['task', '--id', 'x', '--worktree', path.join(wt, 'nope'), '--base', base], 1],
  ];
  for (const [name, args, code] of cases) {
    await t.test(name, () => {
      const r = run(repo, args);
      assert.strictEqual(r.status, code, r.stderr);
    });
  }
});

test('task: a base without committed project.md or without gates.on-done is refused', () => {
  const repo = makeRepo();
  const bare = git(['rev-parse', 'HEAD'], repo);
  const wt = addWorktree(repo);
  // project.md solo en la copia de trabajo del principal: no está en la base.
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n');
  run(repo, ['start', '--flow', 'daily']);
  const a = run(repo, ['task', '--id', 'x', '--worktree', wt, '--base', bare]);
  assert.strictEqual(a.status, 1);
  assert.match(a.stderr, /no tiene \.pignolo\/project\.md commiteado con gates\.on-done/);

  const noGate = commitProjectMd(repo, 'gates:\n  on-edit: echo ok\n');
  const wt2 = addWorktree(repo, 'wt2');
  const b = run(repo, ['task', '--id', 'x', '--worktree', wt2, '--base', noGate]);
  assert.strictEqual(b.status, 1);
  assert.match(b.stderr, /gates\.on-done/);
});

test('task: same id updates (keeps base, adds testRef, replaces lists) and clears the counter', () => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  run(repo, ['start', '--flow', 'daily']);
  assert.strictEqual(run(repo, ['task', '--id', 'x', '--worktree', wt, '--base', base, '--file', 'tests/a.test.js', '--agent', 'pignolo:test-writer']).status, 0);
  fs.writeFileSync(path.join(wt, 'tests-a.txt'), 't');
  git(['add', 'tests-a.txt'], wt);
  git(['commit', '-q', '-m', 'tests'], wt);
  const T = git(['rev-parse', 'HEAD'], wt);
  writeCounter(process.env, repo, 'x', { count: 3, accepted: false, acceptedAgentId: null, blocked: false, lastReason: 'r', stopHookActive: [] });
  assert.ok(fs.existsSync(counterPath(process.env, repo, 'x')));
  const r = run(repo, ['task', '--id', 'x', '--test-ref', T, '--file', 'src/a.js', '--agent', 'pignolo:implementer']);
  assert.strictEqual(r.status, 0, r.stderr);
  const t = readRunFile(repo).tasks.x;
  assert.strictEqual(t.base, base);
  assert.strictEqual(t.testRef, T);
  assert.deepStrictEqual(t.files, ['src/a.js']);
  assert.deepStrictEqual(t.agents, ['pignolo:implementer']);
  assert.strictEqual(readCounter(process.env, repo, 'x').count, 0);
  assert.ok(!fs.existsSync(counterPath(process.env, repo, 'x')));
});

test('task --test-authorization is recorded and valid', () => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  run(repo, ['start', '--flow', 'daily']);
  assert.strictEqual(run(repo, ['task', '--id', 'x', '--worktree', wt, '--base', base, '--test-authorization']).status, 0);
  const obj = readRunFile(repo);
  assert.strictEqual(obj.tasks.x.testAuthorization, true);
  assert.deepStrictEqual(validateRun(obj), []);
});

test('renew moves expires forward; end removes run.json and the counter, and is idempotent', () => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  assert.strictEqual(run(repo, ['renew']).status, 1);
  run(repo, ['start', '--flow', 'daily', '--ttl-min', '1']);
  const before = Date.parse(readRunFile(repo).expires);
  assert.strictEqual(run(repo, ['renew', '--ttl-min', '60']).status, 0);
  assert.ok(Date.parse(readRunFile(repo).expires) > before + 30 * 60000);
  run(repo, ['task', '--id', 'x', '--worktree', wt, '--base', base]);
  writeCounter(process.env, repo, 'x', { count: 2, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] });
  const st = run(repo, ['status']);
  assert.strictEqual(st.out.running, true);
  assert.strictEqual(st.out.handback.count, 2);
  assert.strictEqual(run(repo, ['end']).status, 0);
  assert.ok(!fs.existsSync(runFile(repo)));
  assert.ok(!fs.existsSync(counterPath(process.env, repo, 'x')));
  assert.strictEqual(run(repo, ['end']).status, 0);
  const none = run(repo, ['status']).out;
  assert.deepStrictEqual([none.running, none.run, none.handback], [false, null, null]);
});

test('I1: the _malformed counter shows in status and start, task and end clear it', () => {
  const repo = makeRepo();
  const base = commitProjectMd(repo);
  const wt = addWorktree(repo);
  const bump = () => writeCounter(process.env, repo, '_malformed', { count: 3, accepted: false, acceptedAgentId: null, blocked: false, lastReason: 'x', stopHookActive: [] });
  const gone = () => !fs.existsSync(counterPath(process.env, repo, '_malformed'));
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(runFile(repo), '{roto');
  bump();
  const st = run(repo, ['status']).out;
  assert.strictEqual(st.malformed, true);
  assert.strictEqual(st.malformedHandback.count, 3);
  assert.strictEqual(run(repo, ['start', '--flow', 'daily', '--replace']).status, 0);
  assert.ok(gone(), 'start');
  bump();
  assert.strictEqual(run(repo, ['task', '--id', 'x', '--worktree', wt, '--base', base]).status, 0);
  assert.ok(gone(), 'task');
  bump();
  assert.strictEqual(run(repo, ['end']).status, 0);
  assert.ok(gone(), 'end');
});

test('start --flow plan needs a valid --plan slug and records it in run.json', () => {
  const repo = makeRepo();
  assert.strictEqual(run(repo, ['start', '--flow', 'plan']).status, 2, 'plan flow without --plan');
  assert.strictEqual(run(repo, ['start', '--flow', 'plan', '--plan', 'A b']).status, 2, 'bad slug');
  assert.strictEqual(run(repo, ['start', '--flow', 'daily', '--plan', 'p1']).status, 2, '--plan only with the plan flow');
  assert.ok(!fs.existsSync(runFile(repo)), 'nothing written on usage errors');
  const r = run(repo, ['start', '--flow', 'plan', '--plan', 'p1']);
  assert.strictEqual(r.status, 0, r.stderr);
  const obj = readRunFile(repo);
  assert.strictEqual(obj.plan, 'p1');
  assert.deepStrictEqual(validateRun(obj), []);
  assert.strictEqual(run(repo, ['status']).out.run.plan, 'p1');
});

test('validateRun: plan is optional and must be a slug; a run.json from before stays valid', () => {
  const base = { v: 1, flow: 'plan', started: '2026-09-30T10:00:00.000Z', expires: '2026-09-30T12:00:00.000Z' };
  assert.deepStrictEqual(validateRun(base), []);
  assert.deepStrictEqual(validateRun({ ...base, plan: 'p-1' }), []);
  assert.ok(validateRun({ ...base, plan: 'A b' }).length > 0);
  assert.ok(validateRun({ ...base, plan: 7 }).length > 0);
});
