#!/usr/bin/env node
// Simulación de potencia de la comparación de tres brazos (N, S, P).
// Ficha: tests/evals/RESULTS-comparacion-3-brazos.md. Node >= 22, sin dependencias, PRNG con semilla.
//
// Modelo del log del costo por tarea t, brazo a y repetición k:
//   y[t,a,k] = mu + tau[t] + delta[a] + iota[t,a] + eps[t,a,k]
//   tau   ~ N(0, SIGMA_TASK^2)   efecto de la tarea, compartido por los tres brazos
//   iota  ~ N(0, sigma_int^2)    interacción tarea por brazo
//   eps   ~ N(0, SIGMA_W^2)      ruido entre corridas; se promedian las r repeticiones
// Brazo N: delta = 0 (control). Brazo S: delta = 0. Brazo P: delta = ln(razón verdadera).
// Contrastes: P contra N y P contra S, ambos con la diferencia de logs por tarea; el efecto de la
// tarea se cancela en la diferencia (ese es el sentido de aparear por tarea).
//
// Análisis simulado: media de las diferencias de log por tarea con bootstrap percentil sobre las
// tareas. Como el bootstrap percentil es equivariante a un corrimiento, la distribución bootstrap del
// ruido se calcula una vez por simulación y se reutiliza para todos los delta de la grilla (el mismo
// ruido para todos los delta: números aleatorios comunes). Es exacto, no una aproximación.
//
// Éxito binario: potencia exacta (sin simulación) del McNemar exacto sobre los pares discordantes,
// con éxitos independientes dentro de la tarea.

import { fileURLToPath } from 'node:url';

export const GRID = {
  sigmaTask: 0.6,
  sigmaW: 0.15,
  sigmaInt: [0.15, 0.25, 0.4],
  reps: [1, 2],
  ratios: [0.8, 1.0, 1.2, 1.5], // razón verdadera de costo P / control
  ns: [8, 12, 16, 20, 24, 30],
  niMargin: 1.5,
  equivMargin: 1.25,
  binary: [
    { id: 'igual', label: '0,9 contra 0,9', pP: 0.9, pN: 0.9 },
    { id: 'p-peor', label: 'P 0,7 contra N 0,9', pP: 0.7, pN: 0.9 },
    { id: 'p-mejor', label: 'P 0,9 contra N 0,7', pP: 0.9, pN: 0.7 },
  ],
};

// ---------- PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Semilla de cada celda derivada de la semilla maestra, para que el resultado no dependa del orden.
function subSeed(seed, ...parts) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (Math.round(p * 1000) + 0x7f4a7c15), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function makeNormal(rng) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u === 0) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// ---------- Bootstrap de la media ----------
// Devuelve los cuantiles de la distribución bootstrap de la media de d1 y de d2 (mismo remuestreo).
function bootQuantiles(d1, d2, boot, seed, probs) {
  const n = d1.length;
  let x = (seed | 0) || 123456789;
  const m1 = new Float64Array(boot);
  const m2 = new Float64Array(boot);
  for (let b = 0; b < boot; b++) {
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; // xorshift32
      const idx = (((x >>> 0) * n) / 4294967296) | 0;
      s1 += d1[idx];
      s2 += d2[idx];
    }
    m1[b] = s1 / n;
    m2[b] = s2 / n;
  }
  m1.sort();
  m2.sort();
  const q = (arr, p) => arr[Math.min(boot - 1, Math.max(0, Math.ceil(p * boot) - 1))];
  return [probs.map((p) => q(m1, p)), probs.map((p) => q(m2, p))];
}

// Cuantil 0,95 de la t de Student (aproximación de Cornish-Fisher, error < 0,01 desde 7 grados de libertad).
function tQuant95(df) {
  const z = 1.6448536269514722;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}
