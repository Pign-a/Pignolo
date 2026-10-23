'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractFronts, compareFronts } = require('./evals/compare-fronts.js');

const EVALS = path.join(__dirname, 'evals');
const FIXTURES = path.join(EVALS, 'fixtures');
const expected = JSON.parse(fs.readFileSync(path.join(EVALS, 'fronts-expected.json'), 'utf8'));

test('landing-form con "Frentes: security, hygiene" es ok', () => {
  assert.deepStrictEqual(
    compareFronts('Listo.\nFrentes: security, hygiene\n', 'landing-form', expected),
    { ok: true }
  );
});

test('app-db con seis ids supera el tope de 5', () => {
  const r = compareFronts('Frentes: security, database, code, tests, hygiene, docs', 'app-db', expected);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'supera el tope de 5');
});

test('cli-script con "Frentes:" vacío es ok', () => {
  assert.deepStrictEqual(compareFronts('Revisado.\nFrentes:\n', 'cli-script', expected), { ok: true });
});

test('sin la línea devuelve "sin línea de frentes"', () => {
  for (const f of Object.keys(expected)) {
    const r = compareFronts('texto sin la línea', f, expected);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'sin línea de frentes');
  }
});

test('landing-form con solo security falta hygiene', () => {
  const r = compareFronts('Frentes: security', 'landing-form', expected);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'frentes distintos a los esperados');
  assert.deepStrictEqual(r.missing, ['hygiene']);
  assert.deepStrictEqual(r.extra, []);
});

test('un id fuera del conjunto es "id desconocido"', () => {
  const r = compareFronts('Frentes: foo', 'landing-form', expected);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'id desconocido: foo');
});

test('extractFronts toma la última línea y el orden no importa para comparar', () => {
  assert.deepStrictEqual(extractFronts('Frentes: code\nmás\nFrentes: tests, code'), ['tests', 'code']);
  assert.strictEqual(extractFronts('nada'), null);
  assert.deepStrictEqual(extractFronts('Frentes:'), []);
  assert.deepStrictEqual(compareFronts('Frentes: hygiene, security', 'landing-form', expected), { ok: true });
});

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test('fixtures: exactamente las tres carpetas esperadas y sin .git', () => {
  const dirs = fs.readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepStrictEqual(dirs, ['app-db', 'cli-script', 'landing-form']);
  assert.deepStrictEqual(Object.keys(expected).sort(), dirs);
  for (const f of walk(FIXTURES)) assert.ok(!f.split(path.sep).includes('.git'), f);
});

function stats(name) {
  const files = walk(path.join(FIXTURES, name));
  const lines = files.reduce((n, f) => {
    const buf = fs.readFileSync(f);
    return n + (buf.length ? buf.toString('utf8').split('\n').length : 0);
  }, 0);
  return { files: files.length, lines };
}

test('fixtures chicos cumplen el límite de diff chico (≤5 archivos, ≤200 líneas)', () => {
  for (const name of ['landing-form', 'cli-script']) {
    const s = stats(name);
    assert.ok(s.files <= 5, `${name}: ${s.files} archivos`);
    assert.ok(s.lines <= 200, `${name}: ${s.lines} líneas`);
  }
});

test('fixture grande supera el límite de diff chico', () => {
  const s = stats('app-db');
  assert.ok(s.files > 5 || s.lines > 200, `app-db: ${s.files} archivos, ${s.lines} líneas`);
});
