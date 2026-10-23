// Summary per task and arm, and the decision rule of tests/evals/RESULTS-pignolo2.md.
// Every figure carries its range; nothing is reported as a bare number.
// A run that cannot be trusted ("invalid") is never counted and never dropped silently: it is listed and
// leaves its task "pendiente" until it is rerun.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, decodeModelTokens } from './row.mjs';
import { DEFAULT_WEIGHTS, DEFAULT_MODEL_FACTOR, HARNESS_DIR } from './config.mjs';
import { modelFactorFor } from './metrics.mjs';

const NUMERIC = ['rep', 'cost_usd', 'weighted_tokens', 'input', 'output', 'cache_read', 'cache_write', 'wall_s', 'duration_ms', 'turns',
  'agents', 'agents_main', 'skill_calls', 'own_skill_calls', 'exit_code', 'accept_exit', 'accept_pass', 'accept_fail', 'accept_suites_failed', 'full_pass', 'full_fail',
  'full_baseline_fail', 'files_changed', 'lines_added', 'lines_removed', 'eol_only_files', 'eol_converted_files'];
const BOOLEAN = ['timed_out', 'contamination', 'is_error', 'invalid'];

export function normalizeRows(rows) {
  return rows.map((r) => {
    const o = { ...r };
    for (const k of NUMERIC) o[k] = o[k] === '' || o[k] === undefined || o[k] === null ? null : Number(o[k]);
    for (const k of BOOLEAN) o[k] = o[k] === true || o[k] === 'true';
    return o;
  });
}

export const rowsFromCsv = (text) => normalizeRows(parseCsv(text));

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stat(xs) {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return { median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length };
}

const overlap = (a, b) => a.min <= b.max && b.min <= a.max;
const runId = (r) => `${r.task}/${r.arm}/${r.rep}`;

// Green: the command exited 0, no suite failed to run, no test failed and at least one test passed.
// Unknown suite information (no report, no summary line) does not block; the exit code still has to be 0.
export function isGreen(r) {
  return r.accept_exit === 0
    && (r.accept_suites_failed === null || r.accept_suites_failed === 0)
    && r.accept_fail === 0 && r.accept_pass !== null && r.accept_pass > 0;
}
const hasAccept = (r) => r.accept_pass !== null && r.accept_fail !== null;

const CONTAMINATION_ONLY = new Set(['contaminated', 'own_plugin_not_loaded']);
function reasonsOf(r) {
  const rs = String(r.invalid_reason || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!rs.length && r.invalid) rs.push('invalid');
  if (!rs.length && r.contamination) rs.push('contaminated');
  return rs;
}
function isInvalid(r, includeContaminated) {
  const rs = reasonsOf(r);
  if (!rs.length) return false;
  return !(includeContaminated && rs.every((x) => CONTAMINATION_ONLY.has(x)));
}

// Weighted tokens recomputed from the raw per-model tokens with the CURRENT weights and model factors.
function reweigh(r, weights, modelFactor) {
  const byModel = decodeModelTokens(r.model_tokens);
  if (!byModel) return { value: r.weighted_tokens, fallback: r.weighted_tokens !== null };
  let total = 0;
  for (const [model, t] of Object.entries(byModel)) {
    total += (t.input * weights.input + t.output * weights.output + t.cacheRead * weights.cacheRead + t.cacheWrite * weights.cacheWrite)
      * modelFactorFor(model, modelFactor);
  }
  return { value: Math.round(total * 100) / 100, fallback: false };
}

