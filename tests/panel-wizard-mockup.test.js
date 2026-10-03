'use strict';
// El mockup aprobado del autor (paso 2 de 5) contra lo que dibuja el asistente. Vive acá y no en plugins/pignolo-panel/tests porque un test
// del motor (`claude plugin test`) no puede leer archivos. Si el autor cambia el mockup, cambia el fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers-panel-ui');

const PANEL = path.join(__dirname, '..', 'plugins', 'pignolo-panel');
const FIXTURE = path.join(PANEL, 'tests', 'fixtures', 'mockup-paso-2.txt');
const SAMPLE = path.join(PANEL, 'sample', 'wizard-detect.json');

test('wizard-view: the mockup step 2 renders literally as the approved mockup', async () => {
  const M = await load('wizard-model.js');
  const V = await load('wizard-view.js');
  const { data } = M.readWizardDetect(fs.readFileSync(SAMPLE, 'utf8'));
  const steps = M.stepsFor({ data, uiInstalled: false });
  assert.equal(steps.length, 5);
  const st = { ...M.initialState(steps, data), i: 1 };
  const v = V.stepView({ step: 'profile', state: st, data, uiInstalled: false });
  const fixture = fs.readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n').trimEnd();
  assert.equal(v.lines.join('\n'), fixture);
  // y el fixture mismo cumple el criterio: diez líneas de exactamente 70 caracteres, esquinas redondeadas
  const lines = fixture.split('\n');
  assert.equal(lines.length, 10);
  for (const l of lines) assert.equal([...l].length, 70);
  assert.deepEqual([lines[0][0], [...lines[0]].pop(), lines[9][0], [...lines[9]].pop()], ['╭', '╮', '╰', '╯']);
});

test('wizard-view: the fixture keeps the approved mockup where the author set it (frame, bar, question, first option)', () => {
  // las líneas del mockup aprobado que no cambian por la sonda de teclas ni por los textos sin dato medido
  const approved = [
    '╭─ Empezar con pignolo ──────────────────────────────── paso 2 de 5 ─╮',
    '│ ▰▰▱▱▱                                                              │',
    '│ ¿Qué perfil de modelos usamos?                                     │',
    '│                                                                    │',
    '│  a  balanceado · recomendado    sonnet para construir, opus revisa │',
    '│                                                                    │',
    '╰────────────────────────────────────────────────────────────────────╯',
  ];
  const fixture = fs.readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
  for (const l of approved) assert.ok(fixture.includes(l), l);
});
