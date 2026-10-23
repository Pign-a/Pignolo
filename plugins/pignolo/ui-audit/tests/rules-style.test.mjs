// Extra cases for the style rules (Task 7): every occurrence counts, embedded <style> lines,
// SFC classes map to the same ids as CSS, and !important does not hide a literal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

async function run(tree) {
  const project = writeTree(makeTempDir(), tree);
  return runCheck({ project, files: Object.keys(tree), design: null, base: null, dom: [] });
}
const only = (result, id, status) => result.entries.filter((e) => e.id === id && e.status === status);

test('rounded-[6px] counts once per occurrence', async () => {
  const r = await run({
    'Cards.tsx': 'export const T = () => (\n  <div>\n    <div className="rounded-[6px]">a</div>\n    <div className="rounded-[6px]">b</div>\n    <div className="rounded-[6px]">c</div>\n  </div>\n);\n',
  });
  const fails = only(r, 'LAYOUT-04', 'fail');
  assert.equal(fails.length, 3);
  assert.deepEqual(fails.map((e) => e.line).sort(), [3, 4, 5]);
});

test('STATE-04 in a <style> of an .html reports the file line', async () => {
  const r = await run({ 'page.html': '<!doctype html>\n<style>\n.a { outline: none }\n</style>\n<html><body><p class="a">x</p></body></html>\n' });
  const fails = only(r, 'STATE-04', 'fail');
  assert.equal(fails.length, 1);
  assert.equal(fails[0].line, 3);
});

test('a .vue template maps utilities to the same ids as CSS', async () => {
  const r = await run({ 'C.vue': '<template><button class="outline-none rounded-[6px]">x</button></template>\n' });
  assert.equal(only(r, 'STATE-04', 'fail').length, 1);
  assert.equal(only(r, 'LAYOUT-04', 'fail').length, 1);
});

test('!important does not hide a color literal', async () => {
  const r = await run({ 'a.css': '.a { color: red !important }\n' });
  assert.equal(only(r, 'COLOR-02', 'fail').length, 1);
});

// Ruling (0.2.0): a drawing declaration in the same rule (when the part that removes the outline
// is a :focus/:focus-visible one) or in :focus/:focus-visible of the same base selector restores
// the indicator; so does a focus: or focus-visible: class that draws (not offsets nor transparent).
test('STATE-04 restoring indicators (table)', async () => {
  const cases = [
    ['a.css', '.btn:focus { outline: none; box-shadow: 0 0 0 3px var(--ring); }\n', 0],
    ['a.css', '.btn { outline: none; }\n.btn:focus { border: 2px solid var(--ring); }\n', 0],
    ['a.css', '.btn { outline: none; }\n.btn:focus-visible { outline: 2px solid var(--ring); }\n', 0],
    ['a.css', '.btn:focus { outline: none; box-shadow: none; }\n', 1],
    ['a.css', '.btn { outline: none; }\n.card:focus { box-shadow: 0 0 0 3px var(--ring); }\n', 1],
    ['a.css', '.btn { outline: none; }\n.btn:hover { box-shadow: 0 0 0 3px var(--ring); }\n', 1],
    // the same-rule restore only counts when that selector part is a :focus / :focus-visible one
    ['a.css', '.c1 { outline: none; border: 1px solid #ccc; }\n', 1],
    ['a.css', '.c2 { outline: none; box-shadow: 0 1px 2px rgba(0,0,0,.1); }\n', 1],
    ['a.css', '.c3:not(:focus) { outline: none; border: 1px solid #ccc; }\n', 1],
    ['B.tsx', 'export const B = () => <button className="focus:outline-none focus:ring-2">x</button>;\n', 0],
    ['B.tsx', 'export const B = () => <button className="outline-none focus:shadow-md">x</button>;\n', 0],
    ['B.tsx', 'export const B = () => <button className="focus:outline-none focus-visible:border-2">x</button>;\n', 0],
    ['B.tsx', 'export const B = () => <button className="focus:outline-none">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="focus:outline-none focus:ring-0">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="focus:outline-none hover:ring-2">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="outline-none focus-visible:ring-[3px]">x</button>;\n', 0],
    // offsets and transparent colors do not draw an indicator
    ['B.tsx', 'export const B = () => <button className="outline-none focus:ring-offset-2">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="outline-none focus:outline-offset-2">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="outline-none border focus:border-transparent">x</button>;\n', 1],
    ['B.tsx', 'export const B = () => <button className="outline-none focus:ring-transparent focus:shadow-transparent">x</button>;\n', 1],
  ];
  for (const [file, text, n] of cases) {
    const r = await run({ [file]: text });
    assert.equal(only(r, 'STATE-04', 'fail').length, n, text);
  }
});

test('MOTION-03 exempts declarations inside prefers-reduced-motion: no-preference', async () => {
  const cases = [
    ['@media (prefers-reduced-motion: no-preference) { .a { transition: transform 0.2s; } }\n', 0],
    ['@media (prefers-reduced-motion:no-preference) { .a { animation: spin 1s; } }\n', 0],
    ['@media (min-width: 40em) { .a { transition: transform 0.2s; } }\n', 1],
    ['@media (prefers-reduced-motion: no-preference) { .a { color: red; } }\n.b { animation: spin 1s; }\n', 1],
  ];
  for (const [text, n] of cases) {
    const r = await run({ 'a.css': text });
    assert.equal(only(r, 'MOTION-03', 'fail').length, n, text);
  }
});

test('DEPTH-01 reason separates a literal shadow with a token color from a token of another family', async () => {
  const cases = [
    ['.a { box-shadow: 0 0 0 3px var(--ring); }\n', /literal box-shadow with a token color \(--ring\)/],
    ['.a { box-shadow: var(--radius-md); }\n', /token of another family \(--radius-md\)/],
    ['.a { box-shadow: 0 1px 2px black; }\n', /literal box-shadow outside tokens/],
  ];
  for (const [text, re] of cases) {
    const r = await run({ 'a.css': text });
    const fails = only(r, 'DEPTH-01', 'fail');
    assert.equal(fails.length, 1, text);
    assert.match(fails[0].reason, re, text);
  }
});
