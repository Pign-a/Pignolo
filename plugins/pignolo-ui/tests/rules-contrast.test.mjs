// Extra cases for COLOR-03 that the fixture folders do not cover (large text, prose pairs, aliases).
// The literal pass/fail cases live in tests/fixtures/rules/{COLOR-03,COLOR-04,COLOR-12,DRIFT-01}.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const design = ({ colors = '', typography = '', components = '', body = 'Fixture.' }) => [
  '---', 'version: alpha', 'name: Fixture', 'colors:', colors, typography, components, '---', '', '## Overview', '', body, '',
].join('\n');

async function color03(text) {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': text });
  const r = await runCheck({ project, files: [], design: path.join(project, 'DESIGN.md'), base: null, dom: [] });
  return r.entries.filter((e) => e.id === 'COLOR-03');
}

const COLORS = '  primary: "#0B6BCB"\n  surface: "#FFFFFF"\n  on-surface: "#1A1A1A"\n  mid: "#949494"\n  white: "#FFFFFF"';
const TYPO = 'typography:\n  label-xl:\n    fontSize: 24px\n  label-md:\n    fontSize: 16px';
const component = (name, typo) => `components:\n  ${name}:\n    backgroundColor: "{colors.mid}"\n    textColor: "{colors.white}"\n    typography: "{typography.${typo}}"`;

test('rule COLOR-03 large text component uses 3:1', async () => {
  const large = await color03(design({ colors: COLORS, typography: TYPO, components: component('button-large', 'label-xl') }));
  const e = large.find((x) => x.reason.includes('button-large'));
  assert.equal(e.status, 'pass');
  assert.equal(e.measure.ratio, 3.03);
  assert.equal(e.measure.required, 3);
});

test('rule COLOR-03 same pair at 16px fails', async () => {
  const small = await color03(design({ colors: COLORS, typography: TYPO, components: component('button-small', 'label-md') }));
  const e = small.find((x) => x.reason.includes('button-small'));
  assert.equal(e.status, 'fail');
  assert.equal(e.measure.required, 4.5);
});

test('rule COLOR-03 prose pairs are measured; (texto grande) uses 3:1', async () => {
  const body = 'Lectura: {colors.white} sobre {colors.mid}.\n\nTitulos: {colors.white} sobre {colors.mid} (texto grande).';
  const prose = (await color03(design({ colors: COLORS, body }))).filter((x) => x.reason.includes('(prose)'));
  assert.equal(prose.length, 2);
  const [plain, large] = prose.sort((a, b) => a.line - b.line);
  assert.equal(plain.status, 'fail');
  assert.equal(plain.measure.required, 4.5);
  assert.equal(large.status, 'pass');
  assert.equal(large.measure.required, 3);
  assert.ok(large.line > plain.line);
});

test('rule COLOR-03 alias text on bg is measured as on-surface on background and named', async () => {
  const colors = '  primary: "#0B6BCB"\n  text: "#9A9A9A"\n  bg: "#FFFFFF"';
  const body = '{colors.text} sobre {colors.bg}';
  const entries = await color03(design({ colors, body }));
  const e = entries.find((x) => x.reason.includes('(prose)'));
  assert.equal(e.status, 'fail');
  assert.match(e.reason, /text \(on-surface\)/);
  assert.match(e.reason, /bg \(background\)/);
  assert.match(e.fingerprint, /on-surface\/background/);
});
