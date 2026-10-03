'use strict';
// T3 del plan 2026-10-03-fuga-leak-values: un subagente no lee <pignoloHome>/ui-leaks; la salida segura (sacar del
// índice, leer el archivo viejo) no la frena ningún handler.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, makeRepo, PLUGIN_ROOT } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const reads = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'private-reads.js'));
const guard = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'guard.js'));
const scope = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'scope-gate.js'));
const planAudit = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'plan-audit-gate.js'));

const IMPL = { agent_id: 'a1', agent_type: 'pignolo:implementer' };
const LEAK_MESSAGE = /valores personales de pignolo-ui/;

function setup() {
  const home = makeTempDir('pignolo-leak-home-');
  const env = { HOME: home, USERPROFILE: home, PIGNOLO_HOME: path.join(home, '.pignolo') };
  const leaks = path.join(env.PIGNOLO_HOME, 'ui-leaks', 'abc123def456', 'r1');
  fs.mkdirSync(leaks, { recursive: true });
  fs.writeFileSync(path.join(leaks, 'leak-values.json'), '["SECRETO-XYZ"]\n');
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  fs.mkdirSync(path.join(repo, '.pignolo-ui', 'runs', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo-ui', 'runs', 'r1', 'leak-values.json'), '["SECRETO-XYZ"]\n');
  return { home, env, repo, leaks };
}
const payload = (s, tool, input, who = IMPL) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: s.repo, ...who });
const readsRun = (s, p) => reads.run(p, { env: s.env });

test('1: the old file under the project is readable by a subagent (Read, cat, Get-Content): getting out never needs it blocked', () => {
  const s = setup();
  const old = path.join(s.repo, '.pignolo-ui', 'runs', 'r1', 'leak-values.json');
  assert.equal(readsRun(s, payload(s, 'Read', { file_path: old })).exit, 0);
  assert.equal(readsRun(s, payload(s, 'Bash', { command: 'cat .pignolo-ui/runs/r1/leak-values.json' })).exit, 0);
  assert.equal(readsRun(s, payload(s, 'PowerShell', { command: 'Get-Content .pignolo-ui\\runs\\r1\\leak-values.json' })).exit, 0);
});

test('2: a subagent cannot read <pignoloHome>/ui-leaks (own message); the main thread can', () => {
  const s = setup();
  const file = path.join(s.leaks, 'leak-values.json');
  const deny = (tool, input) => {
    const r = readsRun(s, payload(s, tool, input));
    assert.equal(r.exit, 2, `${tool} ${JSON.stringify(input)}`);
    assert.match(r.stderr, LEAK_MESSAGE);
    assert.ok(!/holdout y los sellos/.test(r.stderr), 'not the holdout message');
  };
  deny('Read', { file_path: file });
  deny('Bash', { command: `cat ${JSON.stringify(file.replace(/\\/g, '/'))}` });
  assert.equal(readsRun(s, payload(s, 'Bash', { command: 'cat $PIGNOLO_HOME/ui-leaks/abc123def456/r1/leak-values.json' })).exit, 2);
  deny('Glob', { path: path.join(s.env.PIGNOLO_HOME, 'ui-leaks'), pattern: '**/*.json' });
  // un recorrido recursivo por el home de pignolo lo alcanza (mensaje del holdout o el propio: se niega igual)
  assert.equal(readsRun(s, payload(s, 'Bash', { command: `grep -r SECRETO ${JSON.stringify(s.env.PIGNOLO_HOME.replace(/\\/g, '/'))}` })).exit, 2);
  for (const tool of [['Read', { file_path: file }], ['Bash', { command: `cat ${JSON.stringify(file.replace(/\\/g, '/'))}` }]]) {
    assert.equal(readsRun(s, payload(s, tool[0], tool[1], {})).exit, 0, 'main thread');
  }
  // el hilo de un validator tampoco se toca (como con el holdout)
  assert.equal(readsRun(s, payload(s, 'Read', { file_path: file }, { agent_id: 'v', agent_type: 'pignolo:validator' })).exit, 0);
});

test('3: the safe exit passes every handler, as main and as subagent, with and without a plan', () => {
  const COMMANDS = ['git restore --staged -- ".pignolo-ui/runs"', 'git rm --cached -r .pignolo-ui/runs', 'git reset -- .pignolo-ui/runs', 'cat .pignolo-ui/runs/r1/leak-values.json'];
  const withPlan = setup();
  assert.ok(ps.newPlan({ main: withPlan.repo, plan: 'p1', request: 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.', spec: 's' }).ok);
  const without = setup();
  const handlers = { guard, 'private-reads': reads, 'scope-gate': scope, 'plan-audit-gate': planAudit };
  for (const s of [withPlan, without]) {
    for (const who of [{}, IMPL]) {
      for (const [name, h] of Object.entries(handlers)) {
        for (const command of COMMANDS) {
          const r = h.run(payload(s, 'Bash', { command }, who), { env: { ...process.env, ...s.env } });
          assert.notEqual(r.exit, 2, `${name} ${who.agent_id ? 'subagent' : 'main'} ${command}: ${r.stderr}`);
        }
      }
    }
  }
});

test('4: PowerShell forms of the safe exit are allowed by the guard', () => {
  const s = setup();
  for (const command of ["git restore --staged -- '.pignolo-ui\\runs'", "git rm --cached -r '.pignolo-ui\\runs'", "git reset -- '.pignolo-ui\\runs'"]) {
    for (const who of [{}, IMPL]) {
      const r = guard.run(payload(s, 'PowerShell', { command }, who), { env: { ...process.env, ...s.env, PIGNOLO_DISABLED: '' } });
      assert.equal(r.exit, 0, `${command}: ${r.stderr}`);
    }
  }
});
