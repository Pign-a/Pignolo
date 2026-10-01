'use strict';
// Regla `pignolo-plan` de la guardia (Task 12, R-14): un subagente no opera plan.js,
// plan-audit.js ni approved.js. next.js, approved-verify.js, plan-check.js y present.js no entran.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeRepo, PLUGIN_ROOT } = require('./helpers');
const guard = require('../plugins/pignolo/hooks/handlers/guard');

const repo = makeRepo();
const P = PLUGIN_ROOT.split(path.sep).join('/');
const SUB = { agent_id: 'a1', agent_type: 'pignolo:implementer' };
const call = (command, who = SUB, tool = 'Bash') => guard.run({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: repo, ...who }, { snapshot: () => null });
const denied = (r, label) => { assert.equal(r.exit, 2, `${label}: ${r.stderr}`); assert.match(r.stderr, /Alternativa:/, label); assert.match(r.stderr, /plan de pignolo|pignolo-plan|plan\.js/i, label); };
const passes = (r, label) => assert.equal(r.exit, 0, `${label}: ${r.stderr}`);

test('a subagent cannot run plan.js, plan-audit.js or approved.js; the main thread can', () => {
  for (const s of ['plan.js status --plan p', 'plan-audit.js begin-review --plan p', 'approved.js save --flow f']) {
    denied(call(`node ${P}/scripts/${s}`), s);
    passes(call(`node ${P}/scripts/${s}`, {}), `main ${s}`);
  }
});

test('read-only scripts and reading the script are not denied', () => {
  for (const s of ['next.js', 'approved-verify.js', 'plan-check.js --plan p', 'present.js check']) passes(call(`node ${P}/scripts/${s}`), s);
  passes(call(`cat ${P}/scripts/plan.js`), 'cat');
});

test('real cache paths and CLAUDE_PLUGIN_ROOT forms are denied', () => {
  denied(call('node "C:/Users/u/.claude/plugins/cache/pignolo/pignolo/0.7.0/scripts/plan.js" status'), 'cache /');
  denied(call('node "C:\\Users\\u\\.claude\\plugins\\cache\\pignolo\\pignolo\\0.7.0\\scripts\\plan.js" status'), 'cache \\');
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.js" status'), '${CLAUDE_PLUGIN_ROOT}');
  denied(call('node "$CLAUDE_PLUGIN_ROOT/scripts/plan.js" status'), '$CLAUDE_PLUGIN_ROOT');
  denied(call('node "$CLAUDE_PLUGIN_ROOT/scripts/approved.js" save'), 'approved');
});

test('not too wide: a foreign variable and a repo folder called pignolo pass', () => {
  passes(call('node "$X/scripts/plan.js" status'), 'foreign variable');
  passes(call('node D:/pignolo/scripts/plan.js'), 'repo named pignolo');
  passes(call('node scripts/plan.js'), 'relative');
});

test('PowerShell forms', () => {
  const ps = (c, who = SUB) => call(c, who, 'PowerShell');
  denied(ps(`& node "${P}/scripts/plan.js" status`), 'ps literal');
  denied(ps('& node "$env:CLAUDE_PLUGIN_ROOT/scripts/plan.js" status'), 'ps env');
  denied(ps('& node "${env:CLAUDE_PLUGIN_ROOT}/scripts/plan-audit.js" end'), 'ps ${env:}');
  passes(ps(`Get-Content ${P}/scripts/plan.js`), 'ps read');
  passes(ps(`& node "${P}/scripts/next.js"`), 'ps next');
  assert.equal(ps(`& node "${P}/scripts/run.js" status`).exit, 2, 'run.js still denied');
});

test('regression: run.js keeps denying a subagent in the same four forms', () => {
  const rule = /pignolo-run|scripts\/run\.js|flujo de pignolo/;
  for (const c of [`node "${P}/scripts/run.js" end`, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" task --id t1', `cd "${P}" && node scripts/run.js start --flow daily --replace`]) {
    const r = call(c);
    assert.equal(r.exit, 2, c);
    assert.match(r.stderr, rule);
  }
  passes(call('node scripts/run.js'), 'project run.js');
  passes(call(`node "${P}/scripts/run.js" end`, {}), 'main thread run.js');
});
