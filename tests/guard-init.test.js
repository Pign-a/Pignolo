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

// --- Pasada de arreglos 8a (I-2): la regla cierra las mismas formas que pignolo-plan ---
// Protects: I-2 (Node resuelve la extensión: `init` sin .js ejecuta lo mismo) · Breaks if: INIT_JS_* vuelve a exigir .js o falta init en EVAL_STATE_SCRIPT.
test('a subagent cannot run init without .js, nor load it with node -e/-p/-r (same as the plan.js family)', () => {
  denied(call(`node "${P}/scripts/init" apply`), 'sin extensión');
  denied(call(`cd "${P}/scripts" && node ./init apply`), 'cd + ./init');
  denied(call('node "$CLAUDE_PLUGIN_ROOT/scripts/init" apply'), '$CLAUDE_PLUGIN_ROOT sin .js');
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/init" detect'), '${CLAUDE_PLUGIN_ROOT} sin .js');
  denied(call(`& node "${P}/scripts/init" apply`, SUB, 'PowerShell'), 'ps sin .js');
  denied(call(`node -e "require('${P}/scripts/init.js').main(['apply','--plan','p.json'])"`), 'node -e con .js');
  denied(call(`node -e "require('${P}/scripts/init')"`), 'node -e sin .js');
  denied(call(`node -p "require('${P}/scripts/init.js')"`), 'node -p');
  denied(call(`node -r ${P}/scripts/init.js -e 1`), 'node -r');
  denied(call('node -e "require(\'${CLAUDE_PLUGIN_ROOT}/scripts/init\')"'), 'node -e dinámico');
  passes(call(`node "${P}/scripts/init" apply`, {}), 'hilo principal sin .js');
  passes(call(`node -e "require('${P}/scripts/init.js')"`, {}), 'hilo principal con -e');
});

test('reading init (with or without .js) and the lib stay allowed for a subagent', () => {
  for (const c of [`cat ${P}/scripts/init`, `grep -n apply ${P}/scripts/init`, `head -20 ${P}/scripts/init.js`, `node --check ${P}/scripts/init.js`, `node -e "require('${P}/lib/init-actions.js')"`, 'node scripts/init detect']) passes(call(c), c);
});

// --- m-6: A8-09 sigue el alias real (junction / nombre 8.3) cuando el archivo existe ---
test('A8-09 also denies a path that reaches project.md through a junction alias (m-6)', () => {
  const r = activeProject();
  const alias = path.join(r, 'alias-dir');
  fs.symlinkSync(path.join(r, '.pignolo'), alias, 'junction');
  const res = edit(r, path.join(alias, 'project.md'), { agent_id: 'a', agent_type: 'pignolo:implementer' }, 'Write');
  assert.equal(res.exit, 2, res.stderr);
  assert.match(res.stderr, /no escribe \.pignolo\/project\.md/);
  assert.equal(edit(r, path.join(alias, 'project.md'), {}, 'Write').exit, 0, 'hilo principal');
  fs.writeFileSync(path.join(r, 'other.md'), 'x');
  assert.equal(edit(r, path.join(r, 'other.md'), { agent_id: 'a', agent_type: 'pignolo:implementer' }).exit, 0, 'otro archivo');
});

// --- Hito 8d, Task 9: places.js entero solo para el hilo principal (misma regla pignolo-init) ---
test('a subagent cannot run places.js (where, fix, undo, any form); the main thread can', () => {
  for (const c of [
    `node "${P}/scripts/places.js" where spec`,
    `node "${P}/scripts/places.js" fix apply --moves m.json --expect abc`,
    `node "${P}/scripts/places.js" undo --record r.json`,
    `node "${P}/scripts/places.js" --cwd x fix apply --moves m.json --expect abc`,
    `node "${P}/scripts/places" fix apply`,
    'node "$CLAUDE_PLUGIN_ROOT/scripts/places.js" fix apply --moves m.json',
    'node "${CLAUDE_PLUGIN_ROOT}/scripts/places" undo --record r.json',
    'node "C:/Users/u/.claude/plugins/cache/m/pignolo/0.14.0/scripts/places.js" where plan',
  ]) {
    denied(call(c), c);
    passes(call(c, {}), `main: ${c}`);
  }
  denied(call(`& node "${P}/scripts/places.js" fix apply`, SUB, 'PowerShell'), 'ps');
  passes(call(`& node "${P}/scripts/places.js" fix apply`, {}, 'PowerShell'), 'ps main');
  denied(call(`node -e "require('${P}/scripts/places.js')"`), 'node -e con .js');
  denied(call('node -e "require(\'${CLAUDE_PLUGIN_ROOT}/scripts/places\')"'), 'node -e dinámico');
  passes(call(`node -e "require('${P}/scripts/places.js')"`, {}), 'main node -e');
});

