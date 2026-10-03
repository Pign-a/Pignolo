'use strict';
// Forma de la skill init, la plantilla de SECURITY.md y el README (Task 10). Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');

const SKILL = readSkill('init');
const ROOT = path.join(__dirname, '..');

test('frontmatter: model-invocable (natural language), name init, real script references and verbs', () => {
  assert.equal(SKILL.data.name, 'init');
  assert.equal(SKILL.data['disable-model-invocation'], undefined);
  assert.ok(SKILL.data.description.length > 40);
  assert.deepEqual(brokenReferences(SKILL.text), []);
  assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md')));
});

test('step 0 confirms before everything, then the fourteen steps of the review come in order: detect before preview, preview before apply, apply before verify', () => {
  const t = SKILL.text;
  const review = t.slice(t.indexOf('## Review point by point'), t.indexOf('## Rules'));
  const steps = [...review.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const at = (re) => t.search(re);
  assert.ok(at(/init\.js"? detect/) < at(/init\.js"? preview/));
  assert.ok(at(/init\.js"? preview/) < at(/init\.js"? apply/));
  assert.ok(at(/init\.js"? apply/) < at(/init\.js"? verify/));
  const s0 = t.indexOf('0. **Confirm');
  assert.ok(s0 > 0 && s0 < t.search(/init.js"? detect/) && s0 < t.indexOf('## Blank project'));
  assert.match(t, /activation-confirm.md/);
  assert.match(t, /init does not migrate any memory/);
  assert.match(t, /autoMemoryEnabled/);
});

test('forbidden instructions are absent: no push, no Edit/Write of the protected files, no commit without asking', () => {
  const bad = [];
  for (const line of SKILL.text.split('\n')) {
    if (/git push/i.test(line)) bad.push(`push: ${line}`);
    if (/(project\.md|settings|\.git\/config)/.test(line) && /\b(Edit|Write)\b/.test(line) && !/\b(never|not)\b/i.test(line)) bad.push(`edit: ${line}`);
    if (/git commit/i.test(line) && !/\b(yes|ask)\b/i.test(line)) bad.push(`commit: ${line}`);
  }
  assert.deepEqual(bad, []);
  assert.match(SKILL.text, /Never push/);
  assert.match(SKILL.text, /Only after the explicit yes/);
});

test('plain words come first and the technical detail only on request or on failure (D-3); the review keeps one step per message', () => {
  assert.match(SKILL.text, /In plain words/);
  assert.match(SKILL.text, /En pocas palabras/);
  assert.match(SKILL.text, /Technical detail/);
  assert.match(SKILL.text, /Detalle técnico/);
  assert.match(SKILL.text, /only if the human asks or something fails/);
  assert.match(SKILL.text, /One step per message/);
});

test('templates/SECURITY.md has exactly the three markers and never says "cumple"', () => {
  const tpl = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'SECURITY.md'), 'utf8');
  const markers = [...tpl.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(markers)].sort(), ['channel', 'project', 'supported']);
  assert.doesNotMatch(tpl, /\bcumple\b/i);
});

test('README points to /pignolo:init and no longer says it does not exist yet', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /Hasta que exista `\/pignolo:init`/);
  assert.match(readme, /\/pignolo:init/);
});

test('the init skill is one of the plugin skills', () => {
  const dirs = fs.readdirSync(path.join(PLUGIN_ROOT, 'skills'));
  assert.ok(dirs.includes('init'));
  for (const d of dirs) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'skills', d, 'SKILL.md')), d);
});

