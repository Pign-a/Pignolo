import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLeakValues } from '../lib/leak-values.mjs';

const fakeOs = { userInfo: () => ({ username: 'ana' }), homedir: () => '/home/ana' };
const fakeExec = (args) => ({ 'user.name': 'Ana Ejemplo\n', 'user.email': 'ana@example.test\n' })[args[1]];

test('collects git, session, OS user and home in order, without duplicates', () => {
  assert.deepEqual(
    collectLeakValues({ project: '/p', email: 'ana@example.test', exec: fakeExec, os: fakeOs }),
    ['Ana Ejemplo', 'ana@example.test', 'ana', '/home/ana'],
  );
});

test('a session email different from git is kept; short values are dropped', () => {
  const v = collectLeakValues({ project: '/p', email: 'otra@example.test', exec: fakeExec, os: { ...fakeOs, userInfo: () => ({ username: 'ab' }) } });
  assert.deepEqual(v, ['Ana Ejemplo', 'ana@example.test', 'otra@example.test', '/home/ana']);
});

test('without git it still returns the OS values', () => {
  const v = collectLeakValues({ project: '/p', exec: () => { throw new Error('no git'); }, os: fakeOs });
  assert.deepEqual(v, ['ana', '/home/ana']);
});
