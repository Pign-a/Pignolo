import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readSkill, readReference, scriptCalls, assertScriptsExist, referencedFiles, assertNoVariables, indexOrder } from './support/skill-checks.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

const SKILLS = ['new', 'improve', 'audit'];
const REFERENCES = fs.readdirSync(path.join(PLUGIN_ROOT, 'reference')).filter((n) => n.endsWith('.md'));

test('new: frontmatter, size, Values block, scripts and referenced files exist', () => {
  const { frontmatter, text, body } = readSkill('new');
  assert.equal(frontmatter.name, 'new');
  assert.match(frontmatter.description, /^".*"$/);
  assert.equal(frontmatter['disable-model-invocation'], 'true');
  assert.ok(text.length <= 12000, `${text.length} characters`);
  const values = body.indexOf('## Values');
  const steps = body.indexOf('## Steps');
  assert.ok(values >= 0 && values < steps);
  for (const v of ['${CLAUDE_PLUGIN_ROOT}', '${CLAUDE_PLUGIN_DATA}', '${user_config.optionsPerDecision}', '${user_config.presentation}']) assert.ok(body.slice(values, steps).includes(v), v);
  assertScriptsExist(scriptCalls(text));
  for (const ref of referencedFiles(text)) assert.doesNotThrow(() => readReference(ref), ref);
  for (const want of ['prepare-run.md', 'options.md', 'present-and-choose.md', 'apply.md']) assert.ok(referencedFiles(text).includes(want), want);
});

test('new: order of the steps of spec section 7, empty project goes through directions, caps', () => {
  const { text } = readSkill('new');
  indexOrder(text, ['run.mjs" env', 'design-md.mjs', 'approve.mjs save --flow direction', 'templates/DESIGN.md', 'approve.mjs record', 'Brief, in text',
    'options.md', 'present-and-choose.md', 'apply.md', '<run>/after', 'compare.mjs" approved', 'ui-auditor', 'report-check.mjs"', 'run.mjs" verdict']);
  assert.ok(/no refinement round|sin ronda de afinado/.test(text));
  assert.ok(text.includes('‹') && text.includes('data-sample'));
  assert.ok(text.includes('design/approved/direction'));
  for (const cap of ['one round of directions', 'one round of mockups', 'at most one regeneration', 'one implementation', 'one batch check', 'one batch of fixes', 'at most one confirmation']) {
    assert.ok(text.toLowerCase().includes(cap), cap);
  }
  assert.ok(/not available in v1/.test(text));
  assert.ok(!/Artifact/.test(text), 'new never calls the Artifact tool');
});

test('present-and-choose.md: no variables, order, never publishes in v1, literal quote, direction flow, -v2', () => {
  const text = readReference('present-and-choose.md');
  assertNoVariables(text);
  indexOrder(text, ['run.mjs" present', 'leak-check.mjs', 'run.mjs" compare-html']);
  for (const lit of ['Never call Artifact', 'not available in v1', 'literal quote', '--kind direction', '-v2', '--quote-file']) assert.ok(text.includes(lit), lit);
  assert.ok(text.indexOf('leak-check.mjs" --dir') < text.indexOf('approve.mjs" save'), 'leak check before saving as approved');
  assert.doesNotMatch(text, /one call|una vez con los archivos|type_url|to-canvas/);
  assertScriptsExist(scriptCalls(text));
});

test('transversal contract of the three skills and the reference files', () => {
  for (const name of REFERENCES) assertNoVariables(readReference(name));
  for (const name of SKILLS) {
    const { text, body } = readSkill(name);
    // variables: only in the Values block, or ${CLAUDE_PLUGIN_ROOT} in commands and ${CLAUDE_PLUGIN_DATA} in --data
    const afterValues = body.slice(body.indexOf('## Steps'));
    assert.ok(!afterValues.includes('${user_config'), `${name}: user_config only in Values`);
    for (const m of afterValues.matchAll(/\$\{CLAUDE_PLUGIN_DATA\}/g)) {
      assert.equal(afterValues.slice(Math.max(0, m.index - 7), m.index), '--data ', `${name}: DATA only as a --data argument outside Values`);
    }
    // dispatches always carry the plugin prefix
    for (const re of [/ui-option/g, /ui-auditor/g]) {
      for (const m of text.matchAll(re)) assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:', `${name}: ${m[0]} without prefix`);
    }
    // "terminado" only next to the verdict script (new, improve); audit never says it
    const lines = text.split('\n').filter((l) => /terminado/i.test(l));
    if (name === 'audit') assert.deepEqual(lines, []);
    else for (const l of lines) assert.ok(/verdict/.test(l), `${name}: "terminado" without run.mjs verdict: ${l.slice(0, 80)}`);
    // after apply.md, every measure/capture/dom/check/report-skeleton/verdict command points at <run>/after
    const first = text.indexOf('apply.md');
    if (first >= 0) {
      for (const l of text.slice(first).split('\n')) {
        if (/(browser\.mjs"|run\.mjs" (check|report-skeleton|verdict)|report-check\.mjs")/.test(l)) assert.ok(l.includes('<run>/after'), `${name}: ${l.slice(0, 90)}`);
      }
    }
  }
  for (const name of REFERENCES) {
    const text = readReference(name);
    for (const m of text.matchAll(/ui-option|ui-auditor/g)) assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:', `${name}: ${m[0]} without prefix`);
  }
  const apply = readReference('apply.md');
  for (const l of apply.split('\n')) {
    if (/run\.mjs" (check|report-skeleton|verdict)|report-check\.mjs"/.test(l)) assert.ok(l.includes('<run>/after'), l.slice(0, 90));
  }
});

test('the three skills reference only files that exist now (present-and-choose.md included)', () => {
  for (const name of SKILLS) {
    for (const ref of referencedFiles(readSkill(name).text)) assert.doesNotThrow(() => readReference(ref), `${name}: ${ref}`);
  }
});
