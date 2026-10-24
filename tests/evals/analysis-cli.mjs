#!/usr/bin/env node
// Command line of tests/evals/analysis.mjs. Reads the CSV of runs (and optionally the grades), prints the analysis. Spends nothing.
//   node tests/evals/analysis-cli.mjs --csv <path> --contrasts "P:N,P:S,S:N" --primary "P:N,P:S" --margin 1.5 --seed 1
//     [--experiment a,b] [--tasks-set validation --task-set-file <path>] [--grades <path>] [--json]
//   node tests/evals/analysis-cli.mjs --study review --csv <path> --experiment <name> --contrasts "P:N,P:C,P:S,C:N,S:N" --primary "P:N,P:C,P:S"
//     --seed 20261030 --item-set-file <path> [--json]      (study B: review of diffs with seeded defects)
// A contrast is TEST:CONTROL and the ratio is test / control. Exit code 0 when the analysis ran, 2 on an input error.
import fs from 'node:fs';
import { analyze, analyzeReview, formatReviewText, formatText, parseContrasts, readRuns, restrictToTasks } from './analysis.mjs';

const HELP = `uso: node tests/evals/analysis-cli.mjs --csv <ruta> --contrasts "P:N,P:S,S:N" --primary "P:N,P:S" [--margin 1.5] [--equiv 1.25]
       [--seed 1] [--resamples 10000] [--grades <ruta>] [--experiment <a[,b]>] [--tasks-set validation|dev --task-set-file <ruta>]
       [--no-activation-arms N] [--success-rule majority|all|any] [--method auto|percentile|bca] [--json] [--help]
       node tests/evals/analysis-cli.mjs --study review --csv <ruta> --experiment <nombre> --contrasts "P:N,P:C,P:S,C:N,S:N" --primary "P:N,P:C,P:S"
       --seed 20261030 --item-set-file <ruta> [--json]

Un contraste es PRUEBA:CONTROL; las razones son prueba / control. La unidad de análisis es la tarea.

  --csv <ruta>            CSV de corridas del arnés (una fila por corrida).
  --contrasts <lista>     contrastes a calcular, por ejemplo "P:N,P:S,S:N".
  --primary <lista>       contrastes primarios preinscritos, por ejemplo "P:N,P:S". Holm ajusta solo esos; los demás se
                          imprimen como exploratorios y sin ajuste. Sin esta opción, Holm abarca todos los contrastes pedidos.
  --experiment <a[,b]>    experimento (o lista separada por comas, para juntarlos de forma explícita). Es obligatorio si el CSV
                          mezcla experimentos.
  --tasks-set <nombre>    conjunto de tareas a analizar, validation o dev; con --task-set-file <ruta>, un JSON como
                          { "validation": ["id", ...], "dev": ["id", ...] }. Así el análisis formal no mezcla tareas de desarrollo.
  --grades <ruta>         notas del panel de jueces (lista de {task, arm, rep, correctness, quality, serious_findings}).
  --margin / --equiv      margen de no inferioridad (1.5) y de equivalencia descriptiva (1.25).
  --no-activation-arms    brazos sin concepto de activación (por defecto N): entran siempre en el análisis por protocolo.
                          Un brazo cuyas corridas no tienen ningún dato de activación (vacío o n/a) no se filtra, y se dice.
  --study review          estudio B (revisión con defectos sembrados) en vez del estudio A. La tarea es el ítem (rev-NN). Recall por
                          ítem = defectos encontrados / sembrados; prueba primaria: permutación de signos (exacta con 15 ítems o menos) sobre
                          la diferencia media de recall por ítem, bilateral, con Holm solo sobre los primarios; Wilcoxon y prueba del signo como
                          sensibilidad; recall agregado con Wilson, tabla por categoría y falsos positivos, descriptivos. Veredicto de la ficha 8.2,
                          con la calificación "más hallazgos sin confirmar" si el brazo de prueba tiene más del doble de hallazgos sin coincidencia
                          por ítem. Con menos de 8 ítems con defectos es exploratorio.
  --item-set-file <ruta>  JSON { "validation": ["rev-01", ...] } con los ítems del estudio B (la clave se cambia con --tasks-set).
  --seed / --resamples    semilla y remuestreos del bootstrap y de la permutación de signos.
  --json                  salida en JSON en vez de texto.

No inferioridad: se declara solo si las dos cotas superiores unilaterales del 95 % (bootstrap percentil o BCa, y cota t
sobre los logaritmos) quedan bajo el margen; el veredicto dice cuál limita.
Corridas censuradas (terminación budget_cap o model_timeout, o censored=true): son válidas, su costo entra tal como se informó
(es una cota inferior) y cuentan como no verdes. Cada contraste imprime cuántas hay por brazo y una sensibilidad descriptiva con su
costo duplicado. Las corridas inválidas (fallos de infraestructura) se excluyen y se listan con su terminación.`;

