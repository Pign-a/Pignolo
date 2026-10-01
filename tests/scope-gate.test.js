'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, git, PLUGIN_ROOT } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const gate = require(path.join(PLUGIN_ROOT, 'lib', 'scope-gate.js'));
const handler = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'scope-gate.js'));

const REQUEST = 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.';
const CARD = `# T

## Goal
Una tarjeta.

## Acceptance examples
- Con "una tarjeta de alcance" queda registrada
- Con "tres ejemplos de aceptacion" valida
- Con "no agregar nada sin avisar" lista lo agregado

## Request to spec
- x

## Not included or reinterpreted
- none

## Added without being asked
- none

## Out of scope
- x

## Reserved decisions
- none

## Cost estimate
- x
`;
const PS_T = 30000;

function project() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'state', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  return repo;
}
function mkPlan(repo, plan, card) {
  assert.ok(ps.newPlan({ main: repo, plan, request: REQUEST, spec: 's' }).ok);
  if (card === 'draft' || card === 'approved') assert.ok(ps.saveScopeCard({ main: repo, plan, text: CARD }).ok);
  if (card === 'approved') assert.ok(ps.approveScopeCard({ main: repo, plan, quote: 'ok' }).ok);
}
function writeRun(repo, over = {}) {
  const run = { v: 1, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: new Date(Date.now() + 3600000).toISOString(), ...over };
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
}
// branch: rama actual simulada (null = detached o ilegible; 'throw' = plazo agotado)
const dec = (repo, command, { branch = 'main', shell = 'bash', env = {} } = {}) => gate.decide({
  command, cwd: repo, env: { ...process.env, ...env }, shell,
  deps: { currentBranch: () => { if (branch === 'throw') throw new Error('timeout'); return branch; }, psTimeoutMs: PS_T },
});
const denied = (r, re) => { assert.ok(r, 'se esperaba un bloqueo'); assert.match(`${r.reason} ${r.alternative}`, re || /./); assert.ok(r.alternative); };

test('no plans folder, no run.json: a loose daily is never touched; PIGNOLO_DISABLED too', () => {
  const repo = project();
  fs.rmSync(path.join(repo, '.pignolo', 'state'), { recursive: true });
  assert.equal(dec(repo, 'git merge int/p1'), null);
  const repo2 = project();
  mkPlan(repo2, 'p1', 'draft');
  assert.equal(dec(repo2, 'git merge int/p1', { env: { PIGNOLO_DISABLED: '1' } }), null);
  assert.ok(dec(repo2, 'git merge int/p1'));
});

test('project not active (no project.md) is silent', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'state', 'plans', 'p1'), { recursive: true });
  assert.equal(dec(repo, 'git merge int/p1'), null);
});

test('draft card: merge and push to main are denied, other targets are not', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  denied(dec(repo, 'git merge int/p1'), /draft/);
  writeRun(repo, { flow: 'plan', plan: 'p1' });
  denied(dec(repo, 'git push origin main'));
  assert.equal(dec(repo, 'git push origin task/p1/01-x'), null);
  assert.equal(dec(repo, 'git merge x', { branch: 'int/p1' }), null);
});

test('approved card passes; editing the card changes the state and denies; truncated plan.json denies', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'approved');
  assert.equal(dec(repo, 'git merge int/p1'), null);
  fs.appendFileSync(path.join(repo, '.pignolo', 'state', 'plans', 'p1', 'scope-card.md'), '\nextra\n');
  denied(dec(repo, 'git merge int/p1'), /changed|cambi/);
  const repo2 = project();
  mkPlan(repo2, 'p1', 'approved');
  const f = path.join(repo2, '.pignolo', 'state', 'plans', 'p1', 'plan.json');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, 20));
  denied(dec(repo2, 'git merge int/p1'), /unreadable|ilegible/);
});

test('flow plan without plan is denied; a daily branch with a draft plan and no run.json.plan is not', () => {
  const repo = project();
  writeRun(repo, { flow: 'plan' });
  denied(dec(repo, 'git merge feature-x'), /no-plan/);
  denied(dec(repo, 'git merge int/p1'), /unregistered/);
  const repo2 = project();
  mkPlan(repo2, 'p1', 'draft');
  assert.equal(dec(repo2, 'git merge task/daily/2026-09-30-x'), null);
});

