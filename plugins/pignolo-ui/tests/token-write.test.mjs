import test from 'node:test';
import assert from 'node:assert/strict';
import { setCssVar, replaceTailwindLiteral, formatLike, scanCss } from '../lib/token-sources.mjs';
import { parseColor } from '../lib/color.mjs';

const CSS = ':root {\n  --primary: #0b6bcb; /* brand */\n  --radius: 8px;\n}\n\n@layer base {\n  .dark {\n    --primary: oklch(0.72 0.14 250);\n  }\n}\n';

test('replacing an existing variable changes only its value', () => {
  const r = setCssVar(CSS, { selector: ':root', name: '--primary', value: '#095bad' });
  assert.equal(r.ok, true);
  assert.equal(r.text, CSS.replace('#0b6bcb', '#095bad'));
  assert.deepEqual([r.line, r.before, r.after], [2, '#0b6bcb', '#095bad']);
});

test('a new variable is inserted in the existing block with its indentation and line endings', () => {
  const crlf = CSS.replace(/\n/g, '\r\n');
  const r = setCssVar(crlf, { selector: '.dark', name: '--surface', value: 'oklch(0.2 0 0)' });
  assert.equal(r.ok, true);
  assert.equal(r.text, crlf.replace('    --primary: oklch(0.72 0.14 250);\r\n', '    --primary: oklch(0.72 0.14 250);\r\n    --surface: oklch(0.2 0 0);\r\n'));
  assert.equal(r.line, 9);
  const dark = scanCss(r.text).blocks.find((b) => b.selector === '.dark');
  assert.deepEqual(dark.vars.map((v) => v.name), ['--primary', '--surface']);
  const noSemi = setCssVar(':root {\n  --last: #fff\n}\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(noSemi.text, ':root {\n  --last: #fff;\n  --b: 2px;\n}\n');
});

test('single-line blocks get the declaration before the closing brace', () => {
  const r = setCssVar(':root { --a: 1px }\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(r.text, ':root { --a: 1px; --b: 2px; }\n');
  const r2 = setCssVar(':root {}\n', { selector: ':root', name: '--b', value: '2px' });
  assert.equal(r2.text, ':root { --b: 2px; }\n');
});

test('a missing block is never created: the write is refused', () => {
  const r = setCssVar(CSS, { selector: '[data-theme="dark"]', name: '--primary', value: '#fff' });
  assert.deepEqual(r, { ok: false, reason: 'block-not-found' });
  assert.deepEqual(setCssVar('', { selector: '@theme', name: '--x', value: '1px' }), { ok: false, reason: 'block-not-found' });
});

test('values that could break the block are refused', () => {
  for (const value of ['red; --x: 1', 'a { b', 'a }', 'a\nb', '']) {
    assert.deepEqual(setCssVar(CSS, { selector: ':root', name: '--primary', value }), { ok: false, reason: 'invalid-value' }, value);
  }
  assert.deepEqual(setCssVar(CSS, { selector: ':root', name: 'primary', value: 'red' }), { ok: false, reason: 'invalid-name' });
});

test('formatLike writes a color in the notation of the existing value', () => {
  const white = parseColor('#ffffff').rgba;
  assert.equal(formatLike('210 40% 98%', white), '0 0% 100%');
  assert.equal(formatLike('#0b6bcb', white), '#ffffff');
  assert.equal(formatLike('hsl(0 0% 0%)', white), 'hsl(0 0% 100%)');
  assert.match(formatLike('oklch(0.5 0.1 200)', white), /^oklch\(1 0 0\)$/);
  assert.equal(formatLike('var(--x)', white), null);
  assert.equal(formatLike('lab(50 0 0)', white), null);
});

test('Tailwind v3: only an existing literal value is replaced, with its quote style', () => {
  const text = "module.exports = {\n  theme: {\n    extend: {\n      colors: { primary: '#0b6bcb', 'on-primary': \"#fff\" },\n      borderRadius: { lg: '12px' },\n      zIndex: { top: 50 },\n    },\n  },\n  plugins: [require('x')],\n};\n";
  const r = replaceTailwindLiteral(text, ['extend', 'colors', 'primary'], '#095bad');
  assert.equal(r.ok, true);
  assert.equal(r.text, text.replace("'#0b6bcb'", "'#095bad'"));
  assert.equal(r.line, 4);
  assert.equal(replaceTailwindLiteral(text, ['extend', 'colors', 'on-primary'], "it's").text, text.replace('"#fff"', '"it\'s"'));
  assert.equal(replaceTailwindLiteral(text, ['extend', 'colors', 'primary'], "a'b").text, text.replace("'#0b6bcb'", "'a\\'b'"));
  assert.equal(replaceTailwindLiteral(text, ['extend', 'zIndex', 'top'], 60).text, text.replace('top: 50', 'top: 60'));
  assert.deepEqual(replaceTailwindLiteral(text, ['extend', 'colors', 'secondary'], '#000'), { ok: false, reason: 'not-a-literal-value' });
  const bad = replaceTailwindLiteral('module.exports = { theme: { colors: base } };', ['colors', 'primary'], '#000');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /^unverified: /);
});
