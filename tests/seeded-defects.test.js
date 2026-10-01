'use strict';
// Contrato mínimo con el arnés de medición del criterio de éxito de la v1 (spec §0).
// El kit de defectos sembrados no se construye acá: es del arnés de
// docs/plans/2026-10-01-bench-pignolo-vs-base.md (tests/bench/vs-base/). Este archivo solo
// verifica que el arnés está y que sus semillas cubren los cinco tipos de §0. Sin agentes.
// La corrida paga la lanza el autor (tests/manual/hito-8.md, punto 10): no corre acá.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');

const REPO = path.join(__dirname, '..');
const KINDS = ['decorative-test', 'dead-defense', 'indirect-destructive-command', 'sensitive-learning', 'project-data-query'];

// Todo valor de texto del JSON (los tipos pueden estar en `kind`, `type` o `id`, según el arnés).
function strings(node, out = new Set()) {
  if (typeof node === 'string') out.add(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => strings(n, out));
  return out;
}

// { ok, problems[] } para un arnés que vive bajo `root`.
function checkHarness(root) {
  const dir = path.join(root, 'tests', 'bench', 'vs-base');
  const problems = [];
  if (!fs.existsSync(path.join(dir, 'run.js'))) problems.push('falta tests/bench/vs-base/run.js');
  const seedsFile = path.join(dir, 'seeds', 'seeds.json');
  if (!fs.existsSync(seedsFile)) {
    problems.push('falta tests/bench/vs-base/seeds/seeds.json');
  } else {
    let seeds;
    try { seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8')); } catch (e) { problems.push(`seeds.json no parsea: ${e.message}`); }
    if (seeds !== undefined) {
      const have = strings(seeds);
      for (const k of KINDS) if (!have.has(k)) problems.push(`seeds.json no trae el tipo ${k}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

function fakeHarness(kinds, { run = true } = {}) {
  const root = makeTempDir('pignolo-seeded-');
  const dir = path.join(root, 'tests', 'bench', 'vs-base');
  fs.mkdirSync(path.join(dir, 'seeds'), { recursive: true });
  if (run) fs.writeFileSync(path.join(dir, 'run.js'), "'use strict';\n");
  fs.writeFileSync(path.join(dir, 'seeds', 'seeds.json'), JSON.stringify({ seeds: kinds.map((kind, i) => ({ id: `s${i}`, kind })) }));
  return root;
}

test('seeded-defects: un arnés con los cinco tipos y run.js pasa', () => {
  const r = checkHarness(fakeHarness(KINDS));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.ok);
});

for (const k of KINDS) {
  test(`seeded-defects: sin el tipo ${k} el contrato falla (rojo)`, () => {
    const r = checkHarness(fakeHarness(KINDS.filter((x) => x !== k)));
    assert.ok(!r.ok);
    assert.ok(r.problems.some((p) => p.includes(k)), r.problems.join('; '));
  });
}

test('seeded-defects: sin run.js o sin seeds.json el contrato falla', () => {
  assert.ok(checkHarness(fakeHarness(KINDS, { run: false })).problems.some((p) => p.includes('run.js')));
  assert.ok(checkHarness(makeTempDir('pignolo-seeded-empty-')).problems.length >= 2);
});

// El arnés real: si todavía no está en esta rama, se salta (no define sembrados propios).
const present = fs.existsSync(path.join(REPO, 'tests', 'bench', 'vs-base', 'run.js'));
test('seeded-defects: el arnés de la comparación está en la rama y trae los cinco tipos de §0', { skip: present ? false : 'el arnés tests/bench/vs-base/ aún no está en esta rama (plan bench-pignolo-vs-base)' }, () => {
  const r = checkHarness(REPO);
  assert.deepStrictEqual(r.problems, []);
});
