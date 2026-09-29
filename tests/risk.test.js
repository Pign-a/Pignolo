'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git } = require('./helpers');

const { assessRisk, maxRisk, TRIPWIRES } = require('../plugins/pignolo/lib/risk');
const CLI = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'risk.js');

const CFG = {
  found: true,
  testPaths: ['tests/', '*.test.js'],
  contracts: ['api/'],
  highRiskPaths: ['src/auth/'],
  costPaths: ['src/billing/'],
  visiblePaths: ['src/ui/'],
  piiPatterns: ['[\\w.]+@example\\.invalid'],
};
const f = (p, status = 'M') => ({ path: p, status });
const add = (p, text, line = 1) => ({ path: p, line, text, sign: '+' });
const del = (p, text, line = 1) => ({ path: p, line, text, sign: '-' });

// Tabla literal (no se toma de TRIPWIRES: si el código omite uno, este test falla).
const CASES = [
  ['manifest', 'dependencies', { files: [f('package.json')] }],
  ['iac-ci', 'irreversible', { files: [f('.github/workflows/ci.yml')] }],
  ['env', 'security', { files: [f('.env.local')] }],
  ['migration', 'irreversible', { files: [f('db/migrations/001_init.sql')] }],
  ['deletion', 'irreversible', { files: [f('src/old.js', 'D')] }],
  ['claude-config', 'security', { files: [f('.claude/settings.json')] }],
  ['contracts', 'contract', { files: [f('api/routes.js')] }],
  ['high-risk', 'security', { files: [f('src/auth/login.js')] }],
  ['cost-paths', 'costs', { files: [f('src/billing/charge.js')] }],
  ['visible-paths', 'scope', { files: [f('src/ui/label.js')] }],
  ['ui-undeclared', 'scope', { files: [f('src/Button.tsx')], config: { visiblePaths: [] } }],
  ['ai-model', 'costs', { files: [f('src/a.js')], lines: [add('src/a.js', "const m = 'claude-opus-4';")] }],
  ['paid-sdk', 'costs', { files: [f('src/a.js')], lines: [add('src/a.js', "const s = require('stripe');")] }],
  ['polling', 'costs', { files: [f('src/a.js')], lines: [add('src/a.js', 'setInterval(tick, 1000);')] }],
  ['retry-concurrency', 'costs', { files: [f('src/a.js')], lines: [add('src/a.js', 'await Promise.all(jobs);')] }],
  ['log-level', 'costs', { files: [f('src/a.js')], lines: [add('src/a.js', 'const l = process.env.LOG_LEVEL;')] }],
  ['pii', 'security', { files: [f('src/a.js')], lines: [add('src/a.js', 'const u = "ana@example.invalid";')] }],
  ['exported-signature', 'contract', { files: [f('src/a.js')], lines: [del('src/a.js', 'export function f(a) {')] }],
];

test('la tabla literal coincide con TRIPWIRES', () => {
  assert.deepEqual(CASES.map((c) => c[0]).sort(), TRIPWIRES.map((t) => t.id).sort());
  assert.equal(CASES.length, 18);
  for (const [id, category] of CASES) assert.equal(TRIPWIRES.find((t) => t.id === id).category, category, id);
});

for (const [id, category, input] of CASES) {
  test(`tripwire ${id}`, () => {
    const r = assessRisk({ files: input.files, lines: input.lines || [], config: { ...CFG, ...(input.config || {}) } });
    assert.equal(r.reserved, true);
    assert.equal(r.level, 'high');
    const hit = r.hits.find((h) => h.tripwire === id);
    assert.ok(hit, `hit ${id}`);
    assert.equal(hit.category, category);
    assert.ok(r.categories.includes(category));
    assert.notEqual(r.laneFloor, 'trivial');
  });
}

test('ui-undeclared y visible-paths fijan el piso de carril', () => {
  const ui = assessRisk({ files: [f('src/Button.tsx')], lines: [], config: { ...CFG, visiblePaths: [] } });
  assert.equal(ui.laneFloor, 'plan');
  const vis = assessRisk({ files: [f('src/ui/x.js')], lines: [], config: CFG });
  assert.equal(vis.laneFloor, 'daily');
});

