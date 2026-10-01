'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const { writeCounter } = require(path.join(PLUGIN_ROOT, 'lib', 'handback-counter.js'));
const { deriveNext } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'next.js');
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
const next = (cwd, over = {}) => deriveNext({ cwd, env: process.env, now: NOW, ...over });

function writeRun(repo, over = {}) {
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  const run = {
    v: 1, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: '2026-09-30T13:00:00.000Z',
    task: { id: 't1', worktree: path.resolve(repo), base: 'a'.repeat(40), files: [], agents: [] }, ...over,
  };
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
  return run;
}
const mkPlan = (repo, plan = 'p1', stage = 'spec', created = '2026-09-30T10:00:00.000Z') => {
  assert.ok(ps.newPlan({ main: repo, plan, request: REQUEST, spec: 's', now: created }).ok);
  assert.ok(ps.update({ main: repo, plan }, (p) => { p.stage = stage; return null; }).ok);
};
function writeLock(repo, files = ['a.txt']) {
  const lock = { v: 1, startedAt: new Date(NOW - 3600000).toISOString(), pid: 2147483000, expires: new Date(NOW - 1000).toISOString(), head: git(['rev-parse', 'HEAD'], repo), worktree: repo, files, added: [] };
  fs.writeFileSync(path.join(repo, '.git', 'pignolo-sabotage.json'), JSON.stringify(lock));
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(path.join(repo, '.git', 'pignolo-sabotage.json'), old, old);
}

test('nothing: no run.json, no plans, no sabotage', () => {
  const repo = makeRepo();
  assert.deepStrictEqual(next(repo), { kind: 'nothing', text: '', facts: [] });
});

test('task-blocked, with exactly the registered phrase', () => {
  const repo = makeRepo();
  writeRun(repo);
  writeCounter(process.env, repo, 't1', { count: 8, accepted: false, acceptedAgentId: null, blocked: true, lastReason: 'tests rojos', stopHookActive: [] });
  const n = next(repo);
  assert.strictEqual(n.kind, 'task-blocked');
  assert.strictEqual(n.text, 'La tarea t1 está BLOCKED en el handback-gate tras 8 intentos (último motivo: tests rojos); la próxima acción registrada es escalarla al humano.');
  assert.ok(n.facts.length >= 1);
});

test('flow-expired-task: an expired flow with a task and no blocked counter', () => {
  const repo = makeRepo();
  writeRun(repo, { expires: '2026-09-30T11:30:00.000Z' });
  const n = next(repo);
  assert.strictEqual(n.kind, 'flow-expired-task');
  assert.strictEqual(n.text, 'El flujo daily venció el 2026-09-30T11:30:00.000Z con la tarea t1 sin cerrar; la próxima acción registrada es renovarlo (`run.js renew`) y revisar `run.js status`.');
});

test('task-in-progress: a live flow with a task', () => {
  const repo = makeRepo();
  writeRun(repo);
  const n = next(repo);
  assert.strictEqual(n.kind, 'task-in-progress');
  assert.match(n.text, /La tarea t1 del flujo daily está en curso/);
  assert.strictEqual(next(repo).text, n.text);
});

test('run-malformed: an unreadable run.json is never "nothing"', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), '{');
  const n = next(repo);
  assert.strictEqual(n.kind, 'run-malformed');
  assert.match(n.text, /El marcador del flujo \(.*run\.json\) está ilegible; la próxima acción registrada es limpiarlo con `run\.js end` o `run\.js start --replace`\./);
});

test('sabotage-pending: a stale lock; next restores nothing', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'saboteado\n');
  writeLock(repo);
  const lockBefore = fs.readFileSync(path.join(repo, '.git', 'pignolo-sabotage.json'), 'utf8');
  const n = next(repo);
  assert.strictEqual(n.kind, 'sabotage-pending');
  assert.ok(n.text.startsWith('Hay un sabotaje interrumpido en '));
  assert.ok(n.text.includes('(archivos: a.txt)'));
  assert.ok(n.text.endsWith('la próxima acción registrada es restaurarlo con `sabotage.js --recover`.'));
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'saboteado\n', 'the sabotaged file is untouched');
  assert.strictEqual(fs.readFileSync(path.join(repo, '.git', 'pignolo-sabotage.json'), 'utf8'), lockBefore, 'the lock is untouched');
});

const STAGE_TEXT = {
  spec: 'escribir la lista de afirmaciones clave',
  claims: 'verificar cada afirmación y resolverla',
  'spec-review': 'correr el `spec-reviewer` y guardar la tarjeta',
  'plan-written': 'auditar el plan',
  executing: 'la siguiente tarea sin cerrar',
  validating: 'correr el `validator` sobre la tanda',
  'final-review': 'la revisión final',
};

test('a plan in each stage gives the text of its row', () => {
  for (const [stage, x] of Object.entries(STAGE_TEXT)) {
    const repo = makeRepo();
    mkPlan(repo, 'p1', stage);
    const n = next(repo);
    assert.strictEqual(n.kind, `plan-${stage}`, stage);
    assert.strictEqual(n.text, `El plan p1 está en la etapa ${stage}; la próxima acción registrada es ${x}.`, stage);
  }
  const closed = makeRepo();
  mkPlan(closed, 'p1', 'closed');
  assert.strictEqual(next(closed).kind, 'nothing');
});

