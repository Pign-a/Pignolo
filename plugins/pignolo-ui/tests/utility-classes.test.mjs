import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkup } from '../lib/markup.mjs';
import { extractClassLists, extractClassListsFromSfc } from '../lib/utility-classes.mjs';

const lists = (t, syntax = 'jsx') => extractClassLists(parseMarkup(t, { syntax }));
const shape = (l) => l.classes.map((c) => [c.base, c.variants, c.arbitrary]);

test('utility-classes variants and base', () => {
  const [l] = lists('<p className="focus-visible:ring-2 hover:dark:bg-red-500 p-4">x</p>');
  assert.deepEqual(l.classes.map((c) => [c.raw, c.variants, c.base, c.arbitrary]), [
    ['focus-visible:ring-2', ['focus-visible'], 'ring-2', null],
    ['hover:dark:bg-red-500', ['hover', 'dark'], 'bg-red-500', null],
    ['p-4', [], 'p-4', null],
  ]);
  assert.equal(l.dynamic, false);
  assert.equal(l.line, 1);
  assert.equal(l.element.tag, 'p');
});

test('utility-classes arbitrary values', () => {
  const [l] = lists('<p className="rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.2)] text-[#333] [&:hover]:underline data-[state=open]:bg-[#fff]/50">x</p>');
  assert.deepEqual(shape(l), [
    ['rounded', [], '6px'],
    ['shadow', [], '0 4px 12px rgba(0,0,0,0.2)'],
    ['text', [], '#333'],
    ['underline', ['[&:hover]'], null],
    ['bg', ['data-[state=open]'], '#fff'],
  ]);
});

test('utility-classes duplicates are not deduplicated', () => {
  const [l] = lists('<p className="rounded-[6px] rounded-[6px]">x</p>');
  assert.equal(l.classes.length, 2);
});

test('utility-classes cn() reads literals and marks dynamic', () => {
  const [l] = lists('<div className={cn("a b", cond && "c", className)}>x</div>');
  assert.deepEqual(l.classes.map((c) => c.raw), ['a', 'b', 'c']);
  assert.equal(l.dynamic, true);
});

test('utility-classes template literal drops partial tokens', () => {
  const [l] = lists('<div className={`p-4 bg-${color}-500 flex`}>x</div>');
  assert.deepEqual(l.classes.map((c) => c.raw), ['p-4', 'flex']);
  assert.equal(l.dynamic, true);
});

test('utility-classes string expression is static and html works', () => {
  assert.equal(lists("<p className={'a b'}>x</p>")[0].dynamic, false);
  const [l] = lists('<p class="a\n  b">x</p>', 'html');
  assert.deepEqual(l.classes.map((c) => [c.raw, c.line]), [['a', 1], ['b', 2]]);
});

test('utility-classes skips elements without class', () => {
  assert.deepEqual(lists('<p>x</p>'), []);
});

test('utility-classes sfc', () => {
  const vue = '<template>\n<div class="p-4 rounded-[6px]" :class="{ \'a b\': on }" class:active={x}>\n</div></template>\n<style>.x { class="no" }</style>';
  const out = extractClassListsFromSfc(vue);
  assert.deepEqual(out.map((l) => [l.classes.map((c) => c.raw), l.dynamic, l.line]), [
    [['p-4', 'rounded-[6px]'], false, 2],
    [['a', 'b'], true, 2],
    [['active'], true, 2],
  ]);
  assert.equal(out[0].classes[1].arbitrary, '6px');
});

test('utility-classes sfc ignores comments', () => {
  assert.deepEqual(extractClassListsFromSfc('<!-- <p class="x"> -->\n<p class="y">').map((l) => l.classes[0].raw), ['y']);
});