function armStats(rows) {
  const accRows = rows.filter(hasAccept);
  const pass = accRows.reduce((s, r) => s + r.accept_pass, 0);
  const fail = accRows.reduce((s, r) => s + r.accept_fail, 0);
  const fullRows = rows.filter((r) => r.full_fail !== null);
  return {
    n: rows.length,
    tokens: stat(rows.map((r) => r.wt)),
    cost: stat(rows.map((r) => r.cost_usd)),
    wall: stat(rows.map((r) => r.wall_s)),
    agents: stat(rows.map((r) => r.agents)),
    timedOut: rows.filter((r) => r.timed_out).length,
    // Did the run exercise the plugin under test? A run activated it when it called at least one of the plugin's own skills.
    // Rows without the data (older CSV) are not counted either way. The plugin's own hook is shown apart.
    // Informative quality note, outside the decision rule: files whose line endings were converted (for example CRLF to LF).
    eol: (() => {
      const known = rows.filter((r) => r.eol_converted_files !== null && r.eol_converted_files !== undefined);
      return {
        converted: known.reduce((t, r) => t + r.eol_converted_files, 0),
        only: known.reduce((t, r) => t + (r.eol_only_files || 0), 0),
        runs: known.filter((r) => r.eol_converted_files > 0).length,
        m: known.length,
      };
    })(),
    activation: { n: rows.filter((r) => r.own_skill_calls !== null && r.own_skill_calls > 0).length, m: rows.filter((r) => r.own_skill_calls !== null).length },
    hook: { n: rows.filter((r) => r.own_hook_ran === 'true').length, m: rows.filter((r) => r.own_hook_ran === 'true' || r.own_hook_ran === 'false').length },
    accept: accRows.length ? { pass, fail, runs: accRows.length, greenRuns: accRows.filter(isGreen).length } : null,
    full: {
      baselineMissing: fullRows.filter((r) => r.full_baseline_fail === null).length,
      overBaseline: fullRows.filter((r) => r.full_baseline_fail !== null && r.full_fail > r.full_baseline_fail).length,
    },
  };
}

const rate = (a) => (a && a.runs > 0 ? a.greenRuns / a.runs : null);

function qualityOf(grades, arm) {
  const g = grades.filter((x) => x.arm === arm);
  return {
    n: g.length,
    quality: median(g.map((x) => x.quality).filter(Number.isFinite)),
    serious: median(g.map((x) => (Array.isArray(x.serious_findings) ? x.serious_findings.length : 0))),
  };
}

// A grade belongs to the run it was written for: same repetition and, when the grade says it, the same run timestamp.
function gradesFor(grades, task, rows) {
  return grades.filter((g) => g.task === task && rows.some((r) => r.arm === g.arm && r.rep === g.rep
    && (g.timestamp === undefined || g.timestamp === null || String(g.timestamp) === String(r.timestamp))));
}

function missingAcceptance(a, b, ids) {
  const lacking = [[ids[0], a], [ids[1], b]].filter(([, s]) => !s.accept || s.accept.runs < s.n);
  if (!lacking.length) return null;
  return `falta la aceptación en corridas válidas de ${lacking.map(([n, s]) => `${n} (${s.accept ? s.accept.runs : 0} de ${s.n})`).join(' y ')}: corré accept y row`;
}

