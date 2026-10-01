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

test('frontmatter: human-only, name init, real script references and verbs', () => {
  assert.equal(SKILL.data.name, 'init');
  assert.equal(SKILL.data['disable-model-invocation'], true);
  assert.ok(SKILL.data.description.length > 40);
  assert.deepEqual(brokenReferences(SKILL.text), []);
  assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md')));
});

test('the fourteen steps come in order: detect before preview, preview before apply, apply before verify', () => {
  const t = SKILL.text;
  const steps = [...t.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const at = (re) => t.search(re);
  assert.ok(at(/init\.js" detect/) < at(/init\.js" preview/));
  assert.ok(at(/init\.js" preview/) < at(/init\.js" apply/));
  assert.ok(at(/init\.js" apply/) < at(/init\.js" verify/));
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

test('the two layers are required for every step message', () => {
  assert.match(SKILL.text, /In plain words/);
  assert.match(SKILL.text, /En pocas palabras/);
  assert.match(SKILL.text, /Technical detail/);
  assert.match(SKILL.text, /Detalle técnico/);
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