test('scope-card: draft, approved and changed give three different texts; audited differs by approval', () => {
  const repo = makeRepo();
  mkPlan(repo, 'p1', 'claims');
  assert.ok(ps.setClaims({ main: repo, plan: 'p1', claims: [], noneReason: 'n/a' }).ok);
  assert.ok(ps.saveScopeCard({ main: repo, plan: 'p1', text: CARD }).ok);
  assert.ok(ps.update({ main: repo, plan: 'p1' }, (p) => { p.stage = 'scope-card'; return null; }).ok);
  const draft = next(repo);
  assert.strictEqual(draft.kind, 'plan-scope-card');
  assert.match(draft.text, /pedirle al humano la aprobación de la tarjeta/);
  assert.ok(ps.approveScopeCard({ main: repo, plan: 'p1', quote: 'ok', now: '2026-09-30T10:00:00.000Z' }).ok);
  const approved = next(repo);
  assert.match(approved.text, /escribir el plan/);
  fs.appendFileSync(path.join(ps.planDir(repo, 'p1'), 'scope-card.md'), '\nmás\n');
  const changed = next(repo);
  assert.match(changed.text, /presentar la tarjeta de nuevo/);
  assert.strictEqual(new Set([draft.text, approved.text, changed.text]).size, 3);
  assert.ok(ps.saveScopeCard({ main: repo, plan: 'p1', text: CARD }).ok);
  assert.ok(ps.update({ main: repo, plan: 'p1' }, (p) => { p.stage = 'audited'; return null; }).ok);
  const au = next(repo);
  assert.match(au.text, /ejecutar las tareas/);
  assert.match(au.text, /runnable/, 'without approval: only what runnable allows');
  assert.ok(ps.approveScopeCard({ main: repo, plan: 'p1', quote: 'ok', now: '2026-09-30T10:00:00.000Z' }).ok);
  assert.ok(!/runnable/.test(next(repo).text));
});

test('the most recent unclosed plan wins', () => {
  const repo = makeRepo();
  mkPlan(repo, 'old', 'claims', '2026-09-01T10:00:00.000Z');
  mkPlan(repo, 'new', 'plan-written', '2026-09-20T10:00:00.000Z');
  mkPlan(repo, 'newest-closed', 'closed', '2026-09-29T10:00:00.000Z');
  assert.match(next(repo).text, /^El plan new está/);
});

test('priority: BLOCKED beats a plan in audited; a pending sabotage beats BLOCKED', () => {
  const repo = makeRepo();
  mkPlan(repo, 'p1', 'audited');
  writeRun(repo);
  writeCounter(process.env, repo, 't1', { count: 8, accepted: false, acceptedAgentId: null, blocked: true, lastReason: 'x', stopHookActive: [] });
  assert.strictEqual(next(repo).kind, 'task-blocked');
  writeLock(repo);
  assert.strictEqual(next(repo).kind, 'sabotage-pending');
});

test('an unreadable plan.json is a fact, not an exception, and not "nothing"', () => {
  const repo = makeRepo();
  mkPlan(repo, 'p1', 'claims');
  fs.writeFileSync(path.join(ps.planDir(repo, 'p1'), 'plan.json'), '{"v":1,"plan":');
  const n = next(repo);
  assert.notStrictEqual(n.kind, 'nothing');
  assert.ok(n.facts.some((f) => /el registro del plan p1 está ilegible/i.test(f)), JSON.stringify(n));
  mkPlan(repo, 'p2', 'spec', '2026-09-29T10:00:00.000Z');
  const both = next(repo);
  assert.strictEqual(both.kind, 'plan-spec');
  assert.ok(both.facts.some((f) => /el registro del plan p1 está ilegible/i.test(f)));
});

function tree(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(`${path.relative(dir, p)}:${fs.statSync(p).mtimeMs}:${fs.readFileSync(p, 'utf8').length}`);
    }
  }(dir));
  return out.sort();
}

test('read-only: it creates and changes no file', () => {
  const repo = makeRepo();
  mkPlan(repo, 'p1', 'executing');
  writeRun(repo);
  const before = tree(repo);
  next(repo);
  const r = spawnSync(process.execPath, [CLI, '--cwd', repo], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(tree(repo), before);
});

test('resume: the same text from a worktree, a subdirectory and the main checkout, in fresh processes', () => {
  const repo = makeRepo();
  mkPlan(repo, 'p1', 'audited');
  const wt = path.join(repo, '.pignolo', 'worktrees', 'x');
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  git(['worktree', 'add', '-q', '-b', 'task-x', wt], repo);
  const sub = path.join(repo, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const text = (cwd) => {
    const r = spawnSync(process.execPath, [CLI, '--cwd', cwd, '--text'], { encoding: 'utf8', cwd: makeTempDir('next-away-') });
    assert.strictEqual(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const fromMain = text(repo);
  assert.match(fromMain, /^El plan p1 está en la etapa audited/);
  assert.strictEqual(text(wt), fromMain);
  assert.strictEqual(text(sub), fromMain);
  const json = JSON.parse(spawnSync(process.execPath, [CLI, '--cwd', wt], { encoding: 'utf8' }).stdout);
  assert.strictEqual(json.kind, 'plan-audited');
  assert.strictEqual(json.text, fromMain);
  assert.strictEqual(spawnSync(process.execPath, [CLI, '--nada'], { encoding: 'utf8' }).status, 2);
});

test('--text prints nothing when there is nothing to do', () => {
  const repo = makeRepo();
  const r = spawnSync(process.execPath, [CLI, '--cwd', repo, '--text'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
