'use strict';
// protect-paths: estado de juicio (spec §8.3, hito 6). (a) INDEX.md y learnings/accepted/ nunca con
// Edit/Write; (b) un subagente no escribe .pignolo/state/**; (c) el hilo principal tampoco desde un
// worktree que no es el checkout principal.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const payload = (cwd, file_path, { agent = null, tool = 'Write' } = {}) => ({ hook_event_name: 'PreToolUse', tool_name: tool, cwd, tool_input: { file_path, content: 'x' }, ...(agent ? { agent_type: agent, agent_id: 'a1' } : {}) });

function setup() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'state', 'work'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  return repo;
}
const state = (root, ...rest) => path.join(root, '.pignolo', 'state', ...rest);

test('INDEX.md and learnings/accepted/ are denied to the main thread with the alternative; proposed/ passes', () => {
  const repo = setup();
  const r = protect.run(payload(repo, state(repo, 'INDEX.md')), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa: node <plugin>\/scripts\/state-index\.js/);
  const e = protect.run(payload(repo, state(repo, 'INDEX.md'), { tool: 'Edit' }), { env: env() });
  assert.strictEqual(e.exit, 2);
  const acc = protect.run(payload(repo, state(repo, 'learnings', 'accepted', '2026-09-30-x.md')), { env: env() });
  assert.strictEqual(acc.exit, 2);
  assert.match(acc.stderr, /Alternativa:.*close-session\.js decide/);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'learnings', 'proposed', '2026-09-30-x.md')), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, path.join('.pignolo', 'state', 'INDEX.md')), { env: env() }).exit, 2, 'ruta relativa al cwd');
});

test('a subagent (agent_id) cannot write .pignolo/state/**; the same path by the main thread passes', () => {
  const repo = setup();
  const sub = protect.run(payload(repo, state(repo, 'work', 'x.md'), { agent: 'pignolo:implementer' }), { env: env() });
  assert.strictEqual(sub.exit, 2);
  assert.match(sub.stderr, /subagente.*Alternativa:/);
  const other = protect.run(payload(repo, state(repo, 'decisions', 'x.md'), { agent: 'general-purpose' }), { env: env() });
  assert.strictEqual(other.exit, 2);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'work', 'x.md')), { env: env() }).exit, 0);
});

test('a task worktree does not write .pignolo/state/: cwd inside .pignolo/worktrees/<t> or a linked worktree', () => {
  const repo = setup();
  const inner = path.join(repo, '.pignolo', 'worktrees', 't1');
  fs.mkdirSync(inner, { recursive: true });
  const r = protect.run(payload(inner, state(inner, 'work', 'x.md')), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /checkout principal.*Alternativa:/);
  assert.strictEqual(protect.run(payload(inner, state(repo, 'work', 'x.md')), { env: env() }).exit, 2, 'ni la copia del principal desde ahí');
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tw', wt], repo);
  assert.strictEqual(protect.run(payload(wt, state(wt, 'work', 'x.md')), { env: env() }).exit, 2);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'work', 'x.md')), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(path.join(repo, 'sub'), state(repo, 'work', 'x.md')), { env: env() }).exit, 0, 'un subdirectorio del principal es el principal');
});

test('with /pignolo:off, (b) and (c) pass and (a) still denies', () => {
  const repo = setup();
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  assert.strictEqual(protect.run(payload(repo, state(repo, 'work', 'x.md'), { agent: 'pignolo:implementer' }), { env: env() }).exit, 0);
  const inner = path.join(repo, '.pignolo', 'worktrees', 't1');
  fs.mkdirSync(inner, { recursive: true });
  assert.strictEqual(protect.run(payload(inner, state(inner, 'work', 'x.md')), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'INDEX.md')), { env: env() }).exit, 2);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'learnings', 'accepted', 'x.md')), { env: env() }).exit, 2);
});

