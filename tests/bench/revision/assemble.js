'use strict';
// Final script (cards, section 8 step 6 and section 9): reads the graded findings, builds the
// arms by union of lenses (lentes) or by moment of review (momento), and computes the metrics of
// the card per repetition, then median and range. Prints tables and writes a CSV.
//
//   node tests/bench/revision/assemble.js --experiment lentes --findings <findings-full.json> --runs <runs-table.json>
//        --grades <grades1.json> [--grades2 <grades2.json>] --out <dir> [--stage A|B]
//   node tests/bench/revision/assemble.js --experiment momento ... --lentes-findings <f.json> --lentes-runs <r.json> --lentes-grades <g.json>
//
// Grades file: { "<code>": "<defect id>" | "<minor id>" | "ninguno" } (or { "<code>": { "match": ... } }).
const fs = require('node:fs');
const path = require('node:path');
const { loadCases, median, range, toCsv, parseArgs } = require('./lib');

const BLOCKING = new Set(['BLOCKER', 'CRITICAL']);
const isBlocking = (sev) => BLOCKING.has(String(sev).toUpperCase());

// ---- grades ---------------------------------------------------------------------------------
function normGrades(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = typeof v === 'string' ? v : (v && v.match) || 'ninguno';
  return out;
}

function cohenKappa(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const p1 = pairs.filter(([a]) => a).length / n;
  const p2 = pairs.filter(([, b]) => b).length / n;
  const pe = p1 * p2 + (1 - p1) * (1 - p2);
  if (pe === 1) return agree === 1 ? 1 : 0;
  return (agree - pe) / (1 - pe);
}

// Resolves the final match of each code. Grader 1 grades everything, grader 2 a sample (or all
// when the agreement is under 85%). Where both graded and differ, the finding counts as NOT
// matched ("ninguno") when the agreement is under 85% (card, section 8 step 5); otherwise grader 1
// stands. `agreement` is over "matches an important defect: yes/no".
function resolveGrades(g1, g2, defectIds) {
  const important = (m) => defectIds.has(m);
  const both = Object.keys(g2).filter((c) => c in g1);
  const pairs = both.map((c) => [important(g1[c]), important(g2[c])]);
  const agreeN = pairs.filter(([a, b]) => a === b).length;
  const pct = both.length ? (100 * agreeN) / both.length : null;
  const conservative = pct !== null && pct < 85;
  const final = {};
  const disagreements = [];
  for (const [c, m] of Object.entries(g1)) {
    if (c in g2 && g2[c] !== m) {
      disagreements.push(c);
      final[c] = conservative ? 'ninguno' : m;
    } else final[c] = m;
  }
  return { final, agreement: { graded: both.length, pct, kappa: cohenKappa(pairs), conservative, disagreements: disagreements.length } };
}

// ---- helpers ---------------------------------------------------------------------------------
const uniq = (xs) => [...new Set(xs)];
function repsOf(findingsOrRuns) {
  return uniq(findingsOrRuns.map((x) => x.rep)).sort((a, b) => a - b);
}

// Defects detected (matched to an important defect of `universe`, BLOCKER or CRITICAL) or seen
// (any severity) among `fs`.
function detection(fs_, matches, universe) {
  const det = new Set();
  const seen = new Set();
  for (const f of fs_) {
    const m = matches[f.code];
    if (!m || !universe.has(m)) continue;
    seen.add(m);
    if (isBlocking(f.severity)) det.add(m);
  }
  return { det, seen };
}

// Findings without backing: BLOCKER/CRITICAL that match neither an important nor a known minor.
function unbacked(fs_, matches, defectIds, minorIds, cleanCases) {
  return fs_.filter((f) => {
    if (!isBlocking(f.severity)) return false;
    if (cleanCases && cleanCases.has(f.caseId)) return true;
    const m = matches[f.code] || 'ninguno';
    return !defectIds.has(m) && !minorIds.has(m);
  }).length;
}

