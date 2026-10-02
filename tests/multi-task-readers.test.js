'use strict';
// I6 (fix pass 7a): con un run.json v2 de DOS tareas, los lectores que aún miraban `run.task` (alias de una sola tarea)
// se quedaban mudos o caían a otra cosa. Cubren subagent-start (la tarjeta), next (task-in-progress / flow-expired-task)
// y la línea "Flujo en curso" del contexto caliente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const handler = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'subagent-start.js'));
const { deriveNext } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));
const cb = require(path.join(PLUGIN_ROOT, 'lib', 'context-budget.js'));
const { readRun } = require(path.join(PLUGIN_ROOT, 'lib', 'project.js'));

const IMPL = 'pignolo:implementer';
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };

function twoTasks({ expires = '2026-09-30T13:00:00.000Z', ids = ['a', 'b'] } = {}) {
  const repo = makeRepo();
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  const tasks = {};
  for (const id of ids) {
    const wt = path.join(makeTempDir('pignolo-wt-'), `task-${id}`);
    fs.mkdirSync(wt);
    tasks[id] = { id, worktree: wt, base: 'a'.repeat(40), files: [], agents: [IMPL] };
    write(repo, `.pignolo/tmp/task-${id}.md`, `# Task-card ${id}\n\n- Goal: objetivo de ${id}\n`);
  }
  write(repo, '.pignolo/run.json', JSON.stringify({ v: 2, flow: 'plan', plan: 'p', started: '2026-09-30T11:00:00.000Z', expires, tasks }));
  return { repo, tasks };
}

test('subagent-start con dos tareas del mismo agente: lista el id y el worktree de cada una y recuerda la línea Task: <id>', () => {
  const { repo, tasks } = twoTasks({ expires: new Date(Date.now() + 3600e3).toISOString() });
  const r = handler.run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: IMPL, cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '' } });
  assert.strictEqual(r.exit, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  for (const t of Object.values(tasks)) {
    assert.ok(ctx.includes(`Worktree: ${t.worktree}`), `falta el worktree de ${t.id}`);
    assert.ok(ctx.includes(`task-${t.id}.md`), `falta la tarjeta de ${t.id}`);
  }
  assert.match(ctx, /Task: <id>/);
});

test('subagent-start: un agente que no figura en ninguna tarea sigue recibiendo solo core.md', () => {
  const { repo } = twoTasks({ expires: new Date(Date.now() + 3600e3).toISOString() });
  const r = handler.run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'pignolo:explorer', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '' } });
  assert.ok(!/Worktree:/.test(JSON.parse(r.stdout).hookSpecificOutput.additionalContext));
});

test('next con dos tareas sin aceptar: task-in-progress nombra las dos; vencido, flow-expired-task las nombra', () => {
  const { repo } = twoTasks();
  const live = deriveNext({ cwd: repo, env: { ...process.env, PIGNOLO_HOME: makeTempDir() }, now: NOW });
  assert.strictEqual(live.kind, 'task-in-progress', live.text);
  assert.match(live.text, /\ba\b/);
  assert.match(live.text, /\bb\b/);
  const exp = twoTasks({ expires: '2026-09-30T11:30:00.000Z' });
  const dead = deriveNext({ cwd: exp.repo, env: { ...process.env, PIGNOLO_HOME: makeTempDir() }, now: NOW });
  assert.strictEqual(dead.kind, 'flow-expired-task', dead.text);
  assert.match(dead.text, /\ba\b/);
  assert.match(dead.text, /\bb\b/);
});

test('la línea "Flujo en curso" del contexto caliente nombra todas las tareas', () => {
  const { repo } = twoTasks({ expires: new Date(Date.now() + 3600e3).toISOString() });
  const r = readRun(repo);
  const { taskList } = require(path.join(PLUGIN_ROOT, 'lib', 'project.js'));
  const flow = { flow: r.run.flow, tasks: taskList(r.run) };
  const out = cb.buildHot({ branch: 'main', nextText: '', flow, entries: [] });
  assert.match(out.text, /Flujo en curso: plan, tareas a, b/);
});

test('session-start toma las tareas con taskList (no run.task)', () => {
  const src = fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'session-start.js'), 'utf8');
  assert.ok(!/r\.run\.task\b/.test(src), 'sigue leyendo run.task');
});
