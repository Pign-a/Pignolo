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
  const dirs = fs.readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'ui-identity').map((e) => e.name).sort(); // ui-identity is the blank-project identity of the ui harness task, not a detection fixture
  assert.deepStrictEqual(dirs, ['app-db', 'cli-script', 'landing-form']);
  assert.deepStrictEqual(Object.keys(expected).sort(), dirs);
  for (const f of walk(FIXTURES)) assert.ok(!f.split(path.sep).includes('.git'), f);
});

function stats(name) {
  const files = walk(path.join(FIXTURES, name));
  const lines = files.reduce((n, f) => {
    const buf = fs.readFileSync(f);
    return n + (buf.length ? buf.toString('utf8').replace(/\r?\n$/, '').split('\n').length : 0);
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

// ---- revisión final F14 ----
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { decodeInput } = require('./evals/compare-fronts.js');
const CLI = path.join(EVALS, 'compare-fronts.js');

function cli(fixture, bytes, { missing = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-cf-'));
  try {
    const file = path.join(dir, missing ? 'no-existe.txt' : 'salida.txt');
    if (!missing) fs.writeFileSync(file, bytes);
    const r = spawnSync(process.execPath, [CLI, fixture, file], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout, err: r.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CRLF: la línea Frentes: se reconoce con finales de línea de Windows', () => {
  assert.deepStrictEqual(compareFronts('Listo.\r\nFrentes: security, hygiene\r\n', 'landing-form', expected), { ok: true });
  assert.deepStrictEqual(compareFronts('Revisado.\r\nFrentes:\r\n', 'cli-script', expected), { ok: true });
  assert.deepStrictEqual(extractFronts('Frentes: code\r\n'), ['code']);
});

test('BOM de UTF-8: se ignora al inicio, también al leer el archivo', () => {
  assert.deepStrictEqual(compareFronts('\uFEFFFrentes: security, hygiene', 'landing-form', expected), { ok: true });
  assert.deepStrictEqual(extractFronts('\uFEFFFrentes:'), []);
  const r = cli('landing-form', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Frentes: security, hygiene\r\n')]));
  assert.strictEqual(r.status, 0, r.out + r.err);
  assert.deepStrictEqual(JSON.parse(r.out), { ok: true });
});

test('UTF-16: falla claro (salida 2) en lugar de decir que no hay línea', () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Frentes: security, hygiene\n', 'utf16le')]);
  assert.throws(() => decodeInput(utf16), /UTF-16/);
  const r = cli('landing-form', utf16);
  assert.strictEqual(r.status, 2);
  assert.match(r.err, /UTF-16/);
  assert.ok(!/sin línea de frentes/.test(r.out));
});

test('un id repetido es "id repetido: <id>"', () => {
  const r = compareFronts('Frentes: security, security, hygiene', 'landing-form', expected);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'id repetido: security');
});

test('un fixture desconocido en la API lanza; no se compara contra una lista vacía', () => {
  assert.throws(() => compareFronts('Frentes:', 'no-existe', expected), /fixture desconocido: no-existe/);
  assert.throws(() => compareFronts('Frentes:', 'toString', expected), /fixture desconocido/);
});

test('CLI: archivo inexistente sale con 2; un desacuerdo sale con 1; un acuerdo con 0', () => {
  assert.strictEqual(cli('landing-form', '', { missing: true }).status, 2);
  assert.strictEqual(cli('landing-form', 'Frentes: security\n').status, 1);
  assert.strictEqual(cli('landing-form', 'Frentes: security, hygiene\n').status, 0);
  assert.strictEqual(cli('no-existe', 'Frentes:\n').status, 2);
});

test('RESULTS-pignolo2.md cita los conteos reales de los fixtures (archivos y líneas)', () => {
  const t = fs.readFileSync(path.join(EVALS, 'RESULTS-pignolo2.md'), 'utf8');
  const row = (name) => t.split('\n').find((l) => l.startsWith(`| \`${name}\``));
  for (const [name, s] of [['landing-form', stats('landing-form')], ['app-db', stats('app-db')], ['cli-script', stats('cli-script')]]) {
    const l = row(name);
    assert.ok(l, `falta la fila de ${name}`);
    assert.ok(l.includes(`${s.files} archivos`), `${name}: la ficha no cita ${s.files} archivos`);
    assert.ok(l.includes(`${s.lines} líneas`), `${name}: la ficha no cita ${s.lines} líneas`);
  }
});

test('fixtures/README.md: la corrida sale de una rama aparte y se revisa git status; app-db corre *.spec.js', () => {
  const t = fs.readFileSync(path.join(FIXTURES, 'README.md'), 'utf8');
  assert.match(t, /git switch -c/);
  assert.match(t, /git status/);
  assert.match(t, /\*\.log/);
  const pkg = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'app-db', 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /spec\.js/);
});