// H1, non-inferiority: the variant Y passes when median(Y) <= 1.5 x median(X) AND max(Y) <= 1.5 x max(X) AND quality is equal or
// better, X being the control of the pair. Overlapping ranges only stop a claim of superiority; they never stop Y from passing.
function decideMedium(a, b, grades, ids = ['A', 'B']) {
  const [X, Y] = ids;
  const reasons = [];
  if (!a.tokens || !b.tokens) return { verdict: 'pendiente', reasons: ['faltan corridas con tokens en algún brazo'] };
  const miss = missingAcceptance(a, b, ids);
  if (miss) return { verdict: 'pendiente', reasons: [miss] };
  const ratio = b.tokens.median / a.tokens.median;
  const ratioMax = b.tokens.max / a.tokens.max;
  reasons.push(`tokens ponderados: mediana ${Y}/${X} = ${fmt(ratio, 2)} (umbral 1,5); máximo ${Y}/${X} = ${fmt(ratioMax, 2)} (umbral 1,5)`);
  if (a.cost && b.cost) reasons.push(`costo USD (informativo): mediana ${Y} ${fmt(b.cost.median, 4)} / ${X} ${fmt(a.cost.median, 4)}`);
  if (b.tokens.median < a.tokens.median) {
    reasons.push(overlap(a.tokens, b.tokens)
      ? `${Y} por debajo de ${X} en la mediana, pero los rangos se pisan: no se afirma superioridad`
      : `${Y} por debajo de ${X} con los rangos separados`);
  }
  const over = [];
  if (b.tokens.median > 1.5 * a.tokens.median) over.push(`la mediana de tokens de ${Y} pasa 1,5 veces la de ${X}`);
  if (b.tokens.max > 1.5 * a.tokens.max) over.push(`el máximo de tokens de ${Y} pasa 1,5 veces el máximo de ${X}`);
  if (over.length) return { verdict: 'no pasa', reasons: [...reasons, ...over] };
  const qa = qualityOf(grades, X);
  const qb = qualityOf(grades, Y);
  if (qa.n < a.n || qb.n < b.n) {
    reasons.push(`falta la nota de calidad a ciegas de corridas válidas (${X} ${qa.n} de ${a.n}, ${Y} ${qb.n} de ${b.n}): corré blind y unblind`);
    return { verdict: 'pendiente', reasons };
  }
  const bad = [];
  if (qb.quality < qa.quality) bad.push(`calidad: mediana de nota ${Y} ${qb.quality} < ${X} ${qa.quality}`);
  if (qb.serious > qa.serious) bad.push(`calidad: hallazgos graves ${Y} ${qb.serious} > ${X} ${qa.serious} (mediana)`);
  const ra = rate(a.accept);
  const rb = rate(b.accept);
  if (ra !== null && rb !== null && rb < ra) bad.push(`calidad: corridas verdes en aceptación ${Y} ${fmt(rb * 100, 0)}% < ${X} ${fmt(ra * 100, 0)}%`);
  if (bad.length) return { verdict: 'no pasa', reasons: [...reasons, ...bad] };
  reasons.push(`calidad: nota mediana ${Y} ${qb.quality} >= ${X} ${qa.quality}, hallazgos graves ${Y} ${qb.serious} <= ${X} ${qa.serious}`);
  reasons.push('no inferioridad (H1): se cumple');
  return { verdict: 'pasa', reasons };
}

function decideSmall(a, b, ids = ['A', 'B']) {
  const [X, Y] = ids;
  const reasons = [];
  let fail = false;
  let open = false;
  let pending = false;
  for (const [name, key] of [['tiempo de pared', 'wall'], ['tokens ponderados', 'tokens']]) {
    if (!a[key] || !b[key]) return { verdict: 'pendiente', reasons: [`faltan datos de ${name} en algún brazo`] };
    if (b[key].median <= a[key].median) {
      reasons.push(`${name}: mediana ${Y} ${fmt(b[key].median)} <= ${X} ${fmt(a[key].median)}`);
    } else if (overlap(a[key], b[key])) {
      open = true;
      reasons.push(`${name}: mediana ${Y} ${fmt(b[key].median)} > ${X} ${fmt(a[key].median)} pero los rangos se pisan (riesgo abierto)`);
    } else {
      fail = true;
      reasons.push(`${name}: mediana ${Y} ${fmt(b[key].median)} > ${X} ${fmt(a[key].median)} con rangos separados`);
    }
  }
  if (a.cost && b.cost) reasons.push(`costo USD (informativo): mediana ${Y} ${fmt(b.cost.median, 4)} / ${X} ${fmt(a.cost.median, 4)}`);
  const miss = missingAcceptance(a, b, ids);
  if (miss) { pending = true; reasons.push(miss); }
  if (b.accept) {
    if (b.accept.greenRuns < b.accept.runs) {
      fail = true;
      reasons.push(`resultado incorrecto: ${b.accept.runs - b.accept.greenRuns} de ${b.accept.runs} corridas de ${Y} no pasan la aceptación`);
    } else if (!miss) {
      reasons.push(`resultado correcto en todas las corridas de ${Y}`);
    }
  }
  if (b.full.overBaseline) {
    fail = true;
    reasons.push(`suite completa: ${b.full.overBaseline} corridas de ${Y} con más fallas que el piso (baselineFull)`);
  }
  if (b.full.baselineMissing) {
    pending = true;
    reasons.push(`suite completa: falta el piso baselineFull de la tarea en <privateRoot>/tasks.json (${b.full.baselineMissing} corridas de ${Y} sin piso)`);
  }
  if (fail) return { verdict: 'no pasa', reasons };
  if (pending) return { verdict: 'pendiente', reasons };
  return { verdict: open ? 'sin diferencia demostrada' : 'pasa', reasons };
}

