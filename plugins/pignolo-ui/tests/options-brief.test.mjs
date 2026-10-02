import test from 'node:test';
import assert from 'node:assert/strict';
import { readReference } from './support/skill-checks.mjs';

// "The brief" section of reference/options.md: from its heading to the next one.
function briefSection() {
  const text = readReference('options.md');
  const start = text.indexOf('## The brief');
  assert.ok(start >= 0, 'options.md has "## The brief"');
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

test('the brief of an option carries the product context printed by run.mjs context (hito 4f)', () => {
  const section = briefSection();
  assert.ok(section.includes('run.mjs" context'), 'pastes the text of run.mjs context');
  assert.ok(section.includes('product context'));
  assert.match(section, /omit it when there is no `PRODUCT\.md`/);
});

test('the other bullets of the brief are still there', () => {
  const section = briefSection();
  for (const needle of ['the text of `<run>/norms.md`', 'the tokens of `DESIGN.md`', 'the axis assigned', 'the write folder', 'destination: canvas']) assert.ok(section.includes(needle), needle);
});
