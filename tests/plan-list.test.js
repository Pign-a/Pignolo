'use strict';
// `plan.js list` y `next` con la etapa de cada plan (hito 7a, Task 16, R-16; A7M-18 y A7M-19). Solo lectura.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const { deriveNext, planList } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));

const PLAN_CLI = path.join(PLUGIN_ROOT, 'scripts', 'plan.js');
const NEXT_CLI = path.join(PLUGIN_ROOT, 'scripts', 'next.js');
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
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const next = (cwd) => deriveNext({ cwd, env: process.env, now: NOW });
const run = (cwd, args, script = PLAN_CLI) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30000 });
  return { status: r.status, out: r.stdout.trim() ? r.stdout : '', json: r.stdout.trim().startsWith('{') ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
};
const mk = (repo, plan, stage, created) => {
  assert.ok(ps.newPlan({ main: repo, plan, request: REQUEST, spec: 's', now: created }).ok);
  assert.ok(ps.update({ main: repo, plan }, (p) => { p.stage = stage; return null; }).ok);
};
const approveCard = (repo, plan) => {
  assert.ok(ps.saveScopeCard({ main: repo, plan, text: CARD }).ok);
  assert.ok(ps.approveScopeCard({ main: repo, plan, quote: 'sí, esa tarjeta' }).ok);
};
const snapshot = (repo) => ({ refs: git(['for-each-ref', '--format=%(refname) %(objectname)'], repo), status: git(['status', '--porcelain', '--ignored'], repo) });

function three() {
  const repo = makeRepo();
  mk(repo, 'viejo', 'spec', '2026-09-28T10:00:00.000Z');
  mk(repo, 'medio', 'audited', '2026-09-29T10:00:00.000Z');
  approveCard(repo, 'medio');
  mk(repo, 'nuevo', 'executing', '2026-09-30T10:00:00.000Z');
  return repo;
}

test('plan.js list: tres planes con su etapa y su tarjeta, del más reciente al más antiguo; --text una línea cada uno; sin --plan sale 0', () => {
  const repo = three();
  const r = run(repo, ['list']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.json.plans.map((p) => [p.plan, p.stage, p.card]), [['nuevo', 'executing', 'none'], ['medio', 'audited', 'approved'], ['viejo', 'spec', 'none']]);
  const t = run(repo, ['list', '--text']);
  assert.strictEqual(t.status, 0, t.stderr);
  assert.deepStrictEqual(t.out.trim().split('\n'), ['nuevo · executing · tarjeta none', 'medio · audited · tarjeta approved', 'viejo · spec · tarjeta none']);
  assert.deepStrictEqual(run(makeRepo(), ['list']).json, { plans: [] }, 'sin planes: plans vacío y exit 0');
  assert.strictEqual(run(makeRepo(), ['list']).status, 0);
  // los demás verbos siguen pidiendo --plan
  assert.strictEqual(run(repo, ['status']).status, 2);
  assert.strictEqual(run(repo, ['list', '--plan', 'x']).status, 2, 'list no acepta --plan');
});

test('plan.js list: un plan.json truncado sale unreadable y los otros dos quedan intactos (A7M-18)', () => {
  const repo = three();
  fs.writeFileSync(path.join(ps.planDir(repo, 'medio'), 'plan.json'), '{"v":1,"plan":');
  const r = run(repo, ['list']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.json.plans.map((p) => p.plan), ['nuevo', 'viejo', 'medio']);
  assert.deepStrictEqual(r.json.plans[2], { plan: 'medio', unreadable: true });
  assert.strictEqual(r.json.plans[0].stage, 'executing');
  assert.strictEqual(r.json.plans[1].stage, 'spec');
  assert.match(run(repo, ['list', '--text']).out, /medio · ilegible/);
});

test('next: el principal es el plan sin cerrar más reciente como hoy y los otros salen en facts con su etapa; el JSON trae plans', () => {
  const repo = three();
  const n = next(repo);
  assert.strictEqual(n.kind, 'plan-executing', 'guarda de regresión: el principal no cambia');
  assert.match(n.text, /^El plan nuevo está en la etapa executing/);
  assert.ok(n.facts.includes('Plan medio: etapa audited.'), JSON.stringify(n.facts));
  assert.ok(n.facts.includes('Plan viejo: etapa spec.'));
  assert.ok(!n.facts.some((f) => /^Plan nuevo:/.test(f)), 'el principal no se repite');
  const viaCli = run(repo, [], NEXT_CLI);
  assert.strictEqual(viaCli.status, 0);
  assert.deepStrictEqual(viaCli.json.plans.map((p) => p.plan), ['nuevo', 'medio', 'viejo']);
  assert.strictEqual(viaCli.json.kind, 'plan-executing');
  assert.deepStrictEqual(planList(repo).map((p) => p.plan), ['nuevo', 'medio', 'viejo']);
});

test('next: más de 8 planes sin cerrar dan 8 líneas y la cuenta; un plan cerrado no aparece', () => {
  const repo = makeRepo();
  for (let i = 0; i < 11; i += 1) mk(repo, `plan-${String(i).padStart(2, '0')}`, 'spec', `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`);
  mk(repo, 'cerrado', 'closed', '2026-09-30T10:00:00.000Z');
  const n = next(repo);
  assert.strictEqual(n.kind, 'plan-spec');
  assert.match(n.text, /^El plan plan-10 está en la etapa spec/);
  const others = n.facts.filter((f) => /^Plan plan-\d+: etapa/.test(f));
  assert.strictEqual(others.length, 8);
  assert.ok(n.facts.includes('Hay 2 planes más (plan.js list).'), JSON.stringify(n.facts));
  assert.ok(!n.facts.some((f) => /cerrado/.test(f)), 'un plan cerrado no se lista');
  const few = makeRepo();
  mk(few, 'a', 'spec', '2026-09-10T10:00:00.000Z');
  mk(few, 'b', 'spec', '2026-09-11T10:00:00.000Z');
  assert.ok(!next(few).facts.some((f) => /planes más/.test(f)), 'con pocos planes no hay línea de cuenta');
});

test('next: solo lectura y la prioridad intacta (un conflicto de cola o una tarea en curso ganan a cualquier plan)', () => {
  const repo = three();
  const before = snapshot(repo);
  next(repo);
  run(repo, ['list']);
  run(repo, [], NEXT_CLI);
  assert.deepStrictEqual(snapshot(repo), before, 'árbol y refs idénticos');
  fs.mkdirSync(path.join(repo, '.pignolo', 'tmp', 'queue'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'tmp', 'queue', 'q.last.json'), JSON.stringify({ status: 'conflict', task: 'task/q/01-a', conflicts: ['x.js'] }));
  assert.strictEqual(next(repo).kind, 'queue-conflict');
  fs.rmSync(path.join(repo, '.pignolo', 'tmp', 'queue', 'q.last.json'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify({
    v: 2, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: '2026-09-30T13:00:00.000Z',
    tasks: { t1: { id: 't1', worktree: path.resolve(repo), base: 'a'.repeat(40), files: [], agents: [] } },
  }));
  assert.strictEqual(next(repo).kind, 'task-in-progress');
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify({
    v: 2, flow: 'daily', started: '2026-09-30T09:00:00.000Z', expires: '2026-09-30T10:00:00.000Z',
    tasks: { t1: { id: 't1', worktree: path.resolve(repo), base: 'a'.repeat(40), files: [], agents: [] } },
  }));
  assert.strictEqual(next(repo).kind, 'flow-expired-task');
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), '{roto');
  assert.strictEqual(next(repo).kind, 'run-malformed');
});
