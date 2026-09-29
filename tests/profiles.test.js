'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { resolveModel, readConfig, writeConfig, configPath } = require('../plugins/pignolo/lib/profiles');

const cases = [
  ['explorer', { profile: 'max' }, 'sonnet'],
  ['implementer', { profile: 'max' }, 'opus'],
  ['implementer', { profile: 'balanced' }, 'sonnet'],
  ['review-risk', { profile: 'economy' }, 'opus'],
  ['researcher', { profile: 'economy' }, 'sonnet'],
  ['implementer', { profile: 'balanced', models: { implementer: 'opus' } }, 'opus'],
];
for (const [role, cfg, want] of cases) {
  test(`resolveModel ${role} ${JSON.stringify(cfg)} -> ${want}`, () => {
    assert.strictEqual(resolveModel(role, cfg), want);
  });
}

test('resolveModel: unknown role throws', () => {
  assert.throws(() => resolveModel('nope', { profile: 'max' }));
});

const envOf = () => ({ PIGNOLO_HOME: makeTempDir() });

test('readConfig without file returns defaults', () => {
  const env = envOf();
  assert.deepStrictEqual(readConfig({ env }), {
    profile: 'balanced', models: {}, presentation: 'ask', engram: false, language: null,
  });
});

test('readConfig: economy without presentation defaults to text', () => {
  const env = envOf();
  fs.writeFileSync(configPath(env), JSON.stringify({ profile: 'economy' }));
  assert.strictEqual(readConfig({ env }).presentation, 'text');
});

test('writeConfig with invalid profile throws and creates no file', () => {
  const env = envOf();
  assert.throws(() => writeConfig({ env }, { profile: 'turbo' }));
  assert.strictEqual(fs.existsSync(configPath(env)), false);
});

test('writeConfig rejects bad presentation, model role and model value', () => {
  const env = envOf();
  assert.throws(() => writeConfig({ env }, { presentation: 'x' }));
  assert.throws(() => writeConfig({ env }, { models: { nope: 'opus' } }));
  assert.throws(() => writeConfig({ env }, { models: { implementer: 'haiku' } }));
  assert.strictEqual(fs.existsSync(configPath(env)), false);
});

test('writeConfig merges with existing config and writes LF, 2 spaces', () => {
  const env = envOf();
  writeConfig({ env }, { profile: 'max' });
  const final = writeConfig({ env }, { language: 'es' });
  assert.strictEqual(final.profile, 'max');
  assert.strictEqual(readConfig({ env }).profile, 'max');
  const raw = fs.readFileSync(configPath(env), 'utf8');
  assert.ok(!raw.includes('\r') && raw.includes('\n  "'));
  assert.strictEqual(path.dirname(configPath(env)), env.PIGNOLO_HOME);
});

test('readConfig with invalid JSON throws config inválida', () => {
  const env = envOf();
  fs.writeFileSync(configPath(env), '{nope');
  assert.throws(() => readConfig({ env }), (e) => e.message === `config inválida: ${configPath(env)}`);
});

// Revisión final del hito 2: lo leído del disco se valida igual que lo que se escribe.
test('readConfig with an unknown profile or bad field on disk throws config inválida', () => {
  for (const bad of [{ profile: 'turbo' }, { presentation: 'x' }, { models: { implementer: 'haiku' } }]) {
    const env = envOf();
    fs.writeFileSync(configPath(env), JSON.stringify(bad));
    assert.throws(() => readConfig({ env }), (e) => e.message === `config inválida: ${configPath(env)}`, JSON.stringify(bad));
  }
});