test('destinations the first regex draft let through', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  const rows = [
    ['checkout main && merge', 'git checkout main && git merge int/p1', { branch: 'int/p1' }],
    ['switch main; merge', 'git switch main; git merge int/p1', { branch: 'int/p1' }],
    ['merge with detached HEAD', 'git merge int/p1', { branch: null }],
    ['merge when currentBranch times out', 'git merge int/p1', { branch: 'throw' }],
    ['cd main && merge', `cd ${repo} && git merge int/p1`, { branch: 'task/p1/01-x' }],
    ['git -C main merge', `git -C ${repo} merge int/p1`, { branch: 'task/p1/01-x' }],
    ['plain push on main with run.json.plan', 'git push', { branch: 'main', run: true }],
    ['push origin HEAD on main', 'git push origin HEAD', { branch: 'main', run: true }],
    ['push origin HEAD:main from int/p1', 'git push origin HEAD:main', { branch: 'int/p1' }],
    ['push to refs/heads/main', 'git push origin int/p1:refs/heads/main', { branch: 'int/p1' }],
    ['push --all on main', 'git push --all', { branch: 'main', run: true }],
  ];
  for (const [name, cmd, o] of rows) {
    if (o.run) writeRun(repo, { plan: 'p1' }); else fs.rmSync(path.join(repo, '.pignolo', 'run.json'), { force: true });
    const r = dec(repo, cmd, { branch: o.branch });
    assert.ok(r, name);
    assert.deepEqual(r.plans, ['p1'], name);
  }
});

test('verbs that also land on main', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  for (const cmd of ['git pull . int/p1', 'git rebase int/p1', 'git cherry-pick int/p1~3..int/p1', 'git fetch . int/p1:main',
    'git fetch . +int/p1:refs/heads/main', 'git branch -f main int/p1', 'git branch --force master int/p1', 'git update-ref refs/heads/main int/p1', 'git reset --soft int/p1']) {
    assert.ok(dec(repo, cmd), cmd);
  }
  // límite declarado: lo que no está en la lista no se mira
  assert.equal(dec(repo, 'git stash'), null);
  assert.equal(dec(repo, 'git tag -f v1 int/p1'), null);
  assert.equal(dec(repo, 'git reset --soft HEAD~1'), null);
  assert.equal(dec(repo, 'git merge --abort'), null);
});

test('classified by subcommand, not by loose words', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  assert.equal(dec(repo, 'git log --grep merge'), null);
  assert.equal(dec(repo, 'git commit -F msg.txt'), null);
  assert.equal(dec(repo, 'git log int/p1 --oneline && git branch -a'), null);
  assert.equal(dec(repo, 'git fetch origin'), null);
});

test('registry and run.json states', () => {
  const repo = project();
  mkPlan(repo, 'other', 'approved');
  writeRun(repo, { flow: 'plan', plan: 'foo' });
  denied(dec(repo, 'git merge int/foo'), /unregistered|registr/);
  fs.rmSync(path.join(repo, '.pignolo', 'run.json'));
  assert.equal(dec(repo, 'git merge int/foo'), null);
  // run.json truncado con plans/ presente
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), '{"v":1,"flo');
  denied(dec(repo, 'git merge int/other'), /unreadable-run|marcador/);
  assert.equal(dec(repo, 'git log'), null);
  // run.json vencido: se usa su campo plan
  const repo2 = project();
  mkPlan(repo2, 'p1', 'draft');
  writeRun(repo2, { plan: 'p1', expires: '2020-01-01T00:00:00.000Z' });
  denied(dec(repo2, 'git push origin main'), /draft/);
  // un comando que no se puede parsear dentro de un plan
  denied(dec(repo2, 'git merge "int/p1'), /unparseable|analiz/);
});

test('PowerShell gives the same verdicts as Bash', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  const o = { shell: 'powershell' };
  assert.ok(dec(repo, 'git merge int/p1', o));
  assert.ok(dec(repo, 'Write-Output ok; git merge int/p1 | Out-Null', o));
  assert.ok(dec(repo, 'git checkout main; git merge int/p1', { ...o, branch: 'int/p1' }));
  assert.equal(dec(repo, 'echo merge main', o), null);
  assert.equal(dec(repo, 'git merge x', { ...o, branch: 'int/p1' }), null);
});

test('handler: exit 2 with Alternativa on deny, silence otherwise, off switches', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  git(['checkout', '-q', '-b', 'int/p1'], repo);
  const input = (command, tool = 'Bash') => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: repo });
  const ok = handler.run(input('git status'), { env: {} });
  assert.deepEqual([ok.exit, ok.stdout, ok.stderr], [0, undefined, undefined]);
  // la rama real del repo es int/p1: un merge ahí no apunta a main
  assert.equal(handler.run(input('git merge x'), { env: {} }).exit, 0);
  git(['checkout', '-q', 'main'], repo);
  const r = handler.run(input('git merge int/p1'), { env: {} });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /Alternativa:/);
  assert.match(r.stderr, /plan\.js scope-card approve/);
  assert.equal(handler.run(input('git merge int/p1'), { env: { PIGNOLO_DISABLED: '1' } }).exit, 0);
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  assert.equal(handler.run(input('git merge int/p1'), { env: {} }).exit, 0);
});