// ---------------------------------------------------------------- hito 8d, Task 10: textos de init, plan, status y close-session
test('8d: la skill init nombra adapt, skeleton, places.js undo, answers.public, --expect y la compuerta corrida aparte; sin runGate, árbol de carpetas ni ruta de usuario', () => {
  const t = SKILL.text;
  for (const re of [/\*\*Layout \(adapt\)\.\*\*/, /\*\*Skeleton\.\*\*/, /places\.js" undo --record/, /answers\.public/, /--expect/, /separate command/, /`adapt`, `skeleton`/]) assert.match(t, re, String(re));
  assert.match(t, /Pignolo never moves code/);
  assert.match(t, /a hard guard is never forced/);
  assert.match(t, /`\/local\/`/);
  assert.doesNotMatch(t, /runGate/);
  assert.doesNotMatch(t, /[├└│]/);
  assert.doesNotMatch(t, /[A-Za-z]:[\\/]+Users|\/home\/|\/Users\//);
});

test('8d: plan lee el lugar de spec y plan con places.js where y ya no fija docs/plans/ ni docs/specs/', () => {
  const plan = readSkill('plan').text;
  assert.match(plan, /places\.js" where spec/);
  assert.match(plan, /places\.js" where plan/);
  assert.doesNotMatch(plan, /docs\/plans\//);
  assert.doesNotMatch(plan, /docs\/specs\//);
  assert.deepEqual(brokenReferences(plan), []);
});

test('8d: status y close-session usan places.js report; close-session ofrece fix preview, no bloquea y sigue sin agentes', () => {
  const status = readSkill('status').text;
  assert.match(status, /places\.js" report/);
  assert.deepEqual(brokenReferences(status), []);
  const cs = readSkill('close-session').text;
  assert.match(cs, /places\.js" report/);
  assert.match(cs, /fix preview/);
  assert.match(cs, /never blocks the closing/);
  assert.match(cs, /No agents\./);
  assert.deepEqual(brokenReferences(cs), []);
});

test('8d: el README explica los seis lugares, where, report, el undo y sus límites', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /## Dónde va cada archivo/);
  for (const re of [/`reference`[^\n]*solo/, /places\.js where/, /`report`/, /places\.js undo/, /Límites/]) assert.match(readme, re, String(re));
});

test('M-7 (R-25): the gate runs apart from apply with its exact command, and the skill covers undo refusal, no gate and the 10-minute limit', () => {
  const t = SKILL.text;
  assert.match(t, /gate\.js" --level on-done --cwd/);
  assert.match(t, /never inside `apply`/);
  assert.match(t, /--level pre-merge/);
  assert.match(t, /declares no gate/);
  assert.match(t, /10-minute limit/);
  assert.match(t, /undo may be refused/);
});

test('I-4: a folder stopped by a hard guard is adopted where it is and the reason stays in refused', () => {
  assert.match(SKILL.text, /adopted where it is \(it goes into the map as that place and the reason stays in `refused`\)/);
});

// ---------------------------------------------------------------- plan 2026-10-02: init rápido y repo en blanco
const { STEP_IDS, BLANK_STEPS, detect } = require('../plugins/pignolo/scripts/init');
const { makeTempDir, git } = require('./helpers');

test('2026-10-02: the blank path comes before the fast flow and the fast flow before the review; each is a section', () => {
  const t = SKILL.text;
  const at = (h) => t.indexOf(h);
  assert.ok(at('## Start') < at('## Blank project'));
  assert.ok(at('## Blank project') < at('## Fast flow (existing project)'));
  assert.ok(at('## Fast flow (existing project)') < at('## Review point by point'));
  const blank = t.slice(at('## Blank project'), at('## Fast flow (existing project)'));
  assert.match(blank, /Walk no steps/);
  assert.match(blank, /nothing to configure yet/);
  assert.match(blank, /`blank-project`/);
  assert.match(blank, /ONE yes\/no question/);
  assert.match(blank, /`\/pignolo:init` again/);
  assert.match(blank, /No gates and no `type` are written/);
  assert.match(blank, /install and scaffold nothing/);
});

test('2026-10-02: closed answers use AskUserQuestion, recommended first, up to 4 per call, with a plain-text fallback', () => {
  const t = SKILL.text;
  assert.match(t, /`AskUserQuestion` tool/);
  assert.match(t, /recommended option first, labelled as recommended, up to 4 questions per call/);
  assert.match(t, /If the tool is not available, ask in plain text with the same options/);
  assert.match(t, /Free text only where there are no options/);
});

test('2026-10-02: the fast flow offers the three choices and an option chosen counts as the yes only for the exact plan shown', () => {
  const t = SKILL.text;
  for (const re of [/\*\*Apply the recommended setup\*\* \(recommended\)/, /\*\*Review point by point\*\*/, /\*\*Cancel\*\*/]) assert.match(t, re, String(re));
  assert.match(t, /explicit yes in their own turn/);
  assert.match(t, /counts as that yes only for the exact plan shown/);
  assert.match(t, /Cancel: say nothing was written/);
  assert.match(t, /init\.js apply --plan <file> --expect <stamp>/);
});

test('2026-10-02: every subcommand, summary field, step id, refusal kind and attention code the skill names exists in the scripts', () => {
  const t = SKILL.text;
  const root = makeTempDir('pignolo-skill-detect-');
  git(['init', '-q', '-b', 'main'], root);
  const out = detect({ cwd: root, env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-skill-home-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-skill-cfg-') } });
  assert.equal(out.blank, true);
  for (const m of t.matchAll(/`summary\.(\w+)`/g)) assert.ok(m[1] in out.summary, 'summary.' + m[1]);
  for (const key of ['blank']) assert.ok(key in out, key);
  const ids = [...t.matchAll(/Step ids: ([^.]*)\./g)][0][1].match(/`([a-z-]+)`/g).map((x) => x.replace(/`/g, ''));
  assert.deepEqual(ids, STEP_IDS);
  assert.deepEqual(out.summary.recommended, BLANK_STEPS);
  for (const id of BLANK_STEPS) assert.match(t, new RegExp('`' + id + '`'), id);
  const src = fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'init.js'), 'utf8');
  assert.ok(src.includes("'blank-project'"));
  const sum = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'init-summary.js'), 'utf8');
  const attention = t.match(/`summary\.attention` \(([^)]*\))?/);
  assert.ok(attention, 'names the attention codes');
  for (const code of ['no-type', 'untested', 'test-placeholder', 'unrecognized-runner', 'mutation-config', 'runner-excludes', 'existing-project-md', 'places-candidates']) {
    assert.match(t, new RegExp('`' + code + '`'), code);
    assert.ok(sum.includes("'" + code + "'"), code);
  }
});

test('2026-10-02: the skill is not longer than before by more than a small margin and carries no user paths', () => {
  assert.ok(SKILL.text.length <= 12300, String(SKILL.text.length));
  assert.doesNotMatch(SKILL.text, /[A-Za-z]:[\\/]+Users|\/home\/|\/Users\//);
});

test('2026-10-02: docs and version: CHANGELOG entry 0.19.0, plugin.json at the CHANGELOG head, spec and README name the decision, the manual checklist covers the blank repo', () => {
  const version = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.equal(changelog.match(/^## (\d+\.\d+\.\d+)/m)[1], version);
  assert.match(changelog, /^## 0.19.0 — 2026-10-03$/m);
  const spec = fs.readFileSync(path.join(ROOT, 'docs', 'specs', '2026-09-26-pignolo-v1-design.md'), 'utf8');
  assert.match(spec, /Decisión del autor, 2026-10-02: `init` y `setup` rápidos, y el repo en blanco/);
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /En un repositorio en blanco/);
  const manual = fs.readFileSync(path.join(ROOT, 'tests', 'manual', 'hito-8.md'), 'utf8');
  assert.match(manual, /Repo en blanco real/);
  assert.match(manual, /init-blank-ready/);
});
