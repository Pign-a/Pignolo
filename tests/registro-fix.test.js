'use strict';
// Pasada de arreglos de 0.24.1 (registro de tareas y project.md ignorado): lo que la revisión pidió además de sus propios tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git, runLauncher } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const PI = require(path.join(PLUGIN_ROOT, 'lib', 'project-ignored.js'));

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const RUN = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
const PROJECT_MD = '---\ntype: code-tested\ngates:\n  on-done: npm test\n---\n';
const home = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-rf-home-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-rf-cfg-') });
const ignored = (repo, rel) => {
  try { git(['check-ignore', '-q', '--', rel], repo); return true; } catch (e) { if (e.status === 1) return false; throw e; }
};
function initCli(args, { cwd, env }) {
  const r = spawnSync(process.execPath, [INIT, ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stderr: r.stderr, json };
}
function planFile() {
  const f = path.join(makeTempDir('pignolo-rf-plan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify({ v: 1, approved: ['ignores'], answers: {}, proposal: {} }));
  return f;
}
function planProject() {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
}

// ---- RG-01 ----
test('RG-01: tasks set refuses an id run.js task could not register, naming the id and the allowed form', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'p1', request: 'x' }).ok, true);
  for (const bad of ['T1.1', 'T_02', 'tarea 3', '-T1', 'a'.repeat(65)]) {
    const r = ps.setTasks({ main: dir, plan: 'p1', tasks: [{ id: bad }] });
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /debe cumplir/, bad);
    assert.ok(r.error.includes(JSON.stringify(bad.slice(0, 80))), `el mensaje nombra el id: ${r.error}`);
  }
  assert.equal(ps.setTasks({ main: dir, plan: 'p1', tasks: [{ id: 'a'.repeat(64) }] }).ok, true);
});

test('RG-01: tasks set refuses ids that differ only by case', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'p1', request: 'x' }).ok, true);
  const r = ps.setTasks({ main: dir, plan: 'p1', tasks: [{ id: 'T01' }, { id: 't01' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /repetido/);
});

test('RG-01: a plan already stored with ids run.js task cannot register says to re-register the tasks', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'project.md'], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const wt = path.join(makeTempDir('pignolo-rf-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tb', wt], repo);
  assert.equal(ps.newPlan({ main: repo, plan: 'p1', request: 'x' }).ok, true);
  ps.update({ main: repo, plan: 'p1' }, (p) => { p.tasks = [{ id: 'T1.1', added: [] }, { id: 'T03', added: [] }]; return null; });
  const go = (args) => spawnSync(process.execPath, [RUN, ...args], { cwd: repo, encoding: 'utf8', timeout: 20000 });
  assert.equal(go(['start', '--flow', 'plan', '--plan', 'p1']).status, 0);
  const r = go(['task', '--id', 'T02', '--worktree', wt, '--base', base]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Volvé a registrar las tareas con plan\.js tasks set/);
  assert.match(r.stderr, /"T1\.1"/);
  assert.equal(go(['task', '--id', 'T03', '--worktree', wt, '--base', base]).status, 0, 'un id válido del plan sigue registrándose');
});

// ---- RG-02 ----
test('RG-02: a title loaded by hand for the SAME plan is kept only while the plan gives none', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'mi-plan', request: 'x' }).ok, true);
  assert.equal(ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T01' }, { id: 'T02', title: 'Del plan' }] }).ok, true);
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.stage = 'executing'; return null; });
  panel.refresh(dir);
  panel.evidence(dir, { card: 'T01', title: 'A mano' });
  panel.evidence(dir, { card: 'T02', title: 'A mano 2' });
  const s = panel.refresh(dir);
  assert.deepEqual(s.cards.map((c) => [c.id, c.title]), [['T01', 'A mano'], ['T02', 'Del plan']]);
});

test('RG-02: a hand-loaded title of a card of another plan does not reach the same-named card of a new plan', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'plan-a', request: 'x' }).ok, true);
  assert.equal(ps.setTasks({ main: dir, plan: 'plan-a', tasks: [{ id: 'T01' }] }).ok, true);
  ps.update({ main: dir, plan: 'plan-a' }, (p) => { p.stage = 'executing'; return null; });
  panel.refresh(dir);
  panel.evidence(dir, { card: 'T01', title: 'A mano del plan A' });
  assert.equal(panel.refresh(dir).cards[0].title, 'A mano del plan A');
  ps.update({ main: dir, plan: 'plan-a' }, (p) => { p.stage = 'closed'; return null; });
  assert.equal(ps.newPlan({ main: dir, plan: 'plan-b', request: 'y' }).ok, true);
  assert.equal(ps.setTasks({ main: dir, plan: 'plan-b', tasks: [{ id: 'T01' }] }).ok, true);
  ps.update({ main: dir, plan: 'plan-b' }, (p) => { p.stage = 'executing'; return null; });
  assert.deepEqual(panel.refresh(dir).cards.map((c) => [c.id, c.plan, c.title]), [['T01', 'plan-b', '']]);
});

