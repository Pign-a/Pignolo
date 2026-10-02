import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { validateProduct, extractContext, PRODUCT_SECTIONS, PRODUCT_TEMPLATE, SECTION_MAX, CONTEXT_MAX } from '../lib/product-md.mjs';

const fixture = (name) => fs.readFileSync(path.join(FIXTURES, 'product', `${name}.md`), 'utf8');
const names = (v) => v.problems.map((p) => p.problem);

test('validateProduct: one case per fixture', () => {
  const complete = validateProduct(fixture('pass-complete'));
  assert.equal(complete.status, 'ok');
  assert.deepEqual(complete.missing, []);

  const partial = validateProduct(fixture('pass-partial'));
  assert.equal(partial.status, 'ok');
  assert.deepEqual(partial.missing, ['First look', 'Not wanted', 'Do not touch']);

  // tolerant reader: an unknown section and the text before the first title are ignored
  const unknown = validateProduct(fixture('pass-unknown-section'));
  assert.equal(unknown.status, 'ok');
  assert.deepEqual(Object.keys(unknown.sections), ['Audience']);

  const undecided = validateProduct(fixture('pass-undecided'));
  assert.equal(undecided.status, 'ok');
  assert.deepEqual(undecided.undecided, ['Tone']);

  const long = validateProduct(fixture('fail-too-long'));
  assert.equal(long.status, 'invalid');
  assert.ok(names(long).includes('too-long'));

  const empty = validateProduct(fixture('fail-empty-section'));
  assert.ok(names(empty).includes('empty-section'));
  assert.equal(empty.problems.find((p) => p.problem === 'empty-section').section, 'Audience');

  const dup = validateProduct(fixture('fail-duplicate'));
  assert.ok(names(dup).includes('duplicate-section'));

  const leak = validateProduct(fixture('fail-leak'));
  const kinds = leak.problems.filter((p) => p.problem === 'leak');
  assert.ok(kinds.some((p) => p.kind === 'email' && p.line === 2), JSON.stringify(leak.problems));
  assert.ok(kinds.some((p) => p.kind === 'path' && p.line === 5), JSON.stringify(leak.problems));
  assert.ok(kinds.every((p) => Number.isInteger(p.line)));
});

test('validateProduct: 60 lines pass and 61 do not (boundary)', () => {
  const sixty = ['## Audience', ...Array.from({ length: 59 }, (_, i) => `l${i}`)].join('\n');
  assert.equal(validateProduct(sixty).status, 'ok');
  assert.ok(names(validateProduct(`${sixty}\nmore`)).includes('too-long'));
});

test('validateProduct: a value of the user is a leak by line and kind, never repeated', () => {
  const text = '## Audience\nSold by Tomas Rivera to gardeners.\n';
  const v = validateProduct(text, { leakValues: ['Tomas Rivera'] });
  assert.equal(v.status, 'invalid');
  const leak = v.problems.find((p) => p.problem === 'leak');
  assert.deepEqual([leak.kind, leak.line], ['value', 2]);
  assert.ok(!JSON.stringify(v.problems).includes('Tomas Rivera'));
});

test('extractContext: canonical order, bounded sections and total', () => {
  const full = extractContext(validateProduct(fixture('pass-complete')));
  const at = PRODUCT_SECTIONS.map((s) => full.indexOf(`## ${s}`));
  assert.ok(at.every((i) => i >= 0) && [...at].sort((a, b) => a - b).join() === at.join(), 'five titles, in order');
  assert.ok(full.length <= CONTEXT_MAX);

  const big = validateProduct(`## Audience\n${'x'.repeat(3000)}\n\n## Tone\nCalm.\n`);
  const text = extractContext(big);
  const audience = text.split('\n\n')[0].split('\n')[1];
  assert.equal(audience.length, SECTION_MAX);
  assert.ok(audience.endsWith('…'));
  assert.ok(text.includes('## Tone\nCalm.'));

  const partial = extractContext(validateProduct(fixture('pass-partial')));
  assert.ok(partial.includes('## Audience') && partial.includes('## Tone') && !partial.includes('## First look'));

  assert.equal(extractContext(validateProduct(fixture('fail-too-long'))), '');
  // a declared gap says nothing, so it adds nothing
  assert.ok(!extractContext(validateProduct(fixture('pass-undecided'))).includes('## Tone'));
});

test('the template validates by itself, all five sections undecided', () => {
  const v = validateProduct(PRODUCT_TEMPLATE);
  assert.equal(v.status, 'ok');
  assert.deepEqual(v.undecided, PRODUCT_SECTIONS);
});