test('handler: a missing command or non-text input is silent', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  assert.equal(handler.run({ tool_name: 'Bash', tool_input: {}, cwd: repo }, { env: {} }).exit, 0);
  assert.equal(handler.run({ tool_name: 'Bash', tool_input: { command: 5 }, cwd: repo }, { env: {} }).exit, 0);
});

// I-1: formas que mueven el plan a main y el primer borrador dejaba pasar
test('I-1: rebase, pull refspec, branch move/copy and checkout/switch -B/-C that land the plan on main are denied', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  writeRun(repo, { plan: 'p1' });
  const rows = [
    'git rebase int/p1 main',
    'git rebase --onto int/p1 main~0 main',
    'git pull . int/p1:main',
    'git branch -M int/p1 main',
    'git branch -C int/p1 main',
    'git branch --force --move int/p1 main',
    'git checkout -B main int/p1',
    'git switch -C main int/p1',
    'git switch --force-create main int/p1',
    'git checkout -Bmain int/p1',
  ];
  for (const cmd of rows) {
    const r = dec(repo, cmd, { branch: 'int/p1' });
    assert.ok(r, cmd);
    assert.deepEqual(r.plans, ['p1'], cmd);
  }
  // lo que no toca main sigue libre
  for (const cmd of ['git rebase main int/p1', 'git branch -M int/p1 int/p2', 'git checkout -B feature int/p1', 'git switch -C feature main', 'git checkout int/p1', 'git pull . main:int/p1']) {
    assert.equal(dec(repo, cmd, { branch: 'int/p1' }), null, cmd);
  }
});

// I-2: git en Windows no distingue mayúsculas
test('I-2: the prefilter is case-insensitive: Git merge int/p1 is parsed and denied', () => {
  const repo = project();
  mkPlan(repo, 'p1', 'draft');
  denied(dec(repo, 'Git merge int/p1'), /draft/);
});

// I-3: el registro viaja en la rama del plan; en main la carpeta no existe
function committedInBranch(card, { withRun } = {}) {
  const repo = project();
  mkPlan(repo, 'p1', card);
  git(['checkout', '-q', '-b', 'int/p1'], repo);
  git(['add', '-f', '.pignolo/state/plans'], repo);
  git(['commit', '-q', '-m', 'plan'], repo);
  git(['checkout', '-q', 'main'], repo);
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'state', 'plans', 'p1')), 'en main el registro no existe en disco');
  if (withRun) writeRun(repo, { plan: 'p1' });
  return repo;
}

test('I-3: registry committed in int/p1, on main with run.json.plan: approved card is allowed, draft is denied', () => {
  const ok = committedInBranch('approved', { withRun: true });
  assert.equal(dec(ok, 'git merge int/p1'), null);
  assert.equal(dec(ok, 'git push origin main'), null);
  const draft = committedInBranch('draft', { withRun: true });
  denied(dec(draft, 'git merge int/p1'), /draft/);
});

test('I-3: without run.json, naming int/<p> activates the rule and the registry is read from the branch', () => {
  const draft = committedInBranch('draft');
  denied(dec(draft, 'git merge int/p1'), /draft/);
  denied(dec(draft, 'git merge queue/p1'), /./) ;
  const ok = committedInBranch('approved');
  assert.equal(dec(ok, 'git merge int/p1'), null);
  // sin rama del plan no hay registro: no es un plan y un daily suelto no se toca
  const none = project();
  fs.rmSync(path.join(none, '.pignolo', 'state'), { recursive: true });
  assert.equal(dec(none, 'git merge int/p9'), null);
});

test('I-3: a git that cannot answer fails closed inside a plan', () => {
  const repo = committedInBranch('approved', { withRun: true });
  const saved = process.env.PATH;
  try {
    process.env.PATH = '';
    process.env.Path = '';
    const r = dec(repo, 'git merge int/p1');
    assert.ok(r, 'sin git no se puede leer el registro: se niega');
  } finally { process.env.PATH = saved; process.env.Path = saved; }
});

test('M-3: the handler comment no longer claims it denies only when the command looks like it reaches main', () => {
  const src = fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'scope-gate.js'), 'utf8');
  assert.ok(!/se niega solo si el comando parece llevar algo a main/.test(src));
});
