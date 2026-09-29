'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, git } = require('./helpers');
const { readProjectConfig, DEFAULT_TEST_PATHS, TYPES } = require('../plugins/pignolo/lib/project-config');

function write(root, text) {
  fs.mkdirSync(path.join(root, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pignolo', 'project.md'), text);
}
const fm = (yaml) => `---\n${yaml}\n---\nnotas\n`;

test('constantes', () => {
  assert.deepStrictEqual(TYPES, ['code-tested', 'code-untested', 'docs', 'script']);
  assert.strictEqual(DEFAULT_TEST_PATHS.length, 7);
  assert.throws(() => { DEFAULT_TEST_PATHS.push('x'); }, TypeError);
});

test('sin archivo: modo conservador', () => {
  const root = makeRepo();
  const c = readProjectConfig({ root });
  assert.strictEqual(c.found, false);
  assert.strictEqual(c.conservative, true);
  assert.deepStrictEqual(c.testPaths, [...DEFAULT_TEST_PATHS]);
  assert.strictEqual(c.testPathsDeclared, false);
  assert.ok(c.warnings.some((w) => w.includes('/pignolo:init')));
  assert.ok(c.protectedTestConfig.includes('.pignolo/project.md'));
  assert.strictEqual(c.type, null);
});

test('test-paths declarado y sin declarar', () => {
  const root = makeRepo();
  write(root, fm('type: docs\ntest-paths:\n  - tests/'));
  let c = readProjectConfig({ root });
  assert.strictEqual(c.found, true);
  assert.strictEqual(c.conservative, false);
  assert.strictEqual(c.testPathsDeclared, true);
  assert.deepStrictEqual(c.testPaths, ['tests/']);
  assert.ok(!c.warnings.some((w) => w.includes('test-paths sin declarar')));
  write(root, fm('type: docs'));
  c = readProjectConfig({ root });
  assert.strictEqual(c.testPathsDeclared, false);
  assert.deepStrictEqual(c.testPaths, [...DEFAULT_TEST_PATHS]);
  assert.ok(c.warnings.some((w) => w.includes('test-paths sin declarar')));
});

test('mapeo, escalar como lista de uno, gates y claves desconocidas', () => {
  const root = makeRepo();
  write(root, fm('type: code-tested\ntest-paths: tests/\ngates:\n  on-done: node check.js\n  extra: x\nhigh-risk-paths:\n  - src/pay/\nmutation: true\nprofile: max\ndeps-install: npm ci\nmagia: 1'));
  const c = readProjectConfig({ root });
  assert.deepStrictEqual(c.testPaths, ['tests/']);
  assert.strictEqual(c.gates['on-done'], 'node check.js');
  assert.deepStrictEqual(c.highRiskPaths, ['src/pay/']);
  assert.strictEqual(c.mutation, true);
  assert.strictEqual(c.profile, 'max');
  assert.strictEqual(c.depsInstall, 'npm ci');
  assert.ok(c.warnings.some((w) => w.includes('magia')));
  assert.ok(c.warnings.some((w) => w.includes('extra')));
});

test('protectedTestConfig incluye siempre project.md', () => {
  const root = makeRepo();
  write(root, fm('type: docs'));
  assert.deepStrictEqual(readProjectConfig({ root }).protectedTestConfig, ['.pignolo/project.md']);
  write(root, fm('type: docs\nprotected-test-config:\n  - jest.config.js'));
  assert.deepStrictEqual(readProjectConfig({ root }).protectedTestConfig, ['jest.config.js', '.pignolo/project.md']);
});

test('inválidos lanzan project.md inválido', async (t) => {
  const cases = [
    ['type: other', /^project\.md inválido: type/],
    ['pii-patterns:\n  - "[unclosed"', /^project\.md inválido: pii-patterns/],
    ['type: docs\n\tx: 1', /^project\.md inválido: yaml-lite: línea/],
  ];
  for (const [yaml, re] of cases) {
    await t.test(yaml.split('\n')[0], () => {
      const root = makeRepo();
      write(root, fm(yaml));
      assert.throws(() => readProjectConfig({ root }), (e) => re.test(e.message));
    });
  }
});

test('desde ref: ignora la copia de trabajo', () => {
  const root = makeRepo();
  write(root, fm('type: code-tested\ngates:\n  on-done: node check.js'));
  git(['add', '.pignolo/project.md'], root);
  git(['commit', '-q', '-m', 'c1'], root);
  const c1 = git(['rev-parse', 'HEAD'], root);
  write(root, fm('type: code-tested\ngates:\n  on-done: "true"'));
  assert.strictEqual(readProjectConfig({ root, ref: c1 }).gates['on-done'], 'node check.js');
  assert.strictEqual(readProjectConfig({ root }).gates['on-done'], 'true');
});

test('ref sin el archivo = no encontrado; ref inexistente lanza', () => {
  const root = makeRepo();
  write(root, fm('type: docs'));
  const c = readProjectConfig({ root, ref: 'HEAD' });
  assert.strictEqual(c.found, false);
  assert.strictEqual(c.conservative, true);
  assert.throws(() => readProjectConfig({ root, ref: 'no-existe-esta-ref' }));
});

test('usa el run recibido en vez de abrir un plazo propio', () => {
  const root = makeRepo();
  const calls = [];
  const run = (args) => { calls.push(args); return args[0] === 'show' ? fm('type: docs') : 'abc'; };
  const c = readProjectConfig({ root, ref: 'X', run });
  assert.strictEqual(c.type, 'docs');
  assert.ok(calls.length >= 1);
});
