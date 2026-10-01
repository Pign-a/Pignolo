'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const { PROFILE_PARAMS } = require(path.join(PLUGIN_ROOT, 'lib', 'roles.js'));

const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'plan.js');
const REQUEST = 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.';
const CARD = (example = 'una tarjeta de alcance', added = '- none') => `# T

## Goal
Una tarjeta.

## Acceptance examples
- Con "${example}" queda registrada
- Con "tres ejemplos de aceptacion" valida
- Con "no agregar nada sin avisar" lista lo agregado

## Request to spec
- x

## Not included or reinterpreted
- none

## Added without being asked
${added}

## Out of scope
- x

## Reserved decisions
- none

## Cost estimate
- x
`;

function plan(cwd, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20000, env: { ...process.env } });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stderr: r.stderr };
}
function file(text, name = 'f.txt') {
  const p = path.join(makeTempDir('plan-cli-'), name);
  fs.writeFileSync(p, text);
  return p;
}

test('walk through the CLI: new, claims, advance, scope-card, approve', () => {
  const repo = makeRepo();
  const ok = (args) => { const r = plan(repo, args); assert.strictEqual(r.status, 0, `${args.join(' ')}: ${r.stderr}`); return r.out; };
  ok(['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 'docs/specs/x.md']);
  assert.strictEqual(ok(['status', '--plan', 'p1']).stage, 'spec');
  ok(['advance', '--plan', 'p1', '--to', 'claims']);
  ok(['claims', 'set', '--plan', 'p1', '--file', file(JSON.stringify([{ id: 'K1', text: 'a', system: 's' }]))]);
  assert.strictEqual(plan(repo, ['claims', 'check', '--plan', 'p1']).status, 1);
  ok(['claims', 'resolve', '--plan', 'p1', '--id', 'K1', '--status', 'corroborated', '--source', 'doc', '--by', 'yo']);
  ok(['claims', 'check', '--plan', 'p1']);
  ok(['advance', '--plan', 'p1', '--to', 'spec-review']);
  assert.strictEqual(ok(['scope-card', 'status', '--plan', 'p1']).state, 'none');
  ok(['scope-card', 'save', '--plan', 'p1', '--file', file(CARD())]);
  assert.strictEqual(ok(['scope-card', 'status', '--plan', 'p1']).state, 'draft');
  ok(['scope-card', 'approve', '--plan', 'p1', '--quote-file', file('dale')]);
  assert.strictEqual(ok(['scope-card', 'status', '--plan', 'p1']).state, 'approved');
  ok(['advance', '--plan', 'p1', '--to', 'scope-card']);
  assert.strictEqual(plan(repo, ['advance', '--plan', 'p1', '--to', 'audited']).status, 1, 'skip is refused');
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'state', 'plans', 'p1', 'scope-card.md')));
});

test('claims set with --none-reason; a duplicate new is exit 1', () => {
  const repo = makeRepo();
  assert.strictEqual(plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST)]).status, 0);
  assert.strictEqual(plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST)]).status, 1);
  assert.strictEqual(plan(repo, ['advance', '--plan', 'p1', '--to', 'claims']).status, 1, 'no spec registered');
});

test('every verb with a missing argument is exit 2', () => {
  const repo = makeRepo();
  const cases = [
    [], ['nada'], ['new'], ['new', '--plan', 'p1'], ['new', '--request-file', 'x'], ['new', '--plan', 'A b', '--request-file', 'x'],
    ['claims'], ['claims', 'set', '--plan', 'p1'], ['claims', 'resolve', '--plan', 'p1', '--id', 'K1'],
    ['claims', 'check'], ['scope-card', 'save', '--plan', 'p1'], ['scope-card', 'approve', '--plan', 'p1'], ['scope-card', 'status'],
    ['tasks', 'set', '--plan', 'p1'], ['runnable'], ['advance', '--plan', 'p1'], ['status'],
  ];
  for (const args of cases) assert.strictEqual(plan(repo, args).status, 2, args.join(' '));
});