for (const [name, text] of [
  ['coherent', 'const coherent = 1;'],
  ['coherent import', 'import coherent from "x";'],
  ['acronym', 'const acronym = 1;'],
  ['striped', 'const striped = true;'],
  ['striped import', 'import striped from "x";'],
  ['o1 variable', 'const o1 = 2;'],
  ['claudette', 'const n = "claudette";'],
]) {
  test(`sin falso positivo: ${name}`, () => {
    const r = assessRisk({ files: [f('src/a.js')], lines: [add('src/a.js', text)], config: CFG });
    assert.deepEqual(r.hits, []);
    assert.equal(r.reserved, false);
  });
}

test('exported-signature: un export nuevo no dispara; una firma cambiada si', () => {
  const nuevo = assessRisk({ files: [f('src/a.js')], lines: [add('src/a.js', 'export function nueva() {}')], config: CFG });
  assert.equal(nuevo.hits.some((h) => h.tripwire === 'exported-signature'), false);
  const cambiado = assessRisk({
    files: [f('src/a.js')],
    lines: [del('src/a.js', 'export function f(a) {'), add('src/a.js', 'export function f(a, b) {')],
    config: CFG,
  });
  assert.ok(cambiado.hits.some((h) => h.tripwire === 'exported-signature'));
  const soloMas = assessRisk({
    files: [f('src/a.js')],
    lines: [del('src/a.js', 'const x = 1;', 3), add('src/a.js', 'export function f(a, b) {', 5)],
    config: CFG,
  });
  assert.equal(soloMas.hits.some((h) => h.tripwire === 'exported-signature'), false);
});

test('exported-signature: formas de CommonJS y de Python', () => {
  for (const [file, text] of [
    ['src/a.js', 'module.exports = { a };'],
    ['src/a.js', 'exports.run = run;'],
    ['src/a.py', 'def publica(x):'],
    ['src/a.py', 'class Modelo:'],
  ]) {
    const r = assessRisk({ files: [f(file)], lines: [del(file, text)], config: CFG });
    assert.ok(r.hits.some((h) => h.tripwire === 'exported-signature'), text);
  }
  const indent = assessRisk({ files: [f('src/a.py')], lines: [del('src/a.py', '    def privada(self):')], config: CFG });
  assert.deepEqual(indent.hits, []);
});

test('I5: module.exports = {…} dispara solo si falta un nombre; un comentario no dispara', async (t) => {
  const sig = (lines) => assessRisk({ files: [f('src/a.js')], lines, config: CFG }).hits.some((h) => h.tripwire === 'exported-signature');
  await t.test('{ a } -> { a, b }: no', () => {
    assert.equal(sig([del('src/a.js', 'module.exports = { a };'), add('src/a.js', 'module.exports = { a, b };')]), false);
  });
  await t.test('{ a, b } -> { a }: sí', () => {
    assert.equal(sig([del('src/a.js', 'module.exports = { a, b };'), add('src/a.js', 'module.exports = { a };')]), true);
  });
  await t.test('comentario que menciona module.exports: no', () => {
    assert.equal(sig([del('src/a.js', '// antes se usaba module.exports = x')]), false);
  });
});

test('nivel y piso sin tripwires', () => {
  const chico = assessRisk({ files: [f('src/util.js')], lines: [add('src/util.js', 'a();', 1), add('src/util.js', 'b();', 2), del('src/util.js', 'c();', 3)], config: CFG });
  assert.equal(chico.level, 'low');
  assert.equal(chico.reserved, false);
  assert.equal(chico.laneFloor, 'trivial');
  const dos = assessRisk({ files: [f('src/a.js'), f('src/b.js')], lines: [], config: CFG });
  assert.equal(dos.level, 'medium');
  assert.equal(dos.laneFloor, 'daily');
  const largo = assessRisk({ files: [f('src/a.js')], lines: Array.from({ length: 11 }, (_, i) => add('src/a.js', `x${i}();`, i + 1)), config: CFG });
  assert.equal(largo.level, 'medium');
  const sinConfig = assessRisk({ files: [f('src/util.js')], lines: [], config: { found: false } });
  assert.equal(sinConfig.level, 'medium');
  assert.equal(sinConfig.laneFloor, 'daily');
});

