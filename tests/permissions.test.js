'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { evaluate, RULES } = require('../plugins/pignolo/lib/git-guard');

const tpl = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions;

const shellOf = (rule) => (rule.startsWith('PowerShell(') ? 'powershell' : 'bash');
const inner = (rule) => rule.replace(/^(Bash|PowerShell)\(/, '').replace(/\)$/, '');

// Criterio de Claude Code (permissions.md, "Wildcard patterns"): `*` es cualquier
// texto, y un ` *` final también acepta el comando sin nada más solo si es el
// único comodín de la regla (F10).
function patternRegex(rule) {
  const body = inner(rule);
  const trailing = body.endsWith(' *') && body.split('*').length === 2;
  const core = (trailing ? body.slice(0, -2) : body).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${core}${trailing ? '( .*)?' : ''}$`);
}

// Muestra por defecto: cada `*` se vuelve `x`. Las reglas cuyo `*` debe ser un
// comando con sentido llevan una muestra explícita.
const SAMPLE_OVERRIDES = {
  'Bash(GIT_CONFIG_* *)': 'GIT_CONFIG_COUNT=1 git status',
  'Bash(bash -c *git *)': 'bash -c "git reset --hard"',
  'Bash(sh -c *git *)': 'sh -c "git stash"',
  'Bash(node -e *git *)': 'node -e "require(\'child_process\').execSync(\'git stash\')"',
  'Bash(python -c *git *)': 'python -c "import os; os.system(\'git stash\')"',
  'Bash(python3 -c *git *)': 'python3 -c "import os; os.system(\'git stash\')"',
  'Bash(cmd /c *git *)': 'cmd /c git reset --hard',
  'Bash(cmd.exe /c *git *)': 'cmd.exe /c git reset --hard',
  'Bash(eval *)': 'eval "git reset --hard"',
  'Bash(xargs *git *)': 'xargs git reset --hard',
  'Bash(find * -exec *git *)': 'find . -exec git checkout -- {} +',
  'Bash(alias *git*)': "alias g='git reset --hard'",
  'Bash(rm *pignolo*disabled*)': 'rm .pignolo/.disabled',
  'Bash(touch *pignolo*disabled*)': 'touch ~/.pignolo/disabled',
  'Bash(* > *pignolo*disabled*)': 'echo x > .pignolo/.disabled',
  'Bash(*launcher.js* toggle*)': 'node "C:/p/hooks/launcher.js" toggle',
  'PowerShell(* -EncodedCommand *)': 'powershell -EncodedCommand ZwBpAHQA',
  'PowerShell(* -enc *)': 'pwsh -enc ZwBpAHQA',
  'PowerShell(Remove-Item *pignolo*disabled*)': 'Remove-Item .pignolo\\.disabled',
  'PowerShell(New-Item *pignolo*disabled*)': 'New-Item .pignolo\\.disabled',
  'PowerShell(Set-Content *pignolo*disabled*)': 'Set-Content .pignolo\\.disabled x',
  'PowerShell(*launcher.js* toggle*)': "'{}' | node C:\\p\\hooks\\launcher.js toggle",
};

function sampleOf(rule) {
  if (SAMPLE_OVERRIDES[rule]) return SAMPLE_OVERRIDES[rule];
  const body = inner(rule);
  return (body.endsWith(' *') ? `${body.slice(0, -2)} x` : body).replace(/\*/g, 'x');
}

// Una muestra por cada regla `block` de la guardia. Las que una regla de
// permisos no puede expresar quedan declaradas con su motivo.
const BLOCK_SAMPLES = {
  'git-config-override': ['bash', 'git -c alias.x="reset --hard" x'],
  'git-env-config': ['bash', 'GIT_CONFIG_COUNT=1 git status'],
  stash: ['bash', 'git stash'],
  'checkout-path': ['bash', 'git checkout -- src/a.js'],
  'checkout-force': ['bash', 'git checkout -f main'],
  'switch-force': ['bash', 'git switch -f main'],
  restore: ['bash', 'git restore src/a.js'],
  'reset-hard': ['bash', 'git reset --hard HEAD~1'],
  clean: ['bash', 'git clean -fd'],
  'worktree-remove-force': ['bash', 'git worktree remove --force ../wt'],
  'no-verify': ['bash', 'git commit --no-verify -m x'],
  'gc-prune': ['bash', 'git gc --prune=now'],
  'reflog-expire': ['bash', 'git reflog expire --all'],
  'push-force': ['bash', 'git push --force origin main'],
  'send-pack': ['bash', 'git send-pack --force origin main'],
  'config-write': ['bash', 'git config alias.x "!git reset --hard"'],
  'pignolo-ref': ['bash', 'git update-ref -d refs/pignolo/wip/x'],
  'update-ref-stdin': ['bash', 'git update-ref --stdin'],
  'read-tree-update': ['bash', 'git read-tree -u --reset HEAD'],
  'checkout-index-force': ['bash', 'git checkout-index -f -a'],
  'rm-force': ['bash', 'git rm -f a.js'],
  'protected-flag': ['bash', 'rm .pignolo/.disabled'],
  'pignolo-launcher': ['bash', 'node "C:/p/pignolo/hooks/launcher.js" toggle'],
  'catastrophic-delete': ['bash', 'rm -rf .git'],
  'protected-path': ['bash', 'touch ~/.pignolo/disabled'],
};
// Reglas deny que un prefijo de permiso no puede expresar. Las no verificables
// no necesitan regla de capa 1: en modos interactivos la guardia pide confirmación.
const NOT_EXPRESSIBLE = {
  'invalid-input': 'no es un comando: no hay texto que una regla pueda comparar',
  'git-C': 'depende del subcomando: con lecturas se permite (F12)',
  'fetch-force-head': 'depende de la combinación de --update-head-ok con un refspec forzado',
  'dynamic-redirect': 'el destino sale de una variable; una regla solo ve el texto literal',
  'pignolo-run': 'depende del payload (agent_id): el hilo principal sí corre run.js; una regla de permisos no distingue',
  'pignolo-holdout': 'depende del payload (agent_id, agent_type): el hilo principal y el validator sí corren holdout.js',
};

test('a trailing " *" matches the bare command only when it is the only wildcard (F10)', () => {
  assert.ok(patternRegex('Bash(git stash drop *)').test('git stash drop'));
  assert.ok(patternRegex('Bash(git stash drop *)').test('git stash drop stash@{0}'));
  assert.ok(!patternRegex('Bash(git push * --force *)').test('git push origin --force'));
  assert.ok(patternRegex('Bash(git push * --force *)').test('git push origin --force main'));
});

test('template has deny and ask arrays for both shells', () => {
  assert.ok(Array.isArray(tpl.deny) && tpl.deny.length > 0);
  assert.ok(Array.isArray(tpl.ask) && tpl.ask.length > 0);
  assert.ok(tpl.deny.some((r) => r.startsWith('PowerShell(')));
  assert.ok(tpl.ask.some((r) => r.startsWith('PowerShell(')));
});

// En un modo autónomo lo no verificable también es deny (en interactivos pide
// confirmación: la capa 1, que niega siempre, es más estricta a propósito).
test('every deny rule is also blocked by the guard (autonomous mode)', () => {
  for (const rule of tpl.deny) {
    const sample = sampleOf(rule);
    assert.match(sample, patternRegex(rule), `${rule} does not match its own sample`);
    assert.strictEqual(evaluate(sample, { shell: shellOf(rule), mode: 'bypassPermissions' }).decision, 'block', `${rule} -> "${sample}"`);
  }
});

test('every block rule of the guard has a deny rule in the template (or a declared reason)', () => {
  for (const [id, [cls]] of Object.entries(RULES)) {
    if (cls !== 'deny' && cls !== 'catastrophic') continue;
    if (NOT_EXPRESSIBLE[id]) continue;
    assert.ok(BLOCK_SAMPLES[id], `rule ${id} needs a sample here`);
    const [shell, sample] = BLOCK_SAMPLES[id];
    assert.strictEqual(evaluate(sample, { shell }).rule, id, `sample for ${id}`);
    const tool = shell === 'powershell' ? 'PowerShell(' : 'Bash(';
    assert.ok(tpl.deny.some((r) => r.startsWith(tool) && patternRegex(r).test(sample)), `no deny rule covers ${id}: "${sample}"`);
  }
});

test('every Bash/PowerShell ask rule is asked (or blocked) by the guard on main', () => {
  for (const rule of tpl.ask.filter((r) => /^(Bash|PowerShell)\(/.test(r))) {
    const sample = sampleOf(rule);
    const d = evaluate(sample, { shell: shellOf(rule), branch: 'main' }).decision;
    assert.ok(d === 'ask' || d === 'block', `${rule} -> "${sample}" -> ${d}`);
  }
});

test('MCP tools that send data ask for confirmation (spec §8.1)', () => {
  for (const verb of ['send', 'push', 'create', 'update', 'navigate']) {
    assert.ok(tpl.ask.includes(`mcp__*__*${verb}*`), verb);
  }
});
