'use strict';
// Revisión de la rama feat/skills-lenguaje-natural (RNL-01 a RNL-05). Cada test falla en 6c2ce98.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CASES, invokedSkill, grade } = require('./evals/activation-cases');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ACT_UI = read('plugins/pignolo-ui/reference/activation.md');
const ACT_CORE = read('plugins/pignolo/templates/activation-confirm.md');
const ENTRY = read('plugins/pignolo/skills/entry/SKILL.md');

function section(text, name) {
  const i = text.indexOf(`### ${name}`);
  assert.ok(i >= 0, name);
  const rest = text.slice(i + 4);
  const j = rest.search(/^#{2,3} /m);
  return j < 0 ? rest : rest.slice(0, j);
}

// La línea de entry que manda la UI a pignolo-ui.
const UI_LINE = ENTRY.split('\n').find((l) => l.includes('pignolo-ui:new'));

// RNL-01: new (paso 7) e improve (paso 2) despachan siempre ui-auditor (0,27 a 0,31 USD, docs/benchmarks.md);
// la opción recomendada muestra solo las opciones (new) o el auditor "con criterios de juicio" (improve).
test('RNL-01: the recommended option of new and improve states the auditor cost they always pay', () => {
  for (const name of ['new', 'improve']) {
    const rec = section(ACT_UI, name).split('\n').find((l) => l.includes('(Recomendado)'));
    // Lo que se paga siempre: la línea sin la cláusula condicional de los criterios de juicio.
    const always = rec.replace(/con criterios de juicio[^"]*/, '');
    assert.match(always, /auditor[^"]*≈ ?0,(27|3)/, `${name}: falta el costo del auditor que la skill corre siempre`);
  }
});

// RNL-02: "Hacerlo directo" sigue "como en una sesión normal"; en un proyecto con pignolo eso es entry, y entry
// vuelve a mandar el pedido de UI a pignolo-ui sin excepción: el usuario recibe la misma pregunta otra vez.
test('RNL-02: entry does not send back to pignolo-ui a request the user already chose to do directly', () => {
  assert.ok(UI_LINE, 'no UI line in entry');
  assert.match(UI_LINE, /Hacerlo directo/, 'entry no tiene excepción para "Hacerlo directo"');
});

// RNL-03: la línea de UI cuelga del paso 2 sin condición: una pregunta sobre una pantalla ("explicame cómo está
// hecho el panel") se manda a new/improve, que cambian archivos; el paso 2 dice que una pregunta no autoriza cambios.
test('RNL-03: entry sends to new or improve only a request that authorizes a change', () => {
  assert.ok(UI_LINE, 'no UI line in entry');
  assert.match(UI_LINE, /authoriz/i, 'la derivación a pignolo-ui no exige que el pedido autorice un cambio');
});

// RNL-04: el paso 0 manda preguntar con AskUserQuestion y nunca en texto, pero no dice qué hacer si la herramienta
// no está (claude -p, un subagente sin ella): queda abierto seguir sin la confirmación.
test('RNL-04: the activation rules say to end the skill when AskUserQuestion cannot be used', () => {
  const re = /(AskUserQuestion[^\n]*(not available|unavailable|cannot)|(not available|unavailable|cannot)[^\n]*AskUserQuestion)/i;
  assert.match(ACT_UI, re, 'pignolo-ui/reference/activation.md');
  assert.match(ACT_CORE, re, 'pignolo/templates/activation-confirm.md');
});

// RNL-05: la prueba toma la primera Skill invocada. En un pedido de UI el camino correcto con pignolo puede ser
// entry -> pignolo-ui:new (entry lo manda así); se cuenta como fallo y baja el acierto de las positivas.
test('RNL-05: a positive case that goes through pignolo:entry and then invokes the expected skill counts as a hit', () => {
  const ev = (skill) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });
  const stream = [ev('pignolo:entry'), ev('pignolo-ui:new')].join('\n');
  const p01 = CASES.find((c) => c.id === 'P01');
  assert.equal(grade(p01.expect, invokedSkill(stream)), true);
});
