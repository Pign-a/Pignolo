import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSymptoms, checkSymptoms, mergeUserSymptoms, matchWords, buildMenu } from '../lib/symptoms.mjs';
import { loadCatalog } from '../lib/catalog.mjs';

const catalog = loadCatalog();
const dict = () => loadSymptoms();
const one = (over) => ({ version: 1, symptoms: [{ id: 'ok-one', label: 'x', words: ['hola'], rules: ['COLOR-03'], fix: 'f', ...over }] });

test('the real dictionary is valid and has 11 symptoms (regression guard)', () => {
  assert.deepEqual(checkSymptoms(dict(), { catalog, judgmentIds: ['J-01'] }), []);
  assert.equal(dict().symptoms.length, 11);
});

test('checkSymptoms rejects each broken rule', () => {
  const opts = { catalog, judgmentIds: ['J-01'] };
  const d = dict();
  const dup = { ...d, symptoms: [...d.symptoms, d.symptoms[0]] };
  assert.ok(checkSymptoms(dup, opts).some((p) => /duplicate id/.test(p)));
  assert.ok(checkSymptoms(one({ words: [] }), opts).some((p) => /words/.test(p)));
  assert.ok(checkSymptoms(one({ words: ['Hola'] }), opts).some((p) => /lowercase/.test(p)));
  assert.ok(checkSymptoms(one({ rules: ['NOPE-99'] }), opts).some((p) => /unknown rule NOPE-99/.test(p)));
  assert.ok(checkSymptoms(one({ id: 'Not Kebab' }), opts).some((p) => /invalid id/.test(p)));
  assert.deepEqual(checkSymptoms(one({}), opts), []);
});

test('matchWords is case and accent blind', () => {
  const s = dict().symptoms;
  assert.deepEqual(matchWords('Se ve plana y apretada', s), ['flat', 'cramped']);
  assert.deepEqual(matchWords('no se ve donde estoy con el teclado', s), ['no-focus']);
  assert.deepEqual(matchWords('NO SE VE DÓNDE ESTOY CON EL TECLADO', s), ['no-focus']);
  assert.deepEqual(matchWords('hola', s), []);
});

test('buildMenu preticks symptoms with a failed rule', () => {
  const s = dict().symptoms;
  const menu = buildMenu({ symptoms: s, failedIds: ['COLOR-03'] });
  assert.equal(menu.length, 11);
  assert.deepEqual(menu.map((m) => m.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(menu.filter((m) => m.preticked).map((m) => m.id), ['hard-to-read', 'dark-broken']);
  const j = buildMenu({ symptoms: s, failedIds: ['J-01'] });
  assert.deepEqual(j.filter((m) => m.preticked).map((m) => m.id), ['no-hierarchy']);
  assert.equal(buildMenu({ symptoms: s, failedIds: [] }).some((m) => m.preticked), false);
});

test('mergeUserSymptoms adds words to an existing id and demands label+rules for a new one', () => {
  const merged = mergeUserSymptoms(dict(), [{ id: 'flat', words: ['cartel feo'] }]);
  assert.ok(merged.symptoms.find((x) => x.id === 'flat').words.includes('cartel feo'));
  assert.deepEqual(matchWords('un cartel feo', merged.symptoms), ['flat']);
  assert.throws(() => mergeUserSymptoms(dict(), [{ id: 'nuevo', words: ['x'] }]), /label/);
  const withNew = mergeUserSymptoms(dict(), [{ id: 'nuevo', words: ['x'], label: 'L', rules: ['COLOR-03'] }]);
  assert.equal(withNew.symptoms.length, 12);
  // the original dictionary object is not mutated
  assert.ok(!dict().symptoms.find((x) => x.id === 'flat').words.includes('cartel feo'));
});
