import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, locate } from '../lib/yaml-subset.mjs';

function ok(text) {
  const r = parseYaml(text);
  assert.equal(r.supported, true, `unsupported: ${r.reason}`);
  assert.deepEqual(r.errors, []);
  return r.value;
}

test('block maps and lists with typed scalars and quoted keys', () => {
  const v = ok([
    'version: alpha',
    'name: "Demo: app"',
    "note: 'it''s ok'",
    'count: 600',
    'ratio: 1.5',
    'neg: -0.02em',
    'on: true',
    'off: false',
    'nothing: null',
    'tilde: ~',
    'empty:',
    'spacing:',
    '  "0": 0px',
    '  "1": 4px',
    'list:',
    '  - a',
    '  - 2',
    '  - "c d"',
    '',
  ].join('\n'));
  assert.deepEqual(v, {
    version: 'alpha', name: 'Demo: app', note: "it's ok", count: 600, ratio: 1.5, neg: '-0.02em',
    on: true, off: false, nothing: null, tilde: null, empty: null,
    spacing: { 0: '0px', 1: '4px' }, list: ['a', 2, 'c d'],
  });
});

test('single-line flow maps and lists, nested inside the same line', () => {
  const v = ok('a: { x: 1, y: "two", z: [1, 2, { k: v }] }\nb: []\nc: {}\nd: [a, b, ]\n');
  assert.deepEqual(v, { a: { x: 1, y: 'two', z: [1, 2, { k: 'v' }] }, b: [], c: {}, d: ['a', 'b'] });
});

test('comments: full line, trailing, inside quotes and without a space before #', () => {
  const v = ok('# head\na: 1 # trailing\nb: "x # not a comment"\nc: a#b\n  # indented comment\nd: 2\n');
  assert.deepEqual(v, { a: 1, b: 'x # not a comment', c: 'a#b', d: 2 });
});

test('an unquoted hex after ": " is a comment, so the value is null (Review Focus 3)', () => {
  const v = ok('colors:\n  primary: #0B6BCB\n  ok: "#0B6BCB"\n');
  assert.deepEqual(v, { colors: { primary: null, ok: '#0B6BCB' } });
});

test('lists of maps, and a compact list at the same indent as its key', () => {
  const v = ok([
    'rejections:',
    '  - id: R-001',
    '    date: 2026-09-28',
    '    pattern:',
    '      kind: selector',
    '      value: ".hero"',
    '  - id: R-002',
    '    note: plain text, with a comma',
    'extracted:',
    '- colors.primary',
    '- rounded.md',
    '',
  ].join('\n'));
  assert.deepEqual(v, {
    rejections: [
      { id: 'R-001', date: '2026-09-28', pattern: { kind: 'selector', value: '.hero' } },
      { id: 'R-002', note: 'plain text, with a comma' },
    ],
    extracted: ['colors.primary', 'rounded.md'],
  });
});

test('CRLF input parses like LF and keeps line numbers', () => {
  const lf = 'a:\n  b: 1\nc: 2\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.deepEqual(parseYaml(crlf).value, parseYaml(lf).value);
  assert.equal(locate(parseYaml(crlf), ['c']).line, 3);
});

test('unsupported constructs make the whole file unsupported', () => {
  const cases = {
    'a: &x 1\nb: 2\n': /anchor/,
    'a: 1\nb: *x\n': /alias/,
    'a: |\n  text\n': /block scalar/,
    'a: >-\n  text\n': /block scalar/,
    'a: 1\n---\nb: 2\n': /document/,
    'a: { x: 1,\n  y: 2 }\n': /flow/,
    'a: [1,\n  2]\n': /flow/,
    'a: !!str 1\n': /tag/,
    'a:\n\tb: 1\n': /tab/,
    'l1:\n  l2:\n    l3:\n      l4:\n        l5:\n          l6: 1\n': /levels/,
    '? complex\n: key\n': /complex/,
  };
  for (const [text, reason] of Object.entries(cases)) {
    const r = parseYaml(text);
    assert.equal(r.supported, false, JSON.stringify(text));
    assert.equal(r.value, null);
    assert.match(r.reason, reason, JSON.stringify(text));
    assert.equal(typeof r.line, 'number');
  }
});

test('four levels of nesting are supported', () => {
  assert.deepEqual(ok('l1:\n  l2:\n    l3:\n      l4:\n        l5: 1\n'), { l1: { l2: { l3: { l4: { l5: 1 } } } } });
  assert.deepEqual(ok('p:\n  r:\n    - pattern: { kind: text }\n'), { p: { r: [{ pattern: { kind: 'text' } }] } });
});

test('an error in one key is reported for that key and the rest is still parsed', () => {
  const r = parseYaml('a: 1\nb: x: y\nc: 3\nd: "open\ne: 5\nc: 4\nf:\n    g: 1\n  h: 2\ni: 6\n');
  assert.equal(r.supported, true);
  assert.deepEqual(r.value, { a: 1, c: 3, e: 5, f: { g: 1 }, i: 6 });
  assert.deepEqual(r.errors.map((e) => [e.line, e.path.join('.')]), [[2, 'b'], [4, 'd'], [6, 'c'], [9, 'f']]);
  for (const e of r.errors) assert.equal(typeof e.message, 'string');
});

test('locate returns the line span and style of each node', () => {
  const r = parseYaml('pignolo:\n  schema: 1\n  states: { hoverOpacity: 0.08 }\n  extracted:\n    - colors.primary\nlast: 1\n');
  assert.deepEqual(locate(r, ['pignolo']), { line: 1, endLine: 5, indent: 0, style: 'block' });
  assert.deepEqual(locate(r, ['pignolo', 'schema']), { line: 2, endLine: 2, indent: 2, style: 'scalar' });
  assert.deepEqual(locate(r, ['pignolo', 'states']), { line: 3, endLine: 3, indent: 2, style: 'flow' });
  assert.deepEqual(locate(r, ['pignolo', 'states', 'hoverOpacity']), { line: 3, endLine: 3, indent: 2, style: 'flow' });
  assert.deepEqual(locate(r, ['pignolo', 'extracted', 0]), { line: 5, endLine: 5, indent: 4, style: 'scalar' });
  assert.equal(locate(r, ['pignolo', 'missing']), null);
});

test('a flow list that starts on its own line and spans several lines is unsupported', () => {
  const r = parseYaml('a:\n  [1,\n  2]\n');
  assert.equal(r.supported, false);
  assert.match(r.reason, /flow/);
});

test('a flow map that starts on its own line and spans several lines is unsupported', () => {
  const r = parseYaml('a:\n  { x: 1,\n    y: 2 }\n');
  assert.equal(r.supported, false);
  assert.match(r.reason, /flow/);
});

test('a single-line flow list on the line after its key parses', () => {
  assert.deepEqual(ok('a:\n  [1, 2]\nb: 1\n'), { a: [1, 2], b: 1 });
});

test('a single-line flow map on the line after its key parses', () => {
  assert.deepEqual(ok('a:\n  {x: 1}\nb: 1\n'), { a: { x: 1 }, b: 1 });
});
