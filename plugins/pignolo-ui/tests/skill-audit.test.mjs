import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkill, readReference, scriptCalls, assertScriptsExist, referencedFiles, assertNoVariables, indexOrder } from './support/skill-checks.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

test('audit: frontmatter, size, scripts and referenced files exist, Values block first', () => {
  const { frontmatter, text, body } = readSkill('audit');
  assert.equal(frontmatter.name, 'audit');
  assert.match(frontmatter.description, /^".*"$/);
  assert.equal(frontmatter['disable-model-invocation'], 'true');
  assert.ok(text.length <= 12000, `${text.length} characters`);
  assertScriptsExist(scriptCalls(text));
  for (const ref of referencedFiles(text)) assert.doesNotThrow(() => readReference(ref), ref);
  assert.ok(referencedFiles(text).includes('prepare-run.md'));
  const values = body.indexOf('## Values');
  const steps = body.indexOf('## Steps');
  assert.ok(values >= 0 && values < steps);
  const block = body.slice(values, steps);
  assert.ok(block.includes('${CLAUDE_PLUGIN_ROOT}') && block.includes('${CLAUDE_PLUGIN_DATA}'));
  assert.match(block, /still starts with `\$\{`/);
});

test('audit: first step is run.mjs env, the auditor goes with the prefix and opus, it does not block', () => {
  const { body, text } = readSkill('audit');
  const steps = body.slice(body.indexOf('## Steps'));
  assert.ok(steps.indexOf('run.mjs" env') >= 0);
  assert.ok(steps.indexOf('run.mjs" env') < steps.indexOf('prepare-run.md'));
  assert.ok(text.includes('pignolo-ui <pluginVersion>'));
  assert.ok(text.includes('"pignolo-ui:ui-auditor"') && text.includes('model: "opus"'));
  for (const m of text.matchAll(/ui-auditor/g)) {
    assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:', 'ui-auditor always with the pignolo-ui: prefix');
  }
  assert.ok(/does not block on findings/.test(text));
  assert.ok(text.includes('auditoría no independiente'));
  assert.ok(!/Bash\(|fullPage/.test(text));
  assert.ok(!/!`/.test(text));
  indexOrder(text, ['run.mjs" env', 'prepare-run.md', 'pignolo-ui:ui-auditor', 'auditor-check', 'report-line']);
  assert.ok(!/terminado/i.test(text), 'audit never says "terminado"');
});

test('prepare-run.md: no variables, steps in order, budget, session and exit 2 rules', () => {
  const text = readReference('prepare-run.md');
  assertNoVariables(text);
  const subs = scriptCalls(text).map((c) => `${c.script} ${c.sub}`);
  const order = ['run.mjs init', 'run.mjs config', 'design-md.mjs validate', 'run.mjs norms', 'browser.mjs measure', 'browser.mjs capture', 'browser.mjs dom', 'run.mjs check'];
  let from = 0;
  for (const want of order) {
    const i = subs.indexOf(want, from);
    assert.ok(i >= 0, `missing or out of order: ${want}`);
    from = i + 1;
  }
  assertScriptsExist(scriptCalls(text));
  assert.ok(text.includes('config get'));
  assert.ok(!text.includes('ui-check.mjs --dom'));
  assert.ok(!/dom-\*\.html/.test(text));
  assert.ok(/at most 8 images/.test(text));
  assert.ok(text.includes('requiere sesión'));
  assert.ok(text.includes('exit 2'));
});

test('the plugin linter stays green with the skill and reference/', () => {
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});

test('audit: calls run.mjs context, says the line when PRODUCT.md is missing and never creates it (hito 4f)', () => {
  const { text } = readSkill('audit');
  for (const lit of ['reference/context.md', 'run.mjs" context', 'Audit never creates `PRODUCT.md`']) assert.ok(text.includes(lit), lit);
  assert.ok(!text.includes('product-md.mjs'));
  assert.ok(text.indexOf('prepare-run.md') < text.indexOf('run.mjs" context') && text.indexOf('run.mjs" context') < text.indexOf('pignolo-ui:ui-auditor'));
});
