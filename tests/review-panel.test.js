'use strict';
// Hallazgos de la revisión del hito del panel (RP-nn), como tests que fallan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, runLauncher, makeRepo } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));

function project() {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
}
const submit = (dir, prompt) => runLauncher('panel-answer', { hook_event_name: 'UserPromptSubmit', cwd: dir, prompt });

// RP-02: el hook solo mira el id y la opción; ignora la pregunta citada. Los id se reusan cuando el registro se
// reconstruye (archivo ilegible u otra schema: seq vuelve a 0), así que una respuesta a OTRA decisión (un botón
// dibujado antes, un texto pegado) marca una decisión que el usuario no respondió. Debe fallar cerrado.
test('RP-02 panel-answer: a quoted question that is not the question of that id does not mark it', () => {
  const dir = project();
  panel.ask(dir, { question: '¿Borramos la rama vieja?', options: ['seguir', 'parar'], recommended: 'parar' });
  const r = submit(dir, 'Respuesta a la decisión Q-1 ("¿Seguimos con el hito de 40 USD?"): seguir.');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(panel.read(dir).state.decisions[0].status, 'open');
});

// RP-04: con una sola decisión abierta, el siguiente paso sugiere en el prompt `Decisión Q-1: <recomendada>`. Si el
// usuario acepta esa sugerencia y la envía, el hook no la reconoce (no es el formato `Respuesta a la decisión ...`): la
// decisión queda abierta para siempre y el siguiente paso vuelve a sugerir lo mismo en cada refresco.
test('RP-04 sending the suggested next step of a decision marks that decision answered', () => {
  const dir = project();
  panel.ask(dir, { question: '¿El PDF usa la plantilla corta?', options: ['plantilla corta', 'plantilla completa'], recommended: 'plantilla corta' });
  const { nextStep, suggestionText } = require(path.join(PLUGIN_ROOT, 'lib', 'next-steps.js'));
  const step = nextStep({ decisions: panel.read(dir).state.decisions });
  assert.equal(step.main && step.main.rule, 'decision');
  const r = submit(dir, suggestionText(step.main));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(panel.read(dir).state.decisions[0].status, 'answered');
});
