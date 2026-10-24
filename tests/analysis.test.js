'use strict';
// Tests del módulo de estadística de la comparación de tres brazos (tests/evals/analysis.mjs y analysis-cli.mjs).
// Datos sintéticos y respuestas conocidas; ninguno gasta tokens ni toca el CSV real.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const EVALS = path.join(__dirname, 'evals');
const CLI = path.join(EVALS, 'analysis-cli.mjs');
const load = () => import(pathToFileURL(path.join(EVALS, 'analysis.mjs')).href);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b} ± ${tol}, obtenido ${a}`);

// Normal(0, 1) con el generador sembrado del módulo (Box-Muller).
function normals(m, seed) {
  const rnd = m.mulberry32(seed);
  return () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
}

const COLS = ['experiment', 'task', 'arm', 'rep', 'timestamp', 'cost_usd', 'wall_s', 'turns', 'accept_exit', 'accept_pass', 'accept_fail', 'invalid', 'invalid_reason',
  'activation_via', 'tsc_new_errors', 'eslint_new_errors', 'out_of_scope_files', 'diff_lines', 'termination', 'censored', 'note'];
const cell = (v) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols = COLS) => [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
const run = (task, arm, rep, extra = {}) => ({
  experiment: 'x', task, arm, rep, timestamp: `ts-${task}-${arm}-${rep}`, cost_usd: 1, wall_s: 60, turns: 10, accept_exit: 0, accept_pass: 5, accept_fail: 0,
  invalid: 'false', activation_via: arm === 'N' ? '' : 'skill_tool', tsc_new_errors: 0, eslint_new_errors: 0, out_of_scope_files: 0, diff_lines: 20, ...extra,
});

test('mulberry32 es determinista y distinto con otra semilla', async () => {
  const m = await load();
  const a = m.mulberry32(7); const b = m.mulberry32(7); const c = m.mulberry32(8);
  const xs = [a(), a(), a()];
  assert.deepStrictEqual(xs, [b(), b(), b()]);
  assert.notStrictEqual(xs[0], c());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('normalCdf y normalQuantile coinciden con valores conocidos', async () => {
  const m = await load();
  near(m.normalCdf(0), 0.5, 1e-12);
  near(m.normalCdf(1.959963984540054), 0.975, 1e-9);
  near(m.normalCdf(-1), 0.15865525393145707, 1e-9);
  near(m.normalQuantile(0.975), 1.959963984540054, 1e-6);
  near(m.normalQuantile(0.05), -1.6448536269514722, 1e-6);
  near(m.normalQuantile(0.5), 0, 1e-12);
});

test('lector de CSV: campos entre comillas, comillas dobles, comas y saltos de línea dentro del campo', async () => {
  const m = await load();
  const text = 'task,arm,note,cost_usd\r\nt1,A,"con, coma",1.5\r\nt2,B,"dice ""hola""\nsegunda línea",2\r\n';
  const rows = m.parseCsv(text);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].note, 'con, coma');
  assert.strictEqual(rows[1].note, 'dice "hola"\nsegunda línea');
  assert.strictEqual(rows[1].cost_usd, '2');
});

test('readRuns separa las corridas inválidas y las lista con su razón', async () => {
  const m = await load();
  const text = toCsv([
    run('t1', 'P', 1), run('t1', 'N', 1),
    run('t2', 'P', 1, { invalid: 'true', invalid_reason: 'contaminated;escaped_cwd', note: 'raro, "citado"' }),
    run('t2', 'N', 1, { cost_usd: '' }),
  ]);
  const r = m.readRuns(text);
  assert.strictEqual(r.rows.length, 3);
  assert.deepStrictEqual(r.invalid, [{ run: 't2/P/1', experiment: 'x', reason: 'contaminated;escaped_cwd' }]);
  assert.strictEqual(r.rows[2].cost_usd, null);
  assert.strictEqual(r.rows[0].cost_usd, 1);
  assert.deepStrictEqual(r.experiments, ['x']);
});

test('collapse: media geométrica por tarea y brazo, ignora inválidas y celdas sin valor', async () => {
  const m = await load();
  const rows = [
    { task: 't1', arm: 'P', rep: 1, cost_usd: 2 }, { task: 't1', arm: 'P', rep: 2, cost_usd: 8 },
    { task: 't1', arm: 'P', rep: 3, cost_usd: 1000, invalid: true },
    { task: 't1', arm: 'N', rep: 1, cost_usd: 5 }, { task: 't2', arm: 'N', rep: 1, cost_usd: null },
  ];
  const t = m.collapse(rows, 'cost_usd');
  near(t.t1.P, 4, 1e-12);
  assert.strictEqual(t.t1.N, 5);
  assert.strictEqual(t.t2, undefined);
  const med = m.collapse([{ task: 'a', arm: 'P', tsc_new_errors: 0 }, { task: 'a', arm: 'P', tsc_new_errors: 4 }, { task: 'a', arm: 'P', tsc_new_errors: 1 }], 'tsc_new_errors', { agg: 'median' });
  assert.strictEqual(med.a.P, 1);
});

test('pairedLogRatios: ln(prueba/control) por tarea y lista las tareas sin un brazo', async () => {
  const m = await load();
  const table = { t1: { N: 2, P: 4 }, t2: { N: 3, P: 3 }, t3: { N: 1 }, t4: { P: 9 } };
  const r = m.pairedLogRatios(table, 'N', 'P');
  assert.deepStrictEqual(r.tasks, ['t1', 't2']);
  near(r.logRatios[0], Math.log(2), 1e-12);
  assert.strictEqual(r.logRatios[1], 0);
  assert.deepStrictEqual(r.excluded.map((e) => e.task), ['t3', 't4']);
  assert.match(r.excluded[0].reason, /P/);
  const shifted = m.pairedLogRatios({ a: { N: 0, P: 1 } }, 'N', 'P', { shift: 1 });
  near(shifted.logRatios[0], Math.log(2), 1e-12);
});

test('prueba de permutación de signos: p exacto en casos calculados a mano', async () => {
  const m = await load();
  assert.strictEqual(m.signFlipTest([1, 2, 3]).p, 0.25); // solo todo + y todo - llegan a |6|: 2 de 8
  assert.strictEqual(m.signFlipTest([3, -1, 2]).p, 0.5); // |6|, |4|, |4|, |6|: 4 de 8
  assert.strictEqual(m.signFlipTest([0.5, 1, 1.5, 2]).p, 0.125);
  assert.strictEqual(m.signFlipTest([1, -1]).p, 1);
  assert.strictEqual(m.signFlipTest([1, 2, 3]).method, 'exacto');
  assert.strictEqual(m.signFlipTest([]).p, null);
});

test('prueba de permutación de signos: Monte Carlo sembrado cuando n > 15', async () => {
  const m = await load();
  const same = Array.from({ length: 20 }, (_, i) => 0.1 + i / 100);
  const a = m.signFlipTest(same, { seed: 3 });
  const b = m.signFlipTest(same, { seed: 3 });
  assert.match(a.method, /Monte Carlo/);
  assert.strictEqual(a.p, b.p);
  assert.ok(a.p < 0.001, `p ${a.p}`);
  const sym = Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : -1) * (1 + i / 10));
  assert.ok(m.signFlipTest(sym, { seed: 3 }).p > 0.5);
});

test('bootstrap: determinista por semilla, contiene la media, y el intervalo de 90 % está dentro del de 95 %', async () => {
  const m = await load();
  const v = [0.1, 0.4, -0.2, 0.3, 0.25, 0.05, 0.5, -0.1];
  const a = m.bootstrapMeanCI(v, { seed: 5, resamples: 2000 });
  const b = m.bootstrapMeanCI(v, { seed: 5, resamples: 2000 });
  const c = m.bootstrapMeanCI(v, { seed: 6, resamples: 2000 });
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.ci95, c.ci95);
  assert.strictEqual(a.method, 'percentile'); // n < 15
  near(a.estimate, v.reduce((s, x) => s + x, 0) / v.length, 1e-12);
  assert.ok(a.ci95[0] < a.estimate && a.estimate < a.ci95[1]);
  assert.ok(a.ci95[0] <= a.ci90[0] && a.ci90[1] <= a.ci95[1]);
  near(a.upper95, a.ci90[1], 1e-12); // en el percentil, la cota unilateral 95 % es el extremo superior del 90 %
  const big = m.bootstrapMeanCI(Array.from({ length: 16 }, (_, i) => (i - 7) / 10), { resamples: 500 });
  assert.strictEqual(big.method, 'bca'); // auto: BCa desde n = 15
  assert.strictEqual(m.bootstrapMeanCI([1]).ci95, null);
});

test('bootstrap: cobertura del intervalo de 90 % sobre 400 conjuntos sintéticos (n = 16 tareas, verdadero 0, sigma 0,3)', async () => {
  const m = await load();
  const z = normals(m, 20261023);
  const out = { percentile: { hit: 0, upper: 0 }, bca: { hit: 0, upper: 0 } };
  const sets = 400;
  for (let s = 0; s < sets; s += 1) {
    const data = Array.from({ length: 16 }, () => 0.3 * z());
    for (const method of ['percentile', 'bca']) {
      const b = m.bootstrapMeanCI(data, { resamples: 800, seed: s + 1, method });
      if (b.ci90[0] <= 0 && 0 <= b.ci90[1]) out[method].hit += 1;
      if (b.upper95 >= 0) out[method].upper += 1;
    }
  }
  for (const method of ['percentile', 'bca']) {
    const cov = out[method].hit / sets;
    const up = out[method].upper / sets;
    assert.ok(cov >= 0.85 && cov <= 0.95, `${method}: cobertura del IC 90 % ${cov}`);
    assert.ok(up >= 0.90 && up <= 0.99, `${method}: cobertura de la cota superior 95 % ${up}`);
  }
});

test('geometricMeanRatio: razón constante da intervalo degenerado; mezcla da razón = exp(media de logs)', async () => {
  const m = await load();
  const k = m.geometricMeanRatio(Array(6).fill(Math.log(1.2)), { resamples: 500 });
  near(k.ratio, 1.2, 1e-12);
  near(k.ci95[0], 1.2, 1e-9);
  near(k.upper95, 1.2, 1e-9);
  const g = m.geometricMeanRatio([Math.log(2), Math.log(0.5), Math.log(4)], { resamples: 500 });
  near(g.ratio, Math.exp((Math.log(2) + Math.log(0.5) + Math.log(4)) / 3), 1e-12);
  assert.strictEqual(g.n, 3);
  assert.strictEqual(m.geometricMeanRatio([]).ratio, null);
});

test('no inferioridad y equivalencia: casos verdadero y falso', async () => {
  const m = await load();
  assert.strictEqual(m.nonInferiority({ upper95: 1.3 }, 1.5), true);
  assert.strictEqual(m.nonInferiority({ upper95: 1.5 }, 1.5), false); // estricto
  assert.strictEqual(m.nonInferiority({ upper95: 1.7 }, 1.5), false);
  assert.strictEqual(m.nonInferiority({ upper95: 1.45 }), true); // margen por defecto 1,5
  assert.strictEqual(m.nonInferiority({ upper95: null }, 1.5), false);
  assert.strictEqual(m.equivalence({ ci90: [0.85, 1.2] }, 1.25), true);
  assert.strictEqual(m.equivalence({ ci90: [0.75, 1.2] }, 1.25), false); // 1/1,25 = 0,8
  assert.strictEqual(m.equivalence({ ci90: [0.9, 1.3] }, 1.25), false);
  assert.strictEqual(m.equivalence({ ci90: [0.9, 1.3] }, 1.5), true);
});

test('Holm: ajuste escalonado, monótono, tope en 1 y nulos intactos', async () => {
  const m = await load();
  const adj = m.holm([0.01, 0.04, 0.03]);
  near(adj[0], 0.03, 1e-12);
  near(adj[1], 0.06, 1e-12);
  near(adj[2], 0.06, 1e-12);
  assert.deepStrictEqual(m.holm([0.6, 0.9]), [1, 1]);
  assert.deepStrictEqual(m.holm([0.02]), [0.02]);
  assert.deepStrictEqual(m.holm([null, 0.01, 0.2]), [null, 0.02, 0.2]);
});

test('Wilson: 18/20 da 0,699 a 0,972; casos de borde', async () => {
  const m = await load();
  const w = m.wilson(18, 20);
  near(w.lower, 0.699, 0.001);
  near(w.upper, 0.972, 0.001);
  near(w.p, 0.9, 1e-12);
  const z = m.wilson(0, 10);
  assert.strictEqual(z.lower, 0);
  near(z.upper, 0.2775, 0.001);
  assert.strictEqual(m.wilson(0, 0).lower, null);
});

test('McNemar exacto: 5 contra 1 da 0,21875; sin discordantes da 1', async () => {
  const m = await load();
  near(m.mcnemarExact(5, 1), 0.21875, 1e-12);
  near(m.mcnemarExact(1, 5), 0.21875, 1e-12);
  assert.strictEqual(m.mcnemarExact(0, 0), 1);
  near(m.mcnemarExact(10, 0), 2 / 1024, 1e-12);
  assert.strictEqual(m.mcnemarExact(3, 3), 1);
});

test('pass^k = C(c,k)/C(n,k)', async () => {
  const m = await load();
  near(m.passPowK(5, 3, 2), 3 / 10, 1e-12); // C(3,2)/C(5,2)
  near(m.passPowK(6, 4, 3), 4 / 20, 1e-12); // C(4,3)/C(6,3)
  assert.strictEqual(m.passPowK(5, 5, 5), 1);
  assert.strictEqual(m.passPowK(5, 1, 2), 0);
  assert.strictEqual(m.passPowK(3, 3, 4), null);
  near(m.passPowK(4, 2, 1), 0.5, 1e-12);
});

test('Wilcoxon de rangos con signo: exacto a mano, ceros descartados, empates con rangos promedio', async () => {
  const m = await load();
  // |0,5|,|1|,|2|,|3|,|4| tienen rangos 1..5; W- = 1, W+ = 14: solo 4 de 32 patrones llegan tan lejos.
  const a = m.wilcoxonSignedRank([1, 2, 3, 4, -0.5]);
  assert.strictEqual(a.wPlus, 14);
  assert.strictEqual(a.wMinus, 1);
  assert.strictEqual(a.p, 0.125);
  assert.strictEqual(a.method, 'exacto');
  const z = m.wilcoxonSignedRank([1, 2, 0, 3]);
  assert.strictEqual(z.n, 3);
  assert.strictEqual(z.zeros, 1);
  assert.strictEqual(z.p, 0.25);
  // Empates: |1|,|1|,|1| comparten el rango 2 y |2| tiene el 4; W+ = 8, W- = 2; 8 de 16 patrones: p = 0,5.
  const t = m.wilcoxonSignedRank([1, 1, -1, 2]);
  assert.strictEqual(t.wPlus, 8);
  assert.strictEqual(t.wMinus, 2);
  assert.strictEqual(t.p, 0.5);
  assert.strictEqual(m.wilcoxonSignedRank([0, 0]).p, null);
});

test('Wilcoxon: aproximación normal con corrección de continuidad por encima de 20', async () => {
  const m = await load();
  const w = m.wilcoxonSignedRank(Array.from({ length: 25 }, (_, i) => 1 + i));
  assert.match(w.method, /normal/);
  assert.strictEqual(w.wPlus, 325);
  near(w.p, 1.31e-5, 2e-6); // z = (162,5 - 0,5) / 37,17
  const balanced = m.wilcoxonSignedRank(Array.from({ length: 24 }, (_, i) => (i % 2 ? -1 : 1) * (1 + i)));
  assert.ok(balanced.p > 0.5);
});

test('ganadas, empates y pérdidas', async () => {
  const m = await load();
  assert.deepStrictEqual(m.winTieLoss([1, 0, -2, 3, 0]), { wins: 2, ties: 2, losses: 1 });
});

test('activated: el control N siempre cuenta; none, n/a y vacío no', async () => {
  const m = await load();
  assert.strictEqual(m.activated({ arm: 'N', activation_via: '' }), true);
  assert.strictEqual(m.activated({ arm: 'N', activation_via: 'none' }), true);
  assert.strictEqual(m.activated({ arm: 'P', activation_via: 'skill_tool' }), true);
  assert.strictEqual(m.activated({ arm: 'P', activation_via: 'both' }), true);
  for (const v of ['none', 'n/a', '', undefined]) assert.strictEqual(m.activated({ arm: 'P', activation_via: v }), false);
  assert.strictEqual(m.activated({ arm: 'S', activation_via: '' }, ['N', 'S']), true);
});

test('parseContrasts: PRUEBA:CONTROL y errores claros', async () => {
  const m = await load();
  assert.deepStrictEqual(m.parseContrasts('P:N, P:S'), [{ test: 'P', control: 'N' }, { test: 'P', control: 'S' }]);
  assert.throws(() => m.parseContrasts('P'), /PRUEBA:CONTROL/);
  assert.throws(() => m.parseContrasts('P:P'), /PRUEBA:CONTROL/);
});

// Diez tareas: P cuesta 1,2 veces N en todas; P no se activa en t09 y t10.
function tenTasks() {
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    const t = `t${String(i).padStart(2, '0')}`;
    rows.push(run(t, 'N', 1, { cost_usd: 1 + i / 10 }));
    rows.push(run(t, 'P', 1, { cost_usd: (1 + i / 10) * 1.2, activation_via: i > 8 ? 'none' : 'skill_tool' }));
  }
  return rows;
}

test('analyze: ITT y por protocolo se separan por activación y cada uno imprime su n y la tasa de activación', async () => {
  const m = await load();
  const rows = m.readRuns(toCsv(tenTasks())).rows;
  const res = m.analyze(rows, { contrasts: 'P:N', seed: 1, resamples: 500 });
  const c = res.contrasts[0];
  assert.strictEqual(c.itt.n, 10);
  assert.strictEqual(c.pp.n, 8);
  assert.deepStrictEqual(c.pp.excludedTasks.map((e) => e.task), ['t09', 't10']);
  assert.strictEqual(c.itt.activation.P.activated, 8);
  assert.strictEqual(c.itt.activation.P.rate, 0.8);
  assert.strictEqual(c.itt.activation.N.rate, null);
  assert.match(c.itt.activation.N.note, /sin concepto de activación/);
  near(c.itt.cost.ratio, 1.2, 1e-9);
  near(c.pp.cost.ratio, 1.2, 1e-9);
  assert.strictEqual(c.itt.label, 'confirmatorio');
  assert.strictEqual(c.itt.cost.nonInferior, true); // 1,2 < 1,5, razón constante
  assert.match(c.itt.cost.nonInferiorityLine, /no inferioridad demostrada/);
  assert.strictEqual(c.itt.cost.equivalent, true); // 1,2 dentro de [0,8; 1,25]
  // La razón es constante, así que el intervalo no contiene a 1: se dice con palabras y sin sobreafirmar.
  assert.match(c.itt.cost.interpretation, /costo mayor en el brazo de prueba/);
});

test('analyze: con menos de 8 tareas es exploratorio y no decide la no inferioridad', async () => {
  const m = await load();
  const rows = m.readRuns(toCsv(tenTasks().filter((r) => Number(r.task.slice(1)) <= 5))).rows;
  const c = m.analyze(rows, { contrasts: 'P:N', resamples: 500 }).contrasts[0];
  assert.strictEqual(c.itt.n, 5);
  assert.strictEqual(c.itt.label, 'exploratorio');
  assert.match(c.itt.cost.nonInferiorityLine, /n insuficiente para decidir/);
  assert.strictEqual(c.itt.cost.nonInferior, false);
  // Con n pequeño el intervalo puede excluir 1 y aun así no se afirma una diferencia.
  assert.ok(c.itt.cost.ci95[0] > 1);
  assert.match(c.itt.cost.interpretation, /exploratorio \(n = 5\): sin diferencia demostrada/);
  assert.doesNotMatch(c.itt.cost.interpretation, /menor|mayor/);
  const text = m.formatText(m.analyze(rows, { contrasts: 'P:N', resamples: 500 }));
  assert.match(text, /n = 5 tareas \(exploratorio\)/);
});

test('analyze: un intervalo que contiene 1 se interpreta como sin diferencia demostrada', async () => {
  const m = await load();
  const rows = [];
  const mult = [0.8, 1.25, 0.9, 1.1, 1.0, 0.7, 1.4, 1.05];
  mult.forEach((k, i) => {
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: 2 }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: 2 * k }));
  });
  const c = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 2000 }).contrasts[0];
  assert.ok(c.itt.cost.ci95[0] < 1 && c.itt.cost.ci95[1] > 1);
  assert.match(c.itt.cost.interpretation, /sin diferencia demostrada/);
  assert.doesNotMatch(c.itt.cost.interpretation, /menor|mayor/);
});

test('analyze: tareas sin un brazo quedan fuera del contraste y listadas; las repeticiones se colapsan antes', async () => {
  const m = await load();
  const rows = [
    run('a', 'N', 1, { cost_usd: 1 }), run('a', 'N', 2, { cost_usd: 4 }), run('a', 'P', 1, { cost_usd: 2 }),
    run('b', 'N', 1, { cost_usd: 1 }), run('b', 'S', 1, { cost_usd: 1 }),
    run('c', 'P', 1, { cost_usd: 1 }), run('c', 'N', 1, { cost_usd: 1 }),
  ];
  const c = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 200 }).contrasts[0];
  assert.deepStrictEqual(c.itt.tasks, ['a', 'c']);
  assert.deepStrictEqual(c.itt.excludedTasks.map((e) => e.task), ['b']);
  // t a: geomean(1, 4) = 2 en N, 2 en P -> razón 1; t c: razón 1.
  near(c.itt.cost.ratio, 1, 1e-12);
});

test('analyze: éxito binario con tabla de discordantes, McNemar, Wilson y costo por tarea resuelta', async () => {
  const m = await load();
  const rows = [];
  // 8 tareas: N resuelve 1-5, P resuelve 3-8. Solo N: 1,2; solo P: 6,7,8; ambas: 3,4,5; ninguna: ninguna.
  for (let i = 1; i <= 8; i += 1) {
    const t = `t${i}`;
    const nOk = i <= 5;
    const pOk = i >= 3;
    rows.push(run(t, 'N', 1, { cost_usd: 1, accept_fail: nOk ? 0 : 2 }));
    rows.push(run(t, 'P', 1, { cost_usd: 2, accept_fail: pOk ? 0 : 2 }));
  }
  const s = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 200 }).contrasts[0].itt.success;
  assert.deepStrictEqual(s.discordant, { controlOnly: 2, testOnly: 3, both: 3, neither: 0 });
  near(s.mcnemarP, m.mcnemarExact(2, 3), 1e-12);
  assert.strictEqual(s.wilsonTasks.P.k, 6);
  assert.strictEqual(s.wilsonTasks.N.k, 5);
  assert.strictEqual(s.wilsonTasks.N.n, 8);
  assert.match(s.interpretation, /sin diferencia demostrada/);
  const cps = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 200 }).contrasts[0].itt.costPerSolved;
  near(cps.N.perSolved, 8 / 5, 1e-12); // 8 USD en total, 5 resueltas
  near(cps.P.perSolved, 16 / 6, 1e-12);
});

test('analyze: notas de jueces por tarea, ganadas/empates/pérdidas, Wilcoxon, y notas de corridas fuera de la población ignoradas', async () => {
  const m = await load();
  const rows = tenTasks();
  const grades = [];
  rows.forEach((r) => {
    const i = Number(r.task.slice(1));
    // P mejor en corrección en las tareas 1-6, igual en 7-8, peor en 9-10.
    const corr = r.arm === 'N' ? 3 : i <= 6 ? 4 : i <= 8 ? 3 : 2;
    grades.push({ task: r.task, arm: r.arm, rep: r.rep, correctness: corr, quality: 3, serious_findings: r.arm === 'N' ? ['a'] : [] });
  });
  grades.push({ task: 't01', arm: 'P', rep: 9, correctness: 0, quality: 0, serious_findings: [] }); // sin corrida: se ignora
  const res = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 200, grades });
  const j = res.contrasts[0].itt.judge;
  assert.strictEqual(j.ignoredGrades, 1);
  assert.strictEqual(j.tasks.length, 10);
  const c = j.scores.correctness;
  assert.deepStrictEqual([c.wins, c.ties, c.losses], [6, 2, 2]);
  assert.strictEqual(c.wilcoxon.n, 8); // los 2 empates se descartan
  near(c.wilcoxon.p, m.wilcoxonSignedRank([1, 1, 1, 1, 1, 1, -1, -1]).p, 1e-12);
  const q = j.scores.quality;
  assert.deepStrictEqual([q.wins, q.ties, q.losses], [0, 10, 0]);
  assert.strictEqual(q.wilcoxon.p, null);
  // Hallazgos graves: P tiene 0 y N tiene 1 en todas, y menos es mejor: diez ganadas.
  assert.strictEqual(j.scores.serious.wins, 10);
  assert.strictEqual(c.testRange.median, 4);
  // En PP quedan 8 tareas: las notas de t09 y t10 de P se ignoran.
  const pp = res.contrasts[0].pp.judge;
  assert.strictEqual(pp.tasks.length, 8);
  assert.ok(pp.ignoredGrades >= 3);
});

test('analyze: una nota con marca de tiempo de otra corrida (corrida rehecha) se ignora', async () => {
  const m = await load();
  const rows = m.readRuns(toCsv(tenTasks())).rows;
  const grades = rows.map((r) => ({
    task: r.task, arm: r.arm, rep: r.rep, timestamp: r.arm === 'P' && r.task === 't01' ? 'otra-corrida' : r.timestamp,
    correctness: 3, quality: 3, serious_findings: [],
  }));
  const j = m.analyze(rows, { contrasts: 'P:N', resamples: 100, grades }).contrasts[0].itt.judge;
  assert.strictEqual(j.ignoredGrades, 1);
  assert.strictEqual(j.tasks.length, 9);
});

test('analyze: Holm corrige el p de costo entre contrastes', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    const t = `t${i}`;
    rows.push(run(t, 'N', 1, { cost_usd: 1 + i / 10 }));
    rows.push(run(t, 'P', 1, { cost_usd: (1 + i / 10) * (1.1 + i / 100) }));
    rows.push(run(t, 'S', 1, { cost_usd: (1 + i / 10) * 0.9 }));
  }
  const res = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N,P:S', resamples: 200 });
  const [a, b] = res.contrasts;
  near(a.itt.cost.p, 2 / 256, 1e-12); // todos los signos iguales, n = 8
  near(a.itt.cost.pAdjusted, Math.min(1, 2 * (2 / 256)), 1e-12);
  assert.ok(b.itt.cost.pAdjusted >= b.itt.cost.p);
  assert.deepStrictEqual(m.holm([a.itt.cost.p, b.itt.cost.p]), [a.itt.cost.pAdjusted, b.itt.cost.pAdjusted]);
});

test('analyze: métricas secundarias con mediana y rango, y razón geométrica descriptiva', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 4; i += 1) {
    rows.push(run(`t${i}`, 'N', 1, { wall_s: 100, turns: 10, diff_lines: 10, tsc_new_errors: 0 }));
    rows.push(run(`t${i}`, 'P', 1, { wall_s: 200, turns: 10, diff_lines: 19, tsc_new_errors: 1 }));
  }
  const s = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 100 }).contrasts[0].itt.secondary;
  near(s.wall_s.ratio, 2, 1e-12);
  near(s.turns.ratio, 1, 1e-12);
  near(s.diff_lines.ratio, 20 / 11, 1e-12); // (19 + 1) / (10 + 1)
  near(s.tsc_new_errors.ratio, 2, 1e-12); // (1 + 1) / (0 + 1)
  near(s.wall_s.test.median, 200, 1e-9);
  near(s.wall_s.control.min, 100, 1e-9);
});

test('formatText: bloque legible en español con n, listas de excluidas y corridas inválidas', async () => {
  const m = await load();
  const csv = toCsv([...tenTasks(), run('t01', 'P', 2, { invalid: 'true', invalid_reason: 'contaminated' })]);
  const r = m.readRuns(csv);
  const res = m.analyze(r.rows, { contrasts: 'P:N', resamples: 300, invalid: r.invalid });
  const text = m.formatText(res);
  assert.match(text, /Contraste P:N/);
  assert.match(text, /ITT \(todas las corridas válidas\)/);
  assert.match(text, /PP \(solo corridas con el plugin activado\)/);
  assert.match(text, /n = 10 tareas \(confirmatorio\)/);
  assert.match(text, /n = 8 tareas/);
  assert.match(text, /Corridas inválidas excluidas: 1/);
  assert.match(text, /t01\/P\/2: contaminated/);
  assert.match(text, /activación P: 8 de 10 corridas \(80\.0 %\)/);
  JSON.stringify(res); // serializable
});

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------

function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('CLI: lee un CSV sintético, imprime el bloque en español y lista las corridas inválidas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const csv = path.join(dir, 'runs.csv');
    fs.writeFileSync(csv, toCsv([...tenTasks(), run('t01', 'P', 2, { invalid: 'true', invalid_reason: 'escaped_cwd', note: 'con, coma' })]));
    const r = cli(['--csv', csv, '--contrasts', 'P:N', '--margin', '1.5', '--seed', '1', '--resamples', '300']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Contraste P:N/);
    assert.match(r.stdout, /no inferioridad demostrada/);
    assert.match(r.stdout, /t01\/P\/2: escaped_cwd/);
    const j = cli(['--csv', csv, '--contrasts', 'P:N', '--seed', '1', '--resamples', '300', '--json']);
    assert.strictEqual(j.status, 0, j.stderr);
    const out = JSON.parse(j.stdout);
    assert.strictEqual(out.contrasts[0].itt.n, 10);
    assert.strictEqual(out.contrasts[0].pp.n, 8);
    assert.deepStrictEqual(out.excludedRuns.map((e) => e.run), ['t01/P/2']);
    // Misma semilla, misma salida.
    assert.strictEqual(cli(['--csv', csv, '--contrasts', 'P:N', '--seed', '1', '--resamples', '300', '--json']).stdout, j.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: notas de jueces con --grades y errores claros con entradas malas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const rows = tenTasks();
    const csv = path.join(dir, 'runs.csv');
    fs.writeFileSync(csv, toCsv(rows));
    const gradesFile = path.join(dir, 'grades.json');
    fs.writeFileSync(gradesFile, JSON.stringify(rows.map((r) => ({ task: r.task, arm: r.arm, rep: r.rep, correctness: r.arm === 'P' ? 4 : 3, quality: 3, serious_findings: [] }))));
    const r = cli(['--csv', csv, '--contrasts', 'P:N', '--grades', gradesFile, '--resamples', '200']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /jueces \(n = 10 tareas/);
    assert.match(r.stdout, /gana\/empata\/pierde 10\/0\/0/);
    assert.notStrictEqual(cli([]).status, 0);
    const noCsv = cli(['--csv', path.join(dir, 'no-existe.csv'), '--contrasts', 'P:N']);
    assert.notStrictEqual(noCsv.status, 0);
    assert.match(noCsv.stderr, /no-existe\.csv/);
    const bad = cli(['--csv', csv, '--contrasts', 'PN']);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /PRUEBA:CONTROL/);
    // Dos experimentos en el mismo CSV: se exige elegir uno.
    const multi = path.join(dir, 'multi.csv');
    fs.writeFileSync(multi, toCsv([...rows, run('z', 'N', 1, { experiment: 'calib' })]));
    const m1 = cli(['--csv', multi, '--contrasts', 'P:N']);
    assert.notStrictEqual(m1.status, 0);
    assert.match(m1.stderr, /--experiment/);
    const m2 = cli(['--csv', multi, '--contrasts', 'P:N', '--experiment', 'x', '--resamples', '100']);
    assert.strictEqual(m2.status, 0, m2.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Segunda versión: cota t, corridas censuradas, conjunto de tareas, Holm solo en los primarios
// ---------------------------------------------------------------------------------------------------------------------

test('cuantil t de Student: valores de tabla, simetría e ida y vuelta con la CDF', async () => {
  const m = await load();
  near(m.studentTQuantile(0.95, 7), 1.8946, 5e-5);
  near(m.studentTQuantile(0.95, 15), 1.7531, 5e-5);
  near(m.studentTQuantile(0.95, 19), 1.7291, 5e-5);
  near(m.studentTQuantile(0.975, 15), 2.1314, 5e-5);
  near(m.studentTQuantile(0.975, 1), 12.7062, 1e-3); // Cauchy
  near(m.studentTQuantile(0.95, 2), 2.9200, 1e-4);
  near(m.studentTQuantile(0.05, 7), -1.8946, 5e-5);
  near(m.studentTQuantile(0.5, 9), 0, 1e-12);
  near(m.studentTQuantile(0.975, 1e6), 1.959964, 1e-4); // tiende a la normal
  near(m.studentTCdf(1.8946, 7), 0.95, 1e-5);
  near(m.studentTCdf(0, 4), 0.5, 1e-12);
  for (const df of [3, 7, 19]) for (const p of [0.6, 0.9, 0.99]) near(m.studentTCdf(m.studentTQuantile(p, df), df), p, 1e-9);
  assert.ok(Number.isNaN(m.studentTQuantile(0.95, 0)));
});

test('cota t unilateral: media + t(0,95; n-1) * s / raiz(n) sobre los logaritmos', async () => {
  const m = await load();
  const logs = [0.1, 0.4, -0.2, 0.3, 0.25, 0.05, 0.5, -0.1];
  const mu = logs.reduce((s, x) => s + x, 0) / 8;
  const sd = Math.sqrt(logs.reduce((s, x) => s + (x - mu) ** 2, 0) / 7);
  const b = m.tUpperBound(logs);
  near(b.upper, Math.exp(mu + 1.894579 * sd / Math.sqrt(8)), 1e-5);
  assert.strictEqual(b.df, 7);
  const k = m.geometricMeanRatio(logs, { resamples: 300 });
  near(k.upperT95, b.upper, 1e-12);
  const flat = m.tUpperBound(Array(5).fill(Math.log(1.2)));
  near(flat.upper, 1.2, 1e-12); // sin dispersión, la cota es la razón
  assert.strictEqual(m.tUpperBound([0.3]).upper, null);
  assert.strictEqual(m.geometricMeanRatio([]).upperT95, null);
});

test('no inferioridad con regla doble: hacen falta las dos cotas por debajo del margen', async () => {
  const m = await load();
  assert.strictEqual(m.nonInferiority({ upper95: 1.4, upperT95: 1.45 }, 1.5), true);
  assert.strictEqual(m.nonInferiority({ upper95: 1.4, upperT95: 1.6 }, 1.5), false);
  assert.strictEqual(m.nonInferiority({ upper95: 1.6, upperT95: 1.4 }, 1.5), false);
  assert.strictEqual(m.nonInferiority({ upper95: 1.4, upperT95: null }, 1.5), false);
  assert.strictEqual(m.nonInferiority({ upper95: 1.4, upperT95: 1.5 }, 1.5), false); // estricto
  const fails = m.niVerdict({ upper95: 1.4, upperT95: 1.6, ciMethod: 'percentile' }, 10, 1.5);
  assert.strictEqual(fails.pass, false);
  assert.strictEqual(fails.binds, 't');
  assert.match(fails.text, /no inferioridad no demostrada/);
  assert.match(fails.text, /percentil 1\.400 < margen 1\.5/);
  assert.match(fails.text, /cota t 1\.600 >= margen 1\.5/);
  assert.match(fails.text, /limita la cota t/);
  const bca = m.niVerdict({ upper95: 1.45, upperT95: 1.3, ciMethod: 'bca' }, 20, 1.5);
  assert.strictEqual(bca.pass, true);
  assert.strictEqual(bca.binds, 'bootstrap');
  assert.match(bca.text, /no inferioridad demostrada/);
  assert.match(bca.text, /BCa 1\.450/);
  assert.match(bca.text, /limita la cota BCa/);
  assert.match(m.niVerdict({ upper95: 1.2, upperT95: 1.3, ciMethod: 'percentile' }, 5, 1.5).text, /n insuficiente para decidir.*cota t 1\.300/);
});

test('analyze: la cota percentil pasa, la cota t falla y la no inferioridad no se declara', async () => {
  const m = await load();
  const mult = [1, 1, 1.1, 1.2, 1.2, 1.3, 1.3, 2.4];
  const rows = [];
  mult.forEach((k, i) => {
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: 2 }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: 2 * k }));
  });
  const res = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 2000, seed: 1, method: 'percentile' });
  const k = res.contrasts[0].itt.cost;
  assert.ok(k.upper95 < 1.5, `percentil ${k.upper95}`);
  assert.ok(k.upperT95 >= 1.5, `t ${k.upperT95}`);
  assert.strictEqual(k.nonInferior, false);
  assert.strictEqual(k.binds, 't');
  assert.deepStrictEqual(k.boundsPass, { bootstrap: true, t: false });
  assert.match(k.nonInferiorityLine, /no inferioridad no demostrada/);
  assert.match(k.nonInferiorityLine, /limita la cota t/);
  assert.match(m.formatText(res), /cota t unilateral 95 %/);
});

test('corridas censuradas: son válidas, su costo entra tal cual y cuentan como no verdes aunque la aceptación diga verde', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: 1, termination: 'ok', censored: 'false' }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: 1, termination: 'ok', censored: 'false' }));
  }
  // t1: P llegó al tope y no tiene columnas de aceptación; t2: P cortada por tiempo con aceptación en verde (no vale).
  Object.assign(rows[1], { cost_usd: 2, termination: 'budget_cap', censored: 'true', accept_exit: '', accept_pass: '', accept_fail: '' });
  Object.assign(rows[3], { cost_usd: 3, termination: 'model_timeout', censored: 'true' });
  const read = m.readRuns(toCsv(rows));
  assert.strictEqual(read.rows.length, 16); // ninguna se descarta
  assert.strictEqual(read.rows.filter((r) => r.censored).length, 2);
  const c = m.analyze(read.rows, { contrasts: 'P:N', resamples: 200 }).contrasts[0].itt;
  near(c.cost.ratio, Math.exp((Math.log(2) + Math.log(3)) / 8), 1e-12); // el costo entra tal como se informó
  assert.deepStrictEqual(c.success.discordant, { controlOnly: 2, testOnly: 0, both: 6, neither: 0 });
  assert.strictEqual(c.success.wilsonTasks.P.k, 6);
  assert.strictEqual(c.success.wilsonRuns.P.n, 8); // la censurada sin aceptación cuenta como corrida evaluada
  assert.deepStrictEqual(c.censored, { P: { runs: 8, censored: 2 }, N: { runs: 8, censored: 0 } });
  assert.strictEqual(m.isGreen({ accept_exit: 0, accept_fail: 0, accept_pass: 5, censored: true }), false);
  assert.strictEqual(m.isGreen({ accept_exit: 0, accept_fail: 0, accept_pass: 5, censored: false }), true);
  const text = m.formatText(m.analyze(read.rows, { contrasts: 'P:N', resamples: 200 }));
  assert.match(text, /corridas censuradas: P 2 de 8, N 0 de 8/);
});

test('sensibilidad de costo con las censuradas duplicadas: descriptiva y con las razones recalculadas', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: 1 }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: 1 }));
  }
  Object.assign(rows[1], { cost_usd: 2, termination: 'budget_cap', censored: 'true' });
  const res = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 300 });
  const s = res.contrasts[0].itt.cost.censoredSensitivity;
  near(res.contrasts[0].itt.cost.ratio, Math.exp(Math.log(2) / 8), 1e-12);
  near(s.ratio, Math.exp(Math.log(4) / 8), 1e-12);
  assert.strictEqual(s.censoredRuns, 1);
  assert.ok(Number.isFinite(s.upper95) && Number.isFinite(s.upperT95));
  assert.match(s.line, /sensibilidad/);
  assert.match(s.line, /duplic/);
  assert.match(s.line, /descriptiv/);
  assert.match(m.formatText(res), /sensibilidad.*duplicara/);
  // Sin censuradas, la sensibilidad coincide con el análisis y lo dice.
  const none = m.analyze(m.readRuns(toCsv(rows.map((r) => ({ ...r, censored: 'false', termination: 'ok' })))).rows, { contrasts: 'P:N', resamples: 300 });
  const s0 = none.contrasts[0].itt.cost.censoredSensitivity;
  assert.strictEqual(s0.censoredRuns, 0);
  near(s0.ratio, none.contrasts[0].itt.cost.ratio, 1e-12);
  assert.match(s0.line, /sin corridas censuradas/);
});

test('columnas de terminación: si falta "censored" se deduce de termination; un CSV viejo no tiene censuradas', async () => {
  const m = await load();
  const only = toCsv([run('a', 'P', 1, { termination: 'budget_cap' }), run('a', 'N', 1, { termination: 'model_timeout' }), run('b', 'P', 1, { termination: 'hang' }), run('b', 'N', 1, { termination: 'ok' })],
    ['task', 'arm', 'rep', 'cost_usd', 'termination']);
  assert.deepStrictEqual(m.readRuns(only).rows.map((r) => r.censored), [true, true, false, false]);
  const old = toCsv([run('a', 'P', 1), run('a', 'N', 1)], ['task', 'arm', 'rep', 'cost_usd', 'accept_exit', 'accept_pass', 'accept_fail']);
  assert.deepStrictEqual(m.readRuns(old).rows.map((r) => r.censored), [false, false]);
  const res = m.analyze(m.readRuns(old).rows, { contrasts: 'P:N', resamples: 100 });
  assert.deepStrictEqual(res.contrasts[0].itt.censored, { P: { runs: 1, censored: 0 }, N: { runs: 1, censored: 0 } });
});

test('corridas inválidas por fallo de infraestructura: se excluyen y se listan con su terminación', async () => {
  const m = await load();
  const csv = toCsv([...tenTasks(), run('t01', 'P', 2, { invalid: 'true', invalid_reason: 'infra', termination: 'infra_fault', cost_usd: 99 })]);
  const r = m.readRuns(csv);
  assert.strictEqual(r.rows.length, 20);
  assert.deepStrictEqual(r.invalid, [{ run: 't01/P/2', experiment: 'x', reason: 'infra', termination: 'infra_fault' }]);
  const text = m.formatText(m.analyze(r.rows, { contrasts: 'P:N', resamples: 100, invalid: r.invalid }));
  assert.match(text, /t01\/P\/2: infra.*infra_fault/);
});

test('por protocolo: un brazo cuyas corridas no tienen dato de activación no se filtra, y se dice', async () => {
  const m = await load();
  const rows = m.readRuns(toCsv(tenTasks().map((r) => (r.arm === 'P' ? { ...r, activation_via: r.task === 't09' ? 'n/a' : '' } : r)))).rows;
  const res = m.analyze(rows, { contrasts: 'P:N', resamples: 200 });
  const c = res.contrasts[0];
  assert.strictEqual(c.pp.n, 10);
  assert.deepStrictEqual(c.pp.activationSkipped, ['P']);
  assert.deepStrictEqual(c.itt.activationSkipped, ['P']);
  assert.match(c.pp.activation.P.note, /sin dato de activación/);
  assert.match(m.formatText(res), /no se filtra por activación en P/);
  // "none" es un dato (el plugin no se activó): ahí sí se filtra y no queda ninguna tarea.
  const none = m.readRuns(toCsv(tenTasks().map((r) => (r.arm === 'P' ? { ...r, activation_via: 'none' } : r)))).rows;
  const r2 = m.analyze(none, { contrasts: 'P:N', resamples: 100 }).contrasts[0];
  assert.strictEqual(r2.pp.n, 0);
  assert.deepStrictEqual(r2.pp.activationSkipped, []);
});

test('conjunto de tareas: restrictToTasks deja solo las listadas, también en las inválidas, e informa lo que falta', async () => {
  const m = await load();
  const csv = toCsv([...tenTasks(), run('t01', 'P', 2, { invalid: 'true', invalid_reason: 'infra' }), run('t10', 'N', 2, { invalid: 'true', invalid_reason: 'infra' })]);
  const read = m.readRuns(csv);
  const kept = m.restrictToTasks(read, ['t01', 't02', 't03', 'fantasma']);
  assert.deepStrictEqual([...new Set(kept.rows.map((r) => r.task))].sort(), ['t01', 't02', 't03']);
  assert.deepStrictEqual(kept.invalid.map((e) => e.run), ['t01/P/2']);
  assert.deepStrictEqual(kept.missingTasks, ['fantasma']);
  assert.strictEqual(kept.droppedRuns, 14);
  assert.strictEqual(m.analyze(kept.rows, { contrasts: 'P:N', resamples: 100 }).contrasts[0].itt.n, 3);
});

test('Holm solo sobre los contrastes primarios; los demás son exploratorios y sin ajuste', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    const base = 1 + i / 10;
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: base }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: base * (1.1 + i / 100) }));
    rows.push(run(`t${i}`, 'S', 1, { cost_usd: base * (i % 2 ? 1.05 : 0.9) }));
  }
  const read = m.readRuns(toCsv(rows)).rows;
  const res = m.analyze(read, { contrasts: 'P:N,P:S,S:N', primary: 'P:N,P:S', resamples: 200 });
  const [pn, ps, sn] = res.contrasts;
  assert.deepStrictEqual(res.primary, ['P:N', 'P:S']);
  assert.deepStrictEqual([pn.role, ps.role, sn.role], ['primario', 'primario', 'exploratorio']);
  near(pn.itt.cost.pAdjusted, Math.min(1, 2 * pn.itt.cost.p), 1e-12); // multiplicador 2, no 3
  assert.deepStrictEqual(m.holm([pn.itt.cost.p, ps.itt.cost.p]), [pn.itt.cost.pAdjusted, ps.itt.cost.pAdjusted]);
  assert.strictEqual(sn.itt.cost.pAdjusted, null);
  assert.strictEqual(sn.pp.cost.pAdjusted, null);
  const text = m.formatText(res);
  assert.match(text, /Contraste S:N .*exploratorio, sin ajuste/);
  assert.match(text, /Contraste P:N .*primario/);
  // Sin --primary, todos los contrastes pedidos se ajustan juntos (comportamiento anterior) y se avisa.
  const all = m.analyze(read, { contrasts: 'P:N,P:S', resamples: 200 });
  assert.strictEqual(all.primary, null);
  assert.deepStrictEqual(all.contrasts.map((c) => c.role), ['primario', 'primario']);
  assert.throws(() => m.analyze(read, { contrasts: 'P:N', primary: 'P:N,P:S', resamples: 100 }), /primario P:S/);
});

function csvWith(dir, name, rows) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, toCsv(rows));
  return file;
}

test('CLI: --experiment acepta una lista separada por comas y exige que existan todos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const rows = tenTasks().map((r) => ({ ...r, experiment: Number(r.task.slice(1)) <= 5 ? 'a' : 'b' }));
    const csv = csvWith(dir, 'runs.csv', [...rows, run('z', 'N', 1, { experiment: 'calib' })]);
    const two = cli(['--csv', csv, '--contrasts', 'P:N', '--experiment', 'a,b', '--resamples', '100', '--json']);
    assert.strictEqual(two.status, 0, two.stderr);
    assert.strictEqual(JSON.parse(two.stdout).contrasts[0].itt.n, 10);
    const one = cli(['--csv', csv, '--contrasts', 'P:N', '--experiment', 'a', '--resamples', '100', '--json']);
    assert.strictEqual(JSON.parse(one.stdout).contrasts[0].itt.n, 5);
    assert.notStrictEqual(cli(['--csv', csv, '--contrasts', 'P:N']).status, 0);
    const bad = cli(['--csv', csv, '--contrasts', 'P:N', '--experiment', 'a,c']);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /"c"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --tasks-set y --task-set-file dejan solo las tareas del conjunto elegido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const csv = csvWith(dir, 'runs.csv', [...tenTasks(), run('t01', 'P', 2, { invalid: 'true', invalid_reason: 'infra' }), run('t10', 'P', 2, { invalid: 'true', invalid_reason: 'infra' })]);
    const set = path.join(dir, 'tasks.json');
    fs.writeFileSync(set, JSON.stringify({ validation: ['t01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 'no-esta'], dev: ['t09', 't10'] }));
    const v = cli(['--csv', csv, '--contrasts', 'P:N', '--tasks-set', 'validation', '--task-set-file', set, '--resamples', '100']);
    assert.strictEqual(v.status, 0, v.stderr);
    assert.match(v.stdout, /conjunto de tareas "validation"/);
    assert.match(v.stdout, /no-esta/);
    assert.match(v.stdout, /n = 8 tareas/);
    assert.match(v.stdout, /Corridas inválidas excluidas: 1/);
    assert.doesNotMatch(v.stdout, /t09|t10/);
    const dev = cli(['--csv', csv, '--contrasts', 'P:N', '--tasks-set', 'dev', '--task-set-file', set, '--resamples', '100', '--json']);
    assert.strictEqual(JSON.parse(dev.stdout).contrasts[0].itt.n, 2);
    for (const args of [['--tasks-set', 'validation'], ['--task-set-file', set], ['--tasks-set', 'otro', '--task-set-file', set], ['--tasks-set', 'validation', '--task-set-file', path.join(dir, 'no.json')]]) {
      const r = cli(['--csv', csv, '--contrasts', 'P:N', ...args]);
      assert.notStrictEqual(r.status, 0, args.join(' '));
      assert.match(r.stderr, /error:/);
    }
    fs.writeFileSync(set, JSON.stringify({ dev: ['t09'] }));
    const missing = cli(['--csv', csv, '--contrasts', 'P:N', '--tasks-set', 'validation', '--task-set-file', set]);
    assert.notStrictEqual(missing.status, 0);
    assert.match(missing.stderr, /validation/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --primary limita Holm, un arm sin dato de activación sale con código 0, y la ayuda describe todo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const rows = [];
    for (let i = 1; i <= 8; i += 1) {
      rows.push(run(`t${i}`, 'N', 1, { cost_usd: 1 + i / 10 }), run(`t${i}`, 'P', 1, { cost_usd: (1 + i / 10) * 1.2, activation_via: '' }), run(`t${i}`, 'S', 1, { cost_usd: 1 + i / 10, activation_via: '' }));
    }
    const csv = csvWith(dir, 'runs.csv', rows);
    const r = cli(['--csv', csv, '--contrasts', 'P:N,P:S,S:N', '--primary', 'P:N,P:S', '--resamples', '100']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /primarios \(Holm\): P:N, P:S/);
    assert.match(r.stdout, /no se filtra por activación en P/);
    const bad = cli(['--csv', csv, '--contrasts', 'P:N', '--primary', 'P:S']);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /primario P:S/);
    const help = cli(['--help']);
    assert.strictEqual(help.status, 0);
    for (const re of [/--primary/, /--task-set-file/, /--tasks-set/, /censur/, /cota t/, /--experiment <a\[,b\]>/]) assert.match(help.stdout, re);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Estudio A: sensibilidad sin las censuradas. Estudio B: revisión con defectos sembrados
// ---------------------------------------------------------------------------------------------------------------------

test('estudio A: la razón de costo sin las corridas censuradas quita esas celdas y las tareas que pierden un brazo', async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    rows.push(run(`t${i}`, 'N', 1, { cost_usd: 1 }));
    rows.push(run(`t${i}`, 'P', 1, { cost_usd: 1 }));
  }
  Object.assign(rows[1], { cost_usd: 2, termination: 'budget_cap', censored: 'true' }); // t1, P
  Object.assign(rows[2], { cost_usd: 3 }); // t2, N sube a 3 y queda
  const res = m.analyze(m.readRuns(toCsv(rows)).rows, { contrasts: 'P:N', resamples: 300 });
  const k = res.contrasts[0].itt.cost;
  near(k.ratio, Math.exp((Math.log(2) + Math.log(1 / 3)) / 8), 1e-12);
  assert.strictEqual(k.withoutCensored.n, 7);
  assert.deepStrictEqual(k.withoutCensored.droppedTasks, ['t1']);
  near(k.withoutCensored.ratio, Math.exp(Math.log(1 / 3) / 7), 1e-12);
  assert.match(k.withoutCensored.line, /sin las corridas censuradas/);
  assert.match(k.withoutCensored.line, /descriptiv/);
  assert.match(k.withoutCensored.line, /t1/);
  assert.match(m.formatText(res), /sin las corridas censuradas.*n = 7/);
  const none = m.analyze(m.readRuns(toCsv(rows.map((r) => ({ ...r, censored: 'false', termination: 'ok' })))).rows, { contrasts: 'P:N', resamples: 300 });
  assert.deepStrictEqual(none.contrasts[0].itt.cost.withoutCensored.droppedTasks, []);
  near(none.contrasts[0].itt.cost.withoutCensored.ratio, none.contrasts[0].itt.cost.ratio, 1e-12);
});

// ---- Estudio B ----
const RCOLS = ['experiment', 'task', 'arm', 'rep', 'timestamp', 'cost_usd', 'wall_s', 'turns', 'agents', 'defects_total', 'defects_found', 'found_by_category',
  'findings_total', 'findings_unmatched', 'activation_via', 'invalid', 'invalid_reason', 'termination', 'censored'];
const reviewRow = (item, arm, found, total, extra = {}) => ({
  experiment: 'rv', task: item, arm, rep: 1, timestamp: `ts-${item}-${arm}`, cost_usd: 1, wall_s: 30, turns: 5, agents: 0, defects_total: total, defects_found: found,
  found_by_category: '', findings_total: 3, findings_unmatched: 1, activation_via: arm === 'P' ? 'skill_tool' : '', invalid: 'false', termination: 'ok', censored: 'false', ...extra,
});
const rcsv = (rows) => toCsv(rows, RCOLS);
const item = (i) => `rev-${String(i).padStart(2, '0')}`;
// Ocho ítems con defectos (totales 2,2,2,2,3,3,2,2) y dos controles limpios. Cada defecto es de la categoría logic o sec.
const TOTALS = [2, 2, 2, 2, 3, 3, 2, 2];
const P_FOUND = [[1, 1], [1, 1], [1, 0], [1, 1], [2, 1], [1, 1], [1, 1], [1, 1]]; // (logic, sec)
const N_FOUND = [[0, 0], [1, 0], [0, 1], [0, 0], [1, 0], [0, 1], [0, 0], [1, 0]];
const C_FOUND = [[1, 0], [1, 1], [1, 0], [0, 1], [1, 1], [1, 1], [1, 0], [1, 1]];
const catText = (total, f) => `logic=${f[0]}/${total - 1}|sec=${f[1]}/1`;
function reviewRows({ unmatched = { P: 4, N: 1, C: 1 }, cleanUnmatched = { P: [2, 4], N: [0, 0], C: [1, 1] } } = {}) {
  const rows = [];
  const sets = { P: P_FOUND, N: N_FOUND, C: C_FOUND };
  for (const arm of ['P', 'N', 'C']) {
    TOTALS.forEach((tot, i) => {
      const f = sets[arm][i];
      rows.push(reviewRow(item(i + 1), arm, f[0] + f[1], tot, { found_by_category: catText(tot, f), findings_unmatched: unmatched[arm] }));
    });
    cleanUnmatched[arm].forEach((u, j) => rows.push(reviewRow(item(9 + j), arm, 0, 0, { findings_unmatched: u, findings_total: u })));
  }
  return rows;
}

test('estudio B: categorías de found_by_category', async () => {
  const m = await load();
  assert.deepStrictEqual(m.parseCategories('logic=1/2|sec=0/1'), { logic: { found: 1, total: 2 }, sec: { found: 0, total: 1 } });
  assert.deepStrictEqual(m.parseCategories(''), {});
  assert.deepStrictEqual(m.parseCategories('roto|x=2/3'), { x: { found: 2, total: 3 } });
});

test('estudio B: recall por ítem, permutación de signos exacta, Holm solo en los primarios y veredicto', async () => {
  const m = await load();
  const rows = m.readRuns(rcsv(reviewRows())).rows;
  const res = m.analyzeReview(rows, { contrasts: 'P:N,P:C,C:N', primary: 'P:N,P:C', seed: 1 });
  assert.strictEqual(res.study, 'review');
  assert.deepStrictEqual(res.defectItems, [1, 2, 3, 4, 5, 6, 7, 8].map(item));
  assert.deepStrictEqual(res.cleanItems, [item(9), item(10)]);
  const [pn, pc, cn] = res.contrasts;
  // P - N por ítem: 1, 0,5, 0, 1, 2/3, 1/3, 1, 0,5 -> media 5/8; 7 diferencias positivas y un cero: 4 de 256 patrones.
  near(pn.meanDiff, 0.625, 1e-12);
  near(pn.p, 4 / 256, 1e-12);
  assert.strictEqual(pn.pMethod, 'exacto');
  assert.deepStrictEqual([pn.wins, pn.ties, pn.losses], [7, 1, 0]);
  // P - C: 0,5; 0; 0; 0,5; 1/3; 0; 0,5; 0 -> 4 diferencias positivas: 2 * 2^4 de 256.
  near(pc.p, 32 / 256, 1e-12);
  // Holm sobre los dos primarios: 2 * (4/256) y max(.., 1 * 32/256).
  near(pn.pAdjusted, 2 * 4 / 256, 1e-12);
  near(pc.pAdjusted, 32 / 256, 1e-12);
  assert.strictEqual(cn.role, 'exploratorio');
  assert.strictEqual(cn.pAdjusted, null);
  assert.strictEqual(pn.n, 8);
  assert.strictEqual(pn.label, 'confirmatorio');
  assert.strictEqual(pn.wilcoxon.n, 7);
  assert.strictEqual(pn.signTest.p, 2 / 128); // 7 ganadas, ceros descartados
  assert.match(pn.verdict.text, /P encuentra más defectos que N/);
  assert.match(pc.verdict.text, /sin diferencia demostrada.*no es equivalencia/);
  assert.match(cn.verdict.text, /exploratorio/);
  assert.doesNotMatch(cn.verdict.text, /encuentra más defectos/);
});

test('estudio B: regla de calificación, más del doble de hallazgos sin coincidencia por ítem', async () => {
  const m = await load();
  const verdictOf = (unmatched) => m.analyzeReview(m.readRuns(rcsv(reviewRows({ unmatched }))).rows, { contrasts: 'P:N', primary: 'P:N' }).contrasts[0];
  const doubled = verdictOf({ P: 4, N: 1, C: 1 });
  assert.strictEqual(doubled.verdict.qualified, true);
  assert.match(doubled.verdict.text, /más defectos sembrados encontrados, con más hallazgos sin confirmar/);
  assert.match(doubled.verdict.text, /muestra revisada a mano/);
  near(doubled.unmatched.test, 4, 1e-12);
  near(doubled.unmatched.control, 1, 1e-12);
  const exactlyDouble = verdictOf({ P: 4, N: 2, C: 1 }); // el doble justo no es "más del doble"
  assert.strictEqual(exactlyDouble.verdict.qualified, false);
  assert.doesNotMatch(exactlyDouble.verdict.text, /con más hallazgos sin confirmar/);
  assert.match(exactlyDouble.verdict.text, /P encuentra más defectos que N/);
  assert.strictEqual(verdictOf({ P: 1, N: 0, C: 0 }).verdict.qualified, true); // control en cero y prueba con alguno
  assert.strictEqual(verdictOf({ P: 0, N: 0, C: 0 }).verdict.qualified, false);
  // Los controles limpios no cambian el veredicto: con muchísimos hallazgos ahí, el veredicto es el mismo.
  const loudClean = m.analyzeReview(m.readRuns(rcsv(reviewRows({ unmatched: { P: 2, N: 2, C: 1 }, cleanUnmatched: { P: [50, 60], N: [0, 0], C: [0, 0] } }))).rows, { contrasts: 'P:N', primary: 'P:N' }).contrasts[0];
  assert.strictEqual(loudClean.verdict.qualified, false);
});

test('estudio B: recall agregado con Wilson, tabla por categoría, falsos positivos y costo por defecto', async () => {
  const m = await load();
  const res = m.analyzeReview(m.readRuns(rcsv(reviewRows())).rows, { contrasts: 'P:N', primary: 'P:N' });
  assert.deepStrictEqual([res.arms.P.pooled.k, res.arms.P.pooled.n], [16, 18]);
  assert.deepStrictEqual([res.arms.N.pooled.k, res.arms.N.pooled.n], [5, 18]);
  near(res.arms.P.pooled.lower, m.wilson(16, 18).lower, 1e-12);
  assert.match(res.arms.P.pooled.note, /agrupados/);
  assert.deepStrictEqual(res.byCategory.logic.P, { found: 9, total: 10 });
  assert.deepStrictEqual(res.byCategory.sec.P, { found: 7, total: 8 });
  assert.deepStrictEqual(res.byCategory.logic.N, { found: 3, total: 10 });
  assert.deepStrictEqual(res.byCategory.sec.N, { found: 2, total: 8 });
  // Controles limpios: hallazgos sin coincidencia por brazo.
  assert.deepStrictEqual([res.arms.P.clean.median, res.arms.P.clean.min, res.arms.P.clean.max, res.arms.P.clean.items], [3, 2, 4, 2]);
  assert.deepStrictEqual([res.arms.N.clean.median, res.arms.N.clean.max], [0, 0]);
  // Ítems con defectos: hallazgos sin coincidencia por ítem.
  near(res.arms.P.defectUnmatched.mean, 4, 1e-12);
  // Costo por defecto: 10 corridas de 1 USD (con los controles) sobre 16 y 5 defectos encontrados.
  near(res.arms.P.costPerDefect, 10 / 16, 1e-12);
  near(res.arms.N.costPerDefect, 10 / 5, 1e-12);
  const text = m.formatReviewText(res);
  assert.match(text, /Wilson/);
  assert.match(text, /categoría logic/);
  assert.match(text, /controles limpios/);
  assert.match(text, /costo por defecto encontrado/);
  JSON.stringify(res);
});

test('estudio B: con menos de 8 ítems es exploratorio y sin veredicto; ítems sin un brazo e inválidas se listan', async () => {
  const m = await load();
  const rows = reviewRows().filter((r) => !(r.task === item(8) && r.arm === 'P'));
  rows.push(reviewRow(item(3), 'P', 0, 2, { rep: 2, invalid: 'true', invalid_reason: 'infra', termination: 'infra_fault', timestamp: 'otro' }));
  const read = m.readRuns(rcsv(rows));
  const res = m.analyzeReview(read.rows, { contrasts: 'P:N,P:C', primary: 'P:N,P:C', invalid: read.invalid });
  const pn = res.contrasts[0];
  assert.strictEqual(pn.n, 7);
  assert.strictEqual(pn.label, 'exploratorio');
  assert.deepStrictEqual(pn.excludedItems.map((e) => e.item), [item(8)]);
  assert.match(pn.verdict.text, /exploratorio \(n = 7/);
  assert.doesNotMatch(pn.verdict.text, /encuentra más defectos/);
  assert.deepStrictEqual(res.incompleteItems, [{ item: item(8), missingArms: ['P'] }]);
  assert.deepStrictEqual(res.excludedRuns.map((e) => e.run), [`${item(3)}/P/2`]);
  const text = m.formatReviewText(res);
  assert.match(text, /n = 7 ítems con defectos \(exploratorio\)/);
  assert.match(text, /Corridas inválidas excluidas: 1/);
  assert.match(text, /rev-03\/P\/2: infra \(terminación: infra_fault\)/);
  assert.match(text, /rev-08.*falta el brazo P/);
});

test('estudio B: el recall se promedia por ítem cuando hay repeticiones y las censuradas se cuentan', async () => {
  const m = await load();
  const rows = reviewRows();
  rows.push(reviewRow(item(1), 'N', 2, 2, { rep: 2, timestamp: 'rep2', censored: 'true', termination: 'budget_cap' }));
  const res = m.analyzeReview(m.readRuns(rcsv(rows)).rows, { contrasts: 'P:N', primary: 'P:N' });
  const d = res.contrasts[0].perItem.find((x) => x.item === item(1));
  near(d.control, 0.5, 1e-12); // media de 0/2 y 2/2
  assert.deepStrictEqual(res.arms.N.censored, { runs: 11, censored: 1 });
});

test('estudio B: la misma semilla da la misma salida y el conjunto de ítems filtra', async () => {
  const m = await load();
  const rows = m.readRuns(rcsv([...reviewRows(), reviewRow('rev-99', 'P', 1, 2), reviewRow('rev-99', 'N', 0, 2)])).rows;
  const kept = m.restrictToTasks({ rows, invalid: [] }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(item));
  const a = m.analyzeReview(kept.rows, { contrasts: 'P:N', primary: 'P:N', seed: 20261030 });
  const b = m.analyzeReview(kept.rows, { contrasts: 'P:N', primary: 'P:N', seed: 20261030 });
  assert.deepStrictEqual(a, b);
  assert.ok(!a.defectItems.includes('rev-99'));
});

test('CLI --study review: CSV sintético, conjunto de ítems, JSON y errores', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-analysis-'));
  try {
    const rows = [...reviewRows(), reviewRow('rev-99', 'P', 1, 2), reviewRow('rev-99', 'N', 0, 2), reviewRow('rev-01', 'P', 0, 2, { rep: 2, invalid: 'true', invalid_reason: 'infra', termination: 'infra_fault' })];
    const csv = path.join(dir, 'rv.csv');
    fs.writeFileSync(csv, rcsv(rows));
    const set = path.join(dir, 'items.json');
    fs.writeFileSync(set, JSON.stringify({ validation: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(item) }));
    const args = ['--study', 'review', '--csv', csv, '--experiment', 'rv', '--contrasts', 'P:N,P:C,P:S,C:N,S:N', '--primary', 'P:N,P:C,P:S', '--seed', '20261030', '--item-set-file', set];
    // Sin el brazo S: los contrastes con S quedan sin ítems pero el análisis corre.
    const r = cli(args);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Estudio de revisión/);
    assert.match(r.stdout, /Contraste P:N .*primario/);
    assert.match(r.stdout, /Contraste C:N .*exploratorio/);
    assert.match(r.stdout, /P encuentra más defectos que N/);
    assert.match(r.stdout, /Corridas inválidas excluidas: 1/);
    assert.doesNotMatch(r.stdout, /rev-99/);
    const j = cli([...args, '--json']);
    assert.strictEqual(j.status, 0, j.stderr);
    const out = JSON.parse(j.stdout);
    assert.strictEqual(out.study, 'review');
    near(out.contrasts[0].p, 4 / 256, 1e-12);
    assert.strictEqual(cli([...args, '--json']).stdout, j.stdout);
    // Sin conjunto de ítems entra rev-99 también.
    const all = cli(['--study', 'review', '--csv', csv, '--experiment', 'rv', '--contrasts', 'P:N', '--json']);
    assert.strictEqual(JSON.parse(all.stdout).defectItems.length, 9);
    const bad = cli(['--study', 'otro', '--csv', csv, '--contrasts', 'P:N']);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /--study/);
    assert.match(cli(['--help']).stdout, /--study review/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('estudio B: el veredicto usa el p ajustado con Holm, no el p sin ajuste', async () => {
  const m = await load();
  // P encuentra los 2 defectos en 8 ítems; N y C solo en 2 de ellos: 6 diferencias de 1 y 2 ceros, p = 2 * 2^2 / 256 = 0,03125 en cada primario.
  const rows = [];
  for (let i = 1; i <= 8; i += 1) {
    rows.push(reviewRow(item(i), 'P', 2, 2), reviewRow(item(i), 'N', i > 6 ? 2 : 0, 2), reviewRow(item(i), 'C', i > 6 ? 2 : 0, 2));
  }
  const res = m.analyzeReview(m.readRuns(rcsv(rows)).rows, { contrasts: 'P:N,P:C', primary: 'P:N,P:C' });
  for (const c of res.contrasts) {
    near(c.p, 8 / 256, 1e-12);
    near(c.pAdjusted, 16 / 256, 1e-12);
    assert.match(c.verdict.text, /sin diferencia demostrada/);
  }
  // Con un solo primario el mismo p ya alcanza.
  const single = m.analyzeReview(m.readRuns(rcsv(rows)).rows, { contrasts: 'P:N,P:C', primary: 'P:N' });
  assert.match(single.contrasts[0].verdict.text, /P encuentra más defectos que N/);
});
