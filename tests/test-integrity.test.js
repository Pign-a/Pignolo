'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, git } = require('./helpers');
const { weakenings, classify, KINDS } = require('../plugins/pignolo/lib/test-integrity');
const { workingTree, headSha } = require('../plugins/pignolo/lib/changes');

const OPTS = { testPaths: ['tests/'], protectedTestConfig: ['jest.config.js', 'pytest.ini'] };
const add = (p, text, line = 1) => ({ path: p, line, text, sign: '+' });
const del = (p, text, line = 1) => ({ path: p, line, text, sign: '-' });
const kinds = (lines, files = []) => classify(lines, files, OPTS).map((w) => w.kind);

test('KINDS es la lista cerrada', () => {
  assert.deepStrictEqual([...KINDS].sort(), [
    'assertion-removed', 'only', 'retry', 'skip', 'snapshot-changed', 'snapshot-update', 'test-deleted',
  ]);
});

const TABLE = [
  ['it.skip en un test', add('tests/a.test.js', "  it.skip('x', () => {});"), ['skip']],
  ['it.skip fuera de tests', add('src/a.js', "  it.skip('x', () => {});"), []],
  ['process.exit no es xit', add('tests/a.test.js', '  process.exit(1)'), []],
  ['benefit no es fit', add('tests/a.test.js', '  benefit(x)'), []],
  ['skip: true en opciones', add('tests/a.test.js', "test('x', { skip: true }, () => {});"), ['skip']],
  ['xit', add('tests/a.test.js', "xit('x', () => {});"), ['skip']],
  ['describe.skip', add('tests/a.test.js', "describe.skip('x', () => {});"), ['skip']],
  ['t.skip', add('tests/a.test.js', "  t.skip('x');"), ['skip']],
  ['it.todo', add('tests/a.test.js', "it.todo('x');"), ['skip']],
  ['pytest.mark.skip', add('tests/test_a.py', '@pytest.mark.skip'), ['skip']],
  ['pytest.mark.xfail', add('tests/test_a.py', '@pytest.mark.xfail(reason="x")'), ['skip']],
  ['@Disabled', add('tests/ATest.java', '  @Disabled'), ['skip']],
  ['[Ignore]', add('tests/ATests.cs', '  [Ignore]'), ['skip']],
  ['it.only', add('tests/a.test.js', "  it.only('x', () => {});"), ['only']],
  ['fit', add('tests/a.test.js', "fit('x', () => {});"), ['only']],
  ['only: true', add('tests/a.test.js', "test('x', { only: true }, () => {});"), ['only']],
  ['jest.retryTimes', add('tests/a.test.js', 'jest.retryTimes(3)'), ['retry']],
  ['retries: en config protegida', add('jest.config.js', '  retries: 2,'), ['retry']],
  ['retries: fuera de tests y config', add('src/a.js', '  retries: 2,'), []],
  ['pytest flaky', add('tests/test_a.py', '@pytest.mark.flaky(reruns=3)'), ['retry']],
  ['jest -u en package.json', add('package.json', '    "test": "jest -u"'), ['snapshot-update']],
  ['jest sin -u en package.json', add('package.json', '    "test": "jest"'), []],
  ['--update-snapshots en config', add('pytest.ini', 'addopts = --update-snapshots'), ['snapshot-update']],
  ['skip en package.json no cuenta', add('package.json', '    "x": "it.skip("'), []],
];
for (const [name, line, want] of TABLE) {
  test(`classify: ${name}`, () => assert.deepStrictEqual(kinds([line]), want));
}

test('classify: la línea y el texto vienen del diff', () => {
  const r = classify([add('tests/a.test.js', "  it.skip('x');", 7)], [], OPTS);
  assert.deepStrictEqual(r, [{ path: 'tests/a.test.js', line: 7, kind: 'skip', text: "  it.skip('x');" }]);
});

