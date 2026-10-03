'use strict';
// Forma de la skill close-session (hito 6b, Task 11; R7 del autor, 2026-10-01: sin
// learning-validator, piso mecánico más el sí del humano). Solo forma: el comportamiento de los
// verbos lo cubre tests/close-session.test.js.
// Protects: spec §10.4 · Breaks if: la skill la invoca el modelo, inventa un verbo, manda editar
// INDEX.md o escribir en accepted/, no para con un merge en curso, no cita al humano, despacha un
// agente o menciona Engram.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');

const s = readSkill('close-session');
const SCRIPT = fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'close-session.js'), 'utf8');
const USAGE_VERBS = /uso: close-session\.js <([a-z|-]+)>/.exec(SCRIPT)[1].split('|');
const VERBS = ['evidence', 'scan', 'decide', 'archive', 'index', 'prune'];

test('frontmatter: model-invocable (natural language), real references', () => {
  assert.equal(s.data.name, 'close-session');
  assert.equal(s.data['disable-model-invocation'], undefined);
  assert.ok(s.data.description.length > 40);
  assert.deepEqual(brokenReferences(s.text), []);
});

test('the steps name exactly the six verbs of the script, and every verb used exists in its usage', () => {
  const used = [...s.text.matchAll(/close-session\.js" ([a-z-]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(used)].sort(), [...VERBS].sort());
  for (const v of used) assert.ok(USAGE_VERBS.includes(v), v);
  for (const m of s.text.matchAll(/<P>\/(scripts\/[\w.-]+)/g)) assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, m[1])), m[1]);
  assert.match(s.text, /decide --id <id> --answer yes/);
  assert.match(s.text, /decide --id <id> --answer no/);
  assert.doesNotMatch(s.text, /--human|--validation-file/);
  assert.match(s.text, /`flags`/);
  assert.match(s.text, /`duplicate`/);
  assert.match(s.text, /archive --dry-run/);
});

test('never edits INDEX.md nor writes accepted/; stops on a merge; quotes the human literally', () => {
  assert.match(s.text, /Never edit `\.pignolo\/state\/INDEX\.md`/);
  assert.match(s.text, /never write into `\.pignolo\/state\/learnings\/accepted\/`/);
  assert.doesNotMatch(s.text, /(Write|Edit) tool[^\n]*learnings\/accepted/);
  assert.match(s.text, /merge, cherry-pick or rebase in progress: stop/);
  assert.match(s.text, /literal quote of their words/);
});

test('no agent is dispatched (R7) and Engram is not mentioned (D-6-1)', () => {
  assert.match(s.text, /you dispatch no subagent/);
  assert.doesNotMatch(s.text, /pignolo:[a-z-]+/);
  assert.doesNotMatch(s.text, /learning-validator/);
  assert.doesNotMatch(s.text, /engram/i);
});

// Protects: decisión del autor del 2026-10-01 (se quitó el agente learning-validator) · Breaks if: vuelve
// su carta, su fila de roles.js, o algo del plugin lo nombra.
test('the learning-validator agent is gone: no card, no role row, no reference in the plugin', () => {
  const roles = require(path.join(PLUGIN_ROOT, 'lib', 'roles.js'));
  assert.ok(!fs.existsSync(path.join(PLUGIN_ROOT, 'agents', 'learning-validator.md')));
  assert.ok(!Object.keys(roles.ROLES || roles.AGENT_ROLES || roles).includes('learning-validator'));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const hits = walk(PLUGIN_ROOT).filter((f) => /learning-validator/.test(fs.readFileSync(f, 'utf8')));
  assert.deepStrictEqual(hits, []);
});
