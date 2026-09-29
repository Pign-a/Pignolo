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
