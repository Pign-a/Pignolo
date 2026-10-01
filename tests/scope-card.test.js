'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { SECTIONS, parseScopeCard, validateScopeCard } = require(path.join(PLUGIN_ROOT, 'lib', 'scope-card.js'));

const REQUEST = 'Quiero que el plan tenga una tarjeta de alcance. Debe listar tres ejemplos de aceptacion, y no debe agregar nada sin avisar.';

const BODY = {
  Goal: 'Una tarjeta de alcance aprobada por el humano.',
  'Acceptance examples': [
    '- Con "una tarjeta de alcance" el plan queda registrado',
    '- Con "tres ejemplos de aceptacion" la tarjeta valida',
    '- Con "no debe agregar nada sin avisar" se lista lo agregado',
  ].join('\n'),
  'Request to spec': '- tarjeta -> seccion',
  'Not included or reinterpreted': '- none',
  'Added without being asked': '- none',
  'Out of scope': '- olas',
  'Reserved decisions': '- none',
  'Cost estimate': '- bajo',
};

function card(over = {}, order = SECTIONS) {
  const body = { ...BODY, ...over };
  return `# Tarjeta\n\n${order.filter((s) => body[s] !== null).map((s) => `## ${s}\n${body[s]}\n`).join('\n')}`;
}

const errs = (text, request = REQUEST) => validateScopeCard(text, { request });

test('SECTIONS is the closed list of 8 headings', () => {
  assert.deepStrictEqual(SECTIONS.length, 8);
  assert.strictEqual(SECTIONS[0], 'Goal');
  assert.strictEqual(SECTIONS[7], 'Cost estimate');
});

test('a complete card validates', () => {
  assert.deepStrictEqual(errs(card()), []);
});

test('each rule fails on its own', () => {
  const swapped = SECTIONS.slice();
  [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
  const ex = (n) => Array.from({ length: n }, (_, i) => `- Caso ${i} con "una tarjeta de alcance"`).join('\n');
  const cases = [
    ['missing Out of scope', card({ 'Out of scope': null }), /Out of scope/],
    ['headings swapped', card({}, swapped), /orden|order/i],
    ['2 examples', card({ 'Acceptance examples': ex(2) }), /3 a 7|3 to 7/],
    ['8 examples', card({ 'Acceptance examples': ex(8) }), /3 a 7|3 to 7/],
    ['example without quotes', card({ 'Acceptance examples': `${ex(2)}\n- sin comillas` }), /comillas|quote/i],
    ['quote not in the request', card({ 'Acceptance examples': `${ex(2)}\n- Con "una tarjeta de alcanse" falla` }), /alcanse/],
    ['Added: A2 without A1', card({ 'Added without being asked': '- A2: algo' }), /A1/],
    ['Added: none plus an item', card({ 'Added without being asked': '- none\n- A1: algo' }), /none/],
    ['empty goal', card({ Goal: '' }), /Goal/],
  ];
  for (const [name, text, re] of cases) {
    const e = errs(text);
    assert.ok(e.length > 0, `${name}: should fail`);
    assert.ok(e.some((m) => re.test(m)), `${name}: ${JSON.stringify(e)}`);
  }
});

test('a quote that differs only in case and spacing is valid', () => {
  const text = card({ 'Acceptance examples': `${BODY['Acceptance examples'].split('\n').slice(0, 2).join('\n')}\n- Con "No  DEBE agregar   nada sin avisar" se lista` });
  assert.deepStrictEqual(errs(text), []);
});

test('typographic quotes also count', () => {
  const text = card({ 'Acceptance examples': `${BODY['Acceptance examples'].split('\n').slice(0, 2).join('\n')}\n- Con “no debe agregar nada sin avisar” se lista` });
  assert.deepStrictEqual(errs(text), []);
});

test('Added with consecutive ids is valid and parsed', () => {
  const text = card({ 'Added without being asked': '- A1: un extra\n- A2: otro extra' });
  assert.deepStrictEqual(errs(text), []);
  const p = parseScopeCard(text);
  assert.deepStrictEqual(p.added, [{ id: 'A1', text: 'un extra' }, { id: 'A2', text: 'otro extra' }]);
  assert.strictEqual(p.examples.length, 3);
  assert.strictEqual(p.examples[0].quote, 'una tarjeta de alcance');
});

// Segunda fuente de citas (decisiones del autor registradas, spec §4.5).
const DECISIONS = [{ id: 'D-1', quote: 'sí, un solo lienzo por proyecto y que crezca' }];
const withExample = (quote) => card({ 'Acceptance examples': [BODY['Acceptance examples'], `- Con "${quote}" hay un solo lienzo`].join('\n') });

test('validateScopeCard: a quote from a recorded author decision is valid; one from neither source fails closed', () => {
  const t = withExample('un solo lienzo por proyecto');
  assert.deepStrictEqual(validateScopeCard(t, { request: REQUEST, decisions: DECISIONS }), []);
  assert.ok(validateScopeCard(t, { request: REQUEST }).some((e) => /no aparece en el pedido/.test(e)), 'sin decisiones sigue fallando');
  const invented = validateScopeCard(withExample('un lienzo por pantalla'), { request: REQUEST, decisions: DECISIONS });
  assert.strictEqual(invented.length, 1);
  assert.match(invented[0], /ni en una decisión registrada/);
});

test('validateScopeCard: a decision without a quote never backs an example', () => {
  const t = withExample('un solo lienzo por proyecto');
  assert.ok(validateScopeCard(t, { request: REQUEST, decisions: [{ id: 'D-1', quote: '' }, { id: 'D-2' }] }).length > 0);
});

// Protects: la mutación `d.quote || d.text || d.id` · Breaks if: una decisión sin cita respalda un ejemplo
// con su texto (la decisión sin cita tiene como texto justo la cita buscada).
test('validateScopeCard: a decision with text but no quote never backs an example', () => {
  const t = withExample('un solo lienzo por proyecto');
  const errs2 = validateScopeCard(t, { request: REQUEST, decisions: [{ id: 'D-1', quote: '', text: 'un solo lienzo por proyecto' }, { id: 'un solo lienzo por proyecto' }] });
  assert.strictEqual(errs2.length, 1);
});

// Protects: M3 de la revisión · Breaks if: una cita de una o dos letras vuelve a valer por subcadena.
test('validateScopeCard: a quote shorter than 3 characters proves nothing', () => {
  const t = withExample('y');
  assert.ok(validateScopeCard(t, { request: REQUEST }).some((e) => /demasiado corta/.test(e)));
  assert.ok(validateScopeCard(t, { request: REQUEST, decisions: DECISIONS }).some((e) => /demasiado corta/.test(e)));
});
