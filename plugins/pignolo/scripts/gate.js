'use strict';
// CLI de la compuerta (spec §8.2): fuera de todo hook.
// Uso: node gate.js --level on-edit|on-done|pre-merge [--cwd <dir>] [--task]
//      [--no-tests-reason <archivo>] [--timeout-min <n>] [--seed <n>] [--base <ref>]
//      Con varias tareas registradas, --task pide --id <tarea> (sale 2 con kind ambiguous-task si falta).
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { runGate, LEVELS, DEFAULT_TIMEOUT_MS } = require('../lib/gate');
const { mainRoot } = require('../lib/disabled');
const { readRun, taskList, taskById } = require('../lib/project');

const ALTERNATIVES = {
  NO_GATE: 'no hay comando para este nivel en gates de .pignolo/project.md; declaralo (nunca es verde).',
  INTEGRITY_NO_REF: 'la tarea no tiene base ni testRef; registrala con run.js task --base <sha>.',
  TREE_CHANGED: 'el comando modificó el árbol; agregá a .gitignore lo que genera la compuerta o corregí el comando.',
  FAIL: 'el comando terminó con error; corregilo y volvé a correr la compuerta.',
  INTEGRITY: 'cambiaron tests o su configuración; revertilos o pedí autorización de tests.',
  NO_MUTATION_TOOL: '`mutation: true` y el diff toca `high-risk-paths`, pero no hay `gates.mutation`; el humano agrega la herramienta y su comando a `project.md`, o pone `mutation: false`.',
  MUTATION: 'sobrevivieron mutantes: un test nuevo que los mate, un equivalente justificado aprobado por un revisor, o deuda registrada.',
  SCOPE: 'hay cambios fuera de los archivos de la tarea o archivos vaciados; revertilos.',
  FLAKY: 'el comando dio rojo y verde con el mismo árbol (o un archivo de test tocado falló en alguna repetición): un test inestable o una carga; corregilo, no se integra.',
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
    else if (a === '--id') o.id = val();
    else if (a === '--no-tests-reason') o.reasonFile = val();
    else if (a === '--timeout-min') o.timeoutMin = Number(val());
    else if (a === '--seed') {
      const v = val();
      if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))) usage('--seed debe ser un entero >= 0');
      o.seed = Number(v);
    } else if (a === '--base') o.base = val();
    else usage(`argumento desconocido: ${a}`);
  }
  if (o.id !== undefined && !o.task) usage('--id va con --task');
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
    const tasks = st.run ? taskList(st.run) : [];
    if (!tasks.length) usage('no hay una tarea registrada en .pignolo/run.json');
    const ids = tasks.map((t) => t.id);
    if (o.id !== undefined) {
      task = taskById(st.run, o.id);
      if (!task) usage(`la tarea ${o.id} no está registrada (${ids.join(', ')})`);
    } else if (tasks.length > 1) {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: 'ambiguous-task', tasks: ids })}\n`);
      usage(`hay varias tareas registradas (${ids.join(', ')}). Alternativa: agregá --id <tarea>`);
    } else task = tasks[0];
    if (!o.cwd) cwd = task.worktree;
  }
  let noTestsReason;
  if (o.reasonFile) {
    try { noTestsReason = fs.readFileSync(o.reasonFile, 'utf8').trim(); } catch (e) { usage(`no se pudo leer ${o.reasonFile}: ${e.message}`); }
  }
  let base;
  if (o.base !== undefined) {
    try {
      base = execFileSync('git', ['rev-parse', '--verify', `${o.base}^{commit}`], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (_) { usage(`--base no es una referencia válida: ${o.base}`); }
  }
  const seal = runGate({
    cwd, level: o.level, env: process.env, task, noTestsReason, seed: o.seed, base,
    timeoutMs: o.timeoutMin ? o.timeoutMin * 60000 : DEFAULT_TIMEOUT_MS,
  });
  process.stdout.write(`${JSON.stringify(seal, null, 2)}\n`);
  if (seal.status !== 'PASS') {
    if (seal.logTail) process.stderr.write(`${seal.logTail}\n`);
    const w = seal.status === 'INTEGRITY' && seal.checks.weakened[0];
    const alt = w
      ? `un test quedó debilitado (${w.kind} en ${w.path}:${w.line}). Alternativa: revertí ese cambio; si hace falta, pedí \`test-authorization\` al humano.`
      : `Alternativa: ${ALTERNATIVES[seal.status] || ''}`;
    process.stderr.write(`pignolo gate: ${seal.status}${seal.checks.scope.length ? ` (${seal.checks.scope.join(', ')})` : ''}. ${alt}\n`);
  }
  process.exitCode = seal.status === 'PASS' || (seal.status === 'NO_TESTS' && seal.noTestsReason) ? 0 : 1;
}

try {
  main();
} catch (e) {
  process.stderr.write(`pignolo gate: ${e.message}\n`);
  process.exitCode = 2;
}
