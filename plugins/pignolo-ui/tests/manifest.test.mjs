import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, REPO_ROOT } from './helpers.mjs';

const OPTION_FIELDS = new Set(['type', 'title', 'description', 'required', 'default', 'options', 'multiple', 'sensitive', 'min', 'max']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('marketplace lists pignolo-ui with a relative source', () => {
  const mk = readJson(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
  const entry = mk.plugins.find((p) => p.name === 'pignolo-ui');
  assert.ok(entry, 'pignolo-ui entry missing');
  assert.equal(entry.source, './plugins/pignolo-ui');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, entry.source)), 'source directory missing');
});

test('plugin manifest: name, semver version, license, no hooks', () => {
  const pj = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
  assert.equal(pj.name, 'pignolo-ui');
  assert.match(pj.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pj.license, 'MIT');
  assert.equal(pj.hooks, undefined);
  assert.equal(pj.mcpServers, undefined);
});

test('userConfig declares exactly the three keys of spec 3.1', () => {
  const { userConfig } = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'));
  assert.deepEqual(Object.keys(userConfig).sort(), ['language', 'optionsPerDecision', 'presentation']);
  assert.deepEqual(userConfig.optionsPerDecision.options, ['1', '3']);
  assert.equal(userConfig.optionsPerDecision.default, '3');
  assert.deepEqual(userConfig.presentation.options, ['auto', 'local']);
  assert.equal(userConfig.presentation.default, 'auto');
  assert.equal(userConfig.language.default, '');
  assert.equal(userConfig.language.options, undefined);
  for (const [key, opt] of Object.entries(userConfig)) {
    assert.equal(opt.type, 'string', key);
    assert.ok(opt.title && opt.description, `${key} needs title and description`);
    for (const field of Object.keys(opt)) assert.ok(OPTION_FIELDS.has(field), `${key}.${field} is not a userConfig field`);
    if (opt.options) assert.ok(opt.options.includes(opt.default), `${key} default must be one of its options`);
  }
});

test('plugin ships README, CHANGELOG, CREDITS and LICENSE', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'CREDITS.md', 'LICENSE']) {
    assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, f)), `${f} missing`);
  }
});
