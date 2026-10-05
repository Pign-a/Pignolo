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

// Bloque 2: el blanco bajo `.pignolo-ui/` va a pignolo-ui, nunca a un carril de git (T2).

const ACT = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'plugins', 'pignolo-ui', 'reference', 'activation.md'), 'utf8');
const UI_BULLET = LINES.find((l) => /^\s+- If the files the request names/.test(l)) || '';

test('LF-07: una viñeta manda `.pignolo-ui/` a improve o new, sin risk.js, porque git lo ignora', () => {
  const line = LINES.find((l) => l.includes('.pignolo-ui/') && l.includes('pignolo-ui:improve') && l.includes('pignolo-ui:new'));
  assert.ok(line, 'no hay viñeta de `.pignolo-ui/` con improve y new');
  assert.match(line, /Do not run `risk\.js`/);
  assert.match(line, /ignores/);
});

test('LF-08: sin pignolo-ui instalado la rama pasa por la pregunta de salida, no por el directo en silencio, y remite a NO-RUNS-COMMIT', () => {
  assert.ok(UI_BULLET, 'no hay viñeta de `.pignolo-ui/`');
  for (const s of ['LEAVE-FLOW', 'is not installed', 'NO-RUNS-COMMIT']) {
    assert.ok(UI_BULLET.includes(s), `falta "${s}" en la viñeta`);
  }
});

test('LF-09: la viñeta no junta `.pignolo-ui/` con commit, stage, git add ni back up', () => {
  assert.ok(UI_BULLET, 'no hay viñeta de `.pignolo-ui/`');
  const sinRemision = UI_BULLET.replace('NO-RUNS-COMMIT', ''); // la remisión a la regla es lo único permitido
  for (const re of [/commit/i, /\bstage/i, /git add/i, /back ?up/i]) {
    assert.doesNotMatch(sinRemision, re, `la viñeta contiene ${re}`);
  }
});

test('LF-10: activation.md dice que "Hacerlo directo" vale solo para ese pedido y que uno posterior o mayor vuelve a preguntar', () => {
  assert.ok(ACT.includes('that request only'), 'falta "that request only"');
  assert.ok(ACT.includes('later or larger request'), 'falta "later or larger request"');
});

test('LF-11: la viñeta de `.pignolo-ui/` va antes del paso 3 y del piso de riesgo (el blanco ignorado nunca llega a risk.js)', () => {
  const at = ENTRY.indexOf('If the files the request names');
  assert.ok(at > 0, 'no hay viñeta');
  assert.ok(at < ENTRY.indexOf('3. **Is another flow running?**'), 'la viñeta va antes del paso 3');
  assert.ok(at < ENTRY.indexOf('5. **Risk floor.**'), 'la viñeta va antes del paso 5');
});

// Bloque 3: "armá un plan" va al carril plan (T3).

const PLAN_SENTENCE_LINE = LINES.find((l) => l.includes('armá un plan')) || '';

test('LF-12: una misma línea de entry nombra "armá un plan", "make a plan", pignolo:plan y que el plan no se escribe en el chat', () => {
  assert.ok(PLAN_SENTENCE_LINE, 'no hay oración de pedido de plan');
  for (const s of ['make a plan', 'pignolo:plan', 'never write the plan in the chat']) {
    assert.ok(PLAN_SENTENCE_LINE.includes(s), `falta "${s}" en la línea`);
  }
});

test('LF-13: la viñeta plan del paso 7 cubre el pedido de un plan o de una especificación', () => {
  const bullet = LINES.find((l) => /^\s+- `plan`:/.test(l));
  assert.ok(bullet, 'no hay viñeta plan en el paso 7');
  assert.ok(bullet.includes('asked for a plan or a spec'), 'falta "asked for a plan or a spec"');
});

test('LF-14: la oración del plan va antes del paso 3 y no menciona risk.js ni LEAVE-FLOW (un pedido de plan no recibe la pregunta de salida)', () => {
  const at = ENTRY.indexOf('authorizes a plan, not code');
  assert.ok(at > 0 && at < ENTRY.indexOf('3. **Is another flow running?**'), 'la oración va antes del paso 3');
  const start = ENTRY.lastIndexOf('A request to plan or to write a spec', at);
  const end = ENTRY.indexOf('as usual.', at) + 'as usual.'.length;
  const sentence = ENTRY.slice(start, end);
  assert.ok(sentence.includes('authorizes a plan, not code'));
  assert.doesNotMatch(sentence, /risk\.js/);
  assert.doesNotMatch(sentence, /LEAVE-FLOW/);
});

test('LF-15: ejecutar un plan que ya existe no se confunde con pedir uno', () => {
  assert.ok(ENTRY.includes('Running a plan that already exists'), 'falta la cláusula');
});
