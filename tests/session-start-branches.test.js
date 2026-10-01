'use strict';
// Aviso de ramas ya unidas en SessionStart (hito 7a, Task 9; D-7-5). No confundir con tests/cleanup.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const ss = require('../plugins/pignolo/hooks/handlers/session-start');
const C = require('../plugins/pignolo/lib/branch-cleanup');

const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const LINE = /ramas ya unidas para limpiar/;

function repoWith({ merged = true, stage = 'closed' } = {}) {
  const main = makeRepo();
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n.disabled\n');
  write(main, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  write(main, '.pignolo/state/plans/p/plan.json', `${JSON.stringify({ v: 1, plan: 'p', stage, request: 'x', claims: [] })}\n`);
  git(['add', '-f', '-A'], main);
  git(['commit', '-q', '-m', 'base'], main);
  git(['branch', 'int/p'], main);
  if (merged) {
    git(['checkout', '-q', '-b', 'task/p/01-a', 'int/p'], main);
    write(main, 'a.txt', 'a\n');
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', 'tarea'], main);
    git(['checkout', '-q', 'int/p'], main);
    git(['merge', '-q', '--no-ff', '-m', 'merge', 'task/p/01-a'], main);
    git(['checkout', '-q', 'main'], main);
    git(['merge', '-q', '--ff-only', 'int/p'], main);
  }
  return main;
}
const start = (main, ctx = {}) => {
  const r = ss.run({ source: 'startup', cwd: main }, { env: { PIGNOLO_HOME: makeTempDir() }, ...ctx });
  return { exit: r.exit, out: r.stdout ? JSON.parse(r.stdout) : {} };
};
const texts = (o) => `${o.systemMessage || ''}\n${(o.hookSpecificOutput && o.hookSpecificOutput.additionalContext) || ''}`;

test('con una rama ya unida el contexto trae la línea; con todo reciente y sin ramas unidas, ni una palabra', () => {
  const main = repoWith();
  const r = start(main);
  assert.strictEqual(r.exit, 0);
  assert.match(texts(r.out), /2 ramas ya unidas para limpiar, 0 sin unir de más de 7 días \(solo informadas\) y 0 worktrees con cambios; \/pignolo:cleanup las lista/);
  const quiet = start(repoWith({ merged: false, stage: 'executing' })); // plan abierto: int/p tampoco se propone
  assert.doesNotMatch(texts(quiet.out), LINE, 'sin ramas unidas: silencio');
  assert.doesNotMatch(texts(quiet.out), /unidas|sin unir/);
});

test('con /pignolo:off (flag de proyecto) y sin proyecto activo, silencio', () => {
  const off = repoWith();
  write(off, '.pignolo/.disabled', 'x\n');
  assert.doesNotMatch(texts(start(off).out), LINE);
  const none = repoWith();
  fs.rmSync(path.join(none, '.pignolo', 'project.md'));
  assert.doesNotMatch(texts(start(none).out), LINE, 'sin project.md no hay proyecto activo');
});

test('con un ejecutor más lento que el presupuesto: silencio, sin aviso a medias y sin error (rojo: sin presupuesto, el hook espera)', () => {
  const main = repoWith();
  const real = C.defaultRun(main);
  const slow = (args, o) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); return real(args, o); };
  const r = start(main, { cleanupOpts: { run: slow }, cleanupBudgetMs: 700 });
  assert.strictEqual(r.exit, 0);
  assert.doesNotMatch(texts(r.out), LINE);
  assert.doesNotMatch(texts(r.out), /Error|no se pudo revisar las ramas/);
  // el mismo ejecutor con presupuesto holgado sí avisa: el silencio es del presupuesto, no de un fallo
  const roomy = start(main, { cleanupOpts: { run: slow }, cleanupBudgetMs: 60000 });
  assert.match(texts(roomy.out), LINE);
});

test('noticeLine: callada ante un error de git y sin ramas ni worktrees no corre git de más', () => {
  const main = repoWith({ merged: false, stage: 'executing' });
  const calls = [];
  const real = C.defaultRun(main);
  const spy = (args, o) => { calls.push(args[0]); return real(args, o); };
  assert.strictEqual(C.noticeLine({ main, opts: { run: spy } }), '');
  assert.ok(calls.length > 0 && calls.length <= 6, `pocas llamadas a git: ${calls.join(',')}`);
  const broken = () => { throw new Error('git roto'); };
  assert.strictEqual(C.noticeLine({ main, opts: { run: broken } }), '');
});
