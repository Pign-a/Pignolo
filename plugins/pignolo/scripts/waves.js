'use strict';
// Olas de un plan en tarjetas (solo lectura; spec §11.4, hito 7a).
// Uso: node waves.js --plan-file <ruta> [--profile max|balanced|economy] [--rework <n>] [--cwd <dir>]
// Salida: el JSON de planWaves. Exit 0; 1 con `kind` (cycle, unknown-dependency, not-cards) y `Alternativa:`; 2 uso.
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const { readProjectConfig } = require('../lib/project-config');
const { readConfig } = require('../lib/profiles');
const { PROFILE_PARAMS } = require('../lib/roles');
const { parsePlanTasks, planWaves } = require('../lib/waves');

class Usage extends Error {}

function parse(argv) {
  const o = {};
  const allowed = ['plan-file', 'profile', 'rework', 'cwd'];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--') || !allowed.includes(a.slice(2))) throw new Usage(`opción desconocida: ${a}`);
    i += 1;
    if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = argv[i];
  }
  return o;
}

function main() {
  const o = parse(process.argv.slice(2));
  if (!o['plan-file']) throw new Usage('uso: waves.js --plan-file <ruta> [--profile <p>] [--rework <n>] [--cwd <dir>]');
  let profile = o.profile;
  if (profile !== undefined && !PROFILE_PARAMS[profile]) throw new Usage(`--profile debe ser ${Object.keys(PROFILE_PARAMS).join(' | ')}`);
  const rework = o.rework === undefined ? 0 : Number(o.rework);
  if (!Number.isInteger(rework) || rework < 0) throw new Usage('--rework debe ser un entero >= 0');
  const root = mainRoot(o.cwd ? path.resolve(o.cwd) : process.cwd());
  if (!profile) {
    try { profile = readConfig().profile; } catch (_) { profile = 'balanced'; }
  }
  const text = fs.readFileSync(path.resolve(o['plan-file']), 'utf8');
  const tasks = parsePlanTasks(text);
  if (!tasks.length) {
    process.stdout.write(`${JSON.stringify({ ok: false, kind: 'not-cards' })}\n`);
    process.stderr.write('pignolo waves: el plan no está en tarjetas (### Task con **Files:**). Alternativa: ejecutá el plan en serie, una tarea por vez\n');
    process.exitCode = 1;
    return;
  }
  let cfg = { contracts: [], serialPaths: [] };
  try { cfg = readProjectConfig({ root }); } catch (_) { /* sin project.md legible: sin contratos declarados */ }
  const res = planWaves({ tasks, profile, contracts: cfg.contracts, serialPaths: cfg.serialPaths, rework });
  process.stdout.write(`${JSON.stringify({ ok: true, profile, rework, ...res })}\n`);
}

try {
  main();
} catch (e) {
  if (e instanceof Usage) {
    process.stderr.write(`pignolo waves: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e.kind) {
    process.stdout.write(`${JSON.stringify({ ok: false, kind: e.kind, message: e.message })}\n`);
    process.stderr.write(`pignolo waves: ${e.message}. Alternativa: corregí las líneas Depends del plan\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`pignolo waves: ${e.message}\n`);
    process.exitCode = 1;
  }
}
