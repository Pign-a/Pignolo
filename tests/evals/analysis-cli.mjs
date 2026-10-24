#!/usr/bin/env node
// Command line of tests/evals/analysis.mjs. Reads the CSV of runs (and optionally the grades), prints the analysis. Spends nothing.
//   node tests/evals/analysis-cli.mjs --csv <path> --contrasts "P:N,P:S" --margin 1.5 --seed 1 [--grades <path>] [--json]
// A contrast is TEST:CONTROL and the ratio is test / control.
import fs from 'node:fs';
import { analyze, formatText, parseContrasts, readRuns } from './analysis.mjs';

const HELP = `uso: node tests/evals/analysis-cli.mjs --csv <ruta> --contrasts "P:N,P:S" [--margin 1.5] [--equiv 1.25] [--seed 1]
       [--resamples 10000] [--grades <ruta>] [--experiment <nombre>] [--no-activation-arms N] [--success-rule majority|all|any] [--json]
Un contraste es PRUEBA:CONTROL; las razones son prueba / control.`;

const VALUE_FLAGS = new Set(['csv', 'contrasts', 'margin', 'equiv', 'seed', 'resamples', 'grades', 'experiment', 'no-activation-arms', 'success-rule', 'method']);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento inesperado "${a}"\n${HELP}`);
    const key = a.slice(2);
    if (key === 'json' || key === 'help') out[key] = true;
    else if (VALUE_FLAGS.has(key)) {
      if (i + 1 >= argv.length) throw new Error(`--${key} necesita un valor`);
      out[key] = argv[(i += 1)];
    } else throw new Error(`opción desconocida --${key}\n${HELP}`);
  }
  return out;
}

const num = (v, name, fallback) => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} necesita un número positivo`);
  return n;
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (!args.csv) throw new Error(`falta --csv\n${HELP}`);
  if (!args.contrasts) throw new Error(`falta --contrasts\n${HELP}`);
  const contrasts = parseContrasts(args.contrasts);
  if (!fs.existsSync(args.csv)) throw new Error(`no existe el CSV ${args.csv}`);
  let { rows, invalid, experiments } = readRuns(fs.readFileSync(args.csv, 'utf8'));
  if (args.experiment) {
    const keep = (r) => r.experiment === args.experiment;
    // Invalid rows of other experiments are not part of this analysis either.
    invalid = invalid.filter((e) => e.experiment === args.experiment);
    rows = rows.filter(keep);
    if (!rows.length) throw new Error(`el CSV no tiene corridas válidas del experimento "${args.experiment}" (hay: ${experiments.join(', ') || 'ninguno'})`);
  } else if (experiments.length > 1) {
    throw new Error(`el CSV mezcla ${experiments.length} experimentos (${experiments.join(', ')}); elegí uno con --experiment`);
  }
  let grades = null;
  if (args.grades) {
    if (!fs.existsSync(args.grades)) throw new Error(`no existe el archivo de notas ${args.grades}`);
    grades = JSON.parse(fs.readFileSync(args.grades, 'utf8'));
    if (!Array.isArray(grades)) throw new Error('el archivo de notas debe ser una lista de {task, arm, rep, correctness, quality, serious_findings}');
  }
  const result = analyze(rows, {
    contrasts,
    margin: num(args.margin, 'margin', 1.5),
    equivMargin: num(args.equiv, 'equiv', 1.25),
    seed: Number(args.seed ?? 1),
    resamples: num(args.resamples, 'resamples', 10000),
    method: args.method || 'auto',
    successRule: args['success-rule'] || 'majority',
    noActivationArms: args['no-activation-arms'] ? args['no-activation-arms'].split(',').map((s) => s.trim()).filter(Boolean) : ['N'],
    grades,
    invalid,
  });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatText(result));
}

try {
  main();
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
