'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');

const { renderProjectMd, mergeProjectMd, validatePiiPattern } = require('../plugins/pignolo/lib/project-md');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');

function readBack(text) {
  const root = makeTempDir('pignolo-pmd-');
  fs.mkdirSync(path.join(root, '.pignolo'));
  fs.writeFileSync(path.join(root, '.pignolo', 'project.md'), text);
  return readProjectConfig({ root });
}

const FULL = {
  type: 'code-tested',
  gates: { 'on-edit': 'npm run typecheck', 'on-done': 'npm run test', 'pre-merge': 'npm run test && npm run lint' },
  testPaths: ['**/*.test.*', 'tests/'],
  protectedTestConfig: ['vitest.config.ts', 'package.json'],
  highRiskPaths: ['auth/'],
  contracts: ['openapi.yaml'],
  serialPaths: ['package-lock.json'],
  costPaths: ['terraform/'],
  visiblePaths: ['public/'],
  piiPatterns: ['\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b'],
  depsInstall: 'npm ci',
  domainRules: ['CLAUDE.md'],
  mutation: true,
  language: 'es',
  profile: 'balanced',
};

test('round trip: every key of the proposal reads back equal, with no warnings', () => {
  const c = readBack(renderProjectMd(FULL));
  assert.equal(c.type, FULL.type);
  assert.deepEqual(c.gates, FULL.gates);
  assert.deepEqual(c.testPaths, FULL.testPaths);
  for (const [p, v] of [['protectedTestConfig', FULL.protectedTestConfig], ['highRiskPaths', FULL.highRiskPaths], ['contracts', FULL.contracts],
    ['serialPaths', FULL.serialPaths], ['costPaths', FULL.costPaths], ['visiblePaths', FULL.visiblePaths], ['piiPatterns', FULL.piiPatterns], ['domainRules', FULL.domainRules]]) {
    assert.deepEqual(c[p].filter((x) => x !== '.pignolo/project.md'), v, p);
  }
  assert.equal(c.depsInstall, 'npm ci');
  assert.equal(c.mutation, true);
  assert.equal(c.language, 'es');
  assert.equal(c.profile, 'balanced');
  assert.deepEqual(c.warnings, []);
});

test('quoting: double quote -> single quotes, both -> unquotable, {files} and * round trip', () => {
  const c = readBack(renderProjectMd({ type: 'code-tested', gates: { 'on-done': 'node -e "1"', 'pre-merge': 'node run.js {files}' }, testPaths: ['*test*'] }));
  assert.equal(c.gates['on-done'], 'node -e "1"');
  assert.equal(c.gates['pre-merge'], 'node run.js {files}');
  assert.deepEqual(c.testPaths, ['*test*']);
  assert.match(renderProjectMd({ gates: { 'on-done': 'node -e "1"' } }), /on-done: 'node -e "1"'/);
  assert.match(renderProjectMd({ gates: { 'on-done': 'node run.js {files}' } }), /on-done: node run\.js \{files\}/);
  assert.throws(() => renderProjectMd({ gates: { 'on-done': `echo "a" 'b'` } }), (e) => e.kind === 'unquotable');
  assert.equal(readBack(renderProjectMd({ gates: { 'on-done': 'true' } })).gates['on-done'], 'true');
});

test('merge never overwrites a declared scalar', () => {
  const r = mergeProjectMd('---\ntype: docs\n---\nnotas\n', { type: 'code-tested' });
  assert.deepEqual(r.conflicts, [{ key: 'type', existing: 'docs', proposed: 'code-tested' }]);
  assert.match(r.text, /^---\ntype: docs\n---/);
  assert.doesNotMatch(r.text, /code-tested/);
});

test('merge: declared lists stay, missing lists are added', () => {
  const r = mergeProjectMd('---\ntest-paths:\n  - spec/\n---\n', { testPaths: ['tests/'], highRiskPaths: ['auth/'] });
  assert.equal(r.conflicts[0].key, 'test-paths');
  assert.deepEqual(r.added, ['high-risk-paths']);
  assert.match(r.text, /test-paths:\n {2}- spec\/\n/);
  assert.doesNotMatch(r.text, /tests\//);
  assert.deepEqual(readBack(r.text).highRiskPaths.filter((x) => x === 'auth/'), ['auth/']);
});

test('merge of gates is per sub-key', () => {
  const r = mergeProjectMd('---\ngates:\n  on-done: make test\ntype: code-tested\n---\n', { gates: { 'on-done': 'npm run test', 'pre-merge': 'make all' } });
  assert.deepEqual(r.conflicts.map((c) => c.key), ['gates.on-done']);
  assert.deepEqual(r.added, ['gates.pre-merge']);
  const c = readBack(r.text);
  assert.equal(c.gates['on-done'], 'make test');
  assert.equal(c.gates['pre-merge'], 'make all');
  assert.equal(c.type, 'code-tested');
});

test('merge keeps the notes byte for byte; text without frontmatter gets one', () => {
  const notes = '\n# Notas\n\nuno\n\ndos con  espacios  \n\ntres\n';
  const r = mergeProjectMd(`---\ntype: code-tested\n---${notes}`, { type: 'code-tested', depsInstall: 'npm ci' });
  assert.ok(r.text.endsWith(`---${notes}`));
  const bare = mergeProjectMd('solo una nota\n', { type: 'docs' });
  assert.equal(bare.text, '---\ntype: docs\n---\nsolo una nota\n');
});

test('invalid frontmatter is refused and no text is returned', () => {
  const r = mergeProjectMd('---\ngates: [a, b]\n---\n', { type: 'docs' });
  assert.equal(r.ok, false);
  assert.equal(r.refused, 'invalid-project-md');
  assert.equal(r.text, undefined);
});

test('merge is idempotent', () => {
  const first = mergeProjectMd('---\ntype: docs\n---\nn\n', FULL);
  const second = mergeProjectMd(first.text, FULL);
  assert.deepEqual(second.added, []);
  assert.equal(second.text, first.text);
  const fresh = mergeProjectMd(first.text, { ...FULL, type: 'docs' });
  assert.deepEqual(fresh.conflicts.map((c) => c.key).filter((k) => k === 'type'), []);
});

test('validatePiiPattern', () => {
  assert.equal(validatePiiPattern('\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b').ok, true);
  assert.equal(validatePiiPattern('(').refused, 'invalid-regex');
  for (const p of ['.*', 'a', '']) assert.equal(validatePiiPattern(p).refused, 'too-broad', JSON.stringify(p));
});

test('CRLF: untouched lines keep their ending and new ones use the file ending', () => {
  const r = mergeProjectMd('---\r\ntype: docs\r\n---\r\nnota\r\n', { type: 'docs', depsInstall: 'npm ci' });
  assert.equal(r.text, '---\r\ntype: docs\r\ndeps-install: npm ci\r\n---\r\nnota\r\n');
});
