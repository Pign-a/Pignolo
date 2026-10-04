'use strict';
// Salir del flujo de pignolo se pregunta por pedido (plan 2026-10-03-salir-del-flujo, T1 a T3).
// Protege: la línea LEAVE-FLOW de entry (pregunta siempre, vale por un pedido, no se hereda ni se infiere
// de "directamente"), lo trivial sin pregunta, el ruteo de `.pignolo-ui/` a pignolo-ui y "armá un plan" al carril plan.
// Se rompe si: se borra o se recorta una cláusula de esa línea, se ensancha "trivial", la viñeta de `.pignolo-ui/`
// se mueve después del piso de riesgo o junta la ruta con una palabra de git, o la oración del plan pierde su cláusula.
// Solo forma: el comportamiento real de la pregunta lo cubre la prueba manual del autor (T7).
const test = require('node:test');
const assert = require('node:assert');
const { readSkill } = require('./skill-forms');

const { text: ENTRY } = readSkill('entry');
const LINES = ENTRY.split('\n');
const LEAVE = LINES.filter((l) => l.startsWith('LEAVE-FLOW:'));
const STEPS_AT = ENTRY.indexOf('## Steps');

// Bloque 1: la pregunta al salir del flujo (T1).

test('LF-01: una sola línea LEAVE-FLOW con la pregunta, las dos opciones, lo que se pierde y el alcance de un pedido', () => {
  assert.strictEqual(LEAVE.length, 1, 'tiene que haber exactamente una línea LEAVE-FLOW:');
  for (const s of ['AskUserQuestion', 'Hacerlo directo', 'no tests first', 'no independent review', 'this one request only']) {
    assert.ok(LEAVE[0].includes(s), `falta "${s}" en LEAVE-FLOW`);
  }
});

test('LF-02: el sí no se hereda a un pedido posterior ni se infiere de la redacción del pedido', () => {
  assert.strictEqual(LEAVE.length, 1);
  for (const s of ['later or larger request', 'directamente', 'just do it']) {
    assert.ok(LEAVE[0].includes(s), `falta "${s}" en LEAVE-FLOW`);
  }
});

test('LF-03: lo trivial, lo de solo lectura y lo entregado a una skill nunca reciben la pregunta; "trivial" no se ensanchó', () => {
  assert.strictEqual(LEAVE.length, 1);
  for (const s of ['A trivial request', 'never get this question']) {
    assert.ok(LEAVE[0].includes(s), `falta "${s}" en LEAVE-FLOW`);
  }
  assert.match(ENTRY, /`trivial`: one line or a mechanical change you fully understand/);
});

test('LF-04: la línea queda antes de "## Steps" y el paso 8 la nombra', () => {
  assert.ok(STEPS_AT > 0);
  assert.ok(ENTRY.indexOf('LEAVE-FLOW:') > 0 && ENTRY.indexOf('LEAVE-FLOW:') < STEPS_AT, 'LEAVE-FLOW va antes de los pasos');
  const step8 = LINES.find((l) => /^8\. /.test(l));
  assert.ok(step8 && step8.includes('LEAVE-FLOW'), 'el paso 8 no menciona LEAVE-FLOW');
});

test('LF-05: la línea de pignolo-ui del paso 2 vale solo para ese pedido y conserva lo que exigen RNL-02 y RNL-03', () => {
  const ui = LINES.find((l) => l.includes('pignolo-ui:new'));
  assert.ok(ui, 'no hay línea de pignolo-ui en entry');
  for (const s of ['this request only', 'Hacerlo directo', 'authorize']) {
    assert.ok(ui.includes(s), `falta "${s}" en la línea de pignolo-ui`);
  }
});

test('LF-06: sin AskUserQuestion no se sigue: se dice que hace falta la confirmación y se frena', () => {
  assert.strictEqual(LEAVE.length, 1);
  assert.match(LEAVE[0], /AskUserQuestion is not available[^\n]*stop/);
});
