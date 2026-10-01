'use strict';
// Regla `pignolo-init` de la guardia (R-22, R-23, A8-01, A8-09): un subagente no EJECUTA el init.js
// del plugin; leerlo (cat, grep, Get-Content...) pasa; el init.js de un proyecto ajeno pasa; el hilo
// principal pasa. Y el deny de Edit/Write sobre .pignolo/project.md vale para todo subagente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, runLauncher, PLUGIN_ROOT } = require('./helpers');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const repo = makeRepo();
const P = PLUGIN_ROOT.split(path.sep).join('/');
const SUB = { agent_id: 'a1', agent_type: 'pignolo:implementer' };
const call = (command, who = SUB, tool = 'Bash', cwd = repo) => guard.run({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd, ...who }, { snapshot: () => null });
const denied = (r, label) => { assert.equal(r.exit, 2, `${label}: ${r.stderr}`); assert.match(r.stderr, /Alternativa:/, label); assert.match(r.stderr, /init\.js|pignolo-init/, label); };
const passes = (r, label) => assert.equal(r.exit, 0, `${label}: ${r.stderr}`);

test('a subagent cannot run the plugin init.js (all roles), the main thread can', () => {
  denied(call(`node "${P}/scripts/init.js" apply --plan p.json`), 'implementer');
  denied(call('node.exe "C:\\x\\plugins\\pignolo\\scripts\\init.js" apply'), 'node.exe backslashes');
  denied(call(`node "${P}/scripts/init.js" apply`, { agent_id: 'a2', agent_type: 'pignolo:fixer' }), 'fixer');
  denied(call(`node "${P}/scripts/init.js" apply`, { agent_id: 'a3', agent_type: 'general-purpose' }), 'general-purpose');
  passes(call(`node "${P}/scripts/init.js" apply --plan p.json`, {}), 'main thread');
});

test('the other plugin forms are denied too, and the rule is per script (detect as well)', () => {
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" detect'), '${CLAUDE_PLUGIN_ROOT}');
  denied(call('node "$CLAUDE_PLUGIN_ROOT/scripts/init.js" detect'), '$CLAUDE_PLUGIN_ROOT');
  denied(call('node "C:/Users/u/.claude/plugins/cache/m/pignolo/0.14.0/scripts/init.js" detect'), 'cache');
  denied(call(`cd "${P}" && node scripts/init.js detect`), 'cd into the plugin');
  denied(call(`node "${P}/scripts/init.js" detect`), 'detect');
});

test('PowerShell forms', () => {
  const ps = (c, who = SUB) => call(c, who, 'PowerShell');
  ps('Get-Date'); // precalienta el analizador: en frío la guardia da `ask` (G6, C-08)
  denied(ps(`& node "${P}/scripts/init.js" apply`), 'ps literal');
  denied(ps('& node "$env:CLAUDE_PLUGIN_ROOT/scripts/init.js" apply'), 'ps env');
});

test('a foreign project init.js passes: not anchored to the plugin (A8-01)', () => {
  passes(call('node scripts/init.js detect'), 'project script, relative');
  passes(call('node D:/otro/scripts/init.js'), 'another repo');
  passes(call('node tests/helpers/my-init.js'), 'similar name');
  passes(call('cat scripts/init.js'), 'cat');
});

test('reading the plugin init.js is not executing it (R-22): must-allow for cat, grep, head, sed -n, Get-Content, Select-String', () => {
  for (const c of [`cat ${P}/scripts/init.js`, `grep -n apply ${P}/scripts/init.js`, `head -n 20 ${P}/scripts/init.js`, `sed -n 1,40p ${P}/scripts/init.js`]) passes(call(c), c);
  const ps = (c) => call(c, SUB, 'PowerShell');
  passes(ps(`Get-Content ${P}/scripts/init.js`), 'Get-Content');
  passes(ps(`Select-String -Path ${P}/scripts/init.js -Pattern apply`), 'Select-String');
});

test('the main thread (no agent_id) is never denied', () => {
  passes(call(`node "${P}/scripts/init.js" apply`, {}), 'apply');
  passes(call(`node "${P}/scripts/init.js" detect`, {}), 'detect');
});

test('the rule keeps denying with /pignolo:off active (it is a guard rule, like pignolo-plan)', () => {
  const r = makeRepo();
  fs.mkdirSync(path.join(r, '.pignolo'));
  fs.writeFileSync(path.join(r, '.pignolo', '.disabled'), '');
  denied(call(`node "${P}/scripts/init.js" apply`, SUB, 'Bash', r), 'with the project off flag');
});

test('smoke through the real launcher: exit 2, "pignolo bloqueó" and Alternativa', () => {
  const res = runLauncher('guard', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `node "${P}/scripts/init.js" apply --plan p.json` }, cwd: repo, ...SUB }, {});
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, /pignolo bloqueó/);
  assert.match(res.stderr, /Alternativa:/);
});

// --- A8-09: Edit/Write sobre project.md y settings.local.json ---
function activeProject() {
  const r = makeRepo();
  fs.mkdirSync(path.join(r, '.pignolo'));
  fs.writeFileSync(path.join(r, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  return r;
}
const edit = (cwd, file, who, tool = 'Edit') => protect.run({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: file }, cwd, ...who }, { env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-gi-') } });

test('every subagent role is denied Edit/Write on .pignolo/project.md with the project active (A8-09)', () => {
  const r = activeProject();
  const f = path.join(r, '.pignolo', 'project.md');
  for (const type of ['pignolo:implementer', 'pignolo:fixer', 'pignolo:test-writer', 'pignolo:explorer', 'general-purpose']) {
    for (const tool of ['Edit', 'Write']) {
      const res = edit(r, f, { agent_id: 'a', agent_type: type }, tool);
      assert.equal(res.exit, 2, `${type} ${tool}`);
      assert.match(res.stderr, /no escribe \.pignolo\/project\.md/);
      assert.match(res.stderr, /Alternativa:/);
    }
  }
});

test('the main thread edits project.md; a subagent in a project without project.md is not affected; settings.local.json is protected for all', () => {
  const r = activeProject();
  assert.equal(edit(r, path.join(r, '.pignolo', 'project.md'), {}).exit, 0);
  const none = makeRepo();
  assert.equal(edit(none, path.join(none, '.pignolo', 'project.md'), { agent_id: 'a', agent_type: 'general-purpose' }).exit, 0);
  for (const who of [{}, { agent_id: 'a', agent_type: 'general-purpose' }]) {
    const res = edit(r, path.join(r, '.claude', 'settings.local.json'), who);
    assert.equal(res.exit, 2);
    assert.match(res.stderr, /\.claude/);
  }
});