const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const fmt = (v) => (v === null || v === undefined ? '-' : Number.isInteger(v) ? String(v) : Number(v).toFixed(2));

function stat(values) {
  const r = range(values);
  return { median: median(values), min: r && r[0], max: r && r[1] };
}

// ---- lentes ----------------------------------------------------------------------------------
function lentesMetrics({ cases, findings, runs, matches, excludeCases = [], label = 'todos los casos' }) {
  const L = cases.lentes;
  const caseList = L.cases.filter((c) => !excludeCases.includes(c.id));
  const universe = new Set(caseList.flatMap((c) => c.defects));
  const cleanCases = new Set(caseList.filter((c) => c.kind === 'clean').map((c) => c.id));
  const defectIds = new Set(cases.defects.map((d) => d.id));
  const minorIds = new Set(cases.minors.map((m) => m.id));
  const inCases = (x) => caseList.some((c) => c.id === x.caseId);
  const F = findings.filter((f) => f.experiment === 'lentes' && inCases(f));
  const R = runs.filter((r) => r.experiment === 'lentes' && inCases(r));
  const reps = repsOf(R);
  const lensesRun = uniq(R.map((r) => r.lens));
  const armLenses = (arm) => L.arms[arm].filter((l) => lensesRun.includes(l));
  const detFor = (lenses, rep) => detection(F.filter((f) => f.rep === rep && lenses.includes(f.lens)), matches, universe);

  const rows = [];
  const arms = {};
  for (const arm of Object.keys(L.arms)) {
    const ls = armLenses(arm);
    arms[arm] = reps.map((r) => detFor(ls, r));
    rows.push({ metric: `detectados ${arm} (de ${universe.size})`, values: arms[arm].map((x) => x.det.size) });
    rows.push({ metric: `vistos ${arm}`, values: arms[arm].map((x) => x.seen.size) });
  }
  const loss = reps.map((_, i) => [...arms.A[i].det].filter((d) => !arms.B[i].det.has(d)).length);
  const lossSeen = reps.map((_, i) => [...arms.A[i].seen].filter((d) => !arms.B[i].seen.has(d)).length);
  rows.unshift({ metric: 'PERDIDA principal (A y no B)', values: loss });
  rows.splice(1, 0, { metric: 'perdida en vistos (A y no B)', values: lossSeen });

  // expected detection from per-lens rates: sum over defects of 1 - prod(1 - p)
  const rate = (lens, d) => {
    const hits = reps.filter((r) => detFor([lens], r).det.has(d)).length;
    return reps.length ? hits / reps.length : 0;
  };
  const expected = (lenses) => [...universe].reduce((acc, d) => acc + 1 - lenses.reduce((p, l) => p * (1 - rate(l, d)), 1), 0);
  const expectedA = expected(armLenses('A'));
  const expectedB = expected(armLenses('B'));

  // defects that an extra lens detects in >= 2 repetitions and reliability in none
  const stableUnique = [];
  const reliab = L.arms.B[0];
  for (const d of universe) {
    const relHits = reps.filter((r) => detFor([reliab], r).det.has(d)).length;
    if (relHits) continue;
    for (const lens of armLenses('A').filter((l) => l !== reliab)) {
      const hits = reps.filter((r) => detFor([lens], r).det.has(d)).length;
      if (hits >= 2) stableUnique.push({ defect: d, lens, hits });
    }
  }

  for (const arm of Object.keys(L.arms)) {
    rows.push({ metric: `alarmas sin respaldo ${arm}`, values: reps.map((r) => unbacked(F.filter((f) => f.rep === r && armLenses(arm).includes(f.lens)), matches, defectIds, minorIds, cleanCases)) });
  }
  // cost and time per arm per repetition: sum of the lens runs; time = max over lenses per case, summed
  for (const arm of Object.keys(L.arms)) {
    const ls = armLenses(arm);
    const rr = (r) => R.filter((x) => x.rep === r && ls.includes(x.lens));
    rows.push({ metric: `ponderado ${arm}`, values: reps.map((r) => sum(rr(r).map((x) => x.weighted))) });
    rows.push({ metric: `contexto final ${arm}`, values: reps.map((r) => sum(rr(r).map((x) => x.finalContext))) });
    rows.push({ metric: `usd ${arm}`, values: reps.map((r) => sum(rr(r).map((x) => x.usd))) });
    rows.push({ metric: `minutos ${arm} (max de lentes por caso)`, values: reps.map((r) => sum(caseList.map((c) => Math.max(0, ...rr(r).filter((x) => x.caseId === c.id).map((x) => Number(x.minutes) || 0))))) });
  }
  const perLens = lensesRun.map((l) => ({
    lens: l,
    runs: R.filter((x) => x.lens === l).length,
    detected: stat(reps.map((r) => detFor([l], r).det.size)),
    weighted: sum(R.filter((x) => x.lens === l).map((x) => x.weighted)),
    usd: sum(R.filter((x) => x.lens === l).map((x) => x.usd)),
    minutesPerRun: R.filter((x) => x.lens === l).length ? sum(R.filter((x) => x.lens === l).map((x) => x.minutes)) / R.filter((x) => x.lens === l).length : null,
  }));

  const lossStat = stat(loss);
  const medA = stat(arms.A.map((x) => x.det.size)).median;
  const decision = [];
  if (reps.length >= 3) {
    if (lossStat.median >= 3 && lossStat.min >= 2 && stableUnique.length >= 2) decision.push('Se mantiene el conjunto completo (mediana de la perdida >= 3, minimo >= 2, >= 2 unicos estables).');
    else if (lossStat.max <= 1 && stableUnique.length === 0) decision.push('Se reduce a reliability + testability (maximo de la perdida <= 1 y ningun unico estable).');
    else decision.push('Sin diferencia demostrada: conjunto reducido en balanced, completo solo en max (lo mas simple); la lente de las detecciones unicas queda como hipotesis E1.');
  } else {
    decision.push(lossStat.median !== null && lossStat.median >= 3
      ? `Etapa A (E2): perdida ${lossStat.median} de ${universe.size} >= 3: se mantiene el conjunto completo.`
      : 'Etapa A (E2): sin diferencia demostrada, sin repeticion; reducir queda como recomendacion debil a confirmar con la etapa B.');
  }
  if (medA !== null && medA < 5) decision.push('Aviso: A detecta menos de 5 en la mediana; las lentes leyendo no reemplazan a la revision final opus con experimentos.');
  return { label, reps, rows, perLens, expected: { A: expectedA, B: expectedB }, stableUnique, decision, universe: universe.size };
}

