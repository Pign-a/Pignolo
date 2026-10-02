'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, git } = require('./helpers');
const { matchAny } = require('../plugins/pignolo/lib/globs');
const { readProjectConfig, DEFAULT_TEST_PATHS, TYPES } = require('../plugins/pignolo/lib/project-config');

function write(root, text) {
  fs.mkdirSync(path.join(root, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pignolo', 'project.md'), text);
}
const fm = (yaml) => `---\n${yaml}\n---\nnotas\n`;

test('constantes', () => {
  assert.deepStrictEqual(TYPES, ['code-tested', 'code-untested', 'docs', 'script']);
  assert.strictEqual(DEFAULT_TEST_PATHS.length, 15);
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

test('M2: un plazo vencido no se presenta como ref inexistente ni como project.md ausente', async (t) => {
  const root = makeRepo();
  const expired = () => { throw new Error('se agotó el plazo de 100 ms'); };
  await t.test('rev-parse vencido -> error de plazo', () => {
    assert.throws(() => readProjectConfig({ root, ref: 'HEAD', run: expired }), (e) => /plazo/.test(e.message) && !/no existe/.test(e.message));
  });
  await t.test('git show vencido -> error, no "no encontrado"', () => {
    const run = (args) => (args[0] === 'rev-parse' ? 'abc' : expired());
    assert.throws(() => readProjectConfig({ root, ref: 'HEAD', run }), /plazo/);
  });
  await t.test('ref inexistente -> "no existe"', () => {
    assert.throws(() => readProjectConfig({ root, ref: 'no-existe-esta-ref' }), /no existe/);
  });
});

test('gates.mutation: se lee como texto, sin aviso de clave desconocida, también desde una ref', async (t) => {
  await t.test('en el árbol de trabajo', () => {
    const root = makeRepo();
    write(root, fm('gates:\n  mutation: "npx stryker run"'));
    const c = readProjectConfig({ root });
    assert.strictEqual(c.gates.mutation, 'npx stryker run');
    assert.ok(!c.warnings.some((w) => /desconocida/.test(w)), c.warnings.join(' | '));
  });
  await t.test('desde una ref', () => {
    const root = makeRepo();
    write(root, fm('gates:\n  mutation: "npx stryker run"'));
    git(['add', '-A'], root);
    git(['commit', '-m', 'p'], root);
    fs.rmSync(path.join(root, '.pignolo'), { recursive: true });
    const c = readProjectConfig({ root, ref: 'HEAD' });
    assert.strictEqual(c.gates.mutation, 'npx stryker run');
  });
  await t.test('ausente queda ausente; vacía avisa y se ignora', () => {
    const root = makeRepo();
    write(root, fm('gates:\n  on-done: "npm test"'));
    assert.strictEqual(readProjectConfig({ root }).gates.mutation, undefined);
    write(root, fm('gates:\n  mutation: ""'));
    const c = readProjectConfig({ root });
    assert.strictEqual(c.gates.mutation, undefined);
    assert.ok(c.warnings.some((w) => /gates\.mutation/.test(w)));
  });
  await t.test('sigue avisando por claves desconocidas', () => {
    const root = makeRepo();
    write(root, fm('gates:\n  otra: "x"'));
    assert.ok(readProjectConfig({ root }).warnings.some((w) => /desconocida "otra"/.test(w)));
  });
});

test('presentation y canvas-consent: claves aditivas, valor inválido es aviso y no error', () => {
  const root = makeRepo();
  write(root, fm('type: code-tested\npresentation: text\ncanvas-consent: true'));
  const ok = readProjectConfig({ root });
  assert.strictEqual(ok.presentation, 'text');
  assert.strictEqual(ok.canvasConsent, true);
  assert.ok(!ok.warnings.some((w) => /desconocida/.test(w)), ok.warnings.join(' | '));

  write(root, fm('type: code-tested\npresentation: bogus\ncanvas-consent: maybe'));
  const bad = readProjectConfig({ root });
  assert.strictEqual(bad.presentation, null);
  assert.strictEqual(bad.canvasConsent, false);
  assert.ok(bad.warnings.some((w) => /presentation/.test(w) && /bogus/.test(w)));
  assert.ok(bad.warnings.some((w) => /canvas-consent/.test(w)));

  write(root, fm('type: code-tested'));
  const none = readProjectConfig({ root });
  assert.strictEqual(none.presentation, null);
  assert.strictEqual(none.canvasConsent, false);
  assert.strictEqual(readProjectConfig({ root: makeRepo() }).presentation, null);
});

test('gates.pre-merge-files (hito 7a, D-7-3): con {files} es válida, sin el marcador se ignora con aviso; gates.repeat ya no existe', () => {
  const root = makeRepo();
  write(root, fm('gates:\n  pre-merge: "npm test"\n  pre-merge-files: "node --test {files}"'));
  const ok = readProjectConfig({ root });
  assert.strictEqual(ok.gates['pre-merge-files'], 'node --test {files}');
  assert.ok(!ok.warnings.some((w) => /pre-merge-files|desconocida/.test(w)), ok.warnings.join(' | '));

  write(root, fm('gates:\n  pre-merge: "npm test"\n  pre-merge-files: "node --test"'));
  const bad = readProjectConfig({ root });
  assert.strictEqual(bad.gates['pre-merge-files'], undefined, 'sin {files} la clave es inválida');
  assert.ok(bad.warnings.some((w) => /pre-merge-files.*\{files\}/.test(w)), bad.warnings.join(' | '));

  write(root, fm('gates:\n  pre-merge: "npm test"\n  repeat: 3'));
  const rep = readProjectConfig({ root });
  assert.strictEqual(rep.gates.repeat, undefined);
  assert.ok(rep.warnings.some((w) => /gates: clave desconocida "repeat"/.test(w)), 'gates.repeat ya no existe: clave desconocida');
});

// A8D-01: los defaults anclados no tratan los documentos como tests.
test('defaults de test-paths: los documentos no son tests y los tests siguen siéndolo', () => {
  const docs = ['docs/specs/a.md', 'docs/specs/2026-10-01-x-design.md', 'docs/research/latest.md', 'docs/plans/p.md', 'doc/specs/a.md', 'docs/contest/x.md', 'README.md', 'src/app.js'];
  for (const d of docs) assert.strictEqual(matchAny(DEFAULT_TEST_PATHS, d), false, d + ' no debe contarse como test');
  const tests = ['src/a.test.js', 'x/b.spec.ts', 'pkg/foo_test.go', 'tests/x.js', 'test/y.js', 'src/__tests__/z.js', 'pkg/test_algo.py', 'a/__snapshots__/s.snap', 'a/fixtures/f.json'];
  for (const t of tests) assert.strictEqual(matchAny(DEFAULT_TEST_PATHS, t), true, t + ' debe contarse como test');
});

test('un test-paths declarado se respeta tal cual, aunque case documentos', () => {
  const root = makeRepo();
  write(root, fm('type: docs\ntest-paths:\n  - "*spec*"'));
  const c = readProjectConfig({ root });
  assert.strictEqual(c.testPathsDeclared, true);
  assert.deepStrictEqual(c.testPaths, ['*spec*']);
  assert.strictEqual(matchAny(c.testPaths, 'docs/specs/a.md'), true);
});

// I-5 (revisión final del hito 8d): los anclados dejaban sin proteger convenciones comunes de tests
test('I-5: los defaults cubren de nuevo spec/, *_spec.*, *-test.*, tests.py y conftest.py sin volver a casar documentos', () => {
  const tests = ['spec/models/user_spec.rb', 'spec/spec_helper.rb', 'app/spec/x.rb', 'lib/user_spec.rb', 'app/tests.py', 'conftest.py', 'pkg/conftest.py', 'lib/foo-test.js', 'src/a-test.ts'];
  for (const t of tests) assert.strictEqual(matchAny(DEFAULT_TEST_PATHS, t), true, t + ' debe contarse como test');
  const noTests = ['docs/specs/a.md', 'docs/research/latest.md', 'src/latest.js', 'src/contest.js', 'src/inspector.js', 'docs/specs/2026-10-01-x-design.md', 'src/attests.js'];
  for (const d of noTests) assert.strictEqual(matchAny(DEFAULT_TEST_PATHS, d), false, d + ' no debe contarse como test');
});
