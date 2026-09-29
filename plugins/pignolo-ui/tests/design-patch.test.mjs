import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, makeTempDir, runScript } from './helpers.mjs';
import { patchDesign, yamlScalar } from '../lib/design-patch.mjs';
import { splitFrontmatter } from '../lib/design-doc.mjs';
import { parseYaml } from '../lib/yaml-subset.mjs';

const VALID = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const valueOf = (text) => parseYaml(splitFrontmatter(text).yaml).value;

const COMMENTED = [
  '---',
  '# tokens of the demo app',
  'name: Demo   # trailing comment',
  'colors:',
  '  primary: "#0B6BCB"  # brand blue',
  '  surface: "#FFFFFF"',
  'pignolo:',
  '  schema: 1',
  '  platform: both # asked on 2026-09-28',
  '  states: { hoverOpacity: 0.08 }',
  '  extracted:',
  '    - colors.primary',
  '    - colors.surface',
  '---',
  '',
  '## Overview',
  '',
].join('\n');

test('set on an existing line keeps comments, indentation and every other byte (CRLF + BOM)', () => {
  const input = `\uFEFF${COMMENTED.replace(/\n/g, '\r\n')}`;
  const r = patchDesign(input, [{ op: 'set', path: ['pignolo', 'platform'], value: 'desktop' }]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, input.replace('  platform: both # asked', '  platform: "desktop" # asked'));
  assert.deepEqual(r.hunks, [{ line: 9, removed: ['  platform: both # asked on 2026-09-28'], added: ['  platform: "desktop" # asked on 2026-09-28'] }]);
  const r2 = patchDesign(COMMENTED, [{ op: 'set', path: ['colors', 'primary'], value: '#095BAD' }]);
  assert.equal(r2.text, COMMENTED.replace('"#0B6BCB"  # brand blue', '"#095BAD"  # brand blue'));
});

test('set creates missing keys under an existing block map, with its indentation', () => {
  const r = patchDesign(COMMENTED, [
    { op: 'set', path: ['pignolo', 'web', 'public'], value: true },
    { op: 'set', path: ['pignolo', 'register'], value: 'product' },
    { op: 'set', path: ['version'], value: 'alpha' },
  ]);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.text, COMMENTED
    .replace('    - colors.surface\n', '    - colors.surface\n  web:\n    public: true\n  register: "product"\n')
    .replace('    - colors.surface\n  web:\n    public: true\n  register: "product"\n---', '    - colors.surface\n  web:\n    public: true\n  register: "product"\nversion: "alpha"\n---'));
  const v = valueOf(r.text);
  assert.equal(v.pignolo.web.public, true);
  assert.equal(v.version, 'alpha');
});

test('flow collections and block containers are never rewritten', () => {
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'states', 'hoverOpacity'], value: 0.1 }]).error, 'in-flow');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'states', 'focusOpacity'], value: 0.1 }]).error, 'in-flow');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['colors'], value: 'x' }]).error, 'not-a-scalar');
  assert.deepEqual(patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'extracted', 'x'], value: 1 }]).error, 'not-a-map');
  assert.deepEqual(patchDesign('# no frontmatter\n', [{ op: 'set', path: ['a'], value: 1 }]).error, 'no-frontmatter');
  assert.deepEqual(patchDesign('---\na: &x 1\n---\n', [{ op: 'set', path: ['b'], value: 1 }]).error, 'unsupported-yaml');
});

test('append adds a list item, creating the list when missing', () => {
  const entry = { id: 'R-001', date: '2026-09-28', rule: 'COLOR-11', pattern: { kind: 'property', value: 'background-image: linear-gradient' }, note: 'no purple gradients' };
  const r = patchDesign(VALID, [{ op: 'append', path: ['pignolo', 'rejections'], value: entry }]);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(valueOf(r.text).pignolo.rejections, [entry]);
  assert.deepEqual(r.hunks[0].added, [
    '  rejections:',
    '    - id: "R-001"',
    '      date: "2026-09-28"',
    '      rule: "COLOR-11"',
    '      pattern:',
    '        kind: "property"',
    '        value: "background-image: linear-gradient"',
    '      note: "no purple gradients"',
  ]);
  const r2 = patchDesign(COMMENTED, [{ op: 'append', path: ['pignolo', 'extracted'], value: 'rounded.md' }]);
  assert.equal(r2.text, COMMENTED.replace('    - colors.surface\n', '    - colors.surface\n    - "rounded.md"\n'));
});