// Cota superior t unilateral del 95 % de la media de arr (sin sumar el efecto verdadero).
function tUpper(arr, tq) {
  const n = arr.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += arr[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (arr[i] - m) ** 2;
  return m + (tq * Math.sqrt(v / (n - 1))) / Math.sqrt(n);
}

function median(arr) {
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- Celda de costo ----------
// Probabilidades de los cuantiles: [0.0125, 0.05, 0.95, 0.9875]
const P_LO_HOLM = 0.0125, P_LO = 0.05, P_HI = 0.95, P_HI_HOLM = 0.9875;

function simulateCostCell({ seed, n, sigmaInt, r, sims, boot }) {
  const { sigmaTask, sigmaW, ratios, niMargin, equivMargin } = GRID;
  const rng = mulberry32(subSeed(seed, n, sigmaInt, r));
  const normal = makeNormal(rng);
  const sdRun = sigmaW / Math.sqrt(r);
  const lnNi = Math.log(niMargin);
  const lnEqHi = Math.log(equivMargin);
  const lnEqLo = -lnEqHi;
  const deltas = ratios.map(Math.log);
  const acc = deltas.map(() => ({ ni: 0, niBoth: 0, niDual: 0, niDualBoth: 0, det90: 0, detHolm: 0, equiv: 0 }));
  const tq = tQuant95(n - 1);
  const widths = [];
  const probs = [P_LO_HOLM, P_LO, P_HI, P_HI_HOLM];

  for (let s = 0; s < sims; s++) {
    const z1 = new Float64Array(n); // P menos N, sin el efecto verdadero
    const z2 = new Float64Array(n); // P menos S, sin el efecto verdadero
    for (let t = 0; t < n; t++) {
      const tau = sigmaTask * normal();
      const y = [0, 0, 0]; // N, S, P (promedio de las r repeticiones)
      for (let a = 0; a < 3; a++) y[a] = tau + sigmaInt * normal() + sdRun * normal();
      z1[t] = y[2] - y[0];
      z2[t] = y[2] - y[1];
    }
    const [[a1lo, a1l, a1h, a1hh], [a2lo, a2l, a2h, a2hh]] = bootQuantiles(
      z1, z2, boot, subSeed(seed, n, sigmaInt, r, s + 1), probs
    );
    void a2lo; void a2l; void a2hh;
    widths.push(a1h - a1l);
    const tb1 = tUpper(z1, tq), tb2 = tUpper(z2, tq); // cota superior t (log), sin el efecto verdadero
    deltas.forEach((d, i) => {
      const hi1 = d + a1h, lo1 = d + a1l, hi2 = d + a2h;
      const ni1 = hi1 < lnNi;
      if (ni1) acc[i].ni++;
      const ni2 = hi2 < lnNi;
      if (ni1 && ni2) acc[i].niBoth++;
      // Regla doble: la cota bootstrap Y la cota t por debajo del margen (en los dos contrastes para niDualBoth).
      const dual1 = ni1 && d + tb1 < lnNi;
      const dual2 = ni2 && d + tb2 < lnNi;
      if (dual1) acc[i].niDual++;
      if (dual1 && dual2) acc[i].niDualBoth++;
      if (lo1 > 0 || hi1 < 0) acc[i].det90++;
      if (d + a1lo > 0 || d + a1hh < 0) acc[i].detHolm++;
      if (lo1 > lnEqLo && hi1 < lnEqHi) acc[i].equiv++;
    });
  }
  const medianWidth = median(widths);
  return {
    n, sigma_int: sigmaInt, r,
    half_width_pct: (Math.exp(medianWidth / 2) - 1) * 100, // semiancho aproximado del IC 90 %, en %
    by_ratio: ratios.map((ratio, i) => ({
      ratio,
      ni: acc[i].ni / sims,
      ni_both: acc[i].niBoth / sims,
      ni_dual: acc[i].niDual / sims,
      ni_dual_both: acc[i].niDualBoth / sims,
      detect90: acc[i].det90 / sims,
      detect_holm: acc[i].detHolm / sims,
      equiv: acc[i].equiv / sims,
    })),
  };
}

// ---------- McNemar exacto ----------
function binomCdfTable(maxM) {
  // cdf[m][k] = P(Bin(m, 0.5) <= k)
  const cdf = [];
  for (let m = 0; m <= maxM; m++) {
    const row = [];
    let c = 1; // C(m, 0)
    let acc = 0;
    for (let k = 0; k <= m; k++) {
      acc += c / 2 ** m;
      row.push(Math.min(1, acc));
      c = (c * (m - k)) / (k + 1);
    }
    cdf.push(row);
  }
  return cdf;
}

export function mcnemarPower(n, pP, pN, alpha = 0.05) {
  const cdf = binomCdfTable(n);
  const qb = pP * (1 - pN); // P éxito y N fracaso
  const qc = (1 - pP) * pN; // P fracaso y N éxito
  const q0 = 1 - qb - qc;
  const lf = [0]; // log factorial
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i));
  let rejBetter = 0, rejWorse = 0;
  for (let b = 0; b <= n; b++) {
    for (let c = 0; b + c <= n; c++) {
      const m = b + c;
      if (m === 0) continue;
      const p = Math.min(1, 2 * cdf[m][Math.min(b, c)]);
      if (!(p < alpha)) continue;
      const rest = n - m;
      const logp = lf[n] - lf[b] - lf[c] - lf[rest]
        + (b ? b * Math.log(qb) : 0) + (c ? c * Math.log(qc) : 0) + (rest ? rest * Math.log(q0) : 0);
      const pr = Math.exp(logp);
      if (b > c) rejBetter += pr; else if (c > b) rejWorse += pr;
    }
  }
  return { reject: rejBetter + rejWorse, reject_p_better: rejBetter, reject_p_worse: rejWorse, discordant_expected: n * (qb + qc) };
}

