// The foundation gate and the define skill (hito 4h): prose contracts, no script behind them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkill, readReference, scriptCalls, assertScriptsExist, referencedFiles, assertNoVariables, indexOrder } from './support/skill-checks.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

test('define: frontmatter, size, Values block first, scripts and referenced files exist', () => {
  const { frontmatter, text, body } = readSkill('define');
  assert.equal(frontmatter.name, 'define');
  assert.match(frontmatter.description, /^".*"$/);
  assert.equal(frontmatter['disable-model-invocation'], 'true');
  assert.ok(text.length <= 12000, `${text.length} characters`);
  const values = body.indexOf('## Values');
  const steps = body.indexOf('## Steps');
  assert.ok(values >= 0 && values < steps);
  for (const v of ['${CLAUDE_PLUGIN_ROOT}', '${CLAUDE_PLUGIN_DATA}', '${user_config.optionsPerDecision}', '${user_config.presentation}']) assert.ok(body.slice(values, steps).includes(v), v);
  assert.ok(!body.slice(steps).includes('${user_config') && !body.slice(steps).includes('${CLAUDE_PLUGIN_DATA}'));
  assertScriptsExist(scriptCalls(text));
  for (const ref of referencedFiles(text)) assert.doesNotThrow(() => readReference(ref), ref);
  for (const want of ['foundation.md', 'options.md']) assert.ok(referencedFiles(text).includes(want), want);
  for (const m of text.matchAll(/ui-option|ui-auditor/g)) assert.equal(text.slice(Math.max(0, m.index - 11), m.index), 'pignolo-ui:');
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});

test('define: product before design, questions before the board, the gate and the leak check before Artifact, nothing written without a confirmed diff', () => {
  const { text } = readSkill('define');
  indexOrder(text, ['run.mjs" env', 'publish-gate', 'run.mjs" init', 'product-md.mjs" create', 'Design in words', '--kind direction', 'design-md.mjs" extract',
    '<run>/board/index.html', 'leak-check.mjs" --dir <run>/board', 'then call Artifact', 'approve.mjs save --flow direction', 'design-md.mjs" patch', '--out <repo>/DESIGN.md',
    'approve.mjs record', 'design-md.mjs" validate', '## pignolo-ui: pendientes']);
  for (const lit of ['AskUserQuestion', 'lo que ya hay', 'extraídos, no decididos', 'never overwrites', 'Never use `--write` on the template', 'An "Ok" confirms only',
    'any exit other than 0 do not call Artifact at all', 'private', 'tablero: local (', 'changes no screen']) assert.ok(text.includes(lit), lit);
  assert.ok(/without a diff the user confirms/.test(text));
  assert.ok(!/terminado/i.test(text) && !text.includes('apply.md'), 'define implements nothing');
});

test('foundation.md: what is defined, the insistence in two questions, the pending note and no script', () => {
  const text = readReference('foundation.md');
  assertNoVariables(text);
  assert.ok(text.length < 5000, `${text.length} characters`);
  assert.equal(scriptCalls(text).length, 0, 'the gate is prose: no script');
  indexOrder(text, ['PRODUCT.md', '## Audience', '## First look', 'DESIGN.md', 'extraídos, no decididos', 'Definir ahora (recomendado)', '/pignolo-ui:define', 'Seguir sin definir',
    'second question', 'Sí, seguir sin definir', '## pignolo-ui: pendientes', 'only with a diff the user confirms', 'sin definición inicial']);
  assert.match(text, /An "Ok"[^.]*is not a request to skip/);
  assert.ok(text.includes('never add a line that is already there'));
});

test('new, improve and audit hold the gate before their step 2 and send to define; only define generates directions or creates PRODUCT.md', () => {
  for (const name of ['new', 'improve', 'audit']) {
    const { text, body } = readSkill(name);
    const gate = body.indexOf('## Foundation gate');
    assert.ok(gate >= 0 && gate < body.indexOf('## Steps'), `${name}: the gate section comes before the steps`);
    for (const lit of ['reference/foundation.md', '/pignolo-ui:define', 'An "Ok" is not that request', 'only after the foundation gate', 'explicitly, twice']) assert.ok(text.includes(lit), `${name}: ${lit}`);
    assert.ok(text.indexOf('reference/foundation.md') < text.indexOf('prepare-run.md'), `${name}: gate before the run`);
    for (const gone of ['--kind direction', 'product-md.mjs', 'se sigue sin contexto de producto']) assert.ok(!text.includes(gone), `${name}: ${gone}`);
    assert.ok(referencedFiles(text).includes('foundation.md'));
  }
  // author's decision (2026-10-02): without a decided DESIGN.md, new and improve cannot be skipped at all; audit can
  for (const name of ['new', 'improve']) assert.ok(readSkill(name).text.includes('`DESIGN.md` cannot be skipped in this skill'), name);
  assert.ok(!readSkill('audit').text.includes('cannot be skipped'));
  assert.match(readReference('foundation.md'), /No skip in `new` and `improve` without a decided `DESIGN\.md`/);
  assert.ok(readSkill('audit').text.includes('sin definición inicial'));
  assert.ok(!readReference('present-and-choose.md').includes('never with Artifact'));
  assert.ok(readReference('context.md').includes('only in `/pignolo-ui:define`'));
});
