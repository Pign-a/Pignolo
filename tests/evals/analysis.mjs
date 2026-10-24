// Statistics for the pre-registered comparison of three arms (tests/evals/analysis-cli.mjs is the command line).
// Pure functions, no dependencies. The unit of analysis is the TASK: repetitions of a task and arm are collapsed first.
// Every ratio is test / control. Every output carries its n and never claims a difference the data do not show.
//
// Pre-registered rules implemented here (tests/evals/RESULTS-comparacion-3-brazos.md, section 7):
// - Non-inferiority of cost needs BOTH one-sided 95 % upper bounds of the geometric mean ratio below the margin: the
//   percentile / BCa bootstrap one and the t one, exp(mean(d) + t(0.95; n-1) * sd(d) / sqrt(n)) over the per-task log ratios d.
//   Both are reported and the verdict says which one binds (the larger).
// - A censored run (termination budget_cap or model_timeout, or censored=true) is valid: its cost enters as reported (a lower
//   bound) and it is never green. Every contrast reports the censored runs per arm and a descriptive sensitivity with their cost
//   doubled. Runs with invalid=true (infrastructure faults) are excluded and listed with their termination. Older CSVs without
//   these columns have no censored runs.
// - Per-protocol analysis: an arm whose runs carry no activation data at all (empty or n/a) is not filtered; "none" is data.
// - Holm adjusts only the primary contrasts (analyze option `primary`); the others are exploratory, without adjustment.
// - Cost sensitivities, both descriptive: censored runs with their cost doubled, and the ratio without the censored runs
//   (their task and arm cells are dropped, and the tasks that lose an arm).
// - Study B (analyzeReview, formatReviewText): review of diffs with seeded defects. The unit is the item; primary test is the
//   exact sign-flip permutation on the mean per-item recall difference with Holm over the primary contrasts only; verdict and
//   qualification ("more than double the unmatched findings") as written in the ficha, section 8.2.
// - restrictToTasks keeps one task set (validation or dev) so the formal analysis never mixes them.

// ---------------------------------------------------------------------------------------------------------------------
// Numeric basics
// ---------------------------------------------------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = Number(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Geometric mean of positive values; null when the list is empty or holds a value that is not positive.
export function geomean(xs) {
  if (!xs.length || xs.some((x) => !(x > 0))) return null;
  return Math.exp(mean(xs.map(Math.log)));
}

// Linear-interpolation quantile (type 7) of an already sorted array.
export function quantileSorted(sorted, p) {
  const n = sorted.length;
  if (!n) return null;
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

// Standard normal CDF. erf by the series with only positive terms (stable), good to about 1e-15.
function erf(x) {
  const ax = Math.abs(x);
  if (ax > 6) return Math.sign(x);
  const x2 = ax * ax;
  let term = ax;
  let sum = ax;
  for (let n = 1; n < 400; n += 1) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (term < 1e-17 * sum) break;
  }
  return Math.sign(x) * (2 / Math.sqrt(Math.PI)) * Math.exp(-x2) * sum;
}
export const normalCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

// Inverse of the normal CDF (Acklam's rational approximation, relative error about 1e-9).
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Student t distribution without dependencies: CDF through the regularized incomplete beta function and quantile by a numeric
// inverse of that CDF. Checked against table values in tests/analysis.test.js.
function logGamma(x) {
  const g = [57.1562356658629235, -59.5979603554754912, 14.1360979747417471, -0.491913816097620199, 0.339946499848118887e-4,
    0.465236289270485756e-4, -0.983744753048795646e-4, 0.158088703224912494e-3, -0.210264441724104883e-3, 0.217439618115212643e-3,
    -0.164318106536763890e-3, 0.844182239838527433e-4, -0.261908384015814087e-4, 0.368991826595316234e-5];
  let y = x;
  let tmp = x + 5.24218750000000000;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 0.999999999999997092;
  for (const c of g) { y += 1; ser += c / y; }
  return tmp + Math.log(2.5066282746310005 * ser / x);
}

// Continued fraction of the incomplete beta function (modified Lentz).
function betaContinuedFraction(x, a, b) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b).
export function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(x, a, b)) / a : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

