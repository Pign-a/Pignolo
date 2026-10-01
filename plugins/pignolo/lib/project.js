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

// Run v1 (§6): { v: 1, flow, started, expires, plan? (slug del plan, flujo plan), task?: { id, worktree (absoluta), base,
// testRef?, files[], agents[], testAuthorization? } }. Devuelve los errores (vacío = válido).
function validateRun(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['run.json no es un objeto'];
  const errs = [];
  if (obj.v !== 1) errs.push('v debe ser 1');
  if (!FLOWS.includes(obj.flow)) errs.push(`flow debe ser uno de ${FLOWS.join(', ')}`);
  if (!isIso(obj.started)) errs.push('started debe ser una fecha ISO');
  if (!isIso(obj.expires)) errs.push('expires debe ser una fecha ISO');
  if (obj.plan !== undefined && !(typeof obj.plan === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(obj.plan))) errs.push('plan debe ser un slug (minúsculas, dígitos y guiones)');
  if (obj.task !== undefined) {
    const t = obj.task;
    if (!t || typeof t !== 'object' || Array.isArray(t)) errs.push('task debe ser un objeto');
    else {
      if (!isStr(t.id)) errs.push('task.id debe ser un texto');
      if (!isStr(t.worktree) || !path.isAbsolute(t.worktree)) errs.push('task.worktree debe ser una ruta absoluta');
      if (!isStr(t.base)) errs.push('task.base debe ser un sha');
      if (t.testRef !== undefined && !isStr(t.testRef)) errs.push('task.testRef debe ser un sha');
      if (!isStrList(t.files)) errs.push('task.files debe ser una lista de textos');
      if (!isStrList(t.agents)) errs.push('task.agents debe ser una lista de textos');
      if (t.testAuthorization !== undefined && typeof t.testAuthorization !== 'boolean') errs.push('task.testAuthorization debe ser booleano');
    }
  }
  return errs;
}

// Flujo de pignolo en curso (decisión del autor, 2026-09-29): la allowlist de agentes rige
// solo mientras exista <main>/.pignolo/run.json con `expires` (ISO) en el futuro. Lo
// escriben las skills de los flujos. Uno ilegible o que no valida cuenta como en curso
// (`malformed`): falla cerrado dentro de un flujo. Uno vencido no cuenta (`expired`),
// pero conserva `run` para que el handback-gate use run.task.
function readRun(main, now = Date.now()) {
  const file = path.join(main, '.pignolo', 'run.json');
  if (!fs.existsSync(file)) return { running: false, expired: false, file };
  let run;
  try { run = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { running: true, expired: false, malformed: true, file }; }
  if (validateRun(run).length) return { running: true, expired: false, malformed: true, file };
  const expired = Date.parse(run.expires) <= now;
  return { running: !expired, expired, file, run };
}

module.exports = { projectState, readRun, runState: readRun, validateRun, mainRoot };