test('scope-card save with an invented quote is exit 1 and the error names the example', () => {
  const repo = makeRepo();
  plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 's']);
  const r = plan(repo, ['scope-card', 'save', '--plan', 'p1', '--file', file(CARD('una cosa inventada'))]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /ejemplo 1/);
  assert.match(r.stderr, /una cosa inventada/);
});

test('scope-card approve from a task worktree resolves the main checkout registry', () => {
  const repo = makeRepo();
  plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 's']);
  plan(repo, ['scope-card', 'save', '--plan', 'p1', '--file', file(CARD())]);
  const wt = path.join(makeTempDir('plan-cli-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'task-x', wt], repo);
  const r = plan(wt, ['scope-card', 'approve', '--plan', 'p1', '--quote-file', file('dale')]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(plan(repo, ['scope-card', 'status', '--plan', 'p1']).out.state, 'approved');
  assert.ok(!fs.existsSync(path.join(wt, '.pignolo', 'state')), 'no second registry in the worktree');
});

test('preApprovalTasks per profile (D-5-3) and runnable', () => {
  assert.deepStrictEqual([PROFILE_PARAMS.max.preApprovalTasks, PROFILE_PARAMS.balanced.preApprovalTasks, PROFILE_PARAMS.economy.preApprovalTasks], [3, 2, 1]);
  const repo = makeRepo();
  plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 's']);
  plan(repo, ['scope-card', 'save', '--plan', 'p1', '--file', file(CARD('una tarjeta de alcance', '- A1: extra'))]);
  const tasks = [{ id: 'T1', added: [] }, { id: 'T2', added: ['A1'] }, { id: 'T3', added: [] }, { id: 'T4', added: [] }, { id: 'T5', added: [] }];
  assert.strictEqual(plan(repo, ['tasks', 'set', '--plan', 'p1', '--file', file(JSON.stringify(tasks))]).status, 0);
  const ids = (profile) => plan(repo, ['runnable', '--plan', 'p1', '--profile', profile]).out.tasks.map((t) => t.id);
  assert.deepStrictEqual(ids('economy'), ['T1']);
  assert.deepStrictEqual(ids('balanced'), ['T1', 'T3']);
  assert.deepStrictEqual(ids('max'), ['T1', 'T3', 'T4']);
  assert.strictEqual(plan(repo, ['runnable', '--plan', 'p1', '--profile', 'nope']).status, 2);
  // sin --profile: el del usuario (balanced por defecto)
  assert.deepStrictEqual(plan(repo, ['runnable', '--plan', 'p1']).out.tasks.map((t) => t.id), ['T1', 'T3']);
  // con la tarjeta aprobada ya no hay tope
  plan(repo, ['scope-card', 'approve', '--plan', 'p1', '--quote-file', file('ok')]);
  assert.strictEqual(plan(repo, ['runnable', '--plan', 'p1', '--profile', 'economy']).out.tasks.length, 5);
});

test('tasks set validates its input', () => {
  const repo = makeRepo();
  plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 's']);
  assert.strictEqual(plan(repo, ['tasks', 'set', '--plan', 'p1', '--file', file('[{"added":[]}]')]).status, 1);
  assert.strictEqual(plan(repo, ['tasks', 'set', '--plan', 'p1', '--file', file('no json')]).status, 1);
});

test('claims set --none-reason registers the reason and lets the plan advance', () => {
  const repo = makeRepo();
  plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 's']);
  assert.strictEqual(plan(repo, ['advance', '--plan', 'p1', '--to', 'claims']).status, 0);
  assert.strictEqual(plan(repo, ['advance', '--plan', 'p1', '--to', 'spec-review']).status, 1, 'no claims and no reason yet');
  assert.strictEqual(plan(repo, ['claims', 'set', '--plan', 'p1', '--none-reason', '']).status, 1);
  assert.strictEqual(plan(repo, ['claims', 'set', '--plan', 'p1', '--none-reason', 'sin supuestos externos']).status, 0);
  assert.strictEqual(plan(repo, ['advance', '--plan', 'p1', '--to', 'spec-review']).status, 0);
});