export function studentTCdf(t, df) {
  if (!(df > 0) || Number.isNaN(t)) return NaN;
  if (t === 0) return 0.5;
  if (!Number.isFinite(df) || df > 1e7) return normalCdf(t);
  const tail = 0.5 * regularizedBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

// Quantile of Student's t: bisection on the CDF (monotone), to double precision. NaN when df is not positive.
export function studentTQuantile(p, df) {
  if (!(df > 0) || Number.isNaN(p)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  if (!Number.isFinite(df) || df > 1e7) return normalQuantile(p);
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  let lo = 0;
  let hi = 1;
  while (studentTCdf(hi, df) < p && hi < 1e300) { lo = hi; hi *= 2; }
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo <= 1e-14 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

// One-sided 95 % upper bound of the geometric mean ratio from the t distribution on the per-task log ratios:
// exp(mean(d) + t(0.95; n-1) * sd(d) / sqrt(n)). Needs n >= 2.
export function tUpperBound(logRatios, { level = 0.95 } = {}) {
  const n = logRatios.length;
  if (n < 2) return { n, df: n - 1, t: null, upperLog: null, upper: null };
  const mu = mean(logRatios);
  const sd = Math.sqrt(logRatios.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1));
  const t = studentTQuantile(level, n - 1);
  const upperLog = mu + (t * sd) / Math.sqrt(n);
  return { n, df: n - 1, t, upperLog, upper: Math.exp(upperLog) };
}

// ---------------------------------------------------------------------------------------------------------------------
// CSV of runs (the format of tests/evals/pignolo2-runs.csv)
// ---------------------------------------------------------------------------------------------------------------------

export function parseCsv(text) {
  const grid = [];
  let row = [];
  let field = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') q = false; else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') grid.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') grid.push(row); }
  if (!grid.length) return [];
  const head = grid[0];
  return grid.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}

const NUMERIC = ['rep', 'cost_usd', 'weighted_tokens', 'input', 'output', 'cache_read', 'cache_write', 'wall_s', 'duration_ms', 'turns',
  'agents', 'skill_calls', 'own_skill_calls', 'exit_code', 'accept_exit', 'accept_pass', 'accept_fail', 'accept_suites_failed',
  'full_pass', 'full_fail', 'full_baseline_fail', 'files_changed', 'lines_added', 'lines_removed', 'tsc_new_errors', 'eslint_new_errors',
  'out_of_scope_files', 'diff_lines', 'defects_total', 'defects_found', 'findings_total', 'findings_unmatched'];
const BOOLEAN = ['timed_out', 'contamination', 'is_error', 'invalid', 'censored'];
// Terminations that make a run censored (stopped by the model's own budget or time, not by a fault of the infrastructure).
const CENSORING_TERMINATIONS = new Set(['budget_cap', 'model_timeout']);

export function normalizeRow(r) {
  const o = { ...r };
  for (const k of NUMERIC) {
    if (!(k in o)) continue;
    o[k] = o[k] === '' || o[k] === null || o[k] === undefined || !Number.isFinite(Number(o[k])) ? null : Number(o[k]);
  }
  for (const k of BOOLEAN) o[k] = o[k] === true || o[k] === 'true';
  // A run is censored when its `censored` column says so or its `termination` is budget_cap / model_timeout.
  // Older CSVs have neither column: nothing is censored.
  if (CENSORING_TERMINATIONS.has(String(o.termination ?? '').trim())) o.censored = true;
  // diff_lines may not be a column: then it is lines added plus lines removed.
  if ((o.diff_lines === undefined || o.diff_lines === null) && (o.lines_added != null || o.lines_removed != null)) {
    o.diff_lines = (o.lines_added || 0) + (o.lines_removed || 0);
  }
  return o;
}

export const runId = (r) => `${r.task}/${r.arm}/${r.rep}`;

// Rows of the CSV: valid ones go to the analysis, invalid ones (invalid=true) are only listed, never dropped silently.
export function readRuns(text) {
  const all = parseCsv(text).map(normalizeRow);
  const rows = all.filter((r) => !r.invalid);
  const invalid = all.filter((r) => r.invalid).map((r) => ({
    run: runId(r), experiment: r.experiment || '', reason: r.invalid_reason || 'invalid',
    ...(r.termination ? { termination: r.termination } : {}),
  }));
  return { rows, invalid, experiments: [...new Set(all.map((r) => r.experiment).filter(Boolean))] };
}

// Green acceptance of one run (same rule as the harness summary).
// A censored run (budget cap or model timeout) is never green, whatever its acceptance columns say.
export function isGreen(r) {
  return !r.censored
    && r.accept_exit === 0
    && (r.accept_suites_failed == null || r.accept_suites_failed === 0)
    && r.accept_fail === 0 && r.accept_pass != null && r.accept_pass > 0;
}
// Runs that count for success: those with acceptance results and the censored ones (not green, even with no acceptance run).
const hasAccept = (r) => r.censored === true || (r.accept_pass != null && r.accept_fail != null);

const NO_ACTIVATION = new Set(['', 'none', 'n/a', 'na']);
// No activation data at all (column absent, empty or n/a): different from "none", which says the plugin did not activate.
const NO_ACTIVATION_DATA = new Set(['', 'n/a', 'na']);
export const hasActivationData = (row) => !NO_ACTIVATION_DATA.has(String(row.activation_via ?? '').trim().toLowerCase());
// Did the plugin of this run's arm activate? Arms without the concept (control, default N) always count.
export function activated(row, noActivationArms = ['N']) {
  if (noActivationArms.includes(row.arm)) return true;
  return !NO_ACTIVATION.has(String(row.activation_via ?? '').trim().toLowerCase());
}

// ---------------------------------------------------------------------------------------------------------------------
// Collapsing and pairing
// ---------------------------------------------------------------------------------------------------------------------

// Per task and arm, one value from the valid repetitions: 'geo' (geometric mean, for cost, time, tokens, turns),
// 'median' (for counts that can be zero) or 'mean'. Returns { task: { arm: value } }; cells with no usable value are absent.
export function collapse(rows, metric, { agg = 'geo' } = {}) {
  const groups = new Map();
  for (const r of rows) {
    if (r.invalid) continue;
    const v = r[metric];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const key = `${r.task}\u0000${r.arm}`;
    if (!groups.has(key)) groups.set(key, { task: r.task, arm: r.arm, v: [] });
    groups.get(key).v.push(v);
  }
  const table = {};
  for (const g of groups.values()) {
    const value = agg === 'geo' ? geomean(g.v) : agg === 'median' ? median(g.v) : mean(g.v);
    if (value === null) continue;
    (table[g.task] ||= {})[g.arm] = value;
  }
  return table;
}

// ln(test / control) per task. A task missing an arm is left out and listed. `shift` is added to both values first
// (use 1 for counts that can be zero).
export function pairedLogRatios(table, control, test, { shift = 0, tasks = null } = {}) {
  const out = { tasks: [], logRatios: [], excluded: [] };
  for (const task of (tasks || Object.keys(table)).sort()) {
    const cell = table[task] || {};
    const missing = [control, test].filter((a) => cell[a] === undefined);
    if (missing.length) { out.excluded.push({ task, reason: `falta el brazo ${missing.join(' y ')}` }); continue; }
    out.tasks.push(task);
    out.logRatios.push(Math.log((cell[test] + shift) / (cell[control] + shift)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Bootstrap of the mean (percentile or BCa) and sign-flip test
// ---------------------------------------------------------------------------------------------------------------------

// Bootstrap over tasks of the mean of `values`. method: 'percentile' | 'bca' | 'auto' (BCa when n >= 15).
// Returns the point estimate, two-sided 90 % and 95 % intervals and the one-sided 95 % upper bound, all on the scale of `values`.
export function bootstrapMeanCI(values, { resamples = 10000, seed = 1, method = 'auto' } = {}) {
  const n = values.length;
  if (n < 2) return { n, estimate: n ? values[0] : null, method: 'none', resamples: 0, ci90: null, ci95: null, upper95: null };
  const theta = mean(values);
  const used = method === 'auto' ? (n >= 15 ? 'bca' : 'percentile') : method;
  const rnd = mulberry32(seed);
  const means = new Float64Array(resamples);
  for (let b = 0; b < resamples; b += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += values[(rnd() * n) | 0];
    means[b] = s / n;
  }
  means.sort();
  let z0 = 0;
  let acc = 0;
  if (used === 'bca') {
    let below = 0;
    for (let b = 0; b < resamples; b += 1) if (means[b] < theta) below += 1;
    const prop = Math.min(resamples / (resamples + 1), Math.max(1 / (resamples + 1), below / resamples));
    z0 = normalQuantile(prop);
    const jack = values.map((_, i) => mean(values.filter((__, j) => j !== i)));
    const jm = mean(jack);
    let num = 0;
    let den = 0;
    for (const j of jack) { num += (jm - j) ** 3; den += (jm - j) ** 2; }
    acc = den > 0 ? num / (6 * den ** 1.5) : 0;
  }
  const at = (alpha) => {
    let p = alpha;
    if (used === 'bca') {
      const za = normalQuantile(alpha);
      const t = z0 + za;
      p = normalCdf(z0 + t / (1 - acc * t));
    }
    return quantileSorted(means, p);
  };
  return {
    n, estimate: theta, method: used, resamples,
    ci90: [at(0.05), at(0.95)],
    ci95: [at(0.025), at(0.975)],
    upper95: at(0.95),
  };
}

// Sign-flip (paired permutation) test of the mean difference being zero, two-sided.
// Exact (all 2^n sign patterns) when n <= 15, Monte Carlo (seeded) otherwise.
export function signFlipTest(diffs, { seed = 1, resamples = 10000, exactMax = 15 } = {}) {
  const n = diffs.length;
  if (!n) return { n, p: null, method: 'none' };
  const obs = Math.abs(diffs.reduce((s, x) => s + x, 0));
  const scale = diffs.reduce((s, x) => s + Math.abs(x), 0) || 1;
  const eps = 1e-12 * scale;
  if (n <= exactMax) {
    const total = 2 ** n;
    let count = 0;
    for (let mask = 0; mask < total; mask += 1) {
      let s = 0;
      for (let i = 0; i < n; i += 1) s += (mask >> i) & 1 ? diffs[i] : -diffs[i];
      if (Math.abs(s) >= obs - eps) count += 1;
    }
    return { n, p: count / total, method: 'exacto' };
  }
  const rnd = mulberry32(seed);
  let count = 0;
  for (let b = 0; b < resamples; b += 1) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += rnd() < 0.5 ? diffs[i] : -diffs[i];
    if (Math.abs(s) >= obs - eps) count += 1;
  }
  return { n, p: (1 + count) / (1 + resamples), method: `Monte Carlo (${resamples})` };
}

// Geometric mean ratio exp(mean(log ratios)) with bootstrap intervals and the sign-flip p value.
export function geometricMeanRatio(logRatios, { resamples = 10000, seed = 1, method = 'auto' } = {}) {
  const n = logRatios.length;
  if (!n) return { n: 0, ratio: null, ci90: null, ci95: null, upper95: null, upperT95: null, p: null, pMethod: 'none', ciMethod: 'none' };
  const b = bootstrapMeanCI(logRatios, { resamples, seed, method });
  const ex = (x) => (x === null || x === undefined ? null : Math.exp(x));
  const t = n >= 2 ? signFlipTest(logRatios, { seed, resamples }) : { p: null, method: 'none' };
  const tb = tUpperBound(logRatios);
  return {
    n,
    ratio: Math.exp(b.estimate),
    ci90: b.ci90 && b.ci90.map(ex),
    ci95: b.ci95 && b.ci95.map(ex),
    upper95: ex(b.upper95),
    upperT95: tb.upper,
    p: t.p,
    pMethod: t.method,
    ciMethod: b.method,
  };
}

// Non-inferiority (pre-registered double rule): true only when BOTH one-sided 95 % upper bounds of the ratio, the percentile / BCa
// bootstrap one (upper95) and the t one (upperT95), are below the margin. A ratio object with no upperT95 key at all (legacy
// callers) is judged on the bootstrap bound alone; a null upperT95 never passes.
export function nonInferiority(ratioCI, margin = 1.5) {
  const below = (u) => typeof u === 'number' && Number.isFinite(u) && u < margin;
  if (!ratioCI || !below(ratioCI.upper95)) return false;
  return ratioCI.upperT95 === undefined ? true : below(ratioCI.upperT95);
}

// Equivalence (TOST style, descriptive): the two-sided 90 % interval lies inside [1/m, m].
export function equivalence(ratioCI, m = 1.25) {
  const ci = ratioCI && ratioCI.ci90;
  return Array.isArray(ci) && ci[0] >= 1 / m && ci[1] <= m;
}

// Holm step-down adjustment, in the order of the input. null p values stay null.
export function holm(ps) {
  const idx = ps.map((p, i) => ({ p, i })).filter((x) => typeof x.p === 'number');
  idx.sort((a, b) => a.p - b.p);
  const m = idx.length;
  const out = ps.map(() => null);
  let run = 0;
  idx.forEach((x, k) => {
    run = Math.max(run, Math.min(1, (m - k) * x.p));
    out[x.i] = run;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Binary success
// ---------------------------------------------------------------------------------------------------------------------

const Z95 = 1.959963984540054;
export function wilson(k, n, z = Z95) {
  if (!(n > 0)) return { k, n, p: null, lower: null, upper: null };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { k, n, p, lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

function binomHalfCdf(k, n) {
  // P(X <= k), X ~ Bin(n, 1/2), by the exact sum of coefficients computed iteratively.
  let c = 1;
  let sum = 0;
  for (let i = 0; i <= k; i += 1) {
    sum += c;
    c = (c * (n - i)) / (i + 1);
  }
  return sum / 2 ** n;
}

// Exact McNemar on the discordant pairs: b = control only, c = test only. Two-sided binomial p.
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  return Math.min(1, 2 * binomHalfCdf(Math.min(b, c), n));
}

// pass^k = C(c,k) / C(n,k): chance that k repetitions drawn from n (c of them successes) are all successes.
export function passPowK(n, c, k) {
  if (!(k >= 1) || k > n || c < 0 || c > n) return null;
  if (c < k) return 0;
  let r = 1;
  for (let i = 0; i < k; i += 1) r *= (c - i) / (n - i);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ordinal judge scores
// ---------------------------------------------------------------------------------------------------------------------

// Wilcoxon signed-rank on paired differences, two-sided. Zero differences are dropped, ties get average ranks.
// Exact (permutation of the observed ranks, which stays valid with ties) for n <= 20, normal approximation with
// continuity correction above.
export function wilcoxonSignedRank(diffs, { exactMax = 20 } = {}) {
  const d = diffs.filter((x) => x !== 0);
  const n = d.length;
  const zeros = diffs.length - n;
  if (!n) return { n: 0, zeros, wPlus: 0, wMinus: 0, p: null, method: 'sin diferencias' };
  const order = d.map((x, i) => ({ a: Math.abs(x), s: x > 0, i })).sort((x, y) => x.a - y.a);
  const ranks = new Array(n);
  const tieSizes = [];
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && Math.abs(order[j + 1].a - order[i].a) < 1e-12 * (order[i].a || 1)) j += 1;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) ranks[k] = r;
    tieSizes.push(j - i + 1);
    i = j + 1;
  }
  let wPlus = 0;
  let wMinus = 0;
  order.forEach((o, k) => { if (o.s) wPlus += ranks[k]; else wMinus += ranks[k]; });
  const total = wPlus + wMinus;
  if (n <= exactMax) {
    // Distribution of W+ over the 2^n sign patterns, on doubled ranks so they are integers.
    const r2 = ranks.map((r) => Math.round(2 * r));
    const sumMax = r2.reduce((s, x) => s + x, 0);
    let dist = new Float64Array(sumMax + 1);
    dist[0] = 1;
    for (const r of r2) {
      const next = new Float64Array(sumMax + 1);
      for (let s = 0; s <= sumMax; s += 1) {
        if (dist[s]) { next[s] += dist[s]; next[s + r] += dist[s]; }
      }
      dist = next;
    }
    const obs = Math.abs(2 * Math.round(2 * wPlus) - sumMax);
    let count = 0;
    for (let s = 0; s <= sumMax; s += 1) if (dist[s] && Math.abs(2 * s - sumMax) >= obs) count += dist[s];
    return { n, zeros, wPlus, wMinus, p: Math.min(1, count / 2 ** n), method: 'exacto' };
  }
  const mu = total / 2;
  const tieAdj = tieSizes.reduce((s, t) => s + (t ** 3 - t), 0) / 48;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieAdj);
  const z = Math.max(0, Math.abs(wPlus - mu) - 0.5) / sigma;
  return { n, zeros, wPlus, wMinus, p: Math.min(1, 2 * (1 - normalCdf(z))), method: 'aproximación normal' };
}

// Win / tie / loss counts of paired differences where a positive difference is a win for the test arm.
export function winTieLoss(diffs) {
  return {
    wins: diffs.filter((x) => x > 0).length,
    ties: diffs.filter((x) => x === 0).length,
    losses: diffs.filter((x) => x < 0).length,
  };
}

const range = (xs) => (xs.length ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs) } : null);

// Judge analysis for one contrast over the tasks present in both arms. grades: [{task, arm, rep, correctness, quality, serious_findings}]
// `valid` is a Map "task/arm/rep" -> Set of run timestamps of the runs in this population; a grade of another run is ignored (and counted).
export function judgeAnalysis(grades, { test, control, tasks, valid = null }) {
  const out = { tasks: [], ignoredGrades: 0, scores: {} };
  const mine = [];
  for (const g of grades || []) {
    if (g.arm !== test && g.arm !== control) continue;
    if (valid) {
      const key = `${g.task}/${g.arm}/${g.rep}`;
      // A grade belongs to the run it was written for: same repetition and, when the grade says it, the same run timestamp.
      const stamps = valid.get(key);
      const stale = g.timestamp !== undefined && g.timestamp !== null && stamps !== undefined && !stamps.has(String(g.timestamp));
      if (stamps === undefined || stale) { out.ignoredGrades += 1; continue; }
    }
    mine.push(g);
  }
  const seriousOf = (g) => (Array.isArray(g.serious_findings) ? g.serious_findings.length : null);
  const dims = [
    { key: 'correctness', get: (g) => g.correctness, sign: 1, label: 'corrección' },
    { key: 'quality', get: (g) => g.quality, sign: 1, label: 'calidad' },
    { key: 'serious', get: seriousOf, sign: -1, label: 'hallazgos graves (menos es mejor)' },
  ];
  const perTaskArm = (task, arm, get) => median(mine.filter((g) => g.task === task && g.arm === arm).map(get).filter((x) => Number.isFinite(x)));
  const judgedTasks = (tasks || []).filter((t) => [test, control].every((a) => mine.some((g) => g.task === t && g.arm === a)));
  out.tasks = judgedTasks;
  for (const d of dims) {
    const rows = judgedTasks.map((t) => ({ task: t, test: perTaskArm(t, test, d.get), control: perTaskArm(t, control, d.get) }))
      .filter((r) => r.test !== null && r.control !== null);
    // A positive difference always means "the test arm is better".
    const diffs = rows.map((r) => d.sign * (r.test - r.control));
    const w = rows.length ? wilcoxonSignedRank(diffs) : { n: 0, p: null, method: 'sin datos' };
    out.scores[d.key] = {
      label: d.label, n: rows.length,
      testRange: range(rows.map((r) => r.test)), controlRange: range(rows.map((r) => r.control)),
      ...winTieLoss(diffs), wilcoxon: w, perTask: rows.map((r, i) => ({ task: r.task, test: r.test, control: r.control, diff: diffs[i] })),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Interpretation strings (Spanish) and verdicts
// ---------------------------------------------------------------------------------------------------------------------

export const MIN_TASKS = 8;
export const labelFor = (n) => (n < MIN_TASKS ? 'exploratorio' : 'confirmatorio');

const fx = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : 's/d');
const fci = (ci, d = 3) => (ci ? `[${fx(ci[0], d)}; ${fx(ci[1], d)}]` : 's/d');

// Never claims a difference when the 95 % interval contains 1.
export function interpretRatio(r, what = 'costo') {
  if (!r || r.n < 2 || !r.ci95) return `n insuficiente: sin diferencia demostrada en ${what}`;
  const [lo, hi] = r.ci95;
  if (r.n < MIN_TASKS) return `exploratorio (n = ${r.n}): sin diferencia demostrada en ${what}; razón ${fx(r.ratio)}, IC 95 % ${fci(r.ci95)}, no concluyente`;
  if (lo <= 1 && hi >= 1) return `sin diferencia demostrada en ${what} (IC 95 % ${fci(r.ci95)} contiene 1)`;
  return hi < 1
    ? `${what} menor en el brazo de prueba (razón ${fx(r.ratio)}, IC 95 % ${fci(r.ci95)})`
    : `${what} mayor en el brazo de prueba (razón ${fx(r.ratio)}, IC 95 % ${fci(r.ci95)})`;
}

const bootstrapName = (r) => (r && r.ciMethod === 'bca' ? 'BCa' : 'percentil');

// Verdict line of the double rule. `binds` is the bound that limits: the larger of the two ('bootstrap' or 't').
export function niVerdict(r, n, margin) {
  const pass = nonInferiority(r, margin);
  const hasT = r && r.upperT95 !== undefined;
  const below = (u) => typeof u === 'number' && Number.isFinite(u) && u < margin;
  const boundsPass = { bootstrap: below(r && r.upper95), t: hasT ? below(r.upperT95) : null };
  const boot = bootstrapName(r);
  let binds = 'bootstrap';
  if (hasT) {
    const ub = r.upper95;
    const ut = r.upperT95;
    binds = typeof ut === 'number' && (typeof ub !== 'number' || ut > ub) ? 't' : 'bootstrap';
  }
  const part = (label, u, ok) => `${label} ${fx(u, 3)} ${ok ? '<' : '>='} margen ${margin}`;
  const parts = [part(`cota superior unilateral 95 % ${boot}`, r && r.upper95, boundsPass.bootstrap)];
  if (hasT) parts.push(part('cota t', r.upperT95, boundsPass.t));
  const bindText = hasT ? `; limita la cota ${binds === 't' ? 't' : boot}` : '';
  const tail = `${parts.join(' y ')}${bindText}`;
  const out = { pass, binds, boundsPass };
  if (n < MIN_TASKS) return { ...out, text: `n insuficiente para decidir (n = ${n} tareas; ${tail}, solo descriptivo)` };
  return { ...out, text: pass ? `no inferioridad demostrada (las dos cotas bajo el margen): ${tail}` : `no inferioridad no demostrada (se exigen las dos cotas bajo el margen): ${tail}` };
}

function interpretP(p, favorTest, what, n = Infinity) {
  if (p === null || p === undefined) return `sin datos suficientes para ${what}`;
  if (n < MIN_TASKS) return `exploratorio (n = ${n}): sin diferencia demostrada en ${what} (p = ${fx(p)}), no concluyente`;
  if (p < 0.05) return favorTest ? `diferencia a favor del brazo de prueba en ${what} (p = ${fx(p)})` : `diferencia en contra del brazo de prueba en ${what} (p = ${fx(p)})`;
  return `sin diferencia demostrada en ${what} (p = ${fx(p)})`;
}

// ---------------------------------------------------------------------------------------------------------------------
// One contrast, one population
// ---------------------------------------------------------------------------------------------------------------------

const GEO_SECONDARY = [['wall_s', 'tiempo (s)'], ['turns', 'turnos'], ['weighted_tokens', 'tokens ponderados']];
const COUNT_SECONDARY = [['tsc_new_errors', 'errores nuevos de tsc'], ['eslint_new_errors', 'errores nuevos de eslint'],
  ['out_of_scope_files', 'archivos fuera de alcance'], ['diff_lines', 'líneas de diff']];

function secondary(rows, { test, control, tasks }) {
  const out = {};
  const specs = [...GEO_SECONDARY.map(([m, l]) => ({ m, l, agg: 'geo', shift: 0 })), ...COUNT_SECONDARY.map(([m, l]) => ({ m, l, agg: 'median', shift: 1 }))];
  for (const s of specs) {
    const table = collapse(rows, s.m, { agg: s.agg });
    const paired = pairedLogRatios(table, control, test, { shift: s.shift, tasks });
    if (!paired.tasks.length) { out[s.m] = { label: s.l, n: 0, note: 'sin datos' }; continue; }
    out[s.m] = {
      label: s.l, n: paired.tasks.length,
      test: range(paired.tasks.map((t) => table[t][test])), control: range(paired.tasks.map((t) => table[t][control])),
      ratio: Math.exp(mean(paired.logRatios)), ratioNote: s.shift ? 'razón geométrica de (x + 1)' : 'razón geométrica',
    };
  }
  return out;
}

function successAnalysis(rows, { test, control, tasks, rule }) {
  const evalRows = rows.filter(hasAccept);
  const solvedOf = (task, arm) => {
    const rs = evalRows.filter((r) => r.task === task && r.arm === arm);
    if (!rs.length) return null;
    const g = rs.filter(isGreen).length;
    const solved = rule === 'all' ? g === rs.length : rule === 'any' ? g > 0 : g > rs.length / 2;
    return { solved, n: rs.length, g };
  };
  const pairs = [];
  const excluded = [];
  for (const t of tasks) {
    const c = solvedOf(t, control);
    const x = solvedOf(t, test);
    if (!c || !x) { excluded.push({ task: t, reason: `sin aceptación evaluada en ${!c ? control : test}` }); continue; }
    pairs.push({ task: t, control: c, test: x });
  }
  const both = pairs.filter((p) => p.control.solved && p.test.solved).length;
  const controlOnly = pairs.filter((p) => p.control.solved && !p.test.solved).length;
  const testOnly = pairs.filter((p) => !p.control.solved && p.test.solved).length;
  const neither = pairs.length - both - controlOnly - testOnly;
  const runStat = (arm) => {
    const rs = evalRows.filter((r) => pairs.some((p) => p.task === r.task) && r.arm === arm);
    return wilson(rs.filter(isGreen).length, rs.length);
  };
  const taskStat = (arm) => wilson(pairs.filter((p) => p[arm === test ? 'test' : 'control'].solved).length, pairs.length);
  const powK = (arm) => {
    const side = arm === test ? 'test' : 'control';
    if (!pairs.length) return null;
    const k = Math.min(3, ...pairs.map((p) => p[side].n));
    return { k, value: mean(pairs.map((p) => passPowK(p[side].n, p[side].g, k))) };
  };
  const p = pairs.length ? mcnemarExact(controlOnly, testOnly) : null;
  return {
    n: pairs.length, rule, excluded,
    discordant: { controlOnly, testOnly, both, neither },
    mcnemarP: p,
    wilsonTasks: { [test]: taskStat(test), [control]: taskStat(control) },
    wilsonRuns: { [test]: runStat(test), [control]: runStat(control) },
    passPowK: { [test]: powK(test), [control]: powK(control) },
    interpretation: pairs.length ? interpretP(p, testOnly > controlOnly, 'el éxito de la aceptación', pairs.length) : 'sin datos de aceptación',
  };
}

function analyzePopulation(rows, { test, control, label, opts, grades }) {
  const cellRows = rows.filter((r) => r.arm === test || r.arm === control);
  const allTasks = [...new Set(cellRows.map((r) => r.task))].sort();
  const costTable = collapse(cellRows, 'cost_usd');
  const paired = pairedLogRatios(costTable, control, test, { tasks: allTasks });
  const n = paired.tasks.length;
  const ratio = geometricMeanRatio(paired.logRatios, { resamples: opts.resamples, seed: opts.seed, method: opts.method });
  const ni = niVerdict(ratio, n, opts.margin);
  const eq = equivalence(ratio, opts.equivMargin);
  const skipped = opts.skipActivation || [];
  const activation = {};
  for (const arm of [test, control]) {
    const armRows = (opts.allRows || rows).filter((r) => r.arm === arm);
    const act = armRows.filter((r) => activated(r, opts.noActivationArms)).length;
    if (opts.noActivationArms.includes(arm)) {
      activation[arm] = { runs: armRows.length, activated: armRows.length, rate: null, note: 'sin concepto de activación (siempre incluido)' };
    } else if (skipped.includes(arm)) {
      activation[arm] = { runs: armRows.length, activated: null, rate: null, note: `sin dato de activación en ninguna corrida (vacío o n/a): no se filtra por activación en ${arm}` };
    } else activation[arm] = { runs: armRows.length, activated: act, rate: armRows.length ? act / armRows.length : null };
  }
  const censored = {};
  for (const arm of [test, control]) {
    const armRows = cellRows.filter((r) => r.arm === arm);
    censored[arm] = { runs: armRows.length, censored: armRows.filter((r) => r.censored).length };
  }
  const valid = new Map();
  for (const r of cellRows) {
    if (!valid.has(runId(r))) valid.set(runId(r), new Set());
    valid.get(runId(r)).add(String(r.timestamp ?? ''));
  }
  return {
    population: label, n, label: labelFor(n), tasks: paired.tasks, excludedTasks: paired.excluded, activation, activationSkipped: skipped, censored,
    cost: {
      ratio: ratio.ratio, ci90: ratio.ci90, ci95: ratio.ci95, upper95: ratio.upper95, upperT95: ratio.upperT95, p: ratio.p, pMethod: ratio.pMethod, ciMethod: ratio.ciMethod,
      binds: ni.binds, boundsPass: ni.boundsPass,
      censoredSensitivity: censoredSensitivity(cellRows, { test, control, tasks: allTasks, ratio, opts }),
      withoutCensored: costWithoutCensored(cellRows, { test, control, tasks: allTasks, ratio, opts }),
      pAdjusted: null, nonInferior: ni.pass && n >= MIN_TASKS, nonInferiorityLine: ni.text, margin: opts.margin,
      equivalent: eq, equivalenceLine: `equivalencia (IC 90 % dentro de [${fx(1 / opts.equivMargin, 3)}; ${fx(opts.equivMargin, 3)}]): ${eq ? 'sí' : 'no'} (descriptivo)`,
      interpretation: interpretRatio(ratio, 'costo'),
    },
    success: successAnalysis(cellRows, { test, control, tasks: paired.tasks.length ? paired.tasks : allTasks, rule: opts.successRule }),
    judge: grades ? judgeAnalysis(grades, { test, control, tasks: paired.tasks, valid }) : null,
    secondary: secondary(cellRows, { test, control, tasks: paired.tasks }),
    costPerSolved: costPerSolved(cellRows, { test, control, tasks: paired.tasks }),
  };
}

// Descriptive sensitivity: the cost ratio recomputed as if the cost of each censored run had been twice what was reported.
// The reported cost of a censored run is a lower bound of what it would have cost, and doubling is a crude bound, not an estimate.
function censoredSensitivity(rows, { test, control, tasks, ratio, opts }) {
  const censoredRuns = rows.filter((r) => r.censored).length;
  if (!censoredRuns) {
    return { censoredRuns, ratio: ratio.ratio, upper95: ratio.upper95, upperT95: ratio.upperT95, line: `sensibilidad (descriptiva): sin corridas censuradas, coincide con el análisis (razón ${fx(ratio.ratio)})` };
  }
  const doubled = rows.map((r) => (r.censored && typeof r.cost_usd === 'number' ? { ...r, cost_usd: r.cost_usd * 2 } : r));
  const paired = pairedLogRatios(collapse(doubled, 'cost_usd'), control, test, { tasks });
  const g = geometricMeanRatio(paired.logRatios, { resamples: opts.resamples, seed: opts.seed, method: opts.method });
  return {
    censoredRuns, ratio: g.ratio, upper95: g.upper95, upperT95: g.upperT95,
    line: `sensibilidad (descriptiva, cota burda): si el costo de cada una de las ${censoredRuns} corridas censuradas se duplicara, la razón sería ${fx(g.ratio)} (cota ${bootstrapName(g)} ${fx(g.upper95)}, cota t ${fx(g.upperT95)}) en vez de ${fx(ratio.ratio)}`,
  };
}

// Descriptive sensitivity (ficha 7.8): the cost ratio without the censored runs. A task and arm cell with any censored run is dropped,
// and with it the task, which loses an arm.
function costWithoutCensored(rows, { test, control, tasks, ratio, opts }) {
  const cells = new Set(rows.filter((r) => r.censored).map((r) => `${r.task}\u0000${r.arm}`));
  const droppedTasks = [...new Set(rows.filter((r) => r.censored).map((r) => r.task))].filter((t) => tasks.includes(t)).sort();
  if (!cells.size) {
    return { censoredRuns: 0, n: ratio.n ?? null, droppedTasks, ratio: ratio.ratio, upper95: ratio.upper95, upperT95: ratio.upperT95, line: `sensibilidad sin las corridas censuradas (descriptiva): no hay corridas censuradas, coincide con el análisis (razón ${fx(ratio.ratio)})` };
  }
  const kept = rows.filter((r) => !cells.has(`${r.task}\u0000${r.arm}`));
  const paired = pairedLogRatios(collapse(kept, 'cost_usd'), control, test, { tasks });
  const g = geometricMeanRatio(paired.logRatios, { resamples: opts.resamples, seed: opts.seed, method: opts.method });
  return {
    censoredRuns: rows.filter((r) => r.censored).length, n: paired.tasks.length, droppedTasks, ratio: g.ratio, upper95: g.upper95, upperT95: g.upperT95,
    line: `sensibilidad sin las corridas censuradas (descriptiva): n = ${paired.tasks.length} tareas (se quitan ${droppedTasks.join(', ') || 'ninguna'}); razón ${fx(g.ratio)} (cota ${bootstrapName(g)} ${fx(g.upper95)}, cota t ${fx(g.upperT95)}) en vez de ${fx(ratio.ratio)}`,
  };
}

// Sum over tasks of the cost of one attempt (arithmetic mean of the repetitions) divided by the tasks with a green acceptance.
function costPerSolved(rows, { test, control, tasks }) {
  const out = {};
  for (const arm of [test, control]) {
    let cost = 0;
    let solved = 0;
    for (const t of tasks) {
      const rs = rows.filter((r) => r.task === t && r.arm === arm && typeof r.cost_usd === 'number');
      if (!rs.length) continue;
      cost += mean(rs.map((r) => r.cost_usd));
      const ev = rs.filter(hasAccept);
      if (ev.length && ev.filter(isGreen).length > ev.length / 2) solved += 1;
    }
    out[arm] = { cost, solved, perSolved: solved ? cost / solved : null };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Whole analysis
// ---------------------------------------------------------------------------------------------------------------------

export function parseContrasts(text) {
  return String(text).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const parts = s.split(':').map((x) => x.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) throw new Error(`contraste inválido "${s}": se espera PRUEBA:CONTROL, por ejemplo P:N`);
    return { test: parts[0], control: parts[1] };
  });
}

// The primary contrasts as "TEST:CONTROL" keys (null when none were given). Each must be among the requested ones.
function resolvePrimary(list, primary) {
  if (primary === null || primary === undefined) return null;
  const parsed = typeof primary === 'string' ? parseContrasts(primary) : primary;
  const keys = parsed.map((c) => `${c.test}:${c.control}`);
  for (const k of keys) {
    if (!list.some((c) => `${c.test}:${c.control}` === k)) throw new Error(`el contraste primario ${k} no está entre los contrastes pedidos (${list.map((c) => `${c.test}:${c.control}`).join(', ')})`);
  }
  return keys;
}

// rows: normalized valid rows. invalid: list from readRuns (reported as they are).
// `primary`: the pre-registered primary contrasts ("P:N,P:S" or a list); Holm adjusts only those and the rest are exploratory
// with no adjustment. Without it, every requested contrast is primary (null in the result tells so).
// `taskSet`: information about the task filter applied before (name, listed, missingTasks, droppedRuns), printed as is.
export function analyze(rows, {
  contrasts, primary = null, margin = 1.5, equivMargin = 1.25, seed = 1, resamples = 10000, method = 'auto', grades = null,
  noActivationArms = ['N'], successRule = 'majority', invalid = [], taskSet = null,
} = {}) {
  const valid = rows.filter((r) => !r.invalid);
  const opts = { margin, equivMargin, seed, resamples, method, noActivationArms, successRule };
  const list = (typeof contrasts === 'string' ? parseContrasts(contrasts) : contrasts) || [];
  const primaryKeys = resolvePrimary(list, primary);
  const results = list.map(({ test, control }) => {
    const inContrast = valid.filter((r) => r.arm === test || r.arm === control);
    // An arm whose runs carry no activation data at all (older CSV, or the harness could not tell) is not filtered in the
    // per-protocol analysis: filtering it would empty the arm. An explicit "none" is data and is filtered.
    const skipActivation = [test, control].filter((arm) => {
      const armRows = inContrast.filter((r) => r.arm === arm);
      return !noActivationArms.includes(arm) && armRows.length > 0 && armRows.every((r) => !hasActivationData(r));
    });
    const popOpts = { ...opts, allRows: inContrast, skipActivation };
    const itt = analyzePopulation(inContrast, { test, control, label: 'ITT (todas las corridas válidas)', opts: popOpts, grades });
    const pp = analyzePopulation(inContrast.filter((r) => skipActivation.includes(r.arm) || activated(r, noActivationArms)), {
      test, control, label: 'PP (solo corridas con el plugin activado)', opts: popOpts, grades,
    });
    const key = `${test}:${control}`;
    return { contrast: key, test, control, role: !primaryKeys || primaryKeys.includes(key) ? 'primario' : 'exploratorio', itt, pp };
  });
  for (const key of ['itt', 'pp']) {
    const prim = results.filter((r) => r.role === 'primario');
    const adj = holm(prim.map((r) => r[key].cost.p));
    prim.forEach((r, i) => { r[key].cost.pAdjusted = adj[i]; });
  }
  return {
    margin, equivMargin, seed, resamples, successRule, noActivationArms, primary: primaryKeys, taskSet,
    excludedRuns: invalid, contrasts: results,
  };
}

// Keeps only the runs (and the listed invalid runs) of the given tasks: the formal analysis must not mix in other task sets.
// Returns the filtered rows and invalid list, the number of valid runs dropped and the listed tasks that have no runs at all.
export function restrictToTasks({ rows, invalid = [] }, taskIds) {
  const wanted = new Set(taskIds);
  const present = new Set(rows.map((r) => r.task));
  const taskOfRun = (run) => run.split('/').slice(0, -2).join('/');
  const kept = rows.filter((r) => wanted.has(r.task));
  return {
    rows: kept,
    invalid: invalid.filter((e) => wanted.has(taskOfRun(e.run))),
    droppedRuns: rows.length - kept.length,
    missingTasks: [...wanted].filter((t) => !present.has(t)),
    listed: wanted.size,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Readable Spanish report
// ---------------------------------------------------------------------------------------------------------------------

const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)} %` : 's/d');
const rg = (r, d = 2) => (r ? `${fx(r.median, d)} [${fx(r.min, d)}–${fx(r.max, d)}]` : 's/d');

function formatPopulation(p, c) {
  const L = [];
  L.push(`  -- ${p.population} -- n = ${p.n} tareas (${p.label})`);
  L.push(`  tareas: ${p.tasks.join(', ') || '(ninguna)'}`);
  for (const e of p.excludedTasks) L.push(`  tarea excluida ${e.task}: ${e.reason}`);
  for (const [arm, a] of Object.entries(p.activation)) {
    L.push(`  activación ${arm}: ${a.rate === null ? a.note : `${a.activated} de ${a.runs} corridas (${pct(a.rate)})`}`);
  }
  const cs = Object.entries(p.censored).map(([arm, v]) => `${arm} ${v.censored} de ${v.runs}`).join(', ');
  L.push(`  corridas censuradas: ${cs} (tope de costo o de tiempo; válidas, cuentan como no verdes y su costo es una cota inferior)`);
  const k = p.cost;
  L.push(`  costo (razón ${c.test}/${c.control}, media geométrica por tarea): ${fx(k.ratio)}  IC 90 % ${fci(k.ci90)}  IC 95 % ${fci(k.ci95)}  cota sup. unilateral 95 % (${k.ciMethod}) ${fx(k.upper95)}  cota t unilateral 95 % ${fx(k.upperT95)}`);
  L.push(`    p (permutación de signos, ${k.pMethod}) = ${fx(k.p)}; p ajustado (Holm) = ${k.pAdjusted === null && c.role === 'exploratorio' ? 'no aplica (contraste exploratorio)' : fx(k.pAdjusted)}; intervalo: ${k.ciMethod}`);
  L.push(`    no inferioridad: ${k.nonInferiorityLine}`);
  L.push(`    ${k.equivalenceLine}`);
  L.push(`    interpretación: ${k.interpretation}`);
  L.push(`    ${k.censoredSensitivity.line}`);
  L.push(`    ${k.withoutCensored.line}`);
  const s = p.success;
  L.push(`  éxito de la aceptación (n = ${s.n} tareas, regla "${s.rule}"):`);
  L.push(`    discordantes: solo ${c.control} ${s.discordant.controlOnly}, solo ${c.test} ${s.discordant.testOnly}, ambos ${s.discordant.both}, ninguno ${s.discordant.neither}; McNemar exacto p = ${fx(s.mcnemarP)}`);
  for (const arm of [c.test, c.control]) {
    const t = s.wilsonTasks[arm];
    const r = s.wilsonRuns[arm];
    const pk = s.passPowK[arm];
    L.push(`    ${arm}: tareas ${t.k}/${t.n} Wilson 95 % [${fx(t.lower)}; ${fx(t.upper)}]; corridas ${r.k}/${r.n} [${fx(r.lower)}; ${fx(r.upper)}]${pk ? `; pass^${pk.k} = ${fx(pk.value)}` : ''}`);
  }
  L.push(`    interpretación: ${s.interpretation}`);
  if (p.judge) {
    L.push(`  jueces (n = ${p.judge.tasks.length} tareas con nota en ambos brazos${p.judge.ignoredGrades ? `; ${p.judge.ignoredGrades} notas ignoradas por corrida fuera de la población` : ''}):`);
    for (const d of Object.values(p.judge.scores)) {
      const w = d.wilcoxon;
      L.push(`    ${d.label}: mediana ${c.test} ${rg(d.testRange, 1)}, ${c.control} ${rg(d.controlRange, 1)}; gana/empata/pierde ${d.wins}/${d.ties}/${d.losses}; Wilcoxon (${w.method}, n efectivo ${w.n}) p = ${fx(w.p)}`);
      L.push(`      ${interpretP(w.p, d.wins > d.losses, d.label, d.n)}`);
    }
  } else L.push('  jueces: sin notas (usar --grades)');
  L.push('  métricas secundarias (descriptivas, sin prueba formal; mediana [rango] por tarea):');
  for (const m of Object.values(p.secondary)) {
    if (!m.n) { L.push(`    ${m.label}: sin datos`); continue; }
    L.push(`    ${m.label} (n = ${m.n}): ${c.test} ${rg(m.test)}, ${c.control} ${rg(m.control)}; ${m.ratioNote} ${fx(m.ratio)}`);
  }
  const cps = p.costPerSolved;
  L.push(`  costo por tarea resuelta: ${[c.test, c.control].map((a) => `${a} ${cps[a].perSolved === null ? 's/d' : fx(cps[a].perSolved, 3)} USD (${cps[a].solved} resueltas)`).join('; ')}`);
  return L;
}

export function formatText(result) {
  const L = [];
  L.push(`Análisis de contrastes (margen de no inferioridad ${result.margin}, equivalencia ${result.equivMargin}, semilla ${result.seed}, ${result.resamples} remuestreos)`);
  L.push(`Unidad de análisis: la tarea. Razones = prueba / control. Con menos de ${MIN_TASKS} tareas el resultado es exploratorio.`);
  L.push(`No inferioridad: se declara solo si las dos cotas superiores unilaterales del 95 % (bootstrap y t) quedan bajo el margen ${result.margin}.`);
  L.push(result.primary
    ? `Contrastes primarios (Holm): ${result.primary.join(', ')}; los demás son exploratorios y sin ajuste.`
    : 'Holm sobre todos los contrastes pedidos (no se indicó --primary).');
  const ts = result.taskSet;
  if (ts) {
    L.push(`Se analiza solo el conjunto de tareas "${ts.name}": ${ts.listed} listadas; ${ts.droppedRuns} corridas de otras tareas descartadas${ts.missingTasks.length ? `; sin corridas: ${ts.missingTasks.join(', ')}` : ''}.`);
  }
  for (const c of result.contrasts) {
    L.push('', `=== Contraste ${c.contrast} (prueba ${c.test}, control ${c.control}) — ${c.role === 'primario' ? 'primario' : 'exploratorio, sin ajuste'} ===`);
    L.push(...formatPopulation(c.itt, c));
    L.push(...formatPopulation(c.pp, c));
  }
  L.push('', `Corridas inválidas excluidas: ${result.excludedRuns.length}`);
  for (const e of result.excludedRuns) L.push(`  ${e.experiment ? `${e.experiment} ` : ''}${e.run}: ${e.reason}${e.termination ? ` (terminación: ${e.termination})` : ''}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Study B: review of diffs with seeded defects (ficha sections 6.2, 7.2 and 8.2). The unit of analysis is the ITEM.
// ---------------------------------------------------------------------------------------------------------------------

// "category=found/total|category2=found/total" -> { category: { found, total } }. Malformed parts are skipped.
export function parseCategories(text) {
  const out = {};
  for (const part of String(text ?? '').split('|')) {
    const m = /^\s*([^=|]+?)\s*=\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(part);
    if (m) out[m[1]] = { found: Number(m[2]), total: Number(m[3]) };
  }
  return out;
}

const spread = (xs) => (xs.length
  ? { items: xs.length, mean: mean(xs), median: median(xs), min: Math.min(...xs), max: Math.max(...xs) }
  : { items: 0, mean: null, median: null, min: null, max: null });

// Verdict of the pre-registered rule (8.2). Only primary contrasts with at least MIN_TASKS items with defects get one.
// Qualification: when the test arm wins on recall and has MORE THAN DOUBLE the unmatched findings per item of the control.
function reviewVerdict({ test, control, role, n, meanDiff, p, pAdjusted, unmatched }) {
  const diffText = `diferencia media de recall por ítem (${test} - ${control}) ${fx(meanDiff)}`;
  if (role !== 'primario') return { kind: 'exploratorio', qualified: false, text: `exploratorio, sin regla de decisión: ${diffText}, p sin ajuste = ${fx(p)}` };
  if (n < MIN_TASKS) return { kind: 'exploratorio', qualified: false, text: `exploratorio (n = ${n} ítems con defectos): sin veredicto, solo descriptivo; ${diffText}, p = ${fx(p)}` };
  const adj = `p ajustado (Holm) = ${fx(pAdjusted)}`;
  if (pAdjusted !== null && pAdjusted < 0.05 && meanDiff > 0) {
    const qualified = Number.isFinite(unmatched.test) && Number.isFinite(unmatched.control) && unmatched.test > 2 * unmatched.control;
    const base = `${test} encuentra más defectos que ${control} (${diffText}, ${adj})`;
    return {
      kind: 'mas', qualified,
      text: qualified
        ? `${base}: más defectos sembrados encontrados, con más hallazgos sin confirmar (hallazgos sin coincidencia por ítem: ${test} ${fx(unmatched.test, 2)} contra ${control} ${fx(unmatched.control, 2)}, más del doble); se informa además la muestra revisada a mano (6.2) para saber cuántos de esos hallazgos eran problemas reales`
        : base,
    };
  }
  if (pAdjusted !== null && pAdjusted < 0.05 && meanDiff < 0) return { kind: 'menos', qualified: false, text: `${test} encuentra menos defectos que ${control} (${diffText}, ${adj})` };
  return {
    kind: 'sin diferencia', qualified: false,
    text: `sin diferencia demostrada entre ${test} y ${control} (${diffText}, ${adj}); no es equivalencia: con ${n} ítems la ausencia de diferencia demostrada no prueba que sean iguales`,
  };
}

// rows: normalized valid rows of the review study (task = item id). Contrasts as in analyze(); Holm only over the primary ones.
export function analyzeReview(rows, { contrasts, primary = null, seed = 1, resamples = 10000, invalid = [], taskSet = null } = {}) {
  const valid = rows.filter((r) => !r.invalid);
  const list = (typeof contrasts === 'string' ? parseContrasts(contrasts) : contrasts) || [];
  const primaryKeys = resolvePrimary(list, primary);
  const scored = valid.filter((r) => typeof r.defects_total === 'number');
  const unscoredRuns = valid.filter((r) => typeof r.defects_total !== 'number').map(runId);
  const totals = new Map();
  for (const r of scored) totals.set(r.task, Math.max(totals.get(r.task) ?? 0, r.defects_total));
  const items = [...totals.keys()].sort();
  const defectItems = items.filter((i) => totals.get(i) > 0);
  const cleanItems = items.filter((i) => totals.get(i) === 0);
  const arms = [...new Set(list.flatMap((c) => [c.test, c.control]))];
  const cellRuns = (item, arm) => scored.filter((r) => r.task === item && r.arm === arm);
  // Recall of an item and arm: mean over its valid runs of defects_found / defects_total (normally one run).
  const recallOf = (item, arm) => {
    const rs = cellRuns(item, arm).filter((r) => r.defects_total > 0 && typeof r.defects_found === 'number');
    return rs.length ? mean(rs.map((r) => r.defects_found / r.defects_total)) : null;
  };
  const unmatchedOf = (item, arm) => {
    const rs = cellRuns(item, arm).filter((r) => typeof r.findings_unmatched === 'number');
    return rs.length ? mean(rs.map((r) => r.findings_unmatched)) : null;
  };

  const results = list.map(({ test, control }) => {
    const perItem = [];
    const excludedItems = [];
    for (const item of defectItems) {
      const t = recallOf(item, test);
      const c = recallOf(item, control);
      const missing = [control, test].filter((a, i) => (i ? t : c) === null);
      if (missing.length) { excludedItems.push({ item, reason: `falta el brazo ${missing.join(' y ')}` }); continue; }
      perItem.push({ item, test: t, control: c, diff: t - c, unmatchedTest: unmatchedOf(item, test), unmatchedControl: unmatchedOf(item, control) });
    }
    const diffs = perItem.map((x) => x.diff);
    const n = perItem.length;
    const flip = n ? signFlipTest(diffs, { seed, resamples }) : { p: null, method: 'sin datos' };
    const w = n ? wilcoxonSignedRank(diffs) : { n: 0, zeros: 0, p: null, method: 'sin datos' };
    const wtl = winTieLoss(diffs);
    const sign = wtl.wins + wtl.losses ? mcnemarExact(wtl.losses, wtl.wins) : null;
    const meanOf = (key) => { const xs = perItem.map((x) => x[key]).filter((x) => typeof x === 'number'); return xs.length ? mean(xs) : null; };
    const key = `${test}:${control}`;
    return {
      contrast: key, test, control, role: !primaryKeys || primaryKeys.includes(key) ? 'primario' : 'exploratorio',
      n, label: labelFor(n), perItem, excludedItems,
      recall: { test: n ? mean(perItem.map((x) => x.test)) : null, control: n ? mean(perItem.map((x) => x.control)) : null },
      meanDiff: n ? mean(diffs) : null, p: flip.p, pMethod: flip.method, pAdjusted: null,
      wilcoxon: w, signTest: { p: sign, n: wtl.wins + wtl.losses, method: 'exacto (ceros descartados)' }, ...wtl,
      unmatched: { test: meanOf('unmatchedTest'), control: meanOf('unmatchedControl') }, verdict: null,
    };
  });
  const prim = results.filter((r) => r.role === 'primario');
  const adj = holm(prim.map((r) => r.p));
  prim.forEach((r, i) => { r.pAdjusted = adj[i]; });
  for (const r of results) r.verdict = reviewVerdict(r);

  const armStats = {};
  for (const arm of arms) {
    const runs = scored.filter((r) => r.arm === arm);
    const defectRuns = runs.filter((r) => r.defects_total > 0);
    const k = defectRuns.reduce((a, r) => a + (r.defects_found || 0), 0);
    const tot = defectRuns.reduce((a, r) => a + r.defects_total, 0);
    const costRuns = runs.filter((r) => typeof r.cost_usd === 'number');
    const cost = costRuns.reduce((a, r) => a + r.cost_usd, 0);
    const perItemValues = (set) => set.map((i) => unmatchedOf(i, arm)).filter((x) => typeof x === 'number');
    const act = runs.filter((r) => hasActivationData(r));
    armStats[arm] = {
      runs: runs.length,
      censored: { runs: runs.length, censored: runs.filter((r) => r.censored).length },
      pooled: { ...wilson(k, tot), note: 'solo descriptivo: los defectos de un mismo ítem están agrupados y no son independientes, el intervalo es optimista' },
      clean: spread(perItemValues(cleanItems)),
      defectUnmatched: spread(perItemValues(defectItems)),
      findingsTotal: spread(defectItems.map((i) => { const rs = cellRuns(i, arm).filter((r) => typeof r.findings_total === 'number'); return rs.length ? mean(rs.map((r) => r.findings_total)) : null; }).filter((x) => typeof x === 'number')),
      cost: { total: cost, runs: costRuns.length }, costPerDefect: k > 0 && costRuns.length ? cost / k : null,
      costRange: range(costRuns.map((r) => r.cost_usd)),
      wall_s: range(runs.map((r) => r.wall_s).filter((x) => typeof x === 'number')),
      turns: range(runs.map((r) => r.turns).filter((x) => typeof x === 'number')),
      agents: range(runs.map((r) => r.agents).filter((x) => typeof x === 'number')),
      activation: act.length
        ? { runs: runs.length, activated: runs.filter((r) => hasActivationData(r) && activated(r, [])).length, withData: act.length }
        : { runs: runs.length, activated: null, withData: 0, note: 'sin dato de activación' },
    };
  }
  const byCategory = {};
  for (const arm of arms) {
    for (const r of scored.filter((x) => x.arm === arm && x.defects_total > 0)) {
      for (const [cat, v] of Object.entries(parseCategories(r.found_by_category))) {
        const cell = ((byCategory[cat] ||= {})[arm] ||= { found: 0, total: 0 });
        cell.found += v.found;
        cell.total += v.total;
      }
    }
  }
  for (const cat of Object.keys(byCategory)) for (const arm of arms) byCategory[cat][arm] ||= { found: 0, total: 0 };
  const incompleteItems = items.map((item) => ({ item, missingArms: arms.filter((a) => !cellRuns(item, a).length) })).filter((x) => x.missingArms.length);
  return {
    study: 'review', seed, primary: primaryKeys, taskSet, defectItems, cleanItems, incompleteItems, unscoredRuns,
    arms: armStats, byCategory: Object.fromEntries(Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b))),
    excludedRuns: invalid, contrasts: results,
  };
}

export function formatReviewText(result) {
  const L = [];
  L.push(`Estudio de revisión con defectos sembrados (semilla ${result.seed}). Unidad de análisis: el ítem. Recall del ítem = defectos encontrados / sembrados; razones y diferencias = prueba - control.`);
  L.push(`Con menos de ${MIN_TASKS} ítems con defectos el resultado es exploratorio y no hay veredicto. Los controles limpios se reportan aparte y no cambian el veredicto de recall.`);
  L.push(result.primary
    ? `Contrastes primarios (Holm): ${result.primary.join(', ')}; los demás son exploratorios y sin ajuste.`
    : 'Holm sobre todos los contrastes pedidos (no se indicó --primary).');
  const ts = result.taskSet;
  if (ts) L.push(`Se analiza solo el conjunto de ítems "${ts.name}": ${ts.listed} listados; ${ts.droppedRuns} corridas de otros ítems descartadas${ts.missingTasks.length ? `; sin corridas: ${ts.missingTasks.join(', ')}` : ''}.`);
  L.push(`Ítems con defectos (${result.defectItems.length}): ${result.defectItems.join(', ') || '(ninguno)'}; controles limpios (${result.cleanItems.length}): ${result.cleanItems.join(', ') || '(ninguno)'}`);
  for (const e of result.incompleteItems) L.push(`Ítem ${e.item} sin todos los brazos: falta ${e.missingArms.join(', ')}`);
  for (const r of result.unscoredRuns) L.push(`Corrida sin puntaje (defects_total vacío) fuera del análisis: ${r}`);
  for (const c of result.contrasts) {
    L.push('', `=== Contraste ${c.contrast} (prueba ${c.test}, control ${c.control}) — ${c.role === 'primario' ? 'primario' : 'exploratorio, sin ajuste'} ===`);
    L.push(`  n = ${c.n} ítems con defectos (${c.label})`);
    for (const e of c.excludedItems) L.push(`  ítem excluido ${e.item}: ${e.reason}`);
    L.push(`  recall medio por ítem: ${c.test} ${fx(c.recall.test)}, ${c.control} ${fx(c.recall.control)}; diferencia media (${c.test} - ${c.control}) ${fx(c.meanDiff)}; gana/empata/pierde ${c.wins}/${c.ties}/${c.losses}`);
    L.push(`  permutación de signos (${c.pMethod}, bilateral) p = ${fx(c.p)}; p ajustado (Holm) = ${c.pAdjusted === null && c.role === 'exploratorio' ? 'no aplica (contraste exploratorio)' : fx(c.pAdjusted)}`);
    L.push(`  sensibilidades: Wilcoxon (${c.wilcoxon.method}, n efectivo ${c.wilcoxon.n}) p = ${fx(c.wilcoxon.p)}; prueba del signo (${c.signTest.method}) p = ${fx(c.signTest.p)}`);
    L.push(`  hallazgos sin coincidencia por ítem con defectos: ${c.test} ${fx(c.unmatched.test, 2)}, ${c.control} ${fx(c.unmatched.control, 2)}`);
    L.push(`  veredicto: ${c.verdict.text}`);
  }
  L.push('', 'Por brazo (descriptivo):');
  for (const [arm, a] of Object.entries(result.arms)) {
    const pl = a.pooled;
    L.push(`  ${arm}: ${a.runs} corridas (censuradas ${a.censored.censored} de ${a.censored.runs})`);
    L.push(`    recall agregado por defecto: ${pl.k}/${pl.n} = ${fx(pl.p)}, Wilson 95 % [${fx(pl.lower)}; ${fx(pl.upper)}] (${pl.note})`);
    L.push(`    hallazgos sin coincidencia: controles limpios (falsos positivos del diff limpio, con la salvedad de que pueden ser problemas reales; n = ${a.clean.items}) mediana ${fx(a.clean.median, 1)} [${fx(a.clean.min, 0)}–${fx(a.clean.max, 0)}]; ítems con defectos (n = ${a.defectUnmatched.items}) media ${fx(a.defectUnmatched.mean, 2)}, mediana ${fx(a.defectUnmatched.median, 1)} [${fx(a.defectUnmatched.min, 0)}–${fx(a.defectUnmatched.max, 0)}]`);
    L.push(`    costo por defecto encontrado: ${a.costPerDefect === null ? 's/d' : `${fx(a.costPerDefect, 3)} USD`} (costo total ${fx(a.cost.total, 2)} USD de ${a.cost.runs} corridas, incluye los controles limpios)`);
    L.push(`    costo ${rg(a.costRange)} USD; tiempo ${rg(a.wall_s, 1)} s; turnos ${rg(a.turns, 1)}; agentes ${rg(a.agents, 1)} (mediana [rango] por corrida)`);
    L.push(`    activación: ${a.activation.activated === null ? a.activation.note : `${a.activation.activated} de ${a.activation.runs} corridas`}`);
  }
  L.push('', 'Recall por categoría (descriptivo, defectos sumados sobre los ítems con defectos; pocos defectos por categoría):');
  for (const [cat, perArm] of Object.entries(result.byCategory)) {
    L.push(`  categoría ${cat}: ${Object.entries(perArm).map(([arm, v]) => `${arm} ${v.found}/${v.total}`).join(', ')}`);
  }
  if (!Object.keys(result.byCategory).length) L.push('  (sin datos de categoría)');
  L.push('', `Corridas inválidas excluidas: ${result.excludedRuns.length}`);
  for (const e of result.excludedRuns) L.push(`  ${e.experiment ? `${e.experiment} ` : ''}${e.run}: ${e.reason}${e.termination ? ` (terminación: ${e.termination})` : ''}`);
  return L.join('\n');
}
