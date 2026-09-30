'use strict';
// Traces con la forma REAL de Claude Code 2.1.285 para probar graders sin gastar tokens.
// Salen de la sonda 2 recortada y sin rutas personales
// (tests/fixtures/evals/probe2-review-reliability-defect.jsonl): el informe final del
// subagente NO sale como evento `assistant` con parent, sino como el `tool_result` que la
// sesión principal recibe por su `tool_use` de Agent. `grade` arma el texto como el runner
// 2.1.285: cada evento re-serializado con JSON.stringify, unidos por "\n", y UNA sola RegExp.
// Lo usan tests/eval-cases.test.js (hito 3) y tests/eval-testing-cases.test.js (hito 4b).
const fs = require('node:fs');
const path = require('node:path');

const REAL = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'evals', 'probe2-review-reliability-defect.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

function grade(g, { trace, files }) {
  const text = typeof g.target === 'object' ? files[g.target.path] : trace.map((e) => JSON.stringify(e)).join('\n');
  if (text === undefined) return false;
  const hit = new RegExp(g.pattern, g.flags || '').test(text);
  return g.match === 'not_contains' ? !hit : hit;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const find = (pred) => clone(REAL.find(pred));
const AGENT_ID = 'toolu_016xwg6uHqSSNnzN3tFRyruo';
const isResult = (e) => e.type === 'user' && e.parent_tool_use_id === null
  && Array.isArray(e.message.content) && e.message.content.some((b) => b.type === 'tool_result' && b.tool_use_id === AGENT_ID);
const REAL_RESULT_TEXT = REAL.find(isResult).message.content[0].content[0].text;
const FRAME_HEAD = REAL_RESULT_TEXT.slice(0, REAL_RESULT_TEXT.indexOf('The report follows:\n') + 'The report follows:\n'.length);
const FRAME_TAIL = REAL_RESULT_TEXT.slice(REAL_RESULT_TEXT.indexOf('\nagentId: '));

// El despacho de la sesión principal. Sin modelo explícito en el caso (el fixer del hito 3),
// el input no lleva `model`; con `c.model`, lleva ese.
function dispatch(c, id = AGENT_ID) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === null && x.message.content[0].type === 'tool_use');
  e.message.content[0].id = id;
  const input = e.message.content[0].input;
  input.subagent_type = `pignolo:${c.agent}`;
  input.prompt = c.brief;
  if (c.model) input.model = c.model;
  else if (!c.reviewer) delete input.model;
  return e;
}
function subEvents(c) {
  // Brief del subagente y sus herramientas reales (Read, Grep), con el tipo del caso.
  const out = REAL.filter((x) => x.parent_tool_use_id === AGENT_ID).map(clone);
  for (const e of out) e.subagent_type = `pignolo:${c.agent}`;
  out[0].message.content[0].text = c.brief;
  return out;
}
function toolUse(name, input, parent) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === AGENT_ID);
  e.message.content = [{ type: 'tool_use', id: `toolu_${name}`, name, input, caller: { type: 'direct' } }];
  e.parent_tool_use_id = parent;
  return e;
}
function agentResult(c, report, id = AGENT_ID) {
  // El tool_result de la sesión principal, con el marco y la sangría que pone el harness.
  const e = find(isResult);
  e.message.content[0].tool_use_id = id;
  const framed = `${FRAME_HEAD}${report.split('\n').map((l) => `  ${l}`).join('\n')}${FRAME_TAIL}`;
  e.message.content[0].content[0].text = framed;
  e.tool_use_result.prompt = c.brief;
  e.tool_use_result.agentType = `pignolo:${c.agent}`;
  e.tool_use_result.content[0].text = report;
  return e;
}
function notification(report) {
  const e = find((x) => x.type === 'system' && x.subtype === 'task_notification');
  e.summary = report;
  return e;
}
function mainSays(text) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === null && x.message.content[0].type === 'text');
  e.message.content[0].text = text;
  return e;
}
// Un tool_result del Agent que no es un informe: error de la herramienta (content string).
function agentError(message) {
  const e = find(isResult);
  e.message.content[0] = { tool_use_id: AGENT_ID, type: 'tool_result', content: `<tool_use_error>${message}</tool_use_error>`, is_error: true };
  delete e.tool_use_result;
  return e;
}
// El aviso que devuelve Agent con run_in_background: true (el informe no llega en el tool_result).
function agentLaunched(c) {
  const e = agentResult(c, '');
  e.message.content[0].content[0].text = 'Async agent launched successfully. agentId: a0 (runs in background; you will be notified when it completes)';
  return e;
}
const RESULT_EVENT = find((x) => x.type === 'result');

// Una corrida: la sesión principal despacha, el subagente trabaja (tools, con su parent) y
// devuelve `report` (null: no hay tool_result del Agent); la principal contesta `main`.
// `result` reemplaza al tool_result del Agent (un error, un aviso de background). `before`
// son eventos de la sesión principal antes del despacho (otro despacho y su tool_result).
function run(c, { report, tools = [], main = 'RELAYED', result, before = [] }) {
  let back = [];
  if (result) back = [result];
  else if (report !== null) back = [notification(report), agentResult(c, report)];
  return [...before, dispatch(c), ...subEvents(c), ...tools, ...back, mainSays(main), RESULT_EVENT];
}

module.exports = { REAL, AGENT_ID, grade, dispatch, toolUse, agentResult, mainSays, agentError, agentLaunched, run };
