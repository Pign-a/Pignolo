'use strict';
// Nombres, tags y validadores de §11.1 (lib/branches.js).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const B = require('../plugins/pignolo/lib/branches');

test('nombres válidos', () => {
  assert.strictEqual(B.taskBranch({ plan: 'hito-7', nn: '03', slug: 'cola' }), 'task/hito-7/03-cola');
  assert.strictEqual(B.cpTag('hito-7', 2), 'cp/hito-7/2');
  assert.strictEqual(B.contractTag('hito-7', 1), 'contract/hito-7/v1');
  assert.strictEqual(B.dailyBranch({ date: '2026-09-30', slug: 'x' }), 'task/daily/2026-09-30-x');
  assert.strictEqual(B.intBranch('p'), 'int/p');
  assert.strictEqual(B.queueBranch('p'), 'queue/p');
  assert.strictEqual(B.backupTag({ date: '2026-09-30', reason: 'antes-de-limpiar' }), 'backup/2026-09-30-antes-de-limpiar');
});

test('nombres inválidos lanzan', () => {
  const t = { plan: 'p', nn: '01', slug: 'a' };
  const cases = [
    () => B.intBranch('Hito7'), () => B.intBranch('daily'), () => B.intBranch('a/b'),
    () => B.taskBranch({ ...t, plan: 'Hito7' }), () => B.taskBranch({ ...t, plan: 'daily' }), () => B.taskBranch({ ...t, plan: 'a/b' }),
    () => B.taskBranch({ ...t, nn: '3' }), () => B.taskBranch({ ...t, nn: '003' }),
    () => B.taskBranch({ ...t, slug: '' }), () => B.taskBranch({ ...t, slug: 'a'.repeat(41) }),
    () => B.contractTag('p', 0), () => B.cpTag('p', 1.5), () => B.cpTag('p', 0),
    () => B.dailyBranch({ date: '2026-9-3', slug: 'x' }),
  ];
  for (const [i, f] of cases.entries()) assert.throws(f, /nombre inválido/, `caso ${i}`);
});

test('parseBranch', () => {
  assert.deepStrictEqual(B.parseBranch('task/daily/2026-09-30-x'), { kind: 'daily', date: '2026-09-30', slug: 'x' });
  assert.deepStrictEqual(B.parseBranch('task/p/01-a-b'), { kind: 'task', plan: 'p', nn: '01', slug: 'a-b' });
  assert.deepStrictEqual(B.parseBranch('int/p'), { kind: 'int', plan: 'p' });
  assert.deepStrictEqual(B.parseBranch('queue/p'), { kind: 'queue', plan: 'p' });
  assert.strictEqual(B.parseBranch('feature/x').kind, 'other');
  assert.strictEqual(B.parseBranch('int/p/extra').kind, 'other');
});

test('nextCp es el máximo + 1 y latestContract es numérico', () => {
  assert.strictEqual(B.nextCp({ refs: [], plan: 'p' }), 1);
  assert.strictEqual(B.nextCp({ refs: ['cp/p/1', 'cp/p/3'], plan: 'p' }), 4);
  assert.strictEqual(B.nextCp({ refs: ['cp/p/1', 'cp/otro/9'], plan: 'p' }), 2);
  assert.deepStrictEqual(B.latestContract({ refs: ['contract/p/v1', 'contract/p/v10', 'contract/p/v2'], plan: 'p' }), { tag: 'contract/p/v10', n: 10 });
  assert.strictEqual(B.latestContract({ refs: ['contract/otro/v1'], plan: 'p' }), null);
});

test('rutas de worktree: absolutas, sin .. y sin choque entre cola y tarea', () => {
  const main = path.resolve('/m');
  const t = B.taskWorktreePath(main, 'p', '01', 'a');
  assert.ok(path.isAbsolute(t));
  assert.ok(!t.split(path.sep).includes('..'));
  assert.strictEqual(t, path.join(main, '.pignolo', 'worktrees', 'p-01-a'));
  assert.strictEqual(B.queueWorktreePath(main, '01-a'), path.join(main, '.pignolo', 'worktrees', '_queue', '01-a'));
  // con `queue-<plan>` el plan 01-a chocaba con el plan queue, tarea 01, slug a
  assert.strictEqual(B.taskWorktreePath(main, 'queue', '01', 'a'), path.join(main, '.pignolo', 'worktrees', 'queue-01-a'));
  assert.notStrictEqual(B.queueWorktreePath(main, '01-a'), B.taskWorktreePath(main, 'queue', '01', 'a'));
});