// ---- RG-03 ----
test('RG-03: a daily run task with the exact id of a plan card does not mark it either', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'mi-plan', request: 'x' }).ok, true);
  assert.equal(ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T01' }] }).ok, true);
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.stage = 'executing'; return null; });
  fs.writeFileSync(path.join(dir, '.pignolo', 'run.json'), JSON.stringify({
    v: 2, flow: 'daily', started: '2026-10-03T10:00:00Z', expires: '2099-01-01T00:00:00Z',
    tasks: { T01: { id: 'T01', worktree: path.join(dir, 'wt'), base: 'a'.repeat(40), files: [], agents: [] } },
  }));
  assert.deepEqual(panel.refresh(dir).cards.filter((c) => c.plan === 'mi-plan').map((c) => [c.id, c.status]), [['T01', 'todo']]);
});

// ---- RG-04 y reglas que no se reescriben ----
const apply = (repo, env) => PI.applyFix({ main: repo, env: env || { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-rf-home-') } });

test('RG-04: four copies of the rule (more passes than one) are all fixed and the other lines stay as they were', () => {
  const repo = makeRepo();
  const text = '.pignolo/\nnode_modules/\n.pignolo/\n*.log\n/.pignolo\n.pignolo/\n';
  fs.writeFileSync(path.join(repo, '.gitignore'), text);
  const r = apply(repo);
  assert.equal(r.status, 'done', JSON.stringify(r));
  assert.ok(r.passes >= 4, `pasadas: ${r.passes}`);
  assert.equal(ignored(repo, '.pignolo/project.md'), false);
  assert.equal(ignored(repo, '.pignolo/run.json'), true);
  const lines = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8').split('\n');
  assert.ok(lines.includes('node_modules/') && lines.includes('*.log'));
  assert.equal(apply(repo).status, 'none');
});

for (const rule of ['**/.pignolo/', '.*', '*', '.PIGNOLO/']) {
  test(`rule that init does not rewrite (${rule}): file untouched, the step reports it not done and the human gets ONE line with file and line`, () => {
    // En un FS que no distingue mayúsculas `.PIGNOLO/` ignora igual la carpeta; si no, el caso no aplica.
    const repo = makeRepo();
    const text = `node_modules/\n${rule}\n`;
    fs.writeFileSync(path.join(repo, '.gitignore'), text);
    if (!ignored(repo, '.pignolo/project.md')) return;
    const before = fs.readFileSync(path.join(repo, '.gitignore'));
    const a = initCli(['apply', '--plan', planFile(), '--cwd', repo], { cwd: repo, env: home() });
    assert.equal(a.status, 0, a.stderr);
    const step = a.json.steps.find((s) => s.id === 'ignores');
    assert.equal(step.projectMdIgnored.status, 'refused');
    assert.equal(step.projectMdIgnored.reason, 'manual-rule');
    assert.deepEqual(fs.readFileSync(path.join(repo, '.gitignore')), before, 'el archivo queda idéntico');
    const mine = a.json.notes.filter((n) => /git ignora \.pignolo\/project\.md/.test(n));
    assert.equal(mine.length, 1, JSON.stringify(a.json.notes));
    assert.ok(mine[0].includes('.gitignore:2'), mine[0]);
    assert.ok(mine[0].includes(rule), mine[0]);
    assert.match(mine[0], /cambiala a mano/);
    assert.ok(!mine[0].includes('\n'));
  });
}

test('a rule in another file is not rewritten: external, one line naming the file', () => {
  const repo = makeRepo();
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.pignolo/\n');
  const a = initCli(['apply', '--plan', planFile(), '--cwd', repo], { cwd: repo, env: home() });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.json.steps.find((s) => s.id === 'ignores').projectMdIgnored.status, 'external');
  assert.equal(a.json.notes.filter((n) => /git ignora \.pignolo\/project\.md/.test(n)).length, 1);
});

// ---- RG-05 ----
test('RG-05: a BOM on the first line of .gitignore survives the rewrite', () => {
  const repo = makeRepo();
  const bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('.pignolo/\r\n*.log\r\n')]);
  fs.writeFileSync(path.join(repo, '.gitignore'), bytes);
  const r = apply(repo);
  assert.equal(r.status, 'done', JSON.stringify(r));
  const after = fs.readFileSync(path.join(repo, '.gitignore'));
  assert.deepEqual([...after.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.equal(after.subarray(3).toString('utf8').split('\r\n').includes('*.log'), true);
  assert.equal(ignored(repo, '.pignolo/project.md'), false);
});

// ---- aviso de SessionStart ----
function ignoredRepo() {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), '.pignolo/\n');
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  return repo;
}
const msgOf = (repo, source, env = {}) => {
  const r = runLauncher('session-start', { source, cwd: repo }, { PIGNOLO_HOME: makeTempDir('pignolo-rf-ss-'), ...env });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  return j.systemMessage || '';
};
const NOTICE = /git ignora \.pignolo\/project\.md/;

