'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const REPO_ROOT = path.join(__dirname, '..');

test('marketplace lists pignolo with a relative source', () => {
  const mk = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(mk.name, 'pignolo');
  const entry = mk.plugins.find((p) => p.name === 'pignolo');
  assert.ok(entry, 'plugin entry missing');
  assert.strictEqual(entry.source, './plugins/pignolo');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, entry.source)), 'source directory missing');
});

test('plugin manifest name matches the marketplace entry', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.strictEqual(pj.name, 'pignolo');
  assert.match(pj.version, /^\d+\.\d+\.\d+$/);
  assert.strictEqual(pj.license, 'MIT');
});