test('el contenido no se mira en test-paths, salvo pii', () => {
  const t = assessRisk({ files: [f('tests/a.test.js')], lines: [add('tests/a.test.js', 'setInterval(x, 1);')], config: CFG });
  assert.equal(t.hits.some((h) => h.tripwire === 'polling'), false);
  const p = assessRisk({ files: [f('tests/fixtures/u.json')], lines: [add('tests/fixtures/u.json', '{"mail":"ana@example.invalid"}')], config: CFG });
  assert.ok(p.hits.some((h) => h.tripwire === 'pii'));
});

test('UI sin visible-paths sube a plan; con visible-paths y el archivo fuera, sin hit', () => {
  const sin = assessRisk({ files: [f('src/Button.tsx')], lines: [], config: { ...CFG, visiblePaths: [] } });
  assert.equal(sin.laneFloor, 'plan');
  const con = assessRisk({ files: [f('src/Button.tsx')], lines: [], config: CFG });
  assert.equal(con.hits.length, 0);
});

test('maxRisk combina nivel, piso, hits y reserved', () => {
  const low = assessRisk({ files: [f('src/util.js')], lines: [], config: CFG });
  const high = assessRisk({ files: [f('package.json')], lines: [], config: CFG });
  const m = maxRisk(low, high);
  assert.equal(m.level, 'high');
  assert.equal(m.reserved, true);
  assert.equal(m.laneFloor, high.laneFloor);
  assert.deepEqual(m.hits, high.hits);
  const other = assessRisk({ files: [f('.env')], lines: [], config: CFG });
  const both = maxRisk(high, other);
  assert.equal(both.hits.length, 2);
  assert.deepEqual([...both.categories].sort(), ['dependencies', 'security']);
  assert.equal(maxRisk(low, low).level, 'low');
});

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('CLI --diff: manifiesto sin commitear', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'package.json'), '{}\n');
  git(['add', 'package.json'], repo);
  git(['commit', '-q', '-m', 'pkg'], repo);
  fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x"}\n');
  const r = cli(['--diff', 'HEAD', '--cwd', repo], makeTempDir());
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.hits.some((h) => h.tripwire === 'manifest'));
  assert.equal(out.reserved, true);
  assert.equal(out.config.found, false);
  assert.ok(Array.isArray(out.config.warnings));
});

test('CLI --files-from y --deleted', () => {
  const repo = makeRepo();
  const list = path.join(makeTempDir(), 'files.txt');
  fs.writeFileSync(list, '.github/workflows/ci.yml\n\nsrc/a.js\n');
  const r = cli(['--files-from', list, '--deleted', 'src/gone.js', '--cwd', repo], repo);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.hits.some((h) => h.tripwire === 'iac-ci'));
  assert.ok(out.hits.some((h) => h.tripwire === 'deletion' && h.path === 'src/gone.js'));
});

test('CLI sin argumentos: exit 2 con el uso', () => {
  const r = cli([], makeTempDir());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--files-from|--diff/);
});

test('M5: CLI cae a la copia de trabajo de project.md solo sin commits; un project.md inválido en HEAD es error', () => {
  const pm = (dir, type) => {
    fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), `---\ntype: ${type}\n---\n`);
  };
  const list = path.join(makeTempDir(), 'files.txt');
  fs.writeFileSync(list, 'src/a.js\n');
  const empty = makeTempDir();
  git(['init', '-q'], empty);
  pm(empty, 'docs');
  const r0 = cli(['--files-from', list, '--cwd', empty], empty);
  assert.equal(r0.status, 0, r0.stderr);
  assert.equal(JSON.parse(r0.stdout).config.found, true);
  const repo = makeRepo();
  pm(repo, 'nope');
  git(['add', '-f', '.pignolo/project.md'], repo);
  git(['commit', '-q', '-m', 'pm'], repo);
  pm(repo, 'docs');
  const r = cli(['--files-from', list, '--cwd', repo], repo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /project\.md/);
});
