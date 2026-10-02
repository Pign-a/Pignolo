'use strict';
// Estado del proyecto para los hooks que dependen de pignolo configurado.
const fs = require('node:fs');
const path = require('node:path');
const { readState, projectRoot, mainRoot } = require('./disabled');

// root: la misma raíz que usa el interruptor (projectRoot: sube sin git hasta
// .pignolo/project.md o .git; si no hay ninguno, el cwd).
// main: raíz del checkout principal (desde un worktree enlazado, la del principal; sin
// git). project.md, /pignolo:off y run.json se leen ahí, así todos miran lo mismo.
// active: hay project.md en main y /pignolo:off (o PIGNOLO_DISABLED=1) no está puesto.
function projectState({ cwd = process.cwd(), env = process.env } = {}) {
  const root = projectRoot(cwd);
  const main = mainRoot(cwd);
  const configured = fs.existsSync(path.join(main, '.pignolo', 'project.md'));
  return { root, main, active: configured && !readState({ env, cwd: main }).hooksOff };
}

const FLOWS = ['trivial', 'daily', 'review', 'plan'];
const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isStr = (v) => typeof v === 'string' && v !== '';
const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

// Run (§6, hito 7a): v1 = { v: 1, flow, started, expires, plan?, task? } (a lo sumo una tarea; se sigue leyendo);
// v2 = { v: 2, flow, started, expires, plan?, tasks: { <id>: task } } (una o varias; lo único que escribe run.js).
// task = { id, worktree (absoluta), base, testRef?, files[], agents[], testAuthorization?, branch? }.
// `v: 2` con `task`, o `v: 1` con `tasks`, es un error. Devuelve los errores (vacío = válido).
function validateTask(t, label, errs) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) { errs.push(`${label} debe ser un objeto`); return; }
  if (!isStr(t.id)) errs.push(`${label}.id debe ser un texto`);
  if (!isStr(t.worktree) || !path.isAbsolute(t.worktree)) errs.push(`${label}.worktree debe ser una ruta absoluta`);
  if (!isStr(t.base)) errs.push(`${label}.base debe ser un sha`);
  if (t.testRef !== undefined && !isStr(t.testRef)) errs.push(`${label}.testRef debe ser un sha`);
  if (!isStrList(t.files)) errs.push(`${label}.files debe ser una lista de textos`);
  if (!isStrList(t.agents)) errs.push(`${label}.agents debe ser una lista de textos`);
  if (t.testAuthorization !== undefined && typeof t.testAuthorization !== 'boolean') errs.push(`${label}.testAuthorization debe ser booleano`);
  if (t.branch !== undefined && !isStr(t.branch)) errs.push(`${label}.branch debe ser un texto`);
}

function validateRun(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['run.json no es un objeto'];
  const errs = [];
  if (obj.v !== 1 && obj.v !== 2) errs.push('v debe ser 1 o 2');
  if (!FLOWS.includes(obj.flow)) errs.push(`flow debe ser uno de ${FLOWS.join(', ')}`);
  if (!isIso(obj.started)) errs.push('started debe ser una fecha ISO');
  if (!isIso(obj.expires)) errs.push('expires debe ser una fecha ISO');
  if (obj.plan !== undefined && !(typeof obj.plan === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(obj.plan))) errs.push('plan debe ser un slug (minúsculas, dígitos y guiones)');
  if (obj.v === 1 && obj.tasks !== undefined) errs.push('v 1 no admite tasks (es de v 2)');
  if (obj.v === 2 && obj.task !== undefined) errs.push('v 2 no admite task (usa tasks)');
  if (obj.v !== 2 && obj.task !== undefined) validateTask(obj.task, 'task', errs);
  if (obj.v === 2) {
    const ts = obj.tasks;
    if (!ts || typeof ts !== 'object' || Array.isArray(ts)) errs.push('tasks debe ser un objeto { <id>: tarea }');
    else {
      for (const [id, t] of Object.entries(ts)) {
        validateTask(t, `tasks.${id}`, errs);
        if (t && typeof t === 'object' && t.id !== id) errs.push(`tasks.${id}.id debe ser ${id}`);
      }
    }
  }
  return errs;
}

// Normaliza a { ...run, tasks } en ambos esquemas. `run.task` queda como alias de solo lectura
// (no enumerable: no se escribe nunca) cuando hay exactamente una tarea (R-2).
function normalizeRun(run) {
  const tasks = run.v === 2 ? { ...run.tasks } : (run.task ? { [run.task.id]: run.task } : {});
  const { task, ...rest } = run;
  const out = { ...rest, tasks };
  const ids = Object.keys(tasks);
  if (ids.length === 1) Object.defineProperty(out, 'task', { value: tasks[ids[0]], enumerable: false });
  return out;
}

const taskList = (run) => Object.values((run && run.tasks) || {});
const taskById = (run, id) => (run && run.tasks && Object.prototype.hasOwnProperty.call(run.tasks, id) ? run.tasks[id] : undefined);

// Flujo de pignolo en curso (decisión del autor, 2026-09-29): la allowlist de agentes rige
// solo mientras exista <main>/.pignolo/run.json con `expires` (ISO) en el futuro. Lo
// escriben las skills de los flujos. Uno ilegible o que no valida cuenta como en curso
// (`malformed`): falla cerrado dentro de un flujo. Uno vencido no cuenta (`expired`),
// pero conserva `run` para que el handback-gate use run.tasks.
function readRun(main, now = Date.now()) {
  const file = path.join(main, '.pignolo', 'run.json');
  if (!fs.existsSync(file)) return { running: false, expired: false, file };
  let run;
  try { run = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { running: true, expired: false, malformed: true, file }; }
  if (validateRun(run).length) return { running: true, expired: false, malformed: true, file };
  const expired = Date.parse(run.expires) <= now;
  return { running: !expired, expired, file, run: normalizeRun(run) };
}

module.exports = { projectState, readRun, runState: readRun, validateRun, taskList, taskById, mainRoot };
