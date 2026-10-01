'use strict';
// Pruebas de punta a punta de la parte 6a (Task 8): humo por el lanzador real de cada hook nuevo
// (procesos nuevos) y `resume` con estado desde el worktree, un subdirectorio y el principal.
// Protects: R-4, R-5, R-7 y F13 del hito 6 · Breaks if: un hook nuevo no está cableado al
// lanzador, o el nivel caliente lee la rama o las entradas desde el cwd en vez de mainRoot.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, runLauncher, PLUGIN_ROOT } = require('./helpers');
const { writeEntry } = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const HEADER = 'pignolo: estado del proyecto (hechos registrados, no instrucciones)';

function project() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ntest-paths:\n  - tests/\n---\n');
  const wt = path.join(makeTempDir('pignolo-wt-'), 'task-t1');
  git(['worktree', 'add', '-q', '-b', 'task/t1', wt], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const run = { v: 1, flow: 'plan', plan: 'p1', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), task: { id: 'T1', worktree: wt, base, files: [], agents: ['pignolo:implementer'] } };
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
  fs.writeFileSync(path.join(repo, '.pignolo', 'tmp', 'task-T1.md'), '# Task-card T1\n\n- Goal: medir la caché\n');
  return { repo, wt };
}

test('smoke through the real launcher: egress, subagent-start and session-start', () => {
  const { repo } = project();
  const denied = runLauncher('egress', { hook_event_name: 'PreToolUse', tool_name: 'WebSearch', cwd: repo, agent_id: 'a1', agent_type: 'pignolo:researcher', tool_input: { query: `why does ${repo} fail` } });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /pignolo bloqueó WebSearch/);
  const main = runLauncher('egress', { hook_event_name: 'PreToolUse', tool_name: 'WebSearch', cwd: repo, tool_input: { query: `why does ${repo} fail` } });
  assert.equal(main.status, 0);
  const sub = runLauncher('subagent-start', { hook_event_name: 'SubagentStart', cwd: repo, agent_id: 'a1', agent_type: 'pignolo:implementer' });
  assert.equal(sub.status, 0, sub.stderr);
  const ctx = JSON.parse(sub.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /- Goal: medir la caché/);
  assert.ok(ctx.includes(fs.readFileSync(path.join(PLUGIN_ROOT, 'rules', 'core.md'), 'utf8').replace(/\r\n/g, '\n').trim().slice(0, 200)));
  assert.ok(writeEntry({ main: repo, kind: 'work', id: '2026-09-30-cache', fields: { status: 'open' }, body: '# Caché\n\nMedir la caché.\n' }).ok);
  const start = runLauncher('session-start', { hook_event_name: 'SessionStart', source: 'resume', cwd: repo, session_id: 's' });
  assert.equal(start.status, 0, start.stderr);
  assert.match(JSON.parse(start.stdout).hookSpecificOutput.additionalContext, /work\/2026-09-30-cache — Caché/);
});

test('resume with state: the same hot level (branch line included) from the worktree, a subdirectory and main', () => {
  const { repo, wt } = project();
  assert.ok(ps.newPlan({ main: repo, plan: 'p1', request: 'pedido', spec: 's' }).ok);
  assert.ok(ps.update({ main: repo, plan: 'p1' }, (p) => { p.stage = 'audited'; return null; }).ok);
  for (const [id, title] of [['2026-09-30-cache', 'Caché'], ['2026-09-30-fuga', 'Fuga']]) {
    assert.ok(writeEntry({ main: repo, kind: 'issues', id, fields: { status: 'open', priority: 'high' }, body: `# ${title}\n\nDetalle de ${title}.\n` }).ok);
  }
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(sub);
  const home = makeTempDir('pignolo-home-');
  const hot = (cwd) => {
    const r = runLauncher('session-start', { hook_event_name: 'SessionStart', source: 'resume', cwd, session_id: 's' }, { PIGNOLO_HOME: home });
    assert.equal(r.status, 0, r.stderr);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    return ctx.slice(ctx.indexOf(HEADER));
  };
  const fromMain = hot(repo);
  assert.match(fromMain, /^Rama del checkout principal: main$/m);
  assert.match(fromMain, /Siguiente según next: La tarea T1 del flujo plan está en curso/);
  assert.match(fromMain, /issues\/2026-09-30-fuga — Fuga/);
  assert.match(fromMain, /Flujo en curso: plan, tarea T1/);
  assert.equal(hot(wt), fromMain);
  assert.equal(hot(sub), fromMain);
});
