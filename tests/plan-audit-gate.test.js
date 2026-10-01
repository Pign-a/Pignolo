'use strict';
// plan-audit-gate (Task 10, R-2, R-15, R-16): los hooks de la auditoría del plan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));
const agents = require(path.join(PLUGIN_ROOT, 'lib', 'plan-agents.js'));
const gate = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'plan-audit-gate.js'));

const J = (obj) => `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
const claim = (id) => ({ id, task: 'T1', claim: `claim ${id}`, how: `how ${id}` });
const entry = (id) => ({ id, verdict: 'holds', experiment: `ran ${id}`, evidence: 'ok' });
const R = agents.REVIEW_AGENT;
const V = agents.VERIFY_AGENT;

function project() {
  const main = makeRepo();
  fs.mkdirSync(path.join(main, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(main, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  return main;
}
const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const bashPre = (cwd, agent) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command: 'ls' }, ...(agent ? { agent_type: agent, agent_id: 'a1' } : {}) });
const post = (cwd, agent, event = 'PostToolUse', tool = 'Bash', command = 'node x.js') => ({ hook_event_name: event, tool_name: tool, cwd, tool_input: { command }, agent_type: agent, agent_id: 'a1' });
const stop = (cwd, agent, message) => ({ hook_event_name: 'SubagentStop', cwd, agent_type: agent, agent_id: 'a1', last_assistant_message: message });
const run = (input, extra = {}) => gate.run(input, { env: env(), ...extra });

test('plan-agents: one interface for the experiment agent (R-16, option a)', () => {
  assert.strictEqual(agents.REVIEW_AGENT, 'pignolo:plan-auditor');
  assert.strictEqual(agents.VERIFY_AGENT, 'pignolo:plan-auditor');
});

test('PreToolUse: Bash is denied to the review agent in review mode, with an Alternativa', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'review' });
  const r = run(bashPre(main, R));
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa:/);
  assert.strictEqual(run({ ...bashPre(main, R), tool_name: 'PowerShell' }).exit, 2);
});

test('PreToolUse: no decision in verify, expired mode, other agent, main thread, or /pignolo:off', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')] });
  assert.strictEqual(run(bashPre(main, V)).exit, 0);
  const old = project();
  pa.beginMode({ main: old, plan: 'p1', mode: 'review', now: Date.now() - 31 * 60000 });
  assert.strictEqual(run(bashPre(old, R)).exit, 0);
  const rev = project();
  pa.beginMode({ main: rev, plan: 'p1', mode: 'review' });
  assert.strictEqual(run(bashPre(rev, 'pignolo:implementer')).exit, 0);
  assert.strictEqual(run(bashPre(rev)).exit, 0);
  assert.strictEqual(gate.run(bashPre(rev, R), { env: { ...env(), PIGNOLO_DISABLED: '1' } }).exit, 0, 'PIGNOLO_DISABLED');
  fs.writeFileSync(path.join(rev, '.pignolo', '.disabled'), '');
  assert.strictEqual(run(bashPre(rev, R)).exit, 0, 'off flag');
});

test('counter by the handler: PostToolUse and PostToolUseFailure both count; Read, review mode and other agents do not', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1'), claim('C2'), claim('C3')] });
  for (let i = 0; i < 2; i += 1) assert.strictEqual(run(post(main, V)).exit, 0);
  assert.strictEqual(pa.readMode({ main }).experiments, 2);
  assert.strictEqual(run(post(main, V, 'PostToolUseFailure')).exit, 0);
  assert.strictEqual(pa.readMode({ main }).experiments, 3, 'a failing Bash counts');
  run(post(main, V, 'PostToolUse', 'Read'));
  run(post(main, 'pignolo:implementer'));
  assert.strictEqual(pa.readMode({ main }).experiments, 3);
  run(post(main, V, 'PostToolUse', 'Bash', 'node a.js\n  && echo b'));
  const log = fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'bash-calls.log'), 'utf8').trim().split('\n');
  assert.strictEqual(log.length, 4, 'multi-line command on one line');
  const rev = project();
  pa.beginMode({ main: rev, plan: 'p1', mode: 'review' });
  run(post(rev, R));
  assert.strictEqual(pa.readMode({ main: rev }).experiments, 0, 'review mode does not count');
});

test('concurrency: 5 processes recording at once count 5 while readMode loops', async () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')] });
  const code = `require(${JSON.stringify(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'))}).recordExperiment({ main: ${JSON.stringify(main)}, plan: 'p1', command: 'node x.js' });`;
  let reading = true;
  let inactive = 0;
  const reader = (async () => {
    while (reading) {
      if (!pa.readMode({ main }).active) inactive += 1;
      await new Promise((r) => setImmediate(r));
    }
  })();
  await Promise.all(Array.from({ length: 5 }, () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`exit ${c}`))));
  })));
  reading = false;
  await reader;
  assert.strictEqual(pa.readMode({ main }).experiments, 5);
  assert.strictEqual(inactive, 0);
});