const VALUE_FLAGS = new Set(['csv', 'contrasts', 'primary', 'margin', 'equiv', 'seed', 'resamples', 'grades', 'experiment', 'tasks-set', 'task-set',
  'task-set-file', 'item-set-file', 'study', 'no-activation-arms', 'success-rule', 'method']);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento inesperado "${a}"\n${HELP}`);
    const key = a.slice(2);
    if (key === 'json' || key === 'help') out[key] = true;
    else if (VALUE_FLAGS.has(key)) {
      if (i + 1 >= argv.length) throw new Error(`--${key} necesita un valor`);
      out[key === 'task-set' ? 'tasks-set' : key] = argv[(i += 1)];
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

const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

// The task ids of one named set in a JSON file { "validation": [...], "dev": [...] }.
function readTaskSet(name, file) {
  if (!['validation', 'dev'].includes(name)) throw new Error(`--tasks-set debe ser validation o dev (se pidió "${name}")`);
  if (!fs.existsSync(file)) throw new Error(`no existe el archivo del conjunto de tareas ${file}`);
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`el archivo del conjunto de tareas no es JSON válido: ${e.message}`); }
  const ids = data && typeof data === 'object' ? data[name] : undefined;
  if (!Array.isArray(ids) || !ids.length || ids.some((x) => typeof x !== 'string' || !x)) {
    throw new Error(`el archivo del conjunto de tareas debe tener "${name}": una lista no vacía de ids de tarea`);
  }
  return ids;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (!args.csv) throw new Error(`falta --csv\n${HELP}`);
  if (!args.contrasts) throw new Error(`falta --contrasts\n${HELP}`);
  const study = args.study || 'workflow';
  if (!['workflow', 'review'].includes(study)) throw new Error(`--study debe ser review o workflow (se pidió "${study}")`);
  if (study === 'review') args['task-set-file'] = args['item-set-file'] || args['task-set-file'];
  if (study === 'review' && args['task-set-file'] && !args['tasks-set']) args['tasks-set'] = 'validation';
  if (Boolean(args['tasks-set']) !== Boolean(args['task-set-file'])) throw new Error('--tasks-set y --task-set-file van juntos');
  const contrasts = parseContrasts(args.contrasts);
  const primary = args.primary ? parseContrasts(args.primary) : null;
  if (!fs.existsSync(args.csv)) throw new Error(`no existe el CSV ${args.csv}`);
  let { rows, invalid, experiments } = readRuns(fs.readFileSync(args.csv, 'utf8'));
  if (args.experiment) {
    const wanted = list(args.experiment);
    for (const e of wanted) {
      if (!experiments.includes(e)) throw new Error(`el CSV no tiene corridas del experimento "${e}" (hay: ${experiments.join(', ') || 'ninguno'})`);
    }
    const keep = (r) => wanted.includes(r.experiment);
    // Invalid rows of other experiments are not part of this analysis either.
    invalid = invalid.filter((e) => wanted.includes(e.experiment));
    rows = rows.filter(keep);
    if (!rows.length) throw new Error(`el CSV no tiene corridas válidas del experimento "${args.experiment}" (hay: ${experiments.join(', ') || 'ninguno'})`);
  } else if (experiments.length > 1) {
    throw new Error(`el CSV mezcla ${experiments.length} experimentos (${experiments.join(', ')}); elegí uno con --experiment (o varios separados por comas)`);
  }
  let taskSet = null;
  if (args['tasks-set']) {
    const ids = readTaskSet(args['tasks-set'], args['task-set-file']);
    const kept = restrictToTasks({ rows, invalid }, ids);
    if (!kept.rows.length) throw new Error(`ninguna corrida válida es de una tarea del conjunto "${args['tasks-set']}"`);
    ({ rows, invalid } = kept);
    taskSet = { name: args['tasks-set'], listed: kept.listed, droppedRuns: kept.droppedRuns, missingTasks: kept.missingTasks };
  }
  if (study === 'review') {
    const review = analyzeReview(rows, { contrasts, primary, seed: Number(args.seed ?? 1), resamples: num(args.resamples, 'resamples', 10000), invalid, taskSet });
    console.log(args.json ? JSON.stringify(review, null, 2) : formatReviewText(review));
    return;
  }
  let grades = null;
  if (args.grades) {
    if (!fs.existsSync(args.grades)) throw new Error(`no existe el archivo de notas ${args.grades}`);
    grades = JSON.parse(fs.readFileSync(args.grades, 'utf8'));
    if (!Array.isArray(grades)) throw new Error('el archivo de notas debe ser una lista de {task, arm, rep, correctness, quality, serious_findings}');
  }
  const result = analyze(rows, {
    contrasts,
    primary,
    margin: num(args.margin, 'margin', 1.5),
    equivMargin: num(args.equiv, 'equiv', 1.25),
    seed: Number(args.seed ?? 1),
    resamples: num(args.resamples, 'resamples', 10000),
    method: args.method || 'auto',
    successRule: args['success-rule'] || 'majority',
    noActivationArms: args['no-activation-arms'] ? list(args['no-activation-arms']) : ['N'],
    grades,
    invalid,
    taskSet,
  });
  console.log(args.json ? JSON.stringify(result, null, 2) : formatText(result));
}

try {
  main();
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
