// Revisión final del hito 4i: hallazgos de los textos de las skills como tests que fallan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkill } from './support/skill-checks.mjs';

// R4i-02. Causa: el paso 9 (`Next screen`) crea una corrida nueva y vuelve al paso 3, salteando los pasos 1 y 2, que son los
// únicos que escriben `<run>/types.json` y corren `leak-values` y `context` en la corrida; `canvas-index.mjs plan` exige
// `--types-file` aunque el lienzo ya exista (sale con 2 si falta), así que la segunda pantalla no llega al mismo lienzo.
test('R4i-02: the Next screen step gives the new run what the canvas loop needs (types.json, leak-values and context)', () => {
  const { text } = readSkill('new');
  const at = text.indexOf('Next screen');
  assert.ok(at >= 0);
  const end = text.indexOf('## Limits', at);
  const step = text.slice(at, end < 0 ? undefined : end);
  assert.ok(step.includes('types.json') || /step 2\b/.test(step), 'the new run never gets <run>/types.json: plan exits 2 on --types-file');
  assert.ok(step.includes('leak-values') || /step 2\b/.test(step), 'the new run never gets <run>/leak-values.json');
});