// The detection rule of the ficha (measurement 3), per fixture: cli-script spends zero agents in total (native-command agents
// included); landing-form at most 2 front agents; app-db at most 5. Front agents are the ones launched by the main thread
// (a native command that the main thread launches cannot be told apart in the stream, so this is an upper bound).
const FIXTURE_RULES = {
  'cli-script': { total: 0, text: 'cero agentes en total' },
  'landing-form': { front: 2, text: 'más de 2 agentes de frente' },
  'app-db': { front: 5, text: 'más de 5 agentes de frente' },
};

function fixtureEntry({ task, fixtureName, mine, bad, expected, activationOf }) {
  const arms = {};
  for (const a of [...new Set(mine.map((r) => r.arm))].sort()) arms[a] = armStats(mine.filter((r) => r.arm === a));
  const rule = FIXTURE_RULES[fixtureName] || {};
  const want = (expected && expected[fixtureName]) || [];
  // Decision criterion (author's decision 2026-10-23): the fronts the main thread actually delegated (agents launched),
  // fronts_by_agents_ok. The "Frentes:" line (fronts_ok) is kept as an informational figure that no longer decides.
  const isBool = (v) => v === 'true' || v === 'false' || v === true || v === false;
  const matched = mine.filter((r) => r.fronts_by_agents_ok === 'true' || r.fronts_by_agents_ok === true);
  const noData = mine.filter((r) => !isBool(r.fronts_by_agents_ok));
  const wrong = mine.filter((r) => !matched.includes(r) && !noData.includes(r));
  const reasons = [`fixture ${fixtureName}: ${matched.length}/${mine.length} corridas con los frentes esperados [${want.join(';')}] (medido por los agentes lanzados)`];
  for (const r of wrong) reasons.push(`${runId(r)}: agentes → [${r.fronts_by_agents || ''}] esperaba [${want.join(';')}]`);
  const total = stat(mine.map((r) => r.agents));
  const front = stat(mine.map((r) => r.agents_main));
  reasons.push(`agentes (total, con los de comandos nativos): ${total ? `mediana ${fmt(total.median, 0)} (rango ${fmt(total.min, 0)} a ${fmt(total.max, 0)})` : 'sin dato'}; lanzados por el hilo principal: ${front ? `mediana ${fmt(front.median, 0)} (rango ${fmt(front.min, 0)} a ${fmt(front.max, 0)})` : 'sin dato'}`);
  const over = mine.filter((r) => noData.indexOf(r) < 0 && ((rule.total !== undefined && r.agents > rule.total) || (rule.front !== undefined && r.agents_main > rule.front)));
  for (const r of over) reasons.push(`${runId(r)}: ${rule.text} (obtuvo ${rule.total !== undefined ? r.agents : r.agents_main})`);
  // INFORMATIONAL figure (original criterion, no longer decides): the "Frentes:" line. Printed only if some run printed it.
  const printed = mine.filter((r) => r.fronts_message !== '' && r.fronts_message !== null && r.fronts_message !== undefined);
  const lineMatched = mine.filter((r) => r.fronts_ok === 'true' || r.fronts_ok === true);
  const info = [];
  if (printed.length) info.push(`línea Frentes (criterio original, ya no decide): ${lineMatched.length}/${mine.length} corridas con los frentes esperados; la imprimieron ${printed.length}/${mine.length}`);
  const invalid = bad.map((r) => ({ run: runId(r), reasons: reasonsOf(r) }));
  let verdict;
  if (invalid.length) {
    verdict = `pendiente: ${invalid.length} corridas inválidas`;
    reasons.unshift(...invalid.map((i) => `inválida ${i.run}: ${i.reasons.join(', ')}`));
  } else if (!mine.length) verdict = 'pendiente';
  else if (noData.length) {
    verdict = 'pendiente';
    reasons.push(`falta el dato de agentes lanzados en ${noData.map(runId).join(', ')}: corré remetric, accept y row`);
  } else if (wrong.length || over.length) verdict = 'no pasa';
  else verdict = 'pasa';
  reasons.push(...info);
  const n = Math.min(...Object.values(arms).map((s) => s.n), Infinity);
  const evidence = n >= 3 ? 'E3' : n >= 2 ? 'E2' : 'sin evidencia';
  const act = activationOf(arms);
  return {
    task, kind: 'fixture', fixture: fixtureName, pair: null, arms, evidence, decision: { verdict, reasons }, invalid, systematicNoChanges: [],
    ...act, eol: Object.fromEntries(Object.entries(arms).map(([a, st]) => [a, st.eol])),
    fixtureDetail: { runs: mine.length, matched: matched.length, noData: noData.length, line: { matched: lineMatched.length, printed: printed.length } },
  };
}

