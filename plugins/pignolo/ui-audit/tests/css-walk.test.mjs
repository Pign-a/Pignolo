import test from 'node:test';
import assert from 'node:assert/strict';
import { walkCss } from '../lib/css-walk.mjs';

test('css-walk two decls with lines', () => {
  const { decls, rules } = walkCss('.btn { outline: none; }\n.btn:focus-visible { outline: 2px solid red; }');
  assert.deepEqual(decls.map((d) => [d.selector, d.property, d.value, d.line]), [
    ['.btn', 'outline', 'none', 1],
    ['.btn:focus-visible', 'outline', '2px solid red', 2],
  ]);
  assert.deepEqual(rules.map((r) => [r.selector, r.line, r.decls.length]), [['.btn', 1, 1], ['.btn:focus-visible', 2, 1]]);
});

test('css-walk at-rule preludes', () => {
  const { decls } = walkCss('@media (prefers-reduced-motion: reduce) {\n  .a { transition: none; }\n}');
  assert.equal(decls.length, 1);
  assert.deepEqual(decls[0].atRules, ['@media (prefers-reduced-motion: reduce)']);
  assert.equal(decls[0].selector, '.a');
  assert.equal(decls[0].line, 2);
});

test('css-walk token blocks', () => {
  const { decls } = walkCss(':root { --x: #fff; }\n.a { color: var(--x); }\n@theme { --color-a: red; }');
  assert.deepEqual(decls.map((d) => d.inTokenBlock), [true, false, true]);
});

test('css-walk url() with braces and semicolons does not split', () => {
  const { decls } = walkCss('.a { background: url(data:image/svg+xml;utf8,<svg>{}</svg>); color: red }');
  assert.deepEqual(decls.map((d) => d.property), ['background', 'color']);
});

test('css-walk braces in strings and comments are inert', () => {
  const { decls } = walkCss('.a { content: "}{;"; /* } */ color: red }');
  assert.deepEqual(decls.map((d) => [d.property, d.value]), [['content', '"}{;"'], ['color', 'red']]);
});

test('css-walk important', () => {
  const { decls } = walkCss('a { color: red !important }\nb { color: blue ! IMPORTANT; margin: 0 }');
  assert.deepEqual(decls.map((d) => [d.value, d.important]), [['red', true], ['blue', true], ['0', false]]);
});

test('css-walk lineOffset', () => {
  const { decls, rules, keyframes } = walkCss('.a { color: red }\n@keyframes k { from { opacity: 0 } }', { lineOffset: 10 });
  assert.equal(decls[0].line, 11);
  assert.equal(rules[0].line, 11);
  assert.equal(keyframes[0].line, 12);
});

test('css-walk keyframes and property normalization', () => {
  const { keyframes, decls } = walkCss('@keyframes spin { from { Opacity: 0 } to { opacity: 1 } }\n.x { --Brand:  1px   2px; COLOR: red }');
  assert.equal(keyframes.length, 1);
  assert.equal(keyframes[0].name, 'spin');
  assert.ok(keyframes[0].text.includes('to { opacity: 1 }'));
  assert.deepEqual(decls.filter((d) => d.selector === '.x').map((d) => [d.property, d.value]), [['--Brand', '1px 2px'], ['color', 'red']]);
  assert.deepEqual(decls.find((d) => d.selector === 'from').atRules, ['@keyframes spin']);
});

test('css-walk declarations directly in at-rules and nested at-rules', () => {
  const { decls } = walkCss('@font-face { font-family: X; }\n.a { @media (min-width: 1px) { color: red } }');
  assert.deepEqual(decls.map((d) => [d.selector, d.atRules]), [['@font-face', []], ['.a', ['@media (min-width: 1px)']]]);
});

test('css-walk never throws on garbage', () => {
  for (const t of ['', '}}}', '{', 'a { b: (', '@media {', 'a { color: "x']) assert.doesNotThrow(() => walkCss(t));
});
