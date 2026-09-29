import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const SPEC_5_4 = ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-05', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04',
  'STATE-04', 'MOTION-03', 'MOTION-04', 'COLOR-02', 'DEPTH-01', 'LAYOUT-04', 'DRIFT-01', 'THEME-01', 'THEME-02', 'COLOR-11',
  'COLOR-12', 'ICON-01', 'CONTENT-01', 'COPY-01', 'META-01'];

test('catalog ids are unique and cover the 25 rules of spec 5.4 plus THEME-03', () => {
  const ids = catalog.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...SPEC_5_4, 'THEME-03'].sort());
  assert.match(catalog.catalogVersion, /^\d+\.\d+\.\d+$/);
});

test('every rule has the fields of spec 5.1 with valid values', () => {
  for (const r of catalog.rules) {
    assert.match(r.id, /^[A-Z0-9]+-\d{2}$/);
    assert.ok(typeof r.criterion === 'string' && r.criterion.length > 0, r.id);
    assert.ok(['script', 'browser', 'agent'].includes(r.class), r.id);
    assert.ok(['document', 'element', 'style'].includes(r.level), r.id);
    assert.ok(['D', 'M', 'D+M'].includes(r.platform), r.id);
    assert.ok(['bloquea', 'alto', 'medio', 'detalle'].includes(r.severity), r.id);
    assert.equal(typeof r.floor, 'boolean', r.id);
    assert.equal(typeof r.acceptsIntentional, 'boolean', r.id);
    assert.ok(typeof r.source === 'string' && r.source.length > 0, r.id);
  }
});

test('no floor rule accepts intentional, and THEME-03 does not either', () => {
  for (const r of catalog.rules) if (r.floor) assert.equal(r.acceptsIntentional, false, r.id);
  assert.equal(catalog.rules.find((r) => r.id === 'THEME-03').acceptsIntentional, false);
});

test('the floor is exactly WCAG A/AA rules plus CONTENT-01 markers', () => {
  const floor = catalog.rules.filter((r) => r.floor).map((r) => r.id).sort();
  assert.deepEqual(floor, ['A11Y-01', 'A11Y-02', 'A11Y-04', 'A11Y-16', 'A11Y-26', 'A11Y-28', 'A11Y-39', 'COLOR-03', 'COLOR-04', 'CONTENT-01', 'STATE-04']);
});
