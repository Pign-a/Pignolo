import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, checkCatalog } from '../lib/catalog.mjs';

const catalog = loadCatalog();
const SPEC_5_4 = ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-05', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04',
  'STATE-04', 'MOTION-03', 'MOTION-04', 'COLOR-02', 'DEPTH-01', 'LAYOUT-04', 'DRIFT-01', 'THEME-01', 'THEME-02', 'COLOR-11',
  'COLOR-12', 'ICON-01', 'CONTENT-01', 'COPY-01', 'META-01'];
const BROWSER = ['NAV-01', 'LAYOUT-10', 'LAYOUT-11', 'MOTION-07', 'TARGET-01', 'FORM-01', 'TYPE-01', 'TYPE-02', 'RESP-01', 'STRESS-01', 'STRESS-02', 'STRESS-03'];
const STATIC_4E = ['A11Y-41', 'MOTION-05', 'MOTION-06', 'MOTION-08', 'MOTION-09', 'STRESS-04'];
const SEO = ['SEO-01', 'SEO-02', 'SEO-04', 'SEO-05', 'SEO-06', 'SEO-09', 'SEO-18'];

test('catalog ids cover the 25 rules of spec 5.4, THEME-03, the browser checks and the 7 SEO ids', () => {
  const ids = catalog.rules.map((r) => r.id);
  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03', ...BROWSER, ...STATIC_4E, ...SEO].sort());
  assert.equal(catalog.catalogVersion, '0.4.0');
});

test('the real catalog has no problems', () => {
  assert.deepEqual(checkCatalog(catalog), []);
});

test('checkers: 25 + 7 SEO ui-check, THEME-03 design-md, browser rules browser; COLOR-12 related to COLOR-03', () => {
  const by = (c) => catalog.rules.filter((r) => r.checker === c).map((r) => r.id).sort();
  assert.deepEqual(by('ui-check'), [...SPEC_5_4, ...STATIC_4E, ...SEO].sort());
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

test('SEO never blocks: document level, no floor, no bloquea; SEO-02 and SEO-09 refuse intentional', () => {
  for (const id of SEO) {
    const r = catalog.rules.find((x) => x.id === id);
    assert.equal(r.level, 'document', id);
    assert.equal(r.floor, false, id);
    assert.notEqual(r.severity, 'bloquea', id);
    assert.equal(r.acceptsIntentional, !['SEO-02', 'SEO-09'].includes(id), id);
  }
  assert.equal(catalog.rules.find((x) => x.id === 'SEO-02').severity, 'alto');
  assert.equal(catalog.rules.find((x) => x.id === 'SEO-18').severity, 'detalle');
});

// Hito 4e: the new taste and measure rules never block and never join the floor.
const NEW_4E = {
  'A11Y-41': ['medio', false],
  'MOTION-05': ['medio', true],
  'MOTION-06': ['detalle', true],
  'MOTION-08': ['medio', true],
  'MOTION-09': ['detalle', true],
  'STRESS-04': ['alto', true],
  'STRESS-01': ['alto', false],
  'STRESS-02': ['alto', false],
  'STRESS-03': ['alto', false], 'TARGET-01': ['alto', false], 'FORM-01': ['medio', false], 'TYPE-01': ['medio', true], 'TYPE-02': ['medio', true], 'RESP-01': ['medio', true] };
test('hito 4e rules: no floor, never bloquea, TARGET-01 and FORM-01 refuse intentional, the type rules accept it', () => {
  for (const [id, [severity, intentional]] of Object.entries(NEW_4E)) {
    const r = catalog.rules.find((x) => x.id === id);
    assert.ok(r, id);
    assert.equal(r.floor, false, id);
    assert.equal(r.severity, severity, id);
    assert.equal(r.acceptsIntentional, intentional, id);
  }
});
