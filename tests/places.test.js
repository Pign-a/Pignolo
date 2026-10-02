'use strict';
// Hito 8d, Task 1: el mapa `places` (validación de rutas, defaults, resolución).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const {
  PLACE_KINDS, PLACE_DEFAULTS, RECOMMENDED_REFERENCE, validatePlacePath, declaredPatternFor, resolvePlaces, placeFor, samePath, isInside,
} = require('../plugins/pignolo/lib/places');

const projectMd = (root, yaml) => {
  fs.mkdirSync(path.join(root, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pignolo', 'project.md'), `---\n${yaml}\n---\nnotas\n`);
};
const bareConfig = () => readProjectConfig({ root: makeRepo() });

test('constants are frozen and reference has no default', () => {
  assert.deepEqual([...PLACE_KINDS], ['spec', 'plan', 'research', 'reference', 'design', 'private']);
  assert.equal(PLACE_DEFAULTS.reference, undefined);
  assert.equal(PLACE_DEFAULTS.spec, 'docs/specs/');
  assert.equal(RECOMMENDED_REFERENCE, 'docs/references/');
  assert.throws(() => { PLACE_DEFAULTS.x = 'y'; }, TypeError);
  assert.throws(() => { PLACE_KINDS.push('x'); }, TypeError);
});

test('validatePlacePath rejects each bad shape with its exact reason', async (t) => {
  const bad = [
    ['/abs/x', 'absolute'], ['C:/x', 'drive'], ['a\\b', 'backslash'], ['a/../b', 'dot-segment'], ['a//b', 'empty-segment'], ['./a', 'dot-segment'],
    ['docs/CON/', 'reserved-name'], ['docs/nul.txt/', 'reserved-name'], ['x?', 'bad-char'], ['docs./', 'trailing-dot-or-space'], ['docs /', 'trailing-dot-or-space'],
    ['.pignolo/x/', 'inside-protected'], ['.git/x/', 'inside-protected'], ['src/', 'framework-name'], ['public/x/', 'framework-name'], ['a'.repeat(101), 'too-long'],
  ];
  for (const [raw, reason] of bad) {
    await t.test(`${raw.slice(0, 20)} -> ${reason}`, () => {
      const r = validatePlacePath(raw);
      assert.equal(r.ok, false);
      assert.equal(r.reason, reason);
    });
  }
  for (const [raw, want] of [['docs/specs', 'docs/specs/'], ['docs/specs/', 'docs/specs/'], ['doc/especificaciones/', 'doc/especificaciones/']]) {
    assert.deepEqual(validatePlacePath(raw), { ok: true, path: want });
  }
});

test('the defaults of test-paths do not count (A8D-01); declared ones do, per file', () => {
  const none = bareConfig();
  assert.equal(none.testPathsDeclared, false);
  assert.deepEqual(validatePlacePath('docs/specs/', { config: none }), { ok: true, path: 'docs/specs/' });
  assert.equal(declaredPatternFor(none, 'docs/specs/a.md'), null);
  // Aun con un config cuyos testPaths casan documentos, sin declarar no cuentan (no depende de los defaults anclados).
  const loose = { testPaths: ['*spec*'], testPathsDeclared: false };
  assert.equal(validatePlacePath('docs/specs/', { config: loose }).ok, true);
  assert.equal(declaredPatternFor(loose, 'docs/specs/a.md'), null);

  const root = makeRepo();
  projectMd(root, 'test-paths:\n  - "*spec*"');
  const declared = readProjectConfig({ root });
  const r = validatePlacePath('docs/specs/', { config: declared });
  assert.deepEqual(r, { ok: false, reason: 'inside-test-paths', detail: '*spec*' });
  assert.equal(declaredPatternFor(declared, 'docs/specs/a.md'), '*spec*');

  const root2 = makeRepo();
  projectMd(root2, 'test-paths:\n  - "**/*.spec.ts"');
  const narrow = readProjectConfig({ root: root2 });
  assert.equal(validatePlacePath('docs/specs/', { config: narrow }).ok, true);
  assert.equal(declaredPatternFor(narrow, 'docs/specs/a.md'), null);

  const root3 = makeRepo();
  projectMd(root3, 'test-paths:\n  - "tests/**"');
  const tests = readProjectConfig({ root: root3 });
  assert.equal(validatePlacePath('tests/docs/', { config: tests }).reason, 'inside-test-paths');
  assert.equal(validatePlacePath('docs/specs/', { config: tests }).ok, true);
});

test('high-risk-paths, contracts and serial-paths declared also freeze a folder', () => {
  const root = makeRepo();
  projectMd(root, 'high-risk-paths:\n  - "docs/**"');
  const c = readProjectConfig({ root });
  assert.equal(validatePlacePath('docs/specs/', { config: c }).detail, 'docs/**');
});

test('resolvePlaces: nothing declared gives five defaults and reference undeclared', () => {
  const { places, warnings } = resolvePlaces(bareConfig());
  for (const k of ['spec', 'plan', 'research', 'design', 'private']) assert.deepEqual(places[k], { kind: k, path: PLACE_DEFAULTS[k], source: 'default' });
  assert.deepEqual(places.reference, { kind: 'reference', path: null, source: 'undeclared' });
  assert.deepEqual(warnings, []);
});

test('resolvePlaces: a declared reference is declared; an invalid one is dropped with a warning', () => {
  const root = makeRepo();
  projectMd(root, 'places:\n  reference: docs/references/\n  spec: src/\n');
  const { places, warnings } = resolvePlaces(readProjectConfig({ root }));
  assert.deepEqual(places.reference, { kind: 'reference', path: 'docs/references/', source: 'declared' });
  assert.equal(places.spec.source, 'default');
  assert.ok(warnings.some((w) => w.includes('places.spec') && w.includes('framework')));
});

test('resolvePlaces: a path that contains another place goes back to its default', () => {
  const { places, warnings } = resolvePlaces({ places: { spec: 'docs/', plan: 'docs/plans/' } });
  assert.equal(places.spec.path, 'docs/specs/');
  assert.equal(places.spec.source, 'default');
  assert.equal(places.plan.source, 'declared');
  assert.ok(warnings.some((w) => w.includes('docs/') && w.includes('docs/plans/') && w.includes('contiene')));
});

test('resolvePlaces: the same path in two kinds (case-insensitive) sends the second back to default', () => {
  const { places, warnings } = resolvePlaces({ places: { spec: 'Docs/specs/', plan: 'docs/specs/' } });
  assert.equal(places.spec.path, 'Docs/specs/');
  assert.equal(places.plan.path, 'docs/plans/');
  assert.equal(places.plan.source, 'default');
  assert.ok(warnings.some((w) => w.includes('case-collision')));
});

test('placeFor throws unknown-kind', () => {
  assert.throws(() => placeFor(bareConfig(), 'x'), (e) => e.kind === 'unknown-kind');
  assert.equal(placeFor(bareConfig(), 'plan').path, 'docs/plans/');
});

test('samePath and isInside normalise the trailing slash and the case', () => {
  assert.equal(samePath('docs/specs', 'docs/specs/'), true);
  assert.equal(samePath('Docs/specs/', 'docs/specs/'), process.platform !== 'linux');
  assert.equal(isInside('docs/specs/x/', 'docs/specs/'), true);
  assert.equal(isInside('docs/specs/', 'docs/specs/'), false);
  assert.equal(isInside('docs/specsX/', 'docs/specs/'), false);
});

test('regression guard: no default is rejected with the config of a repo without project.md', () => {
  const config = bareConfig();
  for (const p of [...Object.values(PLACE_DEFAULTS), RECOMMENDED_REFERENCE]) {
    const r = validatePlacePath(p, { config });
    assert.equal(r.ok, true, `${p}: ${r.reason}`);
  }
});