function activationOf(arms) {
  const activation = Object.fromEntries(Object.entries(arms).map(([a, st]) => [a, st.activation]));
  const known = Object.entries(activation).filter(([, v]) => v.m > 0);
  const activationNotes = [];
  if (known.length && known.every(([, v]) => v.n === 0)) {
    activationNotes.push('ningún corrida activó el plugin: la comparación de esta tarea mide al modelo base');
  } else {
    for (const [a, v] of known) if (v.n === 0) activationNotes.push(`el brazo ${a} no activó el plugin en ninguna corrida (0/${v.m})`);
  }
  return { activation, activationNotes };
}

export function summarize(rowsIn, {
  kinds = {}, grades = [], includeContaminated = false, experiment = null, weights = DEFAULT_WEIGHTS, modelFactor = DEFAULT_MODEL_FACTOR, pairs = [['A', 'B']],
  fixtures = {}, frontsExpected = null,
} = {}) {
  let expectedFronts = frontsExpected;
  if (!expectedFronts) {
    try { expectedFronts = JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, '..', 'fronts-expected.json'), 'utf8')); } catch { expectedFronts = {}; }
  }
  const notes = [];
  let rowsAll = rowsIn;
  if (experiment) {
    const others = [...new Set(rowsIn.filter((r) => r.experiment !== experiment).map((r) => r.experiment))];
    rowsAll = rowsIn.filter((r) => r.experiment === experiment);
    if (others.length) notes.push(`filas de otros experimentos ignoradas (${others.join(', ')}); este resumen es del experimento "${experiment}"`);
  }
  // A rerun (or any later row for the same run) supersedes the earlier one; both stay in the CSV.
  const latest = new Map();
  const superseded = [];
  rowsAll.forEach((r, i) => {
    const k = `${r.task}\u0000${r.arm}\u0000${r.rep}`;
    const prev = latest.get(k);
    if (!prev) { latest.set(k, { r, i }); return; }
    const newer = String(r.timestamp) > String(prev.r.timestamp) || (r.timestamp === prev.r.timestamp && i > prev.i);
    superseded.push(runId(r));
    if (newer) latest.set(k, { r, i });
  });
  if (superseded.length) notes.push(`corridas repetidas (rerun) que reemplazan a la original en las cifras: ${[...new Set(superseded)].join(', ')}; las dos siguen en el CSV`);
  const current = [...latest.values()].map((x) => x.r);

  const invalidRows = current.filter((r) => isInvalid(r, includeContaminated));
  const validRows = current.filter((r) => !isInvalid(r, includeContaminated));
  if (invalidRows.length) {
    notes.push(`corridas inválidas, fuera de las cifras hasta repetirlas (rerun): ${invalidRows.map((r) => `${runId(r)} (${reasonsOf(r).join(', ')})`).join('; ')}`);
  }
  const budget = invalidRows.filter((r) => reasonsOf(r).includes('budget_cap'));
  if (budget.length) {
    notes.push(`superó el tope por corrida: ${budget.map(runId).join(', ')}; si un brazo lo supera de forma sistemática, eso ya es un resultado`);
  }
  const timed = invalidRows.filter((r) => r.timed_out);
  if (timed.length) notes.push(`cortadas por tiempo (cuentan como inválidas y quedan fuera de las cifras): ${timed.map(runId).join(', ')}`);
  const dirtyIncluded = includeContaminated ? current.filter((r) => r.contamination) : [];
  if (dirtyIncluded.length) notes.push(`incluidas pese a la contaminación: ${dirtyIncluded.map(runId).join(', ')}`);
  const multi = validRows.filter((r) => /(^|;)\s*multiple_trees\s*(;|$)/.test(r.note || ''));
  if (multi.length) notes.push(`cambios en más de un árbol (revisar a mano cuál es el medido): ${multi.map(runId).join(', ')}`);

  let fallback = 0;
  for (const r of validRows) {
    const w = reweigh(r, weights, modelFactor);
    r.wt = w.value;
    if (w.fallback) fallback += 1;
  }
  if (fallback) notes.push(`${fallback} filas sin tokens por modelo: se usó el ponderado guardado en el CSV en vez de recalcularlo`);

  const tasks = [];
  const pairList = pairs && pairs.length ? pairs : [['A', 'B']];
  for (const task of [...new Set(current.map((r) => r.task))].sort()) {
    const kind = kinds[task] || null;
    if (kind === 'fixture') {
      tasks.push(fixtureEntry({ task, fixtureName: fixtures[task] || task, mine: validRows.filter((r) => r.task === task), bad: invalidRows.filter((r) => r.task === task), expected: expectedFronts, activationOf }));
      continue;
    }
    // Each rule is evaluated once per pair [control, variant]; a pair with no runs of this task does not appear.
    for (const pair of pairList) {
      const [X, Y] = pair;
      const inPair = (r) => r.arm === X || r.arm === Y;
      const mine = validRows.filter((r) => r.task === task && inPair(r));
      const bad = invalidRows.filter((r) => r.task === task && inPair(r));
      if (!mine.length && !bad.length) continue;
      const arms = {};
      for (const a of [X, Y]) {
        const rowsOfArm = mine.filter((r) => r.arm === a);
        if (rowsOfArm.length) arms[a] = armStats(rowsOfArm);
      }
      const nX = arms[X] ? arms[X].n : 0;
      const nY = arms[Y] ? arms[Y].n : 0;
      // Evidence level: E3 from 3 valid runs per arm, E2 with 2, none with 1 or fewer (one run per arm shows no spread).
      const evidence = Math.min(nX, nY) >= 3 ? 'E3' : Math.min(nX, nY) >= 2 ? 'E2' : 'sin evidencia';
      let decision;
      if (!arms[X] || !arms[Y]) decision = { verdict: 'pendiente', reasons: ['falta un brazo con corridas válidas'] };
      else if (kind === 'medium') decision = decideMedium(arms[X], arms[Y], gradesFor(grades, task, mine), pair);
      else if (kind === 'small') decision = decideSmall(arms[X], arms[Y], pair);
      else decision = { verdict: 'pendiente', reasons: ['tipo de tarea no definido (medium o small): usá la configuración "tasks" o --medium / --small'] };
      const invalid = bad.map((r) => ({ run: runId(r), reasons: reasonsOf(r) }));
      // An arm whose every attempt ends without changes (for example it always stops to ask a question) is a result of the
      // measurement, not a reason to wait: it is named as such and the task is decided from it.
      const systematicNoChanges = [];
      const lines = [];
      for (const a of pair) {
        const attempts = current.filter((r) => r.task === task && r.arm === a);
        if (attempts.length && attempts.every((r) => reasonsOf(r).includes('no_changes'))) {
          systematicNoChanges.push(a);
          lines.push(`el brazo ${a} termina sin cambios en todas las corridas: ${attempts.length}/${attempts.length}`);
        }
      }
      if (systematicNoChanges.length) {
        decision = {
          verdict: systematicNoChanges.includes(X) ? 'no comparable' : 'no pasa',
          reasons: [...lines, ...invalid.map((i) => `inválida ${i.run}: ${i.reasons.join(', ')}`)],
          provisional: decision.verdict,
        };
      } else if (invalid.length) {
        decision = {
          verdict: `pendiente: ${invalid.length} corridas inválidas`,
          reasons: [...invalid.map((i) => `inválida ${i.run}: ${i.reasons.join(', ')}`), 'las cifras de abajo son provisionales, sin esas corridas', ...decision.reasons],
          provisional: decision.verdict,
        };
      }
      // A comparison in which no run called a skill of its plugin measures the base model, not the method.
      const { activation, activationNotes } = activationOf(arms);
      const eol = Object.fromEntries(Object.entries(arms).map(([a, st]) => [a, st.eol]));
      tasks.push({ task, kind, pair, arms, evidence, decision, invalid, systematicNoChanges, activation, activationNotes, eol });
    }
  }
  return { tasks, notes };
}

