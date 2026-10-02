import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBrief, designRegister } from '../lib/brief-md.mjs';
import { BRIEF_TEXT } from './helpers.mjs';

const brief = (extra = '') => `## Screen\nSynthetic account page.\n\n## First look\nThe summary and the pay button.\n\n## Do not touch\nThe invoice wording.\n${extra}`;
const names = (v) => v.problems.map((p) => p.problem);

test('validateBrief: a complete brief is ok, with or without the Register line', () => {
  const brand = validateBrief(brief('Register: brand\n'));
  assert.equal(brand.status, 'ok');
  assert.equal(brand.register, 'brand');
  assert.equal(brand.firstLook, 'The summary and the pay button.');
  assert.equal(brand.doNotTouch, 'The invoice wording.');
  const none = validateBrief(brief());
  assert.equal(none.status, 'ok');
  assert.equal(none.register, null);
  assert.equal(validateBrief(brief('Register: product\n')).register, 'product');
  assert.equal(validateBrief(BRIEF_TEXT).status, 'ok');
});

test('validateBrief: the required sections and the register value', () => {
  assert.ok(names(validateBrief(brief('Register: airy\n'))).includes('bad-register'));
  assert.ok(names(validateBrief('## Do not touch\nnothing\n')).includes('missing-first-look'));
  assert.ok(names(validateBrief('## First look\n\n## Do not touch\nnothing\n')).includes('empty-first-look'));
  assert.ok(names(validateBrief('## First look\nThe button.\n')).includes('missing-do-not-touch'));
  assert.ok(names(validateBrief('## First look\nThe button.\n\n## Do not touch\n')).includes('empty-do-not-touch'));
  // the single word `nothing` is a valid answer
  assert.equal(validateBrief('## First look\nThe button.\n\n## Do not touch\nnothing\n').status, 'ok');
});

test('validateBrief: 60 lines pass, 61 are too long', () => {
  const sixty = ['## First look', 'x', '## Do not touch', 'nothing', ...Array.from({ length: 56 }, (_, i) => `n${i}`)].join('\n');
  assert.equal(sixty.split('\n').length, 60);
  assert.equal(validateBrief(sixty).status, 'ok');
  assert.ok(names(validateBrief(`${sixty}\nmore`)).includes('too-long'));
});

test('validateBrief: a value of the user and an email are leaks by line and kind, never repeated', () => {
  const v = validateBrief(brief('Seen by Tomas Rivera.\n'), { leakValues: ['Tomas Rivera'] });
  assert.equal(v.status, 'invalid');
  const leak = v.problems.find((p) => p.problem === 'leak');
  assert.equal(leak.kind, 'value');
  assert.ok(!JSON.stringify(v.problems).includes('Tomas Rivera'));
  const mail = validateBrief(brief('Write to someone@example.org\n'));
  assert.ok(mail.problems.some((p) => p.problem === 'leak' && p.kind === 'email'));
});

test('designRegister reads pignolo.register of DESIGN.md and answers null otherwise', () => {
  assert.equal(designRegister('---\nname: x\npignolo:\n  register: brand\n---\nbody\n'), 'brand');
  assert.equal(designRegister('---\nname: x\npignolo:\n  register: airy\n---\n'), null);
  assert.equal(designRegister('no frontmatter'), null);
});
