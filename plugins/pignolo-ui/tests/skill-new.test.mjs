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
  assert.ok(text.includes('data-sample') && text.includes('Datos de muestra') && !text.includes('‹'));
  assert.ok(text.includes('design/approved/direction'));
  for (const cap of ['one round of directions', 'one round of mockups', 'at most one regeneration', 'one implementation', 'one batch check', 'one batch of fixes', 'at most one confirmation']) {
    assert.ok(text.toLowerCase().includes(cap), cap);
  }
  assert.ok(!/canvas-not-in-v1|is not available in v1/.test(text), 'the canvas is back in v1 (hito 4c)');
});

test('new and improve: the gate comes before the first Artifact call, the account types are listed and kept in types.json (A4C-01)', () => {
  for (const name of ['new', 'improve']) {
    const { text } = readSkill(name);
    for (const lit of ['scope: "types"', '"Design"', 'types.json', '--design-type', 'publish-gate', 'canvas-index.mjs plan']) assert.ok(text.includes(lit), `${name}: ${lit}`);
    assert.ok(text.indexOf('publish-gate') < text.indexOf('scope: "types"'), `${name}: publish-gate goes before the first Artifact call`);
    assert.ok(/any exit other than 0[^\n]*do not call Artifact at all/.test(text) && text.includes('action: "list"'), `${name}: with exit 1 not even list`);
    assert.ok(/ilegible/.test(text), `${name}: an unreadable presentation is said`);
    assert.doesNotMatch(text, /canvas-not-in-v1|The canvas "Design" is not available in v1/);
    assert.ok(text.includes('First decide how they will be shown'), `${name}: present before the options`);
  }
});

test('present-and-choose.md: no variables, the canvas loop in order, opt-outs, one path to Artifact, no consent question, -v2 (hito 4c)', () => {
  const text = readReference('present-and-choose.md');
  assertNoVariables(text);
  indexOrder(text, ['run.mjs" present', 'leak-values', 'canvas-index.mjs" build', 'canvas-index.mjs" verify', 'canvas-index.mjs" plan', 'step', 'canvas-read-live',
    'canvas-index.mjs" merge --run <run> --live', 'canvas-index.mjs" record --run <run> --step']);
  for (const lit of ['never call Artifact when the mode is local', 'publish-gate'.replace('publish-gate', 'no-publish'), 'config set --key publish --value never', 'presentation = local', 'no publiques',
    'privados de tu cuenta', 'readable by only you', 'no se relee', 'compare.html', '--kind direction', 'Google Fonts', 'lienzo nuevo', 'ilegible', '<run>/local/', 'fuentes remotas quitadas',
    'solo en el lienzo', 'literal quote', '-v2', '--quote-file', 'there is no consent question']) {
    assert.ok(text.toLowerCase().includes(lit.toLowerCase()), lit);
  }
  for (const bad of ['canvasConsent', 'consentNeeded', 'canvas-not-in-v1', 'una vez con los archivos', 'config set --key presentation', '--page-id', '--allow-few-values', 'to-canvas']) assert.ok(!text.includes(bad), `must not say: ${bad}`);
  assert.ok(text.indexOf('leak-check.mjs" --dir') < text.indexOf('approve.mjs" save'), 'leak check before saving as approved');
  assertScriptsExist(scriptCalls(text));
});

test('present-and-choose.md has a single way to Artifact: plan, a step at a time; force, overwrite_unread and share only inside a "never" sentence (A4C-02)', () => {
  const text = readReference('present-and-choose.md');
  assert.ok(!/after `?diff`?[, ]+publish|tras `?diff`?[, ]+public/i.test(text));
  for (const word of ['force', 'overwrite_unread', 'share', 'public']) {
    for (const sentence of text.split(/(?<=[.!?])\s+|\n/).filter((x) => new RegExp(`\\b${word}\\b`).test(x))) {
      assert.ok(/never|nunca/i.test(sentence), `${word} outside a never sentence: ${sentence.slice(0, 90)}`);
    }
  }
  assert.ok(text.includes('exactly as printed'));
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
    const lines = text.split('\n').flatMap((l) => l.split(/(?<=[.!?])\s+/)).filter((l) => /terminado/i.test(l));
    if (name === 'audit') assert.deepEqual(lines, []);
    else for (const l of lines) assert.ok(/verdict/.test(l), `${name}: "terminado" without run.mjs verdict: ${l.slice(0, 80)}`);
    // after apply.md, every measure/capture/dom/check/report-skeleton/verdict command points at <run>/after
    const first = text.indexOf('apply.md');
    if (first >= 0) {
      // per command, not per line: each --run argument must be <run>/after (m-3)
      const cmds = [...text.slice(first).matchAll(/(browser\.mjs"|run\.mjs" (?:check|report-skeleton|verdict)|report-check\.mjs"|compare\.mjs" approved)[^`]*?--run (\S+)/g)];
      assert.ok(cmds.length >= 4, `${name}: found ${cmds.length} commands after apply.md`);
      for (const m of cmds) assert.ok(m[2].startsWith('<run>/after'), `${name}: ${m[1]} uses --run ${m[2]}`);
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

test('new: loads reference/context.md, calls run.mjs context, writes the brief with its two mandatory sections, saves with --brief-file and copies the context to after/ (hito 4f)', () => {
  const { text } = readSkill('new');
  for (const lit of ['reference/context.md', 'run.mjs" context', '## First look', '## Do not touch', '--brief-file']) assert.ok(text.includes(lit), lit);
  assert.ok(/<run>\/after\/[^\n]*product\.md|product\.md[^\n]*<run>\/after\//.test(text) && text.includes('brief.md'), 'product.md and brief.md go to <run>/after/');
  assert.ok(/offer[^.]*PRODUCT\.md|PRODUCT\.md[^.]*offer/.test(text) && /only `new` offers/.test(text), 'new offers to create PRODUCT.md');
  assert.ok(/"no" as the default/.test(text), 'the default is no');
  assert.ok(text.indexOf('run.mjs" context') < text.indexOf('Brief, in text') && text.indexOf('Brief, in text') < text.indexOf('--brief-file'));
});
