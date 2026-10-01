import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editDistance, normalizedDistance, mockupDistance, tileFingerprint, tileDistance, pairwise,
} from '../lib/fingerprint.mjs';

const mock = (over = {}) => ({
  v: 1, kind: 'mockup', width: 1440,
  blocks: ['header', 'section', 'section', 'footer'], headings: [], columns: 2, primary: { row: 'middle', col: 'right' }, ...over,
});

test('editDistance and normalizedDistance', () => {
  assert.equal(editDistance(['header', 'main', 'footer'], ['header', 'footer']), 1);
  assert.equal(normalizedDistance([], []), 0);
  assert.equal(normalizedDistance(['a', 'b'], ['a', 'c']), 0.5);
});

test('mockupDistance: coincide only with close blocks, same columns and same primary', () => {
  assert.equal(mockupDistance(mock(), mock()).coincide, true);
  const otherPrimary = mockupDistance(mock(), mock({ primary: { row: 'bottom', col: 'left' } }));
  assert.equal(otherPrimary.coincide, false);
  assert.ok(!otherPrimary.reasons.includes('primary'));
  assert.equal(mockupDistance(mock(), mock({ columns: 1 })).coincide, false);
  const ten = Array.from({ length: 10 }, () => 'div');
  const change = (n) => ten.map((x, i) => (i < n ? 'span' : x));
  const three = mockupDistance(mock({ blocks: ten }), mock({ blocks: change(3) }));
  assert.equal(three.distance, 0.3);
  assert.equal(three.coincide, false);
  assert.equal(mockupDistance(mock({ blocks: ten }), mock({ blocks: change(2) })).coincide, true);
  assert.equal(mockupDistance(mock(), mock({ primary: null })).coincide, true);
});

const tile = (vars) => `<style>:root{${vars}}</style><p>x</p>`;

test('tileFingerprint reads the :root variables (exact integer hue)', () => {
  const fp = tileFingerprint(tile('--color-primary: oklch(0.6 0.15 250); --font-body: "Inter", sans-serif; --radius-sm: 4px; --radius-md: 8px; --radius-lg: 8px;'));
  assert.deepEqual(fp, { v: 1, kind: 'tile', primaryHue: 250, fontFamily: 'inter', radii: [4, 8] });
  const hex = tileFingerprint(tile('--color-primary: #1a56db')).primaryHue;
  assert.ok(Number.isInteger(hex) && hex >= 0 && hex <= 359);
  assert.deepEqual(tileFingerprint('<p>sin tokens</p>'), { v: 1, kind: 'tile', primaryHue: null, fontFamily: null, radii: [] });
});

test('tileDistance: hue within 30 degrees (circular), same font and radii', () => {
  const t = (h) => ({ v: 1, kind: 'tile', primaryHue: h, fontFamily: 'inter', radii: [4, 8] });
  assert.equal(tileDistance(t(250), t(270)).coincide, true);
  assert.equal(tileDistance(t(250), t(290)).coincide, false);
  assert.equal(tileDistance(t(350), t(10)).coincide, true);
  const missing = tileDistance(t(null), t(10));
  assert.equal(missing.coincide, false);
  assert.deepEqual(missing.reasons, ['missing-primary']);
  assert.equal(tileDistance(t(250), { ...t(250), fontFamily: 'georgia' }).coincide, false);
  assert.equal(tileDistance(t(250), { ...t(250), radii: [0] }).coincide, false);
});

test('pairwise compares every pair in letter order', () => {
  const t = (h) => ({ v: 1, kind: 'tile', primaryHue: h, fontFamily: 'inter', radii: [4] });
  const pairs = pairwise({ C: t(20), A: t(250), B: t(262) }, tileDistance);
  assert.deepEqual(pairs.map((p) => `${p.a}${p.b}:${p.coincide}`), ['AB:true', 'AC:false', 'BC:false']);
});