function fmt(x, d = 2) {
  if (x === null || x === undefined) return 'sin dato';
  return String(Number(Number(x).toFixed(d)));
}

const range = (s, d = 2) => (s ? `mediana ${fmt(s.median, d)} (rango ${fmt(s.min, d)} a ${fmt(s.max, d)})` : 'sin dato');

export function formatSummary(res) {
  const out = [];
  for (const t of res.tasks) {
    out.push(`== ${t.task}${t.kind ? ` (${t.kind})` : ''}${t.pair ? ` [par ${t.pair[0]} contra ${t.pair[1]}]` : ''} ==`);
    out.push(`evidence: ${t.evidence}`);
    for (const [a, s] of Object.entries(t.arms)) {
      const acc = s.accept ? `${s.accept.pass}/${s.accept.pass + s.accept.fail} tests (${s.accept.greenRuns}/${s.accept.runs} corridas verdes)` : 'sin dato';
      out.push(`${a}  n=${s.n}${s.timedOut ? ` (${s.timedOut} cortadas por tiempo)` : ''}`);
      out.push(`   tokens ponderados (pesos y factores de la configuración actual): ${range(s.tokens, 0)}`);
      out.push(`   costo USD: ${range(s.cost, 4)}`);
      out.push(`   tiempo de pared s: ${range(s.wall, 1)}`);
      out.push(`   agentes: ${range(s.agents, 1)}`);
      out.push(`   aceptación: ${acc}`);
      if (s.eol.m) out.push(`   fin de línea (nota, no entra en la regla): ${s.eol.converted} archivos convertidos en ${s.eol.runs}/${s.eol.m} corridas${s.eol.only ? `, ${s.eol.only} con solo cambio de fin de línea` : ''}`);
      out.push(`   activaron el plugin: ${s.activation.m ? `${s.activation.n}/${s.activation.m}` : 'sin dato'}${s.hook.m ? ` (hook propio visto: ${s.hook.n}/${s.hook.m})` : ''}`);
    }
    out.push(`decisión: ${t.decision.verdict}`);
    for (const r of t.decision.reasons) out.push(`   - ${r}`);
    for (const n of t.activationNotes) out.push(`   - ${n}`);
    out.push('');
  }
  for (const n of res.notes) out.push(`nota: ${n}`);
  return out.join('\n').trimEnd();
}
