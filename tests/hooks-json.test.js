'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;

function handlersFor(event) {
  return (hooks[event] || []).flatMap((m) => m.hooks.map((h) => ({ matcher: m.matcher, ...h })));
}

test('every hook uses exec form with node and the launcher', () => {
  for (const event of Object.keys(hooks)) {
    for (const h of handlersFor(event)) {
      assert.strictEqual(h.type, 'command');
      assert.strictEqual(h.command, 'node');
      assert.strictEqual(h.args[0], '${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js');
      assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'handlers', `${h.args[1]}.js`)), h.args[1]);
      assert.ok(h.timeout >= 30 && h.timeout <= 60, `${h.args[1]}: host timeout 30-60 s (the internal deadline decides)`);
      assert.strictEqual(h.shell, undefined);
    }
  }
});

test('guard is registered for Bash and PowerShell', () => {
  const g = handlersFor('PreToolUse').find((h) => h.args[1] === 'guard');
  assert.ok(g);
  assert.ok(/Bash/.test(g.matcher) && /PowerShell/.test(g.matcher));
});

test('protect-paths is registered for file-writing tools', () => {
  const p = handlersFor('PreToolUse').find((h) => h.args[1] === 'protect-paths');
  assert.ok(p);
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.ok(p.matcher.includes(t), t);
});

test('the test-only _echo handler is not registered', () => {
  for (const event of Object.keys(hooks)) {
    for (const h of handlersFor(event)) assert.notStrictEqual(h.args[1], '_echo');
  }
});

test('handback-gate is registered on SubagentStop (pignolo writers), PreToolUse SubagentHandback and PostToolUse Agent', () => {
  const stop = handlersFor('SubagentStop').filter((h) => h.args[1] === 'handback-gate');
  assert.deepStrictEqual(stop.map((h) => h.matcher), ['^pignolo:(implementer|fixer|test-writer)$']);
  const pre = handlersFor('PreToolUse').filter((h) => h.args[1] === 'handback-gate');
  assert.deepStrictEqual(pre.map((h) => h.matcher), ['SubagentHandback']);
  const postHooks = handlersFor('PostToolUse').filter((h) => h.args[1] === 'handback-gate');
  assert.deepStrictEqual(postHooks.map((h) => h.matcher), ['Agent']);
});

test('private-reads is registered on PreToolUse for Read, Grep, Glob, Bash and PowerShell', () => {
  const p = handlersFor('PreToolUse').filter((h) => h.args[1] === 'private-reads');
  assert.deepStrictEqual(p.map((h) => h.matcher), ['Read|Grep|Glob|Bash|PowerShell']);
});

// Hito 5a (Task 12): lista esperada explícita de los hooks nuevos.
test('scope-gate, plan-audit-gate and present-gate are registered exactly as expected', () => {
  const { VERIFY_AGENT } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-agents.js'));
  const pick = (event, name) => handlersFor(event).filter((h) => h.args[1] === name).map((h) => h.matcher);
  assert.deepStrictEqual(pick('PreToolUse', 'scope-gate'), ['Bash|PowerShell']);
  assert.deepStrictEqual(pick('PreToolUse', 'plan-audit-gate'), ['Bash|PowerShell']);
  assert.deepStrictEqual(pick('PostToolUse', 'plan-audit-gate'), ['Bash|PowerShell']);
  assert.deepStrictEqual(pick('PostToolUseFailure', 'plan-audit-gate'), ['Bash|PowerShell']);
  assert.deepStrictEqual(pick('SubagentStop', 'plan-audit-gate'), [`^${VERIFY_AGENT}$`]);
  assert.deepStrictEqual(pick('PreToolUse', 'present-gate'), ['Artifact']);
  for (const event of Object.keys(hooks)) {
    for (const h of handlersFor(event).filter((x) => ['scope-gate', 'plan-audit-gate', 'present-gate'].includes(x.args[1]))) {
      assert.ok(h.timeout >= 30 && h.timeout <= 60, h.args[1]);
    }
  }
  // Cada hook nuevo, en su propia entrada: un deny de scope-gate gana a un ask de la guardia.
  const own = hooks.PreToolUse.find((m) => m.hooks.some((h) => h.args[1] === 'scope-gate'));
  assert.strictEqual(own.hooks.length, 1);
});

// Hito 6 (Task 8): SubagentStart y egreso, cada uno en su entrada y con su matcher exacto.
test('subagent-start and egress are registered exactly as expected', () => {
  const pick = (event, name) => handlersFor(event).filter((h) => h.args[1] === name);
  const sub = pick('SubagentStart', 'subagent-start');
  assert.deepStrictEqual(sub.map((h) => h.matcher), ['^pignolo:']);
  const eg = pick('PreToolUse', 'egress');
  assert.deepStrictEqual(eg.map((h) => h.matcher), ['WebSearch|WebFetch|mcp__.*']);
  for (const h of [...sub, ...eg]) assert.ok(h.timeout >= 30 && h.timeout <= 60, h.args[1]);
  const own = hooks.PreToolUse.find((m) => m.hooks.some((h) => h.args[1] === 'egress'));
  assert.strictEqual(own.hooks.length, 1);
});
