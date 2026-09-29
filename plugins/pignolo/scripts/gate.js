'use strict';
// CLI de la compuerta (spec §8.2): fuera de todo hook.
// Uso: node gate.js --level on-edit|on-done|pre-merge [--cwd <dir>] [--task]
//      [--no-tests-reason <archivo>] [--timeout-min <n>]
const fs = require('node:fs');
const { runGate, LEVELS, DEFAULT_TIMEOUT_MS } = require('../lib/gate');
const { mainRoot } = require('../lib/disabled');
const { readRun } = require('../lib/project');

const ALTERNATIVES = {
  NO_GATE: 'no hay comando para este nivel en gates de .pignolo/project.md; declaralo (nunca es verde).',
  INTEGRITY_NO_REF: 'la tarea no tiene base ni testRef; registrala con run.js task --base <sha>.',
  TREE_CHANGED: 'el comando modificó el árbol; agregá a .gitignore lo que genera la compuerta o corregí el comando.',
  FAIL: 'el comando terminó con error; corregilo y volvé a correr la compuerta.',
  INTEGRITY: 'cambiaron tests o su configuración; revertilos o pedí autorización de tests.',
  SCOPE: 'hay cambios fuera de los archivos de la tarea o archivos vaciados; revertilos.',
  NO_TESTS: 'ningún test cambió; pasá --no-tests-reason <archivo> con el motivo o agregá tests.',
};

function usage(msg) {
  process.stderr.write(`pignolo gate: ${msg}\n`);
  process.exit(2);
}

function parse(argv) {
  const o = { task: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`falta el valor de ${a}`); i += 1; return argv[i]; };
    if (a === '--level') o.level = val();
    else if (a === '--cwd') o.cwd = val();
    else if (a === '--task') o.task = true;
    else if (a === '--no-tests-reason') o.reasonFile = val();
    else if (a === '--timeout-min') o.timeoutMin = Number(val());
    else usage(`argumento desconocido: ${a}`);
  }
  if (!LEVELS.includes(o.level)) usage(`--level debe ser ${LEVELS.join(' | ')}`);
  if (o.timeoutMin !== undefined && !(o.timeoutMin > 0)) usage('--timeout-min debe ser un número positivo');
  return o;
}

function main() {
  const o = parse(process.argv.slice(2));
  let cwd = o.cwd || process.cwd();
  let task;
  if (o.task) {
    const st = readRun(mainRoot(cwd));
    if (!st.run || !st.run.task) usage('no hay una tarea registrada en .pignolo/run.json');
    task = st.run.task;
    if (!o.cwd) cwd = task.worktree;
  }
  let noTestsReason;
  if (o.reasonFile) {
    try { noTestsReason = fs.readFileSync(o.reasonFile, 'utf8').trim(); } catch (e) { usage(`no se pudo leer ${o.reasonFile}: ${e.message}`); }
  }
  const seal = runGate({
    cwd, level: o.level, env: process.env, task, noTestsReason,
    timeoutMs: o.timeoutMin ? o.timeoutMin * 60000 : DEFAULT_TIMEOUT_MS,
  });
  process.stdout.write(`${JSON.stringify(seal, null, 2)}\n`);
  if (seal.status !== 'PASS') {
    if (seal.logTail) process.stderr.write(`${seal.logTail}\n`);
    process.stderr.write(`pignolo gate: ${seal.status}${seal.checks.scope.length ? ` (${seal.checks.scope.join(', ')})` : ''}. Alternativa: ${ALTERNATIVES[seal.status] || ''}\n`);
  }
  process.exitCode = seal.status === 'PASS' || (seal.status === 'NO_TESTS' && seal.noTestsReason) ? 0 : 1;
}

try {
  main();
} catch (e) {
  process.stderr.write(`pignolo gate: ${e.message}\n`);
  process.exitCode = 2;
}
