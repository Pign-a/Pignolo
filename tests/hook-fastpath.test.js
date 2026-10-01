'use strict';
// lib/hook-fastpath.js (Task 12, R-15 iv): atajos de solo-payload que el launcher consulta
// antes de crear el Worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { skips } = require(path.join(PLUGIN_ROOT, 'lib', 'hook-fastpath.js'));
const { REVIEW_AGENT, VERIFY_AGENT } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-agents.js'));

test('plan-audit-gate: skipped unless the agent is one of the audit agents', () => {
  const bash = { tool_name: 'Bash', tool_input: { command: 'ls' } };
  assert.equal(skips('plan-audit-gate', bash), true, 'main thread');
  assert.equal(skips('plan-audit-gate', { ...bash, agent_type: 'pignolo:implementer', agent_id: 'a' }), true);
  assert.equal(skips('plan-audit-gate', { ...bash, agent_type: REVIEW_AGENT, agent_id: 'a' }), false);
  assert.equal(skips('plan-audit-gate', { ...bash, agent_type: VERIFY_AGENT, agent_id: 'a' }), false);
});

test('scope-gate: skipped unless the command has git and a gated verb', () => {
  const cmd = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  for (const c of ['ls -la', 'git status', 'git log --oneline', 'npm test']) assert.equal(skips('scope-gate', cmd(c)), true, c);
  for (const c of ['git merge x', 'git push', 'git -C d pull', 'git update-ref refs/heads/main abc', 'git cherry-pick abc', 'git fetch . x:main']) {
    assert.equal(skips('scope-gate', cmd(c)), false, c);
  }
  assert.equal(skips('scope-gate', { tool_name: 'PowerShell', tool_input: { command: 'git merge int/p1; Get-Date' } }), false);
  assert.equal(skips('scope-gate', { tool_name: 'Bash', tool_input: {} }), false, 'no command');
  assert.equal(skips('scope-gate', { tool_name: 'Bash' }), false, 'no tool_input');
  assert.equal(skips('scope-gate', { tool_name: 'Bash', tool_input: { command: 7 } }), false, 'not a string');
});

test('any other name or a payload of unexpected shape is never skipped', () => {
  assert.equal(skips('guard', { tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
  assert.equal(skips('present-gate', {}), false);
  assert.equal(skips('plan-audit-gate', null), false);
  assert.equal(skips('scope-gate', 'x'), false);
});

test('I-2: the prefilter is case-insensitive and sees checkout/switch', () => {
  const cmd = (command) => ({ tool_name: 'Bash', tool_input: { command } });
  assert.equal(skips('scope-gate', cmd('Git merge int/p1')), false);
  assert.equal(skips('scope-gate', cmd('GIT PUSH origin main')), false);
  assert.equal(skips('scope-gate', cmd('git checkout -B main int/p1')), false);
  assert.equal(skips('scope-gate', cmd('git switch -C main int/p1')), false);
});
