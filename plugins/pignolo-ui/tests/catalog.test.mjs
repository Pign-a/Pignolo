import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, checkCatalog } from '../lib/catalog.mjs';

const catalog = loadCatalog();
const SPEC_5_4 = ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-05', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04',
  'STATE-04', 'MOTION-03', 'MOTION-04', 'COLOR-02', 'DEPTH-01', 'LAYOUT-04', 'DRIFT-01', 'THEME-01', 'THEME-02', 'COLOR-11',
  'COLOR-12', 'ICON-01', 'CONTENT-01', 'COPY-01', 'META-01'];
const BROWSER = ['NAV-01', 'LAYOUT-10', 'LAYOUT-11', 'MOTION-07'];

test('catalog ids cover the 25 rules of spec 5.4, THEME-03 and the 4 browser checks', () => {
  const ids = catalog.rules.map((r) => r.id);
  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03', ...BROWSER].sort());
  assert.equal(catalog.catalogVersion, '0.2.0');
});

test('the real catalog has no problems', () => {
  assert.deepEqual(checkCatalog(catalog), []);
});

test('checkers: 25 ui-check, THEME-03 design-md, browser rules browser; COLOR-12 related to COLOR-03', () => {
  const by = (c) => catalog.rules.filter((r) => r.checker === c).map((r) => r.id).sort();
  assert.deepEqual(by('ui-check'), [...SPEC_5_4].sort());
  assert.deepEqual(by('design-md'), ['THEME-03']);
  assert.deepEqual(by('browser'), [...BROWSER].sort());
  for (const id of BROWSER) assert.equal(catalog.rules.find((r) => r.id === id).class, 'browser', id);
  assert.deepEqual(catalog.rules.find((r) => r.id === 'COLOR-12').related, ['COLOR-03']);
});

test('the floor is WCAG A/AA rules plus CONTENT-01 markers plus NAV-01 and LAYOUT-11', () => {
  const floor = catalog.rules.filter((r) => r.floor).map((r) => r.id).sort();
  assert.deepEqual(floor, ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04',
    'CONTENT-01', 'LAYOUT-11', 'NAV-01', 'STATE-04'].sort());
});

// One synthetic broken catalog per problem checkCatalog reports.
const base = (over = {}) => ({ id: 'X-01', criterion: 'c', class: 'script', level: 'style', platform: 'D+M', severity: 'medio',
  floor: false, acceptsIntentional: false, source: 'WCAG 2.2 SC 1.4.3', checker: 'ui-check', related: [], conflicts: [], ...over });
const CASES = [
  ['duplicate id', [base(), base()], /duplicate id X-01/],
  ['missing field', [base({ criterion: undefined })], /X-01: criterion/],
  ['invalid severity', [base({ severity: 'high' })], /X-01: severity/],
  ['invalid level', [base({ level: 'page' })], /X-01: level/],
  ['floor not boolean', [base({ floor: 'yes' })], /X-01: floor/],
  ['related not a list', [base({ related: 'X-02' })], /X-01: related/],
  ['checker outside the enum', [base({ checker: 'eslint' })], /X-01: checker/],
  ['script rule with browser checker', [base({ checker: 'browser' })], /X-01: class script .*checker browser/],
  ['browser rule without browser checker', [base({ class: 'browser' })], /X-01: class browser .*checker ui-check/],
  ['related id that does not exist', [base({ related: ['X-09'] })], /X-01: related X-09 does not exist/],
  ['conflicts id that does not exist', [base({ conflicts: ['X-09'] })], /X-01: conflicts X-09 does not exist/],
  ['two conflicting rules present at once', [base({ conflicts: ['X-02'] }), base({ id: 'X-02' })], /X-01 and X-02 conflict/],
  ['floor rule that accepts intentional', [base({ floor: true, acceptsIntentional: true })], /X-01: floor rule accepts intentional/],
  ['source without version or date', [base({ source: 'WCAG contrast' })], /X-01: source has no version or date/],
];

for (const [name, rules, message] of CASES) {
  test(`checkCatalog reports: ${name}`, () => {
    const problems = checkCatalog({ catalogVersion: '0.2.0', rules });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], message);
  });
}

test('checkCatalog: conflicting rules on disjoint platforms can coexist', () => {
  const rules = [base({ platform: 'D', conflicts: ['X-02'] }), base({ id: 'X-02', platform: 'M' })];
  assert.deepEqual(checkCatalog({ catalogVersion: '0.2.0', rules }), []);
});