test('SessionStart: the ignored-project.md line prints on a real start', () => {
  assert.match(msgOf(ignoredRepo(), 'startup'), NOTICE);
});
for (const source of ['compact', 'clear', 'resume']) {
  test(`SessionStart: the ignored-project.md line does not print on ${source}`, () => {
    assert.doesNotMatch(msgOf(ignoredRepo(), source), NOTICE);
  });
}
test('SessionStart: the ignored-project.md line does not print when pignolo is switched off', () => {
  const repo = ignoredRepo();
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), 'x\n');
  assert.doesNotMatch(msgOf(repo, 'startup'), NOTICE);
});

// ---- verify lista el .gitignore ----
test('verify lists the modified root .gitignore among the files to commit after init fixed the rule', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n.pignolo/\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'gi'], repo);
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), PROJECT_MD);
  const env = home();
  assert.equal(initCli(['apply', '--plan', planFile(), '--cwd', repo], { cwd: repo, env }).status, 0);
  const v = initCli(['verify', '--cwd', repo], { cwd: repo, env });
  assert.equal(v.status, 0, v.stderr);
  assert.ok(v.json.nextCommit.files.includes('.gitignore'), JSON.stringify(v.json.nextCommit));
  assert.ok(v.json.nextCommit.files.includes('.pignolo/project.md'), JSON.stringify(v.json.nextCommit));
});

// ---- cleanTitle ----
test('cleanTitle: no split surrogate pair and no bidi or zero-width characters', () => {
  const dir = planProject();
  assert.equal(ps.newPlan({ main: dir, plan: 'p1', request: 'x' }).ok, true);
  const long = `${'a'.repeat(118)}\u{1F600}\u{1F600}`; // el corte (119 unidades) caería dentro del par
  assert.equal(ps.setTasks({ main: dir, plan: 'p1', tasks: [{ id: 'T01', title: long }, { id: 'T02', title: 'a‮b​c﻿d⁦e' }] }).ok, true);
  const t = ps.readPlan({ main: dir, plan: 'p1' }).plan.tasks;
  assert.doesNotMatch(t[0].title, /[\ud800-\udbff](?![\udc00-\udfff])/);
  assert.ok(t[0].title.endsWith('…') && t[0].title.length <= 120);
  assert.equal(t[1].title, 'abcde');
});

// ---- el archivo no queda a medias ----
test('a pass whose check fails (git unreadable after the write) leaves the .gitignore exactly as it was and is not reported as done', () => {
  const { gitRun } = require(path.join(PLUGIN_ROOT, 'lib', 'git.js'));
  const repo = makeRepo();
  const gi = path.join(repo, '.gitignore');
  fs.writeFileSync(gi, '.pignolo/\nx\n.pignolo/\n');
  const original = fs.readFileSync(gi);
  let checks = 0;
  const run = (a, c) => { if (a[0] === 'check-ignore' && ++checks >= 3) throw new Error('boom'); return gitRun(a, c, { timeout: 3000 }); };
  const r = PI.applyFix({ main: repo, run, env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-rf-home-') } });
  assert.equal(r.status, 'refused', JSON.stringify(r));
  assert.equal(r.reason, 'unverified');
  assert.deepEqual(fs.readFileSync(gi), original);
});
