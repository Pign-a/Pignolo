'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'evals', 'power-sim.mjs');

function runSim(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return r;
}

const quick = runSim(['--quick', '--json', '--seed', '7']);
const data = quick.status === 0 ? JSON.parse(quick.stdout) : null;

const cell = (r, sigmaInt, n) => data.cost.find((c) => c.r === r && c.sigma_int === sigmaInt && c.n === n);
const at = (c, ratio) => c.by_ratio.find((x) => x.ratio === ratio);

test('--quick --json termina bien y devuelve la estructura esperada', () => {
  assert.strictEqual(quick.status, 0, quick.stderr);
  assert.strictEqual(data.meta.seed, 7);
  // 2 valores de r x 3 de sigma_interacción x 6 de n
  assert.strictEqual(data.cost.length, 36);
  for (const c of data.cost) {
    assert.strictEqual(c.by_ratio.length, 4);
    assert.ok(c.half_width_pct > 0);
    for (const b of c.by_ratio) {
      for (const k of ['ni', 'ni_both', 'ni_dual', 'ni_dual_both', 'detect90', 'detect_holm', 'equiv']) {
        assert.ok(b[k] >= 0 && b[k] <= 1, `${k} fuera de [0,1]`);
      }
      assert.ok(b.ni_both <= b.ni + 1e-12, 'pasar los dos contrastes no puede ser más probable que pasar uno');
      assert.ok(b.ni_dual <= b.ni + 1e-12, 'la regla doble no puede declarar más que el bootstrap solo');
      assert.ok(b.detect_holm <= b.detect90 + 1e-12, 'el IC de 97,5 % no puede detectar más que el de 90 %');
    }
  }
  // 3 escenarios x 6 de n
  assert.strictEqual(data.binary.length, 18);
});

test('la potencia sube con n y el ancho del intervalo baja (tolerancias holgadas)', () => {
  for (const r of [1, 2]) {
    for (const si of [0.15, 0.25, 0.4]) {
      const small = cell(r, si, 8);
      const big = cell(r, si, 30);
      assert.ok(big.half_width_pct < small.half_width_pct, `ancho r=${r} sigma=${si}`);
    }
  }
  const small = cell(1, 0.25, 8);
  const big = cell(1, 0.25, 30);
  assert.ok(at(big, 1.2).ni > at(small, 1.2).ni + 0.1, 'NI con razón verdadera 1,2');
  assert.ok(at(big, 0.8).detect90 > at(small, 0.8).detect90 + 0.1, 'detección de -20 %');
  assert.ok(at(big, 1.0).equiv > at(small, 1.0).equiv + 0.1, 'equivalencia sin efecto');
});

test('más interacción y menos repeticiones bajan la potencia; el efecto verdadero la mueve en el sentido esperado', () => {
  assert.ok(at(cell(1, 0.15, 20), 1.2).ni > at(cell(1, 0.4, 20), 1.2).ni + 0.1);
  // con una razón verdadera menor es más fácil declarar no inferioridad
  const c = cell(1, 0.25, 20);
  assert.ok(at(c, 0.8).ni >= at(c, 1.0).ni - 0.05);
  assert.ok(at(c, 1.0).ni > at(c, 1.2).ni);
  assert.ok(at(c, 1.2).ni > at(c, 1.5).ni);
  // en el margen exacto la probabilidad de declarar no inferioridad es el error tipo I: acotado
  for (const x of data.cost) assert.ok(at(x, 1.5).ni_dual < 0.2, 'error tipo I de la regla doble');
});

test('McNemar exacto: sin diferencia casi no rechaza y con diferencia la potencia sube con n', () => {
  const sc = (id, n) => data.binary.find((b) => b.scenario === id && b.n === n);
  for (const n of [8, 12, 16, 20, 24, 30]) assert.ok(sc('igual', n).reject <= 0.06, `tamaño n=${n}`);
  assert.ok(sc('p-peor', 30).reject > sc('p-peor', 8).reject);
  assert.ok(sc('p-peor', 30).reject_p_worse > 0.2);
  assert.ok(sc('p-peor', 30).reject_p_better < 0.01);
  assert.ok(sc('p-mejor', 30).reject_p_worse < 0.01);
  // el escenario P peor es el espejo de P mejor
  assert.ok(Math.abs(sc('p-peor', 20).reject - sc('p-mejor', 20).reject) < 1e-9);
});

test('con la misma semilla el resultado es idéntico y con otra cambia', () => {
  const again = runSim(['--quick', '--json', '--seed', '7']);
  assert.strictEqual(again.stdout, quick.stdout);
  const other = runSim(['--quick', '--json', '--seed', '8']);
  assert.strictEqual(other.status, 0, other.stderr);
  assert.notStrictEqual(other.stdout, quick.stdout);
});

test('la salida en Markdown trae las tablas y un argumento inválido sale con código 2', () => {
  const md = runSim(['--quick']);
  assert.strictEqual(md.status, 0, md.stderr);
  assert.match(md.stdout, /\*\*r = 1, sigma_interacción = 0,15\*\*/);
  assert.match(md.stdout, /McNemar exacto/);
  const bad = runSim(['--sims', 'abc']);
  assert.strictEqual(bad.status, 2);
  const unknown = runSim(['--nada']);
  assert.strictEqual(unknown.status, 2);
});
