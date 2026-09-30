'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir } = require('./helpers');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const { holdoutDir, privateRoots, PLAN_RE } = require(path.join(PLUGIN, 'lib', 'holdout.js'));
const CLI = path.join(PLUGIN, 'scripts', 'holdout.js');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, rel, text) => {
  const f = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

// Cada caso con su almacén y su carpeta temporal propios (TMP/TEMP/TMPDIR del script).
function envFor() {
  const tmp = makeTempDir('pignolo-holdout-tmp-');
  return { ...process.env, PIGNOLO_HOME: path.join(makeTempDir('pignolo-holdout-home-'), '.pignolo'), TMP: tmp, TEMP: tmp, TMPDIR: tmp };
}
function cli(cwd, env, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch (_) { /* sin JSON */ }
  return { status: r.status, out, stderr: r.stderr };
}

// Repo con project.md: on-done corre acc/check.js (lo trae el holdout); deps-install opcional.
function setup({ deps } = {}) {
  const cwd = makeRepo();
  write(cwd, 'deps.js', `process.exit(${deps === 'fail' ? 1 : 0});\n`);
  const extra = deps ? 'deps-install: "node deps.js"\n' : '';
  write(cwd, '.pignolo/project.md', `---\ntype: code-tested\ngates:\n  on-done: "node acc/check.js"\n${extra}---\n# proyecto\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'proyecto');
  return cwd;
}
function stage(cwd, plan, files) {
  for (const [rel, text] of Object.entries(files)) write(cwd, path.join('.pignolo', 'tmp', 'holdout', plan, rel), text);
  return path.join('.pignolo', 'tmp', 'holdout', plan);
}

test('holdoutDir and privateRoots live under pignoloHome, outside the repo', () => {
  const cwd = makeRepo();
  const env = { PIGNOLO_HOME: path.join(makeTempDir(), '.pignolo') };
  const d = holdoutDir({ env, cwd, plan: 'p1' });
  assert.equal(path.dirname(path.dirname(d)), path.join(env.PIGNOLO_HOME, 'holdout'));
  assert.equal(path.basename(d), 'p1');
  assert.deepEqual(privateRoots(env), [path.join(env.PIGNOLO_HOME, 'holdout'), path.join(env.PIGNOLO_HOME, 'seals')]);
  assert.ok(PLAN_RE.test('p1') && !PLAN_RE.test('../x') && !PLAN_RE.test('-x'));
  assert.throws(() => holdoutDir({ env, cwd, plan: '../x' }));
});

test('save moves the staged files into the store and deletes the source', () => {
  const cwd = setup();
  const env = envFor();
  const from = stage(cwd, 'p1', { 'tests/acc.test.js': 'uno\n' });
  const r = cli(cwd, env, 'save', '--plan', 'p1', '--from', from);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.out, { plan: 'p1', files: ['tests/acc.test.js'] });
  assert.equal(fs.readFileSync(path.join(holdoutDir({ env, cwd, plan: 'p1' }), 'tests', 'acc.test.js'), 'utf8'), 'uno\n');
  assert.ok(!fs.existsSync(path.join(cwd, from)));
  const l = cli(cwd, env, 'list', '--plan', 'p1');
  assert.equal(l.status, 0, l.stderr);
  assert.deepEqual(l.out, { plan: 'p1', count: 1 });
});

test('save rejects a source outside .pignolo/tmp/holdout, an invalid plan and a conflicting file', async (t) => {
  const cwd = setup();
  const env = envFor();
  await t.test('--from outside .pignolo/tmp/holdout', () => {
    write(cwd, 'otro/tests/acc.test.js', 'x\n');
    const r = cli(cwd, env, 'save', '--plan', 'p1', '--from', 'otro');
    assert.equal(r.status, 2, r.stderr);
    assert.ok(fs.existsSync(path.join(cwd, 'otro', 'tests', 'acc.test.js')));
  });
  await t.test('plan ../x', () => {
    const from = stage(cwd, 'p2', { 'a.test.js': 'x\n' });
    assert.equal(cli(cwd, env, 'save', '--plan', '../x', '--from', from).status, 2);
  });
  await t.test('second save with other content keeps the first', () => {
    assert.equal(cli(cwd, env, 'save', '--plan', 'p3', '--from', stage(cwd, 'p3', { 'a.test.js': 'primero\n' })).status, 0);
    const r = cli(cwd, env, 'save', '--plan', 'p3', '--from', stage(cwd, 'p3', { 'a.test.js': 'segundo\n' }));
    assert.equal(r.status, 2, r.stderr);
    assert.equal(fs.readFileSync(path.join(holdoutDir({ env, cwd, plan: 'p3' }), 'a.test.js'), 'utf8'), 'primero\n');
  });
});

function assertNoLeftovers(cwd, env) {
  assert.equal(git(cwd, 'worktree', 'list').split('\n').filter(Boolean).length, 1);
  assert.deepEqual(fs.readdirSync(env.TMP), []);
}

test('run passes a holdout that passes against HEAD and leaves no worktree or temp dir', () => {
  const cwd = setup();
  const env = envFor();
  assert.equal(cli(cwd, env, 'save', '--plan', 'p1', '--from', stage(cwd, 'p1', { 'acc/check.js': 'process.exit(0);\n' })).status, 0);
  const r = cli(cwd, env, 'run', '--plan', 'p1');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.pass, true);
  assert.equal(r.out.exit, 0);
  assert.equal(r.out.count, 1);
  assert.equal(r.out.ref, git(cwd, 'rev-parse', 'HEAD'));
  assertNoLeftovers(cwd, env);
});

test('run fails (exit 1) with a failing holdout, and cleans up', () => {
  const cwd = setup();
  const env = envFor();
  assert.equal(cli(cwd, env, 'save', '--plan', 'p1', '--from', stage(cwd, 'p1', { 'acc/check.js': 'console.log("holdout rojo"); process.exit(1);\n' })).status, 0);
  const r = cli(cwd, env, 'run', '--plan', 'p1');
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.out.pass, false);
  assert.match(r.out.logTail, /holdout rojo/);
  assertNoLeftovers(cwd, env);
});

test('run fails (exit 1) when deps-install fails, and cleans up', () => {
  const cwd = setup({ deps: 'fail' });
  const env = envFor();
  assert.equal(cli(cwd, env, 'save', '--plan', 'p1', '--from', stage(cwd, 'p1', { 'acc/check.js': 'process.exit(0);\n' })).status, 0);
  const r = cli(cwd, env, 'run', '--plan', 'p1');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /no se pudieron instalar las dependencias/);
  assertNoLeftovers(cwd, env);
});

test('drop deletes the store of the plan', () => {
  const cwd = setup();
  const env = envFor();
  assert.equal(cli(cwd, env, 'save', '--plan', 'p1', '--from', stage(cwd, 'p1', { 'a.test.js': 'x\n' })).status, 0);
  assert.equal(cli(cwd, env, 'drop', '--plan', 'p1').status, 0);
  assert.ok(!fs.existsSync(holdoutDir({ env, cwd, plan: 'p1' })));
});
