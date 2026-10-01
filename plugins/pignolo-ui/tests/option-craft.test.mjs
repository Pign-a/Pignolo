// ui-option: craft rules in the card and the model chosen by profile (spec 7.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, runScript } from './helpers.mjs';
import { readSkill, readReference } from './support/skill-checks.mjs';
import { optionModel } from '../lib/option-model.mjs';

const card = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'ui-option.md'), 'utf8');

test('the card states the craft rules as instructions', () => {
  const m = /# Craft\r?\n([\s\S]*?)(?=\r?\n# )/.exec(card);
  assert.ok(m, 'a "# Craft" section');
  const text = m[1];
  for (const needle of ['one nameable look', 'one line', 'one thing the screen is for', 'STRUCTURE', 'layout, grouping, navigation', 'density', 'placeholder', 'centered card on gray', 'three equal cards', 'gradient hero', 'lorem ipsum', 'left-border', 'emoji', 'typeface', '<button>', '<a href>', '<label>', '4.5:1', '44 px']) {
    assert.ok(text.includes(needle), needle);
  }
  assert.ok(text.split(/\r?\n/).length <= 20, 'the section stays short');
});

test('the hard rules and the one-line description survive', () => {
  for (const needle of ['tools: Write', 'Write only to the folder the brief names', 'no remote resources', 'data-primary="true"', 'Datos de ejemplo']) assert.ok(card.includes(needle), needle);
  assert.equal(card.split(/\r?\n/).filter((l) => l.startsWith('description:')).length, 1);
});

test('optionModel: opus in max, sonnet in balanced and economy, balanced for anything else', () => {
  assert.equal(optionModel('max').model, 'opus');
  assert.equal(optionModel('balanced').model, 'sonnet');
  assert.equal(optionModel('economy').model, 'sonnet');
  for (const bad of [undefined, '', '${user_config.profile}', 'MAX', 'turbo']) {
    const r = optionModel(bad);
    assert.equal(r.model, 'sonnet', String(bad));
    assert.equal(r.profile, 'balanced');
    assert.equal(r.defaulted, true);
  }
});

test('run.mjs option-model prints the model of the profile', () => {
  assert.equal(runScript('run.mjs', ['option-model', '--profile', 'max']).json.model, 'opus');
  assert.equal(runScript('run.mjs', ['option-model', '--profile', 'economy']).json.model, 'sonnet');
});

test('manifest declares userConfig.profile and the skills and options.md use it', () => {
  const { userConfig } = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.deepEqual(userConfig.profile.options, ['max', 'balanced', 'economy']);
  assert.equal(userConfig.profile.default, 'balanced');
  for (const s of ['new', 'improve']) assert.ok(readSkill(s).body.includes('${user_config.profile}'), s);
  const opts = readReference('options.md');
  assert.ok(opts.includes('run.mjs" option-model --profile <profile>'));
  assert.ok(!opts.includes('model: "sonnet"'), 'the dispatch takes the model from option-model');
  assert.ok(opts.includes('model: <model>'));
});