test('with PIGNOLO_DISABLED=1 only the catastrophic set rules', () => {
  const repo = setup();
  const e = { ...env(), PIGNOLO_DISABLED: '1' };
  assert.strictEqual(protect.run(payload(repo, state(repo, 'INDEX.md')), { env: e }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, state(repo, 'work', 'x.md'), { agent: 'pignolo:implementer' }), { env: e }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, path.join(repo, '.git', 'config')), { env: e }).exit, 2);
});

test('regression guard: src/a.js and .pignolo/project.md by the main thread keep their result', () => {
  const repo = setup();
  assert.strictEqual(protect.run(payload(repo, path.join(repo, 'src', 'a.js')), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, path.join(repo, '.pignolo', 'project.md')), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(repo, path.join(repo, '.pignolo', 'state-notes.md')), { env: env() }).exit, 0, 'un nombre parecido no es state/');
});

// Protects: M2 de la revisión final (la copia de estado de un worktree de tarea viaja a main con la
// rama) · Breaks if: el hilo principal con cwd en el principal escribe .pignolo/state/, INDEX.md o
// accepted/ de un worktree de tarea o enlazado.
test('the main thread cannot write the state, INDEX.md or accepted/ of a task worktree or a linked worktree from the main checkout', () => {
  const repo = setup();
  const inner = path.join(repo, '.pignolo', 'worktrees', 't1');
  fs.mkdirSync(inner, { recursive: true });
  for (const rest of [['work', 'x.md'], ['INDEX.md'], ['learnings', 'accepted', 'a.md'], ['learnings', 'proposed', 'p.md']]) {
    assert.strictEqual(protect.run(payload(repo, state(inner, ...rest)), { env: env() }).exit, 2, `worktree de tarea ${rest.join('/')}`);
  }
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tw2', wt], repo);
  for (const rest of [['work', 'x.md'], ['INDEX.md'], ['learnings', 'accepted', 'a.md']]) {
    assert.strictEqual(protect.run(payload(repo, state(wt, ...rest)), { env: env() }).exit, 2, `worktree enlazado ${rest.join('/')}`);
  }
  assert.strictEqual(protect.run(payload(repo, state(repo, 'work', 'x.md')), { env: env() }).exit, 0, 'el principal sigue pasando');
  assert.strictEqual(protect.run(payload(repo, state(makeTempDir('pignolo-other-'), 'work', 'x.md')), { env: env() }).exit, 0, 'el estado de otro repo no es asunto de esta regla');
  const off = makeTempDir();
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  assert.strictEqual(protect.run(payload(repo, state(inner, 'work', 'x.md')), { env: { PIGNOLO_HOME: off } }).exit, 0, 'con /pignolo:off (b) y (c) no rigen');
  assert.strictEqual(protect.run(payload(repo, state(inner, 'INDEX.md')), { env: { PIGNOLO_HOME: off } }).exit, 2, 'INDEX.md de una copia sigue negado aun con /pignolo:off');
});

// Protects: spec §4.5/§8.3 (un subagente no escribe decisiones por Edit/Write/MultiEdit/NotebookEdit; el hilo principal sí;
// leer no pasa por este hook) · Breaks if: stateRule deja de cubrir .pignolo/state/decisions/ o niega al hilo principal.
test('decisions/: every write tool is denied to a subagent, the main thread passes', () => {
  const repo = setup();
  const f = state(repo, 'decisions', '2026-10-01-p1-d-1.md');
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    const r = protect.run(payload(repo, f, { agent: 'general-purpose', tool }), { env: env() });
    assert.strictEqual(r.exit, 2, tool);
    assert.match(r.stderr, /subagente.*Alternativa:/, tool);
    assert.strictEqual(protect.run(payload(repo, f, { tool }), { env: env() }).exit, 0, `main ${tool}`);
  }
  assert.strictEqual(protect.run(payload(repo, path.join(repo, 'src', 'x.js'), { agent: 'general-purpose' }), { env: env() }).exit, 0, 'otra ruta');
});
