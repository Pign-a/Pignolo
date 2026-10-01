import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readSkill, readReference, scriptCalls, assertScriptsExist, referencedFiles, assertNoVariables, indexOrder } from './support/skill-checks.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

const presentExists = fs.existsSync(path.join(PLUGIN_ROOT, 'reference', 'present-and-choose.md'));

test('improve: frontmatter, size, Values block before the steps, scripts and files exist', (t) => {
  const { frontmatter, text, body } = readSkill('improve');
  assert.equal(frontmatter.name, 'improve');
  assert.match(frontmatter.description, /^".*"$/);
  assert.equal(frontmatter['disable-model-invocation'], 'true');
  assert.ok(text.length <= 12000, `${text.length} characters`);
  const values = body.indexOf('## Values');
  const steps = body.indexOf('## Steps');
  assert.ok(values >= 0 && values < steps);
  const block = body.slice(values, steps);
  for (const v of ['${CLAUDE_PLUGIN_ROOT}', '${CLAUDE_PLUGIN_DATA}', '${user_config.optionsPerDecision}', '${user_config.presentation}']) assert.ok(block.includes(v), v);
  assertScriptsExist(scriptCalls(text));
  const refs = referencedFiles(text);
  for (const ref of refs) {
    if (ref === 'present-and-choose.md' && !presentExists) { t.diagnostic('present-and-choose.md arrives with the skill new: skipped here'); continue; }
    assert.doesNotThrow(() => readReference(ref), ref);
  }
  for (const want of ['prepare-run.md', 'options.md', 'apply.md']) assert.ok(refs.includes(want), want);
});

test('improve: steps appear in the order of spec section 8, the after goes to <run>/after, caps and informational comparison', () => {
  const { text } = readSkill('improve');
  indexOrder(text, ['run.mjs" env', 'prepare-run.md', 'run.mjs" menu', 'options.md', 'present-and-choose.md', 'approve.mjs save', 'apply.md',
    '--run <run>/after', '--before', 'compare.mjs" approved', 'report-check.mjs"', 'run.mjs" verdict']);
  assert.ok(/informational only|solo informativa/.test(text));
  for (const cap of ['one batch inspection', 'one round of versions', 'at most one regeneration', 'one batch of fixes', 'at most one confirmation']) {
    assert.ok(text.toLowerCase().includes(cap), cap);
  }
  assert.ok(text.includes('reported as pending'));
  assert.ok(text.includes('"pignolo-ui:ui-auditor"'));
  for (const m of text.matchAll(/ui-auditor/g)) assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:');
  assert.ok(/not available in v1/.test(text), 'the canvas is not available in v1 (R10)');
  assert.ok(!/Artifact/.test(text), 'improve never calls the Artifact tool');
});

test('options.md: no variables, literals, discard before the second dispatch, leak check before approve', () => {
  const text = readReference('options.md');
  assertNoVariables(text);
  for (const lit of ['The user asked for <N> subagents for this decision.', 'subagent_type: "pignolo-ui:ui-option"', 'model: "sonnet"',
    '≈ N corridas de ~X k tokens', 'B y C son muy parecidas', 'sequential: true', 'modelo pedido', 'regenerate']) {
    assert.ok(text.includes(lit), lit);
  }
  assert.ok(text.indexOf('run.mjs" discard') >= 0 && text.indexOf('run.mjs" discard') < text.indexOf('Dispatch again'));
  assert.ok(!text.includes('resolvedModel'));
  for (const m of text.matchAll(/ui-option/g)) assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:', 'ui-option always with the prefix');
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]|\/Users\/|\/home\//);
  assert.ok(text.indexOf('leak-check.mjs') >= 0 && text.indexOf('leak-check.mjs') < text.indexOf('approve.mjs save'));
  assertScriptsExist(scriptCalls(text));
});

test('apply.md: batch limits, what restore deletes is shown before it, the verdict decides', () => {
  const text = readReference('apply.md');
  assertNoVariables(text);
  assert.ok(text.includes('5 files') && text.includes('200'));
  for (const lit of ['files.mjs" save', 'files.mjs" verify', 'run.mjs" verdict', 'BLOCKED', 'sin verificar',
    'no verificado: el proyecto no declara build', 'report-check', 'implements']) {
    assert.ok(text.includes(lit), lit);
  }
  const restore = text.indexOf('files.mjs" restore');
  assert.ok(restore > 0);
  assert.ok(text.indexOf('unexpected') >= 0 && text.indexOf('unexpected') < restore);
  assert.ok(text.indexOf('exists: false') >= 0 && text.indexOf('exists: false') < restore);
  assert.doesNotMatch(text, /git reset|git checkout --|git clean/);
  assert.ok(!/git commit/.test(text.replace('does not commit', '')));
  assertScriptsExist(scriptCalls(text));
});
