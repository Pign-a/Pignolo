#!/usr/bin/env node
// Selección reproducible de las tareas de validación de la comparación de tres brazos.
// Ficha: tests/evals/RESULTS-comparacion-3-brazos.md (sección 4.2). Node >= 22, sin dependencias.
//
//   node tests/evals/select-validation.mjs --input tareas.json --output seleccion.json \
//        [--small 5] [--medium 7] [--seed 20261024]
//
// Entrada: una lista de tareas, o un objeto { "<id>": { stratum } }, o { tasks: [...] }. Cada tarea
// necesita `id` (en el objeto por id puede ser la clave) y `stratum` = "small" | "medium". Cualquier otro
// campo se ignora y no entra en la salida ni en el hash.
//
// Regla (queda escrita en `rule` de la salida):
//   1. Se ordenan las tareas de cada estrato por id (el orden de la entrada no influye).
//   2. Se baraja cada estrato con Fisher-Yates y una PRNG mulberry32 propia del estrato
//      (semilla = seed para "small", seed + 1 para "medium"), recorriendo i de n-1 a 1 y
//      tomando j = floor(random() * (i + 1)).
//   3. Se eligen las primeras k tareas del estrato barajado; el resto es la reserva, en el
//      orden del barajado, para reemplazos en ese orden.
// `selected` sale ordenado por id; `reserve` en el orden del barajado (small primero, luego medium).
// `inputHash` es el SHA-256 de la lista [{id, stratum}] ordenada por id.
// Si un estrato tiene menos tareas que las pedidas, se niega (código de salida 1).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const STRATA = ['small', 'medium'];

export const RULE =
  'Por estrato: tareas ordenadas por id; Fisher-Yates (i de n-1 a 1, j = floor(random()*(i+1))) con mulberry32 ' +
  '(semilla = seed para small, seed+1 para medium); se eligen las primeras k del estrato barajado; ' +
  'el resto es la reserva en el orden del barajado.';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function byId(x, y) {
  return x < y ? -1 : x > y ? 1 : 0;
}

export function normalizeTasks(input) {
  let list;
  if (Array.isArray(input)) list = input;
  else if (input && Array.isArray(input.tasks)) list = input.tasks;
  else if (input && typeof input === 'object') list = Object.entries(input).map(([id, v]) => ({ id, ...v }));
  else throw new Error('la entrada tiene que ser una lista o un objeto de tareas');
  const seen = new Set();
  const out = list.map((t) => {
    if (!t || typeof t.id !== 'string' || !t.id) throw new Error('hay una tarea sin id');
    if (!STRATA.includes(t.stratum)) throw new Error(`la tarea ${t.id} tiene un estrato inválido (small o medium)`);
    if (seen.has(t.id)) throw new Error(`id repetido: ${t.id}`);
    seen.add(t.id);
    return { id: t.id, stratum: t.stratum };
  });
  return out.sort((x, y) => byId(x.id, y.id));
}

export function inputHash(tasks) {
  return createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
}

export function selectValidation(input, { small = 5, medium = 7, seed = 20261024 } = {}) {
  const tasks = normalizeTasks(input);
  const wanted = { small, medium };
  for (const s of STRATA) {
    if (!Number.isInteger(wanted[s]) || wanted[s] < 0) throw new Error(`cantidad inválida para ${s}: ${wanted[s]}`);
  }
  if (!Number.isInteger(seed)) throw new Error('la semilla tiene que ser un entero');
  const selected = [];
  const reserve = [];
  const strata = {};
  STRATA.forEach((s, idx) => {
    const ids = tasks.filter((t) => t.stratum === s).map((t) => t.id);
    if (ids.length < wanted[s]) {
      throw new Error(`el estrato ${s} tiene ${ids.length} tareas y se piden ${wanted[s]}`);
    }
    const shuffled = shuffle(ids, mulberry32(seed + idx));
    const chosen = shuffled.slice(0, wanted[s]);
    const rest = shuffled.slice(wanted[s]);
    selected.push(...chosen);
    reserve.push(...rest);
    strata[s] = { candidates: ids.length, selected: chosen.length, reserve: rest.length };
  });
  selected.sort(byId);
  return { seed, rule: RULE, selected, reserve, strata, inputHash: inputHash(tasks) };
}

export function summaryMarkdown(result) {
  const rows = STRATA.map((s) => {
    const x = result.strata[s];
    return `| ${s} | ${x.candidates} | ${x.selected} | ${x.reserve} |`;
  });
  return [
    '# Selección de tareas de validación',
    '',
    `Semilla: ${result.seed}. Hash de la entrada: ${result.inputHash}.`,
    '',
    '| Estrato | Candidatas | Elegidas | Reserva |',
    '|---|---|---|---|',
    ...rows,
    '',
    `Elegidas (${result.selected.length}): ${result.selected.join(', ')}`,
    `Reserva en orden de reemplazo (${result.reserve.length}): ${result.reserve.join(', ')}`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    const val = argv[++i];
    if (val === undefined) throw new Error(`falta el valor de ${a}`);
    o[key] = val;
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.input || !o.output) throw new Error('uso: --input <json> --output <json> [--small 5] [--medium 7] [--seed 20261024]');
  const opts = {};
  if (o.small !== undefined) opts.small = Number(o.small);
  if (o.medium !== undefined) opts.medium = Number(o.medium);
  if (o.seed !== undefined) opts.seed = Number(o.seed);
  const input = JSON.parse(readFileSync(o.input, 'utf8'));
  const result = selectValidation(input, opts);
  writeFileSync(o.output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(summaryMarkdown(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }
}
