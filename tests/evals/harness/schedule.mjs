// Random run order. A schedule is a list of runs in blocks: one block per task, the arms shuffled inside each block, and the tasks
// themselves shuffled, all from one seed (the same seed and arguments always give the same order). `run` does not enforce it; the
// batch driver follows it. Written to <workRoot>/schedule-<seed>.json.
import fs from 'node:fs';
import path from 'node:path';
import { check, assertArmAllowed } from './config.mjs';
import { shuffle } from './blind.mjs';

// FNV-1a over a text: one independent numeric seed per shuffle, so changing one task never reorders the others.
function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export const schedulePath = (cfg, seed) => path.join(cfg.workRoot, `schedule-${seed}.json`);

export function buildSchedule(cfg, { tasks, arms, seed, reps = 1 }) {
  const taskList = [...new Set(tasks || [])];
  const armList = [...new Set(arms || [])];
  if (!taskList.length) throw new Error('--tasks necesita una lista de tareas, por ejemplo a,b,c');
  if (!armList.length) throw new Error('--arms necesita una lista de brazos, por ejemplo N,S,P');
  const n = Number(reps);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--reps debe ser un entero mayor que 0 (se recibió ${reps})`);
  if (seed === undefined || seed === null || seed === '' || !Number.isFinite(Number(seed))) throw new Error('--seed necesita un número');
  for (const t of taskList) for (const a of armList) check(cfg, { task: t, arm: a, rep: 1 });
  const entries = [];
  const skipped = [];
  let block = 0;
  for (let rep = 1; rep <= n; rep += 1) {
    for (const task of shuffle(taskList, seedOf(`${seed}|tasks|${rep}`))) {
      block += 1;
      for (const arm of shuffle(armList, seedOf(`${seed}|arms|${rep}|${task}`))) {
        // A task limited to some arms (a fixture) only gets those.
        try { assertArmAllowed(cfg, task, arm); } catch { skipped.push(`${task}/${arm}`); continue; }
        entries.push({ index: entries.length + 1, block, task, arm, rep });
      }
    }
  }
  if (!entries.length) throw new Error('ninguna combinación de tarea y brazo es válida');
  return { seed: Number(seed), reps: n, tasks: taskList, arms: armList, skipped, entries };
}

export function writeSchedule(cfg, schedule, { force = false } = {}) {
  const file = schedulePath(cfg, schedule.seed);
  const text = `${JSON.stringify(schedule, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== text && !force) {
    throw new Error(`${file} ya existe con otro contenido (otras tareas, brazos o repeticiones con la misma semilla); usá otra --seed o --force`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

export const describeSchedule = (schedule) => schedule.entries.map((e) => `${String(e.index).padStart(3)}. bloque ${e.block}  ${e.task}  ${e.arm}  rep ${e.rep}`);

export function loadSchedule(cfg, file) {
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { throw new Error(`no se pudo leer el calendario ${file}: ${e.message}`); }
  if (!s || !Array.isArray(s.entries) || !s.entries.length) throw new Error(`${file} no tiene entradas (entries)`);
  const seen = new Set();
  for (const e of s.entries) {
    check(cfg, { task: e.task, arm: e.arm, rep: e.rep });
    assertArmAllowed(cfg, e.task, e.arm);
    const k = `${e.task}/${e.arm}/${e.rep}`;
    if (seen.has(k)) throw new Error(`el calendario repite ${k}`);
    seen.add(k);
  }
  return s;
}

