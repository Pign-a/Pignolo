import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './helpers.mjs';
import { validateDesign, splitFrontmatter } from '../lib/design-doc.mjs';

const TEMPLATE = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'DESIGN.md'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));

test('the template passes the own validator with no findings', () => {
  const r = validateDesign(TEMPLATE, { catalog });
  assert.deepEqual(r.findings, []);
  assert.equal(r.status, 'valid');
});

test('the template prose cites tokens, never raw values', () => {
  const { body } = splitFrontmatter(TEMPLATE);
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|ms|%)\b/);
  assert.match(body, /\{colors\.primary\}/);
});

test('the template ends with an empty ## Decisions section and has no dark theme by default', () => {
  assert.match(TEMPLATE, /\n## Decisions\n$/);
  assert.doesNotMatch(TEMPLATE, /^\s+themes:/m);
  assert.doesNotMatch(TEMPLATE, /^\s+extracted:/m);
});
