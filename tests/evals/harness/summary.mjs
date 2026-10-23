// Summary per task and arm, and the decision rule of tests/evals/RESULTS-pignolo2.md.
// Every figure carries its range; nothing is reported as a bare number.
import { parseCsv } from './row.mjs';

const NUMERIC = ['rep', 'cost_usd', 'weighted_tokens', 'input', 'output', 'cache_read', 'cache_write', 'wall_s', 'turns', 'agents',
  'accept_pass', 'accept_fail', 'full_pass', 'full_fail', 'files_changed', 'lines_added', 'lines_removed'];

export function normalizeRows(rows) {
  return rows.map((r) => {
    const o = { ...r };
    for (const k of NUMERIC) o[k] = o[k] === '' || o[k] === undefined || o[k] === null ? null : Number(o[k]);
    for (const k of ['timed_out', 'contamination']) o[k] = o[k] === true || o[k] === 'true';
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

function armStats(rows) {
  const accRows = rows.filter((r) => r.accept_pass !== null && r.accept_fail !== null);
  const pass = accRows.reduce((s, r) => s + r.accept_pass, 0);
  const fail = accRows.reduce((s, r) => s + r.accept_fail, 0);
  return {
    n: rows.length,
    tokens: stat(rows.map((r) => r.weighted_tokens)),
    cost: stat(rows.map((r) => r.cost_usd)),
    wall: stat(rows.map((r) => r.wall_s)),
    agents: stat(rows.map((r) => r.agents)),
    timedOut: rows.filter((r) => r.timed_out).length,
    accept: accRows.length
      ? { pass, fail, runs: accRows.length, greenRuns: accRows.filter((r) => r.accept_fail === 0 && r.accept_pass > 0).length }
      : null,
  };
}

const rate = (a) => (a && a.pass + a.fail > 0 ? a.pass / (a.pass + a.fail) : null);

function qualityOf(grades, task, arm) {
  const g = grades.filter((x) => x.task === task && x.arm === arm);
  return {
    n: g.length,
    quality: median(g.map((x) => x.quality).filter(Number.isFinite)),
    serious: median(g.map((x) => (Array.isArray(x.serious_findings) ? x.serious_findings.length : 0))),
  };
}

function decideMedium(a, b, grades, task) {
  const reasons = [];
  if (!a.tokens || !b.tokens) return { verdict: 'pendiente', reasons: ['faltan corridas con tokens en algún brazo'] };
  const ratio = b.tokens.median / a.tokens.median;
  reasons.push(`tokens ponderados: B/A = ${fmt(ratio, 2)} de la mediana (umbral 1,5)`);
  if (overlap(a.tokens, b.tokens)) {
    reasons.push('los rangos de tokens de A y B se pisan');
    return { verdict: 'sin diferencia demostrada', reasons };
  }
  if (ratio > 1.5) {
    reasons.push('tokens de B por encima de 1,5 veces los de A');
    return { verdict: 'no pasa', reasons };
  }
  const qa = qualityOf(grades, task, 'A');
  const qb = qualityOf(grades, task, 'B');
  if (!qa.n || !qb.n) {
    reasons.push('falta la nota de calidad a ciegas (grades.json) de algún brazo');
    return { verdict: 'pendiente', reasons };
  }
  const bad = [];
  if (qb.quality < qa.quality) bad.push(`calidad: mediana de nota B ${qb.quality} < A ${qa.quality}`);
  if (qb.serious > qa.serious) bad.push(`calidad: hallazgos graves B ${qb.serious} > A ${qa.serious} (mediana)`);
  const ra = rate(a.accept);
  const rb = rate(b.accept);
  if (ra !== null && rb !== null && rb < ra) bad.push(`calidad: tests de aceptación que pasan B ${fmt(rb * 100, 0)}% < A ${fmt(ra * 100, 0)}%`);
  if (bad.length) return { verdict: 'no pasa', reasons: [...reasons, ...bad] };
  reasons.push(`calidad: nota mediana B ${qb.quality} >= A ${qa.quality}, hallazgos graves B ${qb.serious} <= A ${qa.serious}`);
  return { verdict: 'pasa', reasons };
}

function decideSmall(a, b) {
  const reasons = [];
  let fail = false;
  let open = false;
  for (const [name, key] of [['tiempo de pared', 'wall'], ['tokens ponderados', 'tokens']]) {
    if (!a[key] || !b[key]) return { verdict: 'pendiente', reasons: [`faltan datos de ${name} en algún brazo`] };
    if (b[key].median <= a[key].median) {
      reasons.push(`${name}: mediana B ${fmt(b[key].median)} <= A ${fmt(a[key].median)}`);
    } else if (overlap(a[key], b[key])) {
      open = true;
      reasons.push(`${name}: mediana B ${fmt(b[key].median)} > A ${fmt(a[key].median)} pero los rangos se pisan (riesgo abierto)`);
    } else {
      fail = true;
      reasons.push(`${name}: mediana B ${fmt(b[key].median)} > A ${fmt(a[key].median)} con rangos separados`);
    }
  }
  if (!b.accept) {
    reasons.push('falta la aceptación de B (corré accept y row)');
    return { verdict: fail ? 'no pasa' : 'pendiente', reasons };
  }
  if (b.accept.greenRuns < b.accept.runs) {
    fail = true;
    reasons.push(`resultado incorrecto: ${b.accept.runs - b.accept.greenRuns} de ${b.accept.runs} corridas de B no pasan la aceptación`);
  } else {
    reasons.push('resultado correcto en todas las corridas de B');
  }
  return { verdict: fail ? 'no pasa' : open ? 'sin diferencia demostrada' : 'pasa', reasons };
}

export function summarize(rowsIn, { kinds = {}, grades = [], includeContaminated = false } = {}) {
  const notes = [];
  // A rerun (or any later row for the same run) supersedes the earlier one; both stay in the CSV.
  const latest = new Map();
  const superseded = [];
  rowsIn.forEach((r, i) => {
    const k = `${r.task}\u0000${r.arm}\u0000${r.rep}`;
    const prev = latest.get(k);
    if (!prev) { latest.set(k, { r, i }); return; }
    const newer = String(r.timestamp) > String(prev.r.timestamp) || (r.timestamp === prev.r.timestamp && i > prev.i);
    superseded.push(`${r.task}/${r.arm}/${r.rep}`);
    if (newer) latest.set(k, { r, i });
  });
  if (superseded.length) notes.push(`corridas repetidas (rerun) que reemplazan a la original en las cifras: ${[...new Set(superseded)].join(', ')}; las dos siguen en el CSV`);
  let rows = [...latest.values()].map((x) => x.r);
  const dirty = rows.filter((r) => r.contamination);
  if (dirty.length && !includeContaminated) {
    notes.push(`excluidas por contaminación (el plugin del otro brazo estaba activo): ${dirty.map((r) => `${r.task}/${r.arm}/${r.rep}`).join(', ')}`);
    rows = rows.filter((r) => !r.contamination);
  } else if (dirty.length) {
    notes.push(`incluidas pese a la contaminación: ${dirty.map((r) => `${r.task}/${r.arm}/${r.rep}`).join(', ')}`);
  }
  const timed = rows.filter((r) => r.timed_out);
  if (timed.length) notes.push(`corridas cortadas por tiempo (entran en las cifras): ${timed.map((r) => `${r.task}/${r.arm}/${r.rep}`).join(', ')}`);

  const tasks = [];
  for (const task of [...new Set(rows.map((r) => r.task))].sort()) {
    const mine = rows.filter((r) => r.task === task);
    const arms = {};
    for (const a of [...new Set(mine.map((r) => r.arm))].sort()) arms[a] = armStats(mine.filter((r) => r.arm === a));
    const nA = arms.A ? arms.A.n : 0;
    const nB = arms.B ? arms.B.n : 0;
    const evidence = Math.min(nA, nB) >= 3 ? 'E3' : 'E2';
    const kind = kinds[task] || null;
    let decision;
    if (!arms.A || !arms.B) decision = { verdict: 'pendiente', reasons: ['falta un brazo'] };
    else if (kind === 'medium') decision = decideMedium(arms.A, arms.B, grades, task);
    else if (kind === 'small') decision = decideSmall(arms.A, arms.B);
    else decision = { verdict: 'pendiente', reasons: ['tipo de tarea no definido (medium o small): usá la configuración "tasks" o --medium / --small'] };
    tasks.push({ task, kind, arms, evidence, decision });
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
    out.push(`== ${t.task}${t.kind ? ` (${t.kind})` : ''} ==`);
    out.push(`evidence: ${t.evidence}`);
    for (const [a, s] of Object.entries(t.arms)) {
      const acc = s.accept ? `${s.accept.pass}/${s.accept.pass + s.accept.fail} tests (${s.accept.greenRuns}/${s.accept.runs} corridas sin fallas)` : 'sin dato';
      out.push(`${a}  n=${s.n}${s.timedOut ? ` (${s.timedOut} cortadas por tiempo)` : ''}`);
      out.push(`   tokens ponderados: ${range(s.tokens, 0)}`);
      out.push(`   costo USD: ${range(s.cost, 4)}`);
      out.push(`   tiempo de pared s: ${range(s.wall, 1)}`);
      out.push(`   agentes: ${range(s.agents, 1)}`);
      out.push(`   aceptación: ${acc}`);
    }
    out.push(`decisión: ${t.decision.verdict}`);
    for (const r of t.decision.reasons) out.push(`   - ${r}`);
    out.push('');
  }
  for (const n of res.notes) out.push(`nota: ${n}`);
  return out.join('\n').trimEnd();
}
