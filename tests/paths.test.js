'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanPath, resolveClean, FLAG_RE } = require('../plugins/pignolo/lib/paths');

test('cleanPath uses forward slashes and lower case', () => {
  assert.strictEqual(cleanPath('C:\\Repo\\.PIGNOLO\\.Disabled'), 'c:/repo/.pignolo/.disabled');
});

test('cleanPath drops the suffixes Windows ignores (H12)', () => {
  assert.strictEqual(cleanPath('a/.disabled.'), 'a/.disabled');
  assert.strictEqual(cleanPath('a/.disabled .'), 'a/.disabled');
  assert.strictEqual(cleanPath('a/.disabled::$DATA'), 'a/.disabled');
  assert.strictEqual(cleanPath('a/.disabled:stream'), 'a/.disabled');
  assert.strictEqual(cleanPath('../x/./y'), '../x/./y');
});

test('resolveClean joins relative paths and resolves ..', () => {
  assert.strictEqual(resolveClean('sub/../.pignolo/.disabled', 'C:\\repo'), 'c:/repo/.pignolo/.disabled');
  assert.strictEqual(resolveClean('D:/otro/x', 'C:\\repo'), 'd:/otro/x');
  assert.strictEqual(resolveClean('~/.pignolo/disabled', 'C:\\repo'), '~/.pignolo/disabled');
});

test('FLAG_RE matches both flags and nothing else', () => {
  for (const yes of ['c:/r/.pignolo/.disabled', '~/.pignolo/disabled', '.pignolo/.disabled']) assert.ok(FLAG_RE.test(yes), yes);
  for (const no of ['c:/r/.pignolo/.gitignore', 'c:/r/.pignolo/.disabled/x', 'c:/r/xpignolo/.disabledx']) assert.ok(!FLAG_RE.test(no), no);
});

// Protects: `~` y ~/.claude del entorno del hook (G5, auditoría 3) · Breaks if: el home
// sale del proceso y no del entorno que recibe el hook, o se ignora CLAUDE_CONFIG_DIR.
test('userHomes and claudeDirs come from the environment of the hook', () => {
  const path = require('node:path');
  const { userHomes, claudeDirs } = require('../plugins/pignolo/lib/home');
  assert.deepStrictEqual(userHomes({ HOME: '/h', USERPROFILE: 'C:\U' }), ['/h', 'C:\U']);
  assert.deepStrictEqual(userHomes({ USERPROFILE: 'C:\U' }), ['C:\U']);
  assert.deepStrictEqual(claudeDirs({ HOME: '/h', CLAUDE_CONFIG_DIR: '/cfg' }), [path.join('/h', '.claude'), '/cfg']);
  assert.strictEqual(userHomes({}).length, 1);
});
