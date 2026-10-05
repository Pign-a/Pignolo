'use strict';
// Revisión del panel 0.4.0 (detalle por agente), parte pura. Cada test falla sobre f153447 y dice su causa en una línea.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./helpers-panel-ui');

// RD-02. Causa: reopen() vuelve a poner el agente en 'running' pero deja `lastAt` del tramo anterior; agentFlags mide el silencio
// desde ese paso viejo, así que un agente que se acaba de retomar (SendMessage) sale "◌ sin actividad hace N min" y primero en la lista.
test('RD-02: an agent that is resumed after it finished is not stalled the moment it resumes', async () => {
  const { newRegistry, addAgent, noteStep, finish, reopen, agentView, agentFlags } = await load('model.js');
  const reg = newRegistry();
  const rec = addAgent(reg, { id: 'x', type: 't', description: 'd', model: 'haiku', startedAt: 1_000 });
  noteStep(rec, { toolUses: [], usage: { input_tokens: 10, output_tokens: 1 } }, 5_000);
  finish(rec, 6_000, false);
  const RESUMED = 600_000; // diez minutos despues llega su proximo turn.step
  reopen(rec, RESUMED);
  assert.strictEqual(rec.status, 'running');
  const f = agentFlags(agentView(rec), RESUMED + 1_000);
  assert.strictEqual(f.stalled, false, 'recien retomado y ya figura parado (lastAt = ' + rec.lastAt + ')');
});

// RD-03. Causa: el nombre de la herramienta y los campos `last` de la muestra se cortan con String.slice (unidades UTF-16) DESPUES de
// limpiar: el corte puede partir un par sustituto y dejar un sustituto suelto, justo lo que clean() promete que no se dibuja.
test('RD-03: cutting the tool name or the sample target never leaves a lone surrogate', async () => {
  const { newRegistry, addAgent, noteStep } = await load('model.js');
  const { readState } = await load('state.js');
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  const rec = addAgent(newRegistry(), { id: 'x', type: 't', startedAt: 1 });
  noteStep(rec, { toolUses: [{ name: 'n'.repeat(39) + '😀', input: {} }], usage: null }, 2);
  assert.ok(!lone.test(rec.last.name), JSON.stringify(rec.last.name));
  const a = readState({ schema: 'pignolo-panel-state/1', agents: [{ type: 't', last: { name: 'Bash', target: 'x'.repeat(79) + '😀' } }] }).snap.agents[0];
  assert.ok(!lone.test(a.last.target), JSON.stringify(a.last.target));
});