// ---------- Corrida completa ----------
export function run({ seed = 20261023, sims = 1000, boot = 2000 } = {}) {
  const cost = [];
  for (const r of GRID.reps) {
    for (const sigmaInt of GRID.sigmaInt) {
      for (const n of GRID.ns) cost.push(simulateCostCell({ seed, n, sigmaInt, r, sims, boot }));
    }
  }
  const binary = [];
  for (const sc of GRID.binary) {
    for (const n of GRID.ns) binary.push({ scenario: sc.id, label: sc.label, pP: sc.pP, pN: sc.pN, n, ...mcnemarPower(n, sc.pP, sc.pN) });
  }
  return { meta: { seed, sims, boot, ...GRID }, cost, binary };
}

// ---------- Salida en Markdown ----------
const pc = (x) => (x * 100).toFixed(0);
const f2 = (x) => x.toFixed(2).replace('.', ',');
const rl = (ratio) => String(ratio).replace('.', ',');

function minN(cells, pick) {
  const hit = cells.find((c) => pick(c) >= 0.8);
  return hit ? String(hit.n) : `>${GRID.ns[GRID.ns.length - 1]}`;
}

export function toMarkdown(res) {
  const { meta } = res;
  const L = [];
  L.push(`Semilla ${meta.seed}; ${meta.sims} simulaciones por celda; ${meta.boot} remuestreos bootstrap; sigma_tarea ${f2(meta.sigmaTask)}, sigma_corrida ${f2(meta.sigmaW)}.`);
  L.push('');
  L.push('Columnas: **±%** semiancho mediano del IC 90 % de la razón de costos; **NI** probabilidad de declarar no inferioridad (cota superior unilateral del 95 % por bootstrap percentil < 1,5) según la razón verdadera P/control; **NI doble** lo mismo exigiendo además que la cota t (n-1 grados de libertad, en log) quede por debajo de 1,5; **Dif90** probabilidad de que el IC 90 % bilateral excluya 1; **DifHolm** igual con el IC 97,5 % (umbral del menor de los dos p con Holm); **Eq** probabilidad de que el IC 90 % quede dentro de [0,8; 1,25]. En la razón verdadera 1,5 las columnas NI son la tasa de error tipo I; en 1,0 las columnas Dif son la tasa de falsa alarma.');
  L.push('');
  for (const r of meta.reps) {
    for (const si of meta.sigmaInt) {
      L.push(`**r = ${r}, sigma_interacción = ${f2(si)}**`);
      L.push('');
      L.push('| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |');
      L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const c of res.cost.filter((x) => x.r === r && x.sigma_int === si)) {
        const g = (ratio) => c.by_ratio.find((x) => x.ratio === ratio);
        L.push(`| ${c.n} | ${c.half_width_pct.toFixed(0)} | ${pc(g(1.0).ni)} | ${pc(g(1.2).ni)} | ${pc(g(1.5).ni)} | ${pc(g(1.2).ni_dual)} | ${pc(g(1.5).ni_dual)} | ${pc(g(0.8).detect90)} | ${pc(g(1.0).detect90)} | ${pc(g(1.2).detect90)} | ${pc(g(0.8).detect_holm)} | ${pc(g(1.0).equiv)} |`);
      }
      L.push('');
    }
  }
  L.push('**Tareas mínimas de la grilla para potencia de al menos 0,8** (las probabilidades de las tablas anteriores, en %; "> 30" si ni 30 alcanza)');
  L.push('');
  L.push('| r | sigma_interacción | NI si razón 1,0 | NI si razón 1,2 | NI en los dos contrastes si razón 1,0 | NI doble si razón 1,2 | Detectar -20 % (razón 0,8), IC 90 % | Detectar -20 %, Holm | Detectar +20 % (razón 1,2), IC 90 % |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of meta.reps) {
    for (const si of meta.sigmaInt) {
      const cells = res.cost.filter((x) => x.r === r && x.sigma_int === si);
      const at = (ratio, key) => (c) => c.by_ratio.find((x) => x.ratio === ratio)[key];
      L.push(`| ${r} | ${f2(si)} | ${minN(cells, at(1.0, 'ni'))} | ${minN(cells, at(1.2, 'ni'))} | ${minN(cells, at(1.0, 'ni_both'))} | ${minN(cells, at(1.2, 'ni_dual'))} | ${minN(cells, at(0.8, 'detect90'))} | ${minN(cells, at(0.8, 'detect_holm'))} | ${minN(cells, at(1.2, 'detect90'))} |`);
    }
  }
  L.push('');
  L.push('**Éxito binario: McNemar exacto (potencia exacta, sin simulación; éxitos independientes dentro de la tarea; alfa bilateral 0,05).** "Rechaza" es cualquier rechazo; "P peor" y "P mejor" son rechazos en cada sentido.');
  L.push('');
  L.push('| Escenario | n | Pares discordantes esperados | Rechaza | P peor | P mejor |');
  L.push('|---|---|---|---|---|---|');
  for (const b of res.binary) {
    L.push(`| ${b.label} | ${b.n} | ${b.discordant_expected.toFixed(1).replace('.', ',')} | ${pc(b.reject)} | ${pc(b.reject_p_worse)} | ${pc(b.reject_p_better)} |`);
  }
  L.push('');
  return L.join('\n');
}

// ---------- CLI ----------
function parseArgs(argv) {
  const o = { seed: 20261023, sims: null, boot: null, quick: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quick') o.quick = true;
    else if (a === '--json') o.json = true;
    else if (a === '--seed' || a === '--sims' || a === '--boot') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${a} necesita un número positivo`);
      o[a.slice(2)] = v;
    } else throw new Error(`argumento desconocido: ${a}`);
  }
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const sims = o.sims ?? (o.quick ? 200 : 1000);
    const boot = o.boot ?? (o.quick ? 300 : 2000);
    const res = run({ seed: o.seed, sims, boot });
    process.stdout.write(o.json ? JSON.stringify(res, null, 1) + '\n' : toMarkdown(res) + '\n');
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}
