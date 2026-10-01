'use strict';
// Protects: R-5 del hito 6 (SubagentStart inyecta core.md a todo pignolo:* y la tarjeta al agente
// de la tarea; nunca niega) · Breaks if: compara con task.agent, inyecta la tarjeta a otro agente,
// lee un run.json ilegible o vencido, no recorta la tarjeta o habla con /pignolo:off.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const handler = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'subagent-start.js'));

const CORE = fs.readFileSync(path.join(PLUGIN_ROOT, 'rules', 'core.md'), 'utf8').replace(/\r\n/g, '\n').trim();
const IMPL = 'pignolo:implementer';

function setup({ run = 'running', card = '# Task-card T1\n\n- Goal: sumar el contador de visitas\n' } = {}) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  const wt = path.join(makeTempDir('pignolo-wt-'), 'task-t1');
  git(['worktree', 'add', '-q', '-b', 'task/t1', wt], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const mk = (expires) => JSON.stringify({ v: 1, flow: 'daily', started: new Date().toISOString(), expires, task: { id: 'T1', worktree: wt, base, files: [], agents: [IMPL] } });
  const file = path.join(repo, '.pignolo', 'run.json');
  if (run === 'running') fs.writeFileSync(file, mk(new Date(Date.now() + 3600e3).toISOString()));
  else if (run === 'expired') fs.writeFileSync(file, mk(new Date(Date.now() - 3600e3).toISOString()));
  else if (run === 'malformed') fs.writeFileSync(file, '{"v":1,');
  if (card !== null) fs.writeFileSync(path.join(repo, '.pignolo', 'tmp', 'task-T1.md'), card);
  return { repo, wt };
}

const call = (cwd, agent, env = {}) => handler.run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: agent, cwd }, { env: { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '', ...env } });
const ctxOf = (r) => { assert.equal(r.exit, 0); const o = JSON.parse(r.stdout); assert.equal(o.hookSpecificOutput.hookEventName, 'SubagentStart'); return o.hookSpecificOutput.additionalContext; };

test('the task agent gets core.md and the card with worktree and branch', () => {
  const { repo, wt } = setup();
  const ctx = ctxOf(call(repo, IMPL));
  assert.ok(ctx.startsWith(CORE));
  assert.match(ctx, /- Goal: sumar el contador de visitas/);
  assert.ok(ctx.includes(`Worktree: ${wt}`));
  assert.match(ctx, /^Rama: task\/t1$/m);
  // Desde el worktree de la tarea lee el run.json del checkout principal.
  assert.match(ctxOf(call(wt, IMPL)), /- Goal: sumar/);
});

test('another pignolo agent in the same flow gets only core.md', () => {
  const { repo } = setup();
  assert.equal(ctxOf(call(repo, 'pignolo:explorer')), CORE);
});

test('no run.json, missing card, malformed or expired run.json: only core.md, exit 0', () => {
  const none = setup({ run: 'none' });
  assert.equal(ctxOf(call(none.repo, IMPL)), CORE);
  const nocard = setup({ card: null });
  assert.equal(ctxOf(call(nocard.repo, IMPL)), CORE);
  for (const run of ['malformed', 'expired']) {
    const s = setup({ run });
    assert.equal(ctxOf(call(s.repo, IMPL)), CORE, run);
  }
});

test('a 9,000-character card is cut to 6,000 plus the mark', () => {
  const big = `# Task-card T1\n\n- Goal: x\n${'y'.repeat(9000)}\nFINAL-LINE`;
  const { repo } = setup({ card: big });
  const ctx = ctxOf(call(repo, IMPL));
  const part = ctx.slice(ctx.indexOf('# Task-card T1'), ctx.indexOf('\n[recortada]'));
  assert.equal(part.length, 6000);
  assert.match(ctx, /\n\[recortada\]\n/);
  assert.doesNotMatch(ctx, /FINAL-LINE/);
});

test('/pignolo:off, PIGNOLO_DISABLED=1, a non-pignolo agent or an unreadable core.md: no output', () => {
  const { repo } = setup();
  assert.deepEqual(call(repo, 'general-purpose'), { exit: 0 });
  assert.deepEqual(call(repo, IMPL, { PIGNOLO_DISABLED: '1' }), { exit: 0 });
  const r = handler.run({ agent_type: IMPL, cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir() }, corePath: path.join(repo, 'no-existe.md') });
  assert.deepEqual(r, { exit: 0 });
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  assert.deepEqual(call(repo, IMPL), { exit: 0 });
});
