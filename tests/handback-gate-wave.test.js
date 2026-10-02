'use strict';
// M8 (fix pass 7a): con una ola de dos tareas, el PostToolUse del handback-gate no acusa a la tarea de OTRO escritor que sigue
// trabajando. Se resuelve la tarea por la línea `Task: <id>` del informe; sin ella, se dice el estado, no una orden.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const gate = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'handback-gate.js'));
const { writeCounter } = require(path.join(PLUGIN_ROOT, 'lib', 'handback-counter.js'));

function wave() {
  const main = makeRepo();
  fs.mkdirSync(path.join(main, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(main, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  const tasks = {};
  for (const id of ['a', 'b']) tasks[id] = { id, worktree: main, base: 'a'.repeat(40), files: ['x.js'], agents: ['pignolo:implementer'] };
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify({ v: 2, flow: 'plan', plan: 'p', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), tasks }));
  const env = { PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  const counter = (id, over) => writeCounter(env, main, id, { count: 0, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [], ...over });
  const post = (response) => gate.run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, tool_response: response, cwd: main }, { env });
  return { counter, post };
}
const ctxOf = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '');

test('M8: vuelve el escritor de a (aceptado) mientras b sigue con un rechazo: con "Task: a" en el informe no se acusa a b', () => {
  const w = wave();
  w.counter('a', { count: 1, accepted: true });
  w.counter('b', { count: 1, accepted: false, lastReason: 'tests rojos' });
  const r = w.post({ content: [{ type: 'text', text: 'Task: a\nlisto\nDONE' }] });
  assert.strictEqual(ctxOf(r), '', 'silencio: a pasó el handback-gate');
});

test('M8: con "Task: b" en el informe y b rechazado, se acusa a b', () => {
  const w = wave();
  w.counter('a', { count: 1, accepted: true });
  w.counter('b', { count: 1, accepted: false, lastReason: 'tests rojos' });
  const c = ctxOf(w.post({ content: [{ type: 'text', text: 'Task: b\nDONE' }] }));
  assert.match(c, /la tarea b no pasó el handback-gate \(tests rojos\).*BLOCKED/);
});

test('M8: sin línea Task y con dos tareas, dice el estado de la que tiene un rechazo sin ordenar tratarla como BLOCKED', () => {
  const w = wave();
  w.counter('a', { count: 1, accepted: true });
  w.counter('b', { count: 1, accepted: false, lastReason: 'tests rojos' });
  const c = ctxOf(w.post('sin identificar'));
  assert.match(c, /\bb\b.*tests rojos/);
  assert.match(c, /si es la que acaba de volver/);
});