test('places.js: reading it or running a foreign places.js is not executing the plugin one (must-allow de lectura)', () => {
  for (const c of [`cat ${P}/scripts/places.js`, `grep -n undo ${P}/scripts/places.js`, `head -n 20 ${P}/scripts/places.js`, `sed -n 1,40p ${P}/scripts/places.js`]) passes(call(c), c);
  passes(call(`Get-Content ${P}/scripts/places.js`, SUB, 'PowerShell'), 'Get-Content');
  passes(call(`Select-String -Path ${P}/scripts/places.js -Pattern undo`, SUB, 'PowerShell'), 'Select-String');
  passes(call('node scripts/places.js where'), 'places.js de otro proyecto');
  passes(call('node tests/helpers/my-places.js'), 'nombre parecido');
  passes(call(`node "${P}/scripts/places-detect.js"`), 'otro nombre');
});

test('init.js apply sigue negado a un subagente (regresión de 8a)', () => {
  denied(call(`node "${P}/scripts/init.js" apply --plan p.json --expect abc`), 'init apply');
});

// --- Hito 8d, I-3: el cd que cambia al directorio de scripts del plugin, separado por `;` o salto de línea ---
test('I-3: a subagent cannot run init.js/places.js after a cd/Set-Location/Push-Location separated by ; or newline', () => {
  const ps = (c, who = SUB) => call(c, who, 'PowerShell');
  ps('Get-Date'); // precalienta el analizador
  for (const script of ['places.js', 'init.js']) {
    for (const c of [
      `cd ${P}/scripts && node ${script} undo`,
      `cd ${P}/scripts; node ${script} undo`,
      `cd ${P}/scripts\nnode ${script} undo`,
      `cd ${P}; cd scripts; node ${script} x`,
      `cd ${P}; node scripts/${script} x`,
      `cd "${P}/scripts"; node ./${script} x`,
    ]) {
      denied(call(c), c);
      passes(call(c, {}), `main: ${c}`);
    }
    for (const c of [
      `Set-Location ${P}/scripts; node ${script} undo`,
      `Push-Location ${P}; node scripts/${script} x`,
      `Set-Location ${P}/scripts\nnode ${script} undo`,
    ]) {
      denied(ps(c), c);
      passes(ps(c, {}), `main: ${c}`);
    }
  }
});

test('I-3: reading the scripts after a cd (cat, grep, wc, node --check, Get-Content) still passes', () => {
  const ps = (c, who = SUB) => call(c, who, 'PowerShell');
  for (const c of [
    `cd ${P}/scripts; cat places.js`,
    `cd ${P}/scripts; grep -n undo places.js`,
    `cd ${P}/scripts\nwc -l init.js`,
    `cd ${P}/scripts; node --check places.js`,
    `cd ${P}; head -n 5 scripts/init.js`,
  ]) passes(call(c), c);
  for (const c of [`Set-Location ${P}/scripts; Get-Content places.js`, `Push-Location ${P}; Get-Content scripts/init.js`]) passes(ps(c), c);
});

test('I-3: a cd to a foreign directory followed by node places.js is still not the plugin one', () => {
  const other = makeTempDir('pignolo-foreign-').split(path.sep).join('/');
  passes(call(`cd ${other}; node places.js where`), 'foreign cd ;');
  passes(call(`cd ${other}\nnode init.js detect`), 'foreign cd newline');
});

test('I-3: with an unknowable cd (dynamic target) the bare node places.js / init.js is denied to a subagent', () => {
  denied(call('cd "$SOMEWHERE"; node places.js undo'), 'cd dinámico places');
  denied(call('cd $(pwd)/x\nnode ./init.js apply'), 'cd dinámico init');
  passes(call('cd "$SOMEWHERE"; node places.js undo', {}), 'main thread');
});

test('un subagente no corre setup.js con --apply (retired, permissions); sin --apply y en el hilo principal pasa', () => {
  denied(call(`node "${P}/scripts/setup.js" retired --apply`), 'retired --apply');
  denied(call(`node "${P}/scripts/setup.js" permissions --target user --apply`), 'permissions --apply');
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" retired --apply'), 'CLAUDE_PLUGIN_ROOT');
  passes(call(`node "${P}/scripts/setup.js" retired`), 'retired sin --apply');
  passes(call(`node "${P}/scripts/setup.js" check`), 'check');
  passes(call(`node "${P}/scripts/setup.js" retired --apply`, {}), 'hilo principal');
  passes(call('node "C:/otro/proyecto/scripts/setup.js" retired --apply'), 'setup.js ajeno');
});
