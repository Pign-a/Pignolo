'use strict';
// Reglas del paso 2 (brainstorm) de la skill plan y su costura con el spec-reviewer
// (decisión del autor, 2026-10-01, tras el A/B de tests/evals/RESULTS-brainstorm.md): no hay skill
// nueva, el paso de hoy suma las reglas que funcionaron. La skill es texto: estos tests fijan que
// cada regla esté escrita, que el paso siga siendo corto y que lo que nombra exista.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { readSkill, brokenReferences } = require('./skill-forms');
const { PLUGIN_ROOT } = require('./helpers');

const { text } = readSkill('plan');
const lines = text.split('\n');
const from = lines.findIndex((l) => /^2\. \*\*/.test(l));
const to = lines.findIndex((l, i) => i > from && /^3\. \*\*/.test(l));
const step2 = lines.slice(from, to).join('\n');
const step3 = lines.slice(to, lines.findIndex((l, i) => i > to && /^4\. \*\*/.test(l))).join('\n');

test('plan step 2: it is found, and the skill stays compact', () => {
  assert.ok(from > 0 && to > from, 'no encontré el paso 2');
  assert.ok(step2.length <= 5200, `el paso 2 mide ${step2.length} caracteres`);
  assert.ok(text.length <= 13000, `la skill mide ${text.length} caracteres`);
  assert.deepStrictEqual(brokenReferences(text), []);
  assert.doesNotMatch(text, /pignolo:brainstorm|pignolo:grill/); // no hay skill nueva
});

test('plan step 2: read before asking, reflect back, and an "Ok" confirms only the understanding', () => {
  assert.match(step2, /Read before asking/);
  for (const re of [/the request/, /`project\.md`/, /earlier decisions/, /the code the request touches/]) assert.match(step2, re);
  assert.match(step2, /one short message/);
  assert.match(step2, /"Ok"[^.]*confirms that reading and nothing else/);
  assert.match(step2, /never an assumption/i);
});

test('plan step 2: never ask what the repo answers, and a past decision is not a current fact', () => {
  assert.match(step2, /never asked/i);
  assert.match(step2, /`file:line`/);
  assert.match(step2, /not a fact for a new request/);
  assert.match(step2, /"previous decision, still valid\?"/);
});

test('plan step 2: the seven classes of open point', () => {
  for (const re of [/repo fact/, /author decision/, /technical ruling/, /measurable/, /A\/B or a spike/, /its cost/, /researchable/, /key claim/, /visual/, /out of scope/]) assert.match(step2, re);
  assert.match(step2, /in doubt[^.]*author's/i);
});

test('plan step 2: one reserved question per message, recommended option first, low-risk batch', () => {
  assert.match(step2, /one per message/);
  assert.match(step2, /recommended option first/);
  assert.match(step2, /batch/i);
  assert.match(step2, /¿van así, o cambiás alguno\?/);
});

test('plan step 2: budget 3 / 6 / 10 and the "suficiente" exit with its exception', () => {
  assert.match(step2, /3 for a small request/);
  assert.match(step2, /\b6\b[^.]*medium/);
  assert.match(step2, /\b10\b[^.]*large/);
  assert.match(step2, /`suficiente`/);
  assert.match(step2, /declared assumption `S<n>`/);
  assert.match(step2, /irreversible, cost or security/);
  assert.match(step2, /pending question/);
  assert.match(step2, /scope-card shows it again/);
});

test('plan step 2: the two-opus debate is offered in one line with its cost and never run unasked', () => {
  assert.match(step2, /debate of two opus agents/);
  assert.match(step2, /one line with its cost/);
  assert.match(step2, /never (?:run it )?unasked/);
});

test('plan step 2: the spec has the fixed sections, in order', () => {
  let at = -1;
  for (const h of ['Pedido', 'Hechos del repo', 'Decisiones del autor', 'Rulings técnicos', 'Supuestos declarados', 'Mediciones propuestas', 'Fuera de alcance']) {
    const i = step2.indexOf(`\`${h}\``, at + 1);
    assert.ok(i > at, `falta o está desordenada: ${h}`);
    at = i;
  }
});

test('plan: author decisions are recorded with the verb, and the spec-reviewer gets them as a second source', () => {
  assert.match(step2, /plan\.js" decision add --plan <plan> --id D-<n> --text-file "[^"]+" --quote-file "[^"]+"/);
  assert.match(step3, /plan\.js" decision list --plan <plan>/);
  assert.match(step3, /second source/);
  const agent = fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', 'spec-reviewer.md'), 'utf8');
  assert.match(agent, /recorded author decisions/i);
  assert.match(agent, /second source/i);
  assert.match(agent, /backed by a recorded decision[^.\n]*not[^.\n]*Added without being asked/i);
  assert.match(agent, /matches neither/i);
});

test('CREDITS.md: one line per MIT source, own text only', () => {
  const t = fs.readFileSync(path.join(PLUGIN_ROOT, 'CREDITS.md'), 'utf8');
  assert.match(t, /Matt Pocock/);
  assert.match(t, /grill/i);
  assert.match(t, /Jesse Vincent/);
  assert.match(t, /brainstorming/i);
  assert.match(t, /MIT/);
  assert.match(t, /own text|texto propio/i);
  assert.strictEqual(t.split('\n').filter((l) => /^- /.test(l)).length, 2);
});