test('classify: 2 aserciones quitadas y 1 agregada dan un assertion-removed por archivo', () => {
  const lines = [
    del('tests/a.test.js', '  expect(a).toBe(1);', 3),
    del('tests/a.test.js', '  expect(b).toBe(2);', 4),
    add('tests/a.test.js', '  expect(a).toBe(1);', 3),
  ];
  const r = classify(lines, [{ path: 'tests/a.test.js', status: 'M' }], OPTS);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].kind, 'assertion-removed');
  assert.strictEqual(r[0].path, 'tests/a.test.js');
  assert.match(r[0].text, /2/);
  assert.match(r[0].text, /1/);
});

test('classify: una aserción quitada y una agregada no dan nada', () => {
  const lines = [del('tests/a.test.js', '  expect(a).toBe(1);'), add('tests/a.test.js', '  expect(a).toBe(2);')];
  assert.deepStrictEqual(kinds(lines, [{ path: 'tests/a.test.js', status: 'M' }]), []);
});

test('classify: assert de Python al comienzo de la línea cuenta', () => {
  const lines = [del('tests/test_a.py', '    assert x == 1'), del('tests/test_a.py', '    self.assertEqual(a, b)')];
  assert.deepStrictEqual(kinds(lines, [{ path: 'tests/test_a.py', status: 'M' }]), ['assertion-removed']);
});

test('classify: archivo borrado da test-deleted y no assertion-removed', () => {
  const lines = [del('tests/a.test.js', '  expect(a).toBe(1);'), del('tests/a.test.js', '  expect(b).toBe(2);')];
  const r = classify(lines, [{ path: 'tests/a.test.js', status: 'D' }], OPTS);
  assert.deepStrictEqual(r.map((w) => w.kind), ['test-deleted']);
  assert.strictEqual(r[0].path, 'tests/a.test.js');
});

test('classify: borrar un archivo fuera de test-paths no da nada', () => {
  assert.deepStrictEqual(kinds([], [{ path: 'src/a.js', status: 'D' }]), []);
});

test('classify: snapshot modificado o borrado da snapshot-changed, agregado no', () => {
  const p = 'tests/__snapshots__/a.snap';
  assert.deepStrictEqual(kinds([], [{ path: p, status: 'M' }]), ['snapshot-changed']);
  assert.deepStrictEqual(kinds([], [{ path: p, status: 'A' }]), []);
  assert.deepStrictEqual(kinds([], [{ path: 'tests/golden/out.txt', status: 'M' }]), ['snapshot-changed']);
  assert.ok(kinds([], [{ path: p, status: 'D' }]).includes('snapshot-changed'));
});

test('weakenings: it.skip en la copia de trabajo da un skip con la línea correcta', () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, 'tests'));
  const f = path.join(dir, 'tests', 'a.test.js');
  fs.writeFileSync(f, "const t = require('node:test');\n\nt.it('x', () => {});\n");
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'test'], dir);
  fs.writeFileSync(f, "const t = require('node:test');\n\nit.skip('x', () => {});\n");
  const r = weakenings({ cwd: dir, base: headSha({ cwd: dir }), tree: workingTree({ cwd: dir }), testPaths: ['tests/'], protectedTestConfig: [] });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].kind, 'skip');
  assert.strictEqual(r[0].path, 'tests/a.test.js');
  assert.strictEqual(r[0].line, 3);
});

test('weakenings: sin cambios no da nada, y un test borrado da test-deleted', () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), "it('x', () => { expect(1).toBe(1); });\n");
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'test'], dir);
  const base = headSha({ cwd: dir });
  const opts = { cwd: dir, base, testPaths: ['tests/'], protectedTestConfig: [] };
  assert.deepStrictEqual(weakenings({ ...opts, tree: workingTree({ cwd: dir }) }), []);
  fs.rmSync(path.join(dir, 'tests', 'a.test.js'));
  const r = weakenings({ ...opts, tree: workingTree({ cwd: dir }) });
  assert.deepStrictEqual(r.map((w) => w.kind), ['test-deleted']);
});