// ---- momento ---------------------------------------------------------------------------------
// Findings and runs of the reused lentes runs are re-labelled as the momento runs they stand for.
function mergeReused({ cases, findings, runs, lentes }) {
  if (!lentes) return { findings, runs, missing: [] };
  const outF = findings.slice();
  const outR = runs.slice();
  const missing = [];
  for (const b of cases.momento.blocks) {
    for (const run of b.runs.filter((x) => x.reusedFrom)) {
      for (let rep = 1; rep <= cases.momento.reps; rep += 1) {
        const lid = `${run.reusedFrom.case}|${run.reusedFrom.lens}|${rep}`;
        const lr = lentes.runs.find((x) => x.run === lid);
        if (!lr) { missing.push(lid); continue; }
        const tag = { experiment: 'momento', batch: b.batch, arm: b.arm, block: b.id, subrun: run.id, caseId: undefined, lens: cases.momento.lens, rep };
        outR.push({ ...lr, ...tag, reusedFrom: lid });
        for (const f of lentes.findings.filter((x) => x.run === lid)) outF.push({ ...f, ...tag, code: `L:${f.code}` });
      }
    }
  }
  return { findings: outF, runs: outR, missing };
}

function momentoMetrics({ cases, findings, runs, matches }) {
  const M = cases.momento;
  const defectIds = new Set(cases.defects.map((d) => d.id));
  const minorIds = new Set(cases.minors.map((m) => m.id));
  const F = findings.filter((f) => f.experiment === 'momento');
  const R = runs.filter((r) => r.experiment === 'momento');
  const reps = repsOf(R);
  const out = [];
  for (const cmp of M.comparisons) {
    const universe = new Set(M.scope[cmp.batch]);
    const dists = new Set(cases.defects.filter((d) => d.distributed).map((d) => d.id));
    const arms = {};
    const rows = [];
    for (const arm of cmp.arms) {
      const blocks = M.blocks.filter((b) => b.arm === arm && b.batch === cmp.batch).map((b) => b.id);
      const fsArm = (r) => F.filter((f) => f.rep === r && blocks.includes(f.block));
      const rsArm = (r) => R.filter((x) => x.rep === r && blocks.includes(x.block));
      arms[arm] = reps.map((r) => detection(fsArm(r), matches, universe));
      rows.push({ metric: `detectados ${arm} (de ${universe.size})`, values: arms[arm].map((x) => x.det.size) });
      rows.push({ metric: `  locales ${arm}`, values: arms[arm].map((x) => [...x.det].filter((d) => !dists.has(d)).length) });
      rows.push({ metric: `  repartidos ${arm}`, values: arms[arm].map((x) => [...x.det].filter((d) => dists.has(d)).length) });
      rows.push({ metric: `vistos ${arm}`, values: arms[arm].map((x) => x.seen.size) });
      rows.push({ metric: `alarmas sin respaldo ${arm}`, values: reps.map((r) => unbacked(fsArm(r), matches, defectIds, minorIds, null)) });
      rows.push({ metric: `ponderado ${arm}`, values: reps.map((r) => sum(rsArm(r).map((x) => x.weighted))) });
      rows.push({ metric: `contexto final ${arm}`, values: reps.map((r) => sum(rsArm(r).map((x) => x.finalContext))) });
      rows.push({ metric: `minutos ${arm} (suma de corridas)`, values: reps.map((r) => sum(rsArm(r).map((x) => x.minutes))) });
    }
    // moment of detection: for each defect the arm T detects, the tasks where it was matched
    const moment = [];
    if (cmp.arms.includes('T')) {
      const tBlocks = M.blocks.filter((b) => b.arm === 'T' && b.batch === cmp.batch).map((b) => b.id);
      for (const d of universe) {
        const at = uniq(F.filter((f) => tBlocks.includes(f.block) && matches[f.code] === d && isBlocking(f.severity)).map((f) => f.subrun));
        if (at.length) moment.push({ defect: d, tasks: at.sort() });
      }
    }
    const a0 = cmp.arms[0];
    const a1 = cmp.arms[1];
    const s0 = stat(arms[a0].map((x) => x.det.size));
    const s1 = stat(arms[a1].map((x) => x.det.size));
    const cost = (arm) => sum(rows.find((r) => r.metric === `ponderado ${arm}`).values) / (reps.length || 1);
    const decision = [];
    if (reps.length) {
      if (cmp.id === 'T-vs-F-7a') {
        const adopt = s0.median - s1.median >= 2 && s0.min > s1.max;
        decision.push(adopt ? 'Se adopta la revision por tarea (mediana de T supera a F en >= 2 y rangos no se pisan).' : 'Queda la revision al final: sin diferencia demostrada (lo mas simple).');
        if (adopt && cost('F') > 0 && cost('T') > 3 * cost('F')) decision.push('T cuesta mas de 3 veces F: la decision pasa al autor con las dos cifras.');
      } else {
        const overlap = s0.min <= s1.max && s1.min <= s0.max;
        const cheap = cost('F') > 0 && cost('G') <= 0.7 * cost('F');
        decision.push(s0.median >= s1.median - 1 && overlap && cheap ? 'Se permite agrupar planes chicos (G >= F - 1, rangos se pisan, G <= 70% del costo de F).' : 'No se agrupa: una revision por plan es lo mas simple (o G pierde 2+ con rangos separados, o no ahorra el 30%).');
      }
    }
    out.push({ id: cmp.id, reps, rows, moment, decision, universe: universe.size, stats: { [a0]: s0, [a1]: s1 } });
  }
  return out;
}

