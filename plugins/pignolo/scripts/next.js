#!/usr/bin/env node
'use strict';
// La próxima acción derivada del estado (spec §10.3). Solo lectura.
// Uso: node next.js [--cwd <dir>] [--text]
// Imprime { kind, text, facts } como JSON; con --text, solo el texto (nada si no hay nada).
// Exit 0 siempre salvo uso incorrecto (2).
const path = require('node:path');
const { deriveNext, planList } = require('../lib/next');
const { mainRoot } = require('../lib/disabled');

const argv = process.argv.slice(2);
let cwd = process.cwd();
let textOnly = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--cwd' && argv[i + 1] !== undefined) { cwd = path.resolve(argv[i + 1]); i += 1; } else if (argv[i] === '--text') textOnly = true;
  else {
    process.stderr.write(`pignolo next: argumento desconocido: ${argv[i]}\nuso: next.js [--cwd <dir>] [--text]\n`);
    process.exit(2);
  }
}

const n = deriveNext({ cwd, env: process.env, now: Date.now() });
if (textOnly) {
  if (n.text) process.stdout.write(`${n.text}\n`);
} else {
  // `plans`: todos los planes con su etapa (el mismo contenido que `plan.js list`).
  let plans = [];
  try { plans = planList(mainRoot(cwd)); } catch (_) { plans = []; }
  // `suggest`: el siguiente paso del panel (lib/next-steps.js), calculado sin escribir el registro.
  let suggest = { none: 'nothing' };
  try { suggest = require('../lib/panel-state').compute(mainRoot(cwd), { now: Date.now() }).next; } catch (_) { /* sin sugerencia */ }
  process.stdout.write(`${JSON.stringify({ ...n, plans, suggest })}\n`);
}
