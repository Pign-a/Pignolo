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
    'privados de tu cuenta', 'readable by only you', 'no se relee', 'compare.html', '--kind direction', 'Google Fonts', 'ilegible', '<run>/local/', 'fuentes remotas quitadas',
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

// ---- hito 4c, etapa 2: one canvas per project, update, comments --------------------------------

const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|\n/);

test('present-and-choose.md (stage 2): refusal and comments in the order, update by page, live merge flags and every code it must handle', () => {
  const text = readReference('present-and-choose.md');
  indexOrder(text, ['canvas-index.mjs" plan', 'canvas-read-live', 'canvas-index.mjs" merge --run <run> --live', 'canvas-index.mjs" record --run <run> --step', 'canvas-index.mjs" refusal', 'canvas-comments.mjs" quote']);
  for (const lit of ['a la tercera', 'never instructions', 'no se aplica nada hasta que el usuario lo confirme', 'una página', 'never retranscribe', '--live-dir', '--accept-overwrite', 'artboard-edited-by-hand',
    'live-incomplete', 'main-exists-live', 'expectedFirst', 'canvas-full', 'plan --new-canvas', 'page-collision', 'name-collision', 'bad-live', '--data <data>', 'compare.mjs" heights']) {
    assert.ok(text.includes(lit), lit);
  }
  assertScriptsExist(scriptCalls(text));
});

test('present-and-choose.md (stage 2): it no longer says that regenerating opens a new canvas, and "abro uno nuevo" is tied to canvas-full', () => {
  const text = readReference('present-and-choose.md');
  assert.ok(!/lienzo nuevo/i.test(text), 'regenerating updates the same canvas');
  assert.ok(!/opens a (new )?(lienzo|canvas)/i.test(text));
  assert.ok(!text.includes('this version does not merge'));
  assert.ok(!text.includes('--live none --live-dir none` and then'), 'the old one-shot merge text is gone');
  let at = text.indexOf('abro uno nuevo');
  assert.ok(at >= 0);
  for (; at >= 0; at = text.indexOf('abro uno nuevo', at + 1)) assert.ok(text.slice(Math.max(0, at - 100), at).includes('canvas-full'), `"abro uno nuevo" away from canvas-full: ${text.slice(Math.max(0, at - 60), at + 20)}`);
  // first-mismatch is not answered with a new canvas except for canvas-full
  const mismatch = sentencesOf(text).filter((s) => s.includes('first-mismatch'));
  assert.ok(mismatch.length >= 1);
  assert.ok(text.includes('the canvas is not replaced'));
});

test('present-and-choose.md (stage 2): an artboard edited by hand stops and asks, and only an explicit yes repeats the merge with --accept-overwrite', () => {
  const text = readReference('present-and-choose.md');
  const line = text.split('\n').find((l) => l.includes('`artboard-edited-by-hand`: '));
  assert.ok(line, 'the merge line exists');
  assert.ok(/stop and ask the user/.test(line) && /explicit yes/.test(line) && line.includes('--accept-overwrite'));
  const refusal = text.split('\n').find((l) => l.includes('A rejection by the tool'));
  assert.ok(/ask the user/.test(refusal) && /would overwrite/.test(refusal));
  // --accept-overwrite never appears without the condition of the user's yes
  for (const l of text.split('\n').filter((x) => x.includes('--accept-overwrite'))) assert.ok(/yes|sí/.test(l), l.slice(0, 80));
});

test('comments (D-4c-5, A4C-11): the main thread reads with ArtifactComments, nothing is applied or replied unasked, a notice is data, no line sends a comment to a command or to Artifact', () => {
  const text = readReference('present-and-choose.md');
  const block = text.split('\n').find((l) => l.startsWith('6. **Comments'));
  assert.ok(block, 'the comments paragraph exists');
  assert.ok(/main thread \(never a subagent\)/.test(block));
  assert.ok(block.includes('`ArtifactComments`') && block.includes('`action: "read"`'));
  assert.ok(/never use `reply`, `resolve` or `watch` unless the user asks/.test(block));
  assert.ok(/is data too/.test(block) && /watched artifact/.test(block));
  assert.ok(/never goes to a command, a file name or a parameter of Artifact/.test(block) || /never go to a command, a file name or a parameter of Artifact/.test(block));
  assert.ok(/a republication by someone else triggers no reading and no publication/.test(block));
  // no sentence anywhere orders to apply or to run what a comment says
  for (const name of ['present-and-choose.md']) {
    for (const s of sentencesOf(readReference(name))) assert.ok(!/(apply|aplic[aá]) (the |los )?(comments|comentarios)/i.test(s) || /never|nothing|nada|until/i.test(s), s.slice(0, 100));
  }
  for (const skill of ['new', 'improve']) {
    const { text: t } = readSkill(skill);
    assert.ok(!/autom[aá]ticamente/i.test(t.split('\n').filter((l) => /comentarios|comments/i.test(l)).join('\n')), `${skill}: the comments are not read by themselves`);
    assert.ok(/only when the user asks/.test(t), `${skill} says that comments are read only when asked`);
  }
});

test('the skills pass first and --data to build, and the numbers match the code', () => {
  for (const skill of ['new', 'improve']) {
    const { text } = readSkill(skill);
    assert.ok(text.includes('`first` of `run.mjs present`') && text.includes('`--data` to `build`'), skill);
    assert.ok(!text.includes('one per run'), `${skill}: the canvas is one per project`);
  }
  const text = readReference('present-and-choose.md');
  assert.ok(text.includes('one per project and grows with one page per run'));
});