// ---- output ----------------------------------------------------------------------------------
function tableText(title, reps, rows) {
  const head = ['metrica', ...reps.map((r) => `rep${r}`), 'mediana', 'min', 'max'];
  const body = rows.map((r) => {
    const s = stat(r.values);
    return [r.metric, ...r.values.map(fmt), fmt(s.median), fmt(s.min), fmt(s.max)];
  });
  const widths = head.map((_, i) => Math.max(head[i].length, ...body.map((b) => String(b[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  return [`== ${title}`, line(head), ...body.map(line)].join('\n');
}

function csvRowsOf(group, reps, rows) {
  return rows.map((r) => {
    const s = stat(r.values);
    const o = { grupo: group, metrica: r.metric, mediana: s.median, min: s.min, max: s.max };
    reps.forEach((rep, i) => { o[`rep${rep}`] = r.values[i]; });
    return o;
  });
}

function loadJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

function run(args) {
  const cases = loadCases();
  const experiment = args.experiment;
  const findings = loadJson(args.findings);
  const runs = loadJson(args.runs);
  const g1 = normGrades(loadJson(args.grades));
  const g2 = args.grades2 ? normGrades(loadJson(args.grades2)) : {};
  const defectIds = new Set(cases.defects.map((d) => d.id));
  const minorIds = new Set(cases.minors.map((m) => m.id));
  const valid = new Set([...defectIds, ...minorIds, 'ninguno']);
  for (const [c, m] of Object.entries({ ...g1, ...g2 })) if (!valid.has(m)) throw new Error(`calificacion con id desconocido: ${c} -> ${m}`);

  let allFindings = findings;
  let allRuns = runs;
  let matchSets = { primary: resolveGrades(g1, g2, defectIds), only1: { final: g1, agreement: null } };
  const warnings = [];
  if (experiment === 'momento' && args['lentes-findings']) {
    const lg = normGrades(loadJson(args['lentes-grades']));
    const merged = mergeReused({ cases, findings, runs, lentes: { findings: loadJson(args['lentes-findings']), runs: loadJson(args['lentes-runs']) } });
    allFindings = merged.findings;
    allRuns = merged.runs;
    if (merged.missing.length) warnings.push(`faltan corridas reusadas de lentes: ${merged.missing.join(', ')}`);
    for (const k of ['primary', 'only1']) {
      const fin = { ...matchSets[k].final };
      for (const [c, m] of Object.entries(lg)) fin[`L:${c}`] = m;
      matchSets[k] = { ...matchSets[k], final: fin };
    }
  }
  const missing = allFindings.filter((f) => !(f.code in matchSets.primary.final)).length;
  if (missing) warnings.push(`${missing} hallazgos sin calificar: cuentan como "ninguno"`);
  const sections = [];
  const csv = [];
  const results = {};
  const labels = args['grader1-only'] === undefined && matchSets.primary.agreement && matchSets.primary.agreement.disagreements ? ['primary', 'only1'] : ['primary'];
  for (const k of labels) {
    const matches = matchSets[k].final;
    const tag = k === 'primary' ? '' : ' [solo calificador 1]';
    if (experiment === 'lentes') {
      const variants = [{ ex: [], label: 'todos los casos' }];
      if (cases.lentes.cases.some((c) => c.id === 'D1') && args['exclude-case'] !== 'none') variants.push({ ex: [String(args['exclude-case'] || 'D1')], label: `sin ${args['exclude-case'] || 'D1'}` });
      for (const v of variants) {
        const m = lentesMetrics({ cases, findings: allFindings, runs: allRuns, matches, excludeCases: v.ex, label: v.label });
        results[`${k}:${v.label}`] = m;
        sections.push(`${tableText(`lentes-reales, ${m.label}${tag}`, m.reps, m.rows)}\nEsperado (1-prod(1-p)): A ${fmt(m.expected.A)}  B ${fmt(m.expected.B)}\nUnicos estables: ${m.stableUnique.map((s) => `${s.defect} (${s.lens}, ${s.hits}/${m.reps.length})`).join('; ') || 'ninguno'}\nPor lente: ${m.perLens.map((p) => `${p.lens} det med ${fmt(p.detected.median)} ponderado ${fmt(p.weighted)} usd ${fmt(p.usd)} min/corrida ${fmt(p.minutesPerRun)}`).join(' | ')}\nRegla: ${m.decision.join(' ')}`);
        csv.push(...csvRowsOf(`${k}:${m.label}`, m.reps, m.rows));
      }
    } else {
      for (const m of momentoMetrics({ cases, findings: allFindings, runs: allRuns, matches })) {
        results[`${k}:${m.id}`] = m;
        sections.push(`${tableText(`momento-de-revision, ${m.id}${tag}`, m.reps, m.rows)}\nMomento de deteccion: ${m.moment.map((x) => `${x.defect} -> ${x.tasks.join('+')}`).join('; ') || 'ninguno'}\nRegla: ${m.decision.join(' ')}`);
        csv.push(...csvRowsOf(`${k}:${m.id}`, m.reps, m.rows));
      }
    }
  }
  const ag = matchSets.primary.agreement;
  const head = ag && ag.graded
    ? `Acuerdo de calificadores: ${ag.graded} hallazgos, ${fmt(ag.pct)}%, kappa ${fmt(ag.kappa)}${ag.conservative ? ' (< 85%: el calificador 2 debe calificar todo; los desacuerdos cuentan como no emparejados)' : ''}.`
    : 'Sin calificador 2: no hay acuerdo que publicar.';
  const text = [head, ...warnings.map((w) => `AVISO: ${w}`), ...sections].join('\n\n');
  const graded = allFindings.map((f) => ({
    codigo: f.code, caso: f.caseId || `${f.block}|${f.subrun}`, gravedad: f.severity, emparejado_con: matchSets.primary.final[f.code] || 'ninguno',
    calificador_1: g1[f.code] || '', calificador_2: g2[f.code] || '',
  }));
  return { text, csv: toCsv(['grupo', 'metrica', 'rep1', 'rep2', 'rep3', 'mediana', 'min', 'max'], csv), graded: toCsv(['codigo', 'caso', 'gravedad', 'emparejado_con', 'calificador_1', 'calificador_2'], graded), results };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!['lentes', 'momento'].includes(args.experiment) || !args.findings || !args.runs || !args.grades || !args.out) {
    process.stderr.write('uso: node assemble.js --experiment lentes|momento --findings <f.json> --runs <runs-table.json> --grades <g1.json> [--grades2 <g2.json>] --out <dir> [--exclude-case D1|none] [--lentes-findings --lentes-runs --lentes-grades]\n');
    process.exit(2);
  }
  try {
    const r = run(args);
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, `metrics-${args.experiment}.csv`), r.csv);
    fs.writeFileSync(path.join(args.out, `findings-graded-${args.experiment}.csv`), r.graded);
    process.stdout.write(`${r.text}\n`);
  } catch (e) {
    process.stderr.write(`assemble: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { resolveGrades, cohenKappa, detection, lentesMetrics, momentoMetrics, mergeReused, isBlocking, normGrades, run };