test('SubagentStop in verify: blocks twice, the third attempt passes as incomplete; complete is silent', () => {
  const main = project();
  const claims = [claim('C1'), claim('C2'), claim('C3')];
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims });
  run(post(main, V));
  const msg = J([entry('C1')]);
  for (let i = 1; i <= 2; i += 1) {
    const r = run(stop(main, V, msg));
    assert.strictEqual(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.decision, 'block');
    assert.match(out.reason, /scratch/);
    assert.strictEqual(pa.readMode({ main }).attempts, i);
  }
  const third = run(stop(main, V, msg));
  assert.strictEqual(third.exit, 0);
  assert.strictEqual(third.stdout || '', '');
  const m = pa.readMode({ main });
  assert.strictEqual(m.attempts, 3);
  assert.strictEqual(m.incomplete, true);
  assert.deepStrictEqual(fs.readFileSync(path.join(pa.auditDir(main, 'p1'), 'stops.log'), 'utf8').trim().split('\n'), ['stop', 'stop', 'stop', 'incomplete']);

  const ok = project();
  pa.beginMode({ main: ok, plan: 'p1', mode: 'verify', claims: [claim('C1')] });
  run(post(ok, V));
  const quiet = run(stop(ok, V, J([entry('C1')])));
  assert.deepStrictEqual({ exit: quiet.exit, stdout: quiet.stdout || '', stderr: quiet.stderr || '' }, { exit: 0, stdout: '', stderr: '' });
  assert.strictEqual(pa.readMode({ main: ok }).incomplete, false);
});

test('SubagentStop in verify: a missing last message counts as no entries; other agents and no mode are silent', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')] });
  run(post(main, V));
  const r = run({ hook_event_name: 'SubagentStop', cwd: main, agent_type: V, agent_id: 'a1' });
  assert.strictEqual(JSON.parse(r.stdout).decision, 'block');
  const other = run(stop(main, 'pignolo:implementer', ''));
  assert.deepStrictEqual({ exit: other.exit, stdout: other.stdout || '' }, { exit: 0, stdout: '' });
  assert.strictEqual(pa.readMode({ main }).attempts, 1, 'only the audit agent counts');
  const idle = project();
  assert.strictEqual(run(stop(idle, V, '')).exit, 0);
  assert.ok(!fs.existsSync(path.join(pa.auditDir(idle, 'p1'), 'stops.log')));
});

test('SubagentStop: the attempt is counted before anything else, even if the decision throws', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'verify', claims: [claim('C1')] });
  const input = stop(main, V, '');
  Object.defineProperty(input, 'last_assistant_message', { get() { throw new Error('boom'); } });
  const r = run(input);
  assert.strictEqual(r.exit, 0, 'a failing decision does not exit 2 (that would bypass MAX_BLOCKS)');
  assert.strictEqual(pa.readMode({ main }).attempts, 1);
});

test('SubagentStop in review mode asks for the json block of findings and claims', () => {
  const main = project();
  pa.beginMode({ main, plan: 'p1', mode: 'review' });
  assert.strictEqual(JSON.parse(run(stop(main, R, 'sin bloque')).stdout).decision, 'block');
  const ok = run(stop(main, R, J({ findings: [], claims: [claim('C1')] })));
  assert.strictEqual(ok.stdout || '', '');
});
