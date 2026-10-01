// Hito 4b without a model: skills, support files, agents and plugin.json agree with each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';
import { readSkill, readReference, scriptCalls, assertScriptsExist, referencedFiles, assertNoVariables } from './support/skill-checks.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));

test('every skill calls existing scripts and loads existing support files, which hold no variables', () => {
  for (const name of ['new', 'improve', 'audit']) {
    const { text } = readSkill(name);
    assertScriptsExist(scriptCalls(text));
    for (const ref of referencedFiles(text)) assert.doesNotThrow(() => readReference(ref), `${name}: ${ref}`);
  }
  for (const f of fs.readdirSync(path.join(PLUGIN_ROOT, 'reference'))) {
    const text = readReference(f);
    assertNoVariables(text);
    if (scriptCalls(text).length) assertScriptsExist(scriptCalls(text));
  }
});

test('plugin.json keeps the two settings with their options and defaults, and no language or dependencies', () => {
  assert.deepEqual(manifest.userConfig.optionsPerDecision.options, ['1', '3']);
  assert.equal(manifest.userConfig.optionsPerDecision.default, '3');
  assert.deepEqual(manifest.userConfig.presentation.options, ['auto', 'local']);
  assert.equal(manifest.userConfig.presentation.default, 'auto');
  assert.ok(!('language' in manifest.userConfig));
  assert.ok(!('dependencies' in manifest));
});

test('both agents exist and the plugin linter is green', () => {
  for (const a of ['ui-option', 'ui-auditor']) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'agents', `${a}.md`)), a);
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});

test('the CHANGELOG has the entry of the current version, which is 0.6.1', () => {
  const changelog = fs.readFileSync(path.join(PLUGIN_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.equal(manifest.version, '0.6.1');
  assert.match(changelog, new RegExp(`^## ${manifest.version.replace(/\./g, '\\.')} `, 'm'));
});

test('the manual checklist exists and covers the rows of spec 16.4 that apply to v1', () => {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'tests', 'manual', 'hito-4.md'), 'utf8');
  for (const needle of ['transcript', 'optionsPerDecision', 'requiere sesión', 'discarded', '2.1.271', 'espacios', 'Node 22', 'A11Y-40']) assert.ok(text.includes(needle), needle);
});
