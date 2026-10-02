import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadNorms, extract, judgmentIds, BASE_NORMS_FILE } from '../lib/norms.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { makeTempDir } from './helpers.mjs';

const base = fs.readFileSync(BASE_NORMS_FILE, 'utf8');
const userFile = (text) => {
  const f = path.join(makeTempDir(), 'norms.md');
  fs.writeFileSync(f, text);
  return f;
};

test('base norms: five sections, size, consecutive J ids, catalog ids exist', () => {
  for (const h of ['Hierarchy', 'Accessibility floor', 'Platform (HIG, Fluent 2)', 'Tone by register', 'Judgment criteria']) {
    assert.ok(base.includes(`## ${h}`), h);
  }
  assert.ok(base.length <= 6000);
  const ids = judgmentIds(base);
  assert.ok(ids.length >= 8 && ids.length <= 25);
  assert.deepEqual(ids, ids.map((_, i) => `J-${String(i + 1).padStart(2, '0')}`));
  const catalog = loadCatalog();
  const cited = [...new Set(base.match(/\b[A-Z0-9]+-\d+\b/g) || [])].filter((x) => !/^J-/.test(x));
  for (const id of cited) assert.ok(catalog.rules.some((r) => r.id === id), `${id} not in catalog`);
});

test('loadNorms without a user file gives user null', () => {
  assert.equal(loadNorms({}).user, null);
  assert.equal(loadNorms({ userFile: path.join(makeTempDir(), 'nope.md') }).user, null);
});

test('loadNorms accepts a valid author file with inline symptoms', () => {
  const f = userFile('---\npignolo: { schema: 1, register: product }\nsymptoms: [{ id: flat, words: [cartel feo] }]\n---\nCuerpo del autor.\n');
  const { user } = loadNorms({ userFile: f });
  assert.equal(user.ok, true);
  assert.equal(user.symptoms[0].id, 'flat');
  assert.match(user.body, /Cuerpo del autor/);
});

test('loadNorms ignores the whole author file when it is invalid', () => {
  const unknownKey = loadNorms({ userFile: userFile('---\npignolo: { colour: red }\n---\nx\n') }).user;
  assert.equal(unknownKey.ok, false);
  assert.match(unknownKey.warning, /^normas del autor ignoradas/);
  const badRule = loadNorms({ userFile: userFile('---\nsymptoms: [{ id: x, label: L, words: [a], rules: [NOPE-1] }]\n---\nx\n') }).user;
  assert.equal(badRule.ok, false);
  assert.match(badRule.warning, /NOPE-1/);
});

test('extract caps the user body at 4000 chars and keeps tone and J criteria', () => {
  const body = 'z'.repeat(10000);
  const text = extract({ base, user: { ok: true, body } });
  assert.ok(text.includes('## Tone by register') && text.includes('J-01'));
  assert.ok(!text.includes('## Hierarchy'));
  const zs = (text.match(/z/g) || []).length;
  assert.equal(zs, 4000);
  const ignoredText = extract({ base, user: { ok: false, warning: 'x' } });
  assert.ok(!ignoredText.includes('Author norms'));
});

test('every J criterion says when it applies, and the ids keep their order with the new format', () => {
  const lines = base.split('\n').filter((l) => /^- J-\d{2}:/.test(l));
  assert.equal(lines.length, 12);
  for (const l of lines) assert.ok(l.includes('Applies when:'), `no "Applies when:" in: ${l}`);
  assert.deepEqual(judgmentIds(base), Array.from({ length: 12 }, (_, i) => `J-${String(i + 1).padStart(2, '0')}`));
});

test('J-12 reads the register of the brief as well as the one of DESIGN.md (hito 4f)', () => {
  const line = base.split('\n').find((l) => l.startsWith('- J-12:'));
  assert.ok(line.includes('Applies when:'));
  assert.ok(line.includes('brief'), line);
});
