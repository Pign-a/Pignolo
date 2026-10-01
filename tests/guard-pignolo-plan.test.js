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
  for (const s of ['plan.js status --plan p', 'plan.js decision add --plan p --id D-1', 'plan-audit.js begin-review --plan p', 'approved.js save --flow f']) {
    denied(call(`node ${P}/scripts/${s}`), s);
    passes(call(`node ${P}/scripts/${s}`, {}), `main ${s}`);
  }
});

// Protects: hito 6, Task 8 (los scripts que escriben .pignolo/state/ son del hilo principal) ·
// Breaks if: PLAN_SCRIPT no suma close-session.js y state-index.js.
test('a subagent cannot run close-session.js or state-index.js; the main thread can', () => {
  for (const s of ['close-session.js archive', 'state-index.js', 'state-index.js --check']) {
    denied(call(`node ${P}/scripts/${s}`), s);
    passes(call(`node ${P}/scripts/${s}`, {}), `main ${s}`);
  }
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/close-session.js" prune'), 'close-session dyn');
  denied(call(`& node "${P}/scripts/state-index.js"`, SUB, 'PowerShell'), 'state-index ps');
  passes(call('node scripts/close-session.js archive'), 'project close-session.js');
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

// Protects: I3 de la revisión final del hito 6 (G19: la compuerta reconocía pocas formas) · Breaks if:
// PLAN_SCRIPT vuelve a exigir .js, o node -e/-p/-r con el script del plugin deja de negarse.
test('a subagent cannot run the state scripts without the .js extension', () => {
  for (const s of ['plan', 'plan-audit', 'approved', 'close-session archive', 'state-index', 'state-index --check']) {
    denied(call(`node ${P}/scripts/${s}`), s);
    passes(call(`node ${P}/scripts/${s}`, {}), `main ${s}`);
  }
  denied(call('node "${CLAUDE_PLUGIN_ROOT}/scripts/close-session" prune'), 'dyn sin extensión');
  denied(call('node "C:/Users/u/.claude/plugins/cache/pignolo/pignolo/0.7.0/scripts/plan" status'), 'cache sin extensión');
  denied(call(`& node "${P}/scripts/state-index"`, SUB, 'PowerShell'), 'ps sin extensión');
  assert.equal(call(`node "${P}/scripts/run" end`).exit, 2, 'run sin extensión');
  assert.equal(call(`node "${P}/scripts/holdout"`).exit, 2, 'holdout sin extensión');
  passes(call('node scripts/close-session archive'), 'script relativo de un proyecto');
  passes(call('node D:/pignolo/scripts/plan status'), 'repo llamado pignolo');
});

test('a subagent cannot load the state scripts with node -e/-p/-r (their main runs on load); the lib is a declared limit', () => {
  for (const c of [
    `node -e "require('${P}/scripts/state-index.js')"`,
    `node -e "require('${P}/scripts/state-index')"`,
    `node -p "require('${P}/scripts/close-session.js')"`,
    `node --eval "require('${P}/scripts/plan.js')"`,
    `node -r ${P}/scripts/close-session.js -e 1`,
    'node -e "require(\'${CLAUDE_PLUGIN_ROOT}/scripts/close-session\')"',
    `node -e "require('${P.replace(/\//g, '\\\\')}\\scripts\\state-index.js')"`,
  ]) denied(call(c), c);
  passes(call(`node -e "require('${P}/scripts/state-index.js')"`, {}), 'main thread');
  passes(call(`node -e "require('${P}/lib/learnings.js')"`), 'la lib: límite declarado (spec 8.3)');
});

// Protects: G21 (leer no se niega) · Breaks if: la regla niega cat, grep, head, wc o node --check.
test('reading the state scripts is never denied, with or without the extension', () => {
  for (const s of ['close-session', 'close-session.js', 'state-index', 'plan', 'plan-audit.js', 'approved']) {
    for (const reader of ['cat', 'grep -n main', 'head -20', 'wc -l', 'sed -n 1,5p']) passes(call(`${reader} ${P}/scripts/${s}`), `${reader} ${s}`);
  }
  passes(call(`node --check ${P}/scripts/state-index.js`), 'node --check');
  passes(call(`node -c ${P}/scripts/close-session.js`), 'node -c');
  for (const c of [`Get-Content ${P}/scripts/close-session`, `Select-String -Pattern x -Path ${P}/scripts/state-index.js`]) passes(call(c, SUB, 'PowerShell'), c);
});

// Protects: spec §8.3 (leer .pignolo/state/decisions/ sigue permitido a un subagente: el spec-reviewer lo necesita) ·
// Breaks if: la guardia niega `cat`/`grep`/`ls` de las decisiones.
// Límite declarado (no se testea como bloqueo): una escritura por redirección o `cp` a .pignolo/state/ desde Bash
// no la cubre ninguna regla; la cubre la revisión del diff y la aprobación humana de la tarjeta (spec §4.5, §8.3).
test('a subagent can read the recorded decisions', () => {
  for (const c of ['cat .pignolo/state/decisions/2026-10-01-p1-d-1.md', 'grep -r quote .pignolo/state/decisions/', 'ls .pignolo/state/decisions']) passes(call(c), c);
});
