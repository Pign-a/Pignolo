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

test('the twelve steps come in order: detect before preview, preview before apply, apply before verify', () => {
  const t = SKILL.text;
  const steps = [...t.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