test('remove-item drops the item lines; the last one leaves an empty flow list', () => {
  const r = patchDesign(COMMENTED, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'colors.primary' }]);
  assert.equal(r.text, COMMENTED.replace('    - colors.primary\n', ''));
  const r2 = patchDesign(r.text, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'colors.surface' }]);
  assert.equal(r2.text, COMMENTED.replace('  extracted:\n    - colors.primary\n    - colors.surface\n', '  extracted: []\n'));
  const r3 = patchDesign(r2.text, [{ op: 'append', path: ['pignolo', 'extracted'], value: 'colors.surface' }]);
  assert.deepEqual(valueOf(r3.text).pignolo.extracted, ['colors.surface']);
  assert.equal(patchDesign(COMMENTED, [{ op: 'remove-item', path: ['pignolo', 'extracted'], value: 'nope' }]).error, 'item-not-found');
});

test('section-append writes at the end of ## Decisions, creating it at the end when missing', () => {
  const entry = '- 2026-09-28 — decided X.';
  const r = patchDesign(VALID, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(r.text, `${VALID}\n${entry}\n`);
  const withContent = patchDesign(`${VALID}\n- 2026-09-01 — earlier.\n\n## Appendix\n\nx\n`, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(withContent.text, `${VALID}\n- 2026-09-01 — earlier.\n${entry}\n\n## Appendix\n\nx\n`);
  const noSection = VALID.replace('\n## Decisions\n', '');
  const created = patchDesign(noSection, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  assert.equal(created.text, `${noSection}\n## Decisions\n\n${entry}\n`);
});

test('yamlScalar quotes every string and refuses line breaks', () => {
  assert.equal(yamlScalar('a "b" \\ c'), '"a \\"b\\" \\\\ c"');
  assert.equal(yamlScalar(0.5), '0.5');
  assert.equal(yamlScalar(false), 'false');
  assert.equal(yamlScalar(null), 'null');
  assert.throws(() => yamlScalar('a\nb'), /line break/);
  assert.throws(() => yamlScalar(Number.NaN), /finite/);
  const r = patchDesign(COMMENTED, [{ op: 'set', path: ['name'], value: 'a\nb' }]);
  assert.equal(r.ok, false);
});

test('the diff shows each hunk with its line', () => {
  const r = patchDesign(COMMENTED, [{ op: 'set', path: ['pignolo', 'platform'], value: 'mobile' }]);
  assert.equal(r.diff, '--- DESIGN.md\n+++ DESIGN.md (propuesto)\n@@ línea 9 @@\n-  platform: both # asked on 2026-09-28\n+  platform: "mobile" # asked on 2026-09-28\n');
});

test('CLI: without --write nothing changes; a patch the validator would reject is never written', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(file, VALID);
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['pignolo', 'platform'], value: 'desktop' }]));
  let out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, false);
  assert.match(out.json.diff, /\+ {2}platform: "desktop"/);
  assert.equal(fs.readFileSync(file, 'utf8'), VALID);
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, true);
  assert.equal(fs.readFileSync(file, 'utf8'), VALID.replace('  platform: both', '  platform: "desktop"'));
  fs.writeFileSync(ops, JSON.stringify([{ op: 'append', path: ['pignolo', 'intentional'], value: { id: 'A11Y-01', why: 'x' } }]));
  const before = fs.readFileSync(file, 'utf8');
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 1);
  assert.equal(out.json.written, false);
  assert.deepEqual(out.json.validation.findings.map((f) => f.id), ['DESIGN-INTENTIONAL']);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['colors'], value: 1 }]));
  out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]);
  assert.equal(out.status, 1);
  assert.equal(out.json.error, 'not-a-scalar');
});

test('CLI: a rejecting finding the file already had does not block an unrelated patch', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(file, VALID.replace('      fast: 120\n', '      fast: "120ms"\n'));
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['pignolo', 'register'], value: 'brand' }]));
  const out = runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops, '--write']);
  assert.equal(out.status, 0, out.stdout);
  assert.equal(out.json.written, true);
  assert.ok(out.json.validation.findings.some((f) => f.id === 'DESIGN-TOKEN-LIKE'));
});
