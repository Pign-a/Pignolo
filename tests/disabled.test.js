'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { readState, flagPaths } = require('../plugins/pignolo/lib/disabled');

test('everything on by default', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const s = readState({ env, cwd: makeTempDir() });
  assert.deepStrictEqual(s, { guardOff: false, hooksOff: false, globalFlag: false, projectFlag: false });
});

test('project flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(flagPaths({ env, cwd }).project, 'x');
  const s = readState({ env, cwd });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('global flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  fs.writeFileSync(flagPaths({ env, cwd: '.' }).global, 'x');
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('PIGNOLO_DISABLED=1 turns everything off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '1' };
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.guardOff, true);
  assert.strictEqual(s.hooksOff, true);
});

test('PIGNOLO_DISABLED with any other value does not turn the guard off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: 'true' };
  assert.strictEqual(readState({ env, cwd: makeTempDir() }).guardOff, false);
});
