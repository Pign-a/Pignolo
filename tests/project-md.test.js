'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');

const { renderProjectMd, mergeProjectMd, validatePiiPattern, revertPlaces } = require('../plugins/pignolo/lib/project-md');
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

// --- Pasada de arreglos 8a ---
// Protects: I-1 · Breaks if: las claves nuevas de un mapa se insertan con 2 espacios aunque el mapa use otra sangría.
test('merge into a gates map indented with 3 or 4 spaces keeps that indentation and stays parseable', () => {
  for (const ind of ['    ', '   ']) {
    const text = `---\ntype: code-tested\ngates:\n${ind}on-edit: npm run lint\n---\nnotas\n`;
    const r = mergeProjectMd(text, { gates: { 'on-edit': 'npm run lint', 'on-done': 'npm test' } });
    assert.equal(r.ok, true);
    assert.ok(r.text.includes(`gates:\n${ind}on-edit: npm run lint\n${ind}on-done: npm test\n---`), JSON.stringify(r.text));
    assert.equal(readBack(r.text).gates['on-done'], 'npm test');
  }
});

// Protects: m-5 · Breaks if: una clave declarada vacía (`language:`) se informa como agregada sin escribir nada.
test('a declared-but-empty scalar key gets its value written on the same line', () => {
  const r = mergeProjectMd('---\ntype: docs\nlanguage:\n---\n', { type: 'docs', language: 'es' });
  assert.deepEqual(r.added, ['language']);
  assert.equal(r.text, '---\ntype: docs\nlanguage: es\n---\n');
  assert.equal(readBack(r.text).language, 'es');
  const crlf = mergeProjectMd('---\r\ntype: docs\r\nlanguage:\r\n---\r\n', { language: 'es' });
  assert.equal(crlf.text, '---\r\ntype: docs\r\nlanguage: es\r\n---\r\n');
});

// Protects: m-7 · Breaks if: validatePiiPattern deja pasar patrones que casan cualquier línea común.
test('validatePiiPattern rejects patterns that match ordinary lines (a space, "..")', () => {
  for (const p of [' ', '..', '\\s', '[a-z ]']) assert.equal(validatePiiPattern(p).ok, false, `"${p}"`);
  for (const p of ['\\b\\d{8}\\b', '@example\\.com', 'cliente-\\d+']) assert.equal(validatePiiPattern(p).ok, true, p);
});

// Hito 8d: la clave `places`.
test('places: renders in KEYS order, reads back, and an unknown kind is a warning', () => {
  const text = renderProjectMd({ type: 'docs', places: { spec: 'doc/specs/' } });
  assert.match(text, /places:\n {2}spec: doc\/specs\/\n/);
  const c = readBack(text);
  assert.deepEqual(c.places, { spec: 'doc/specs/' });
  assert.deepEqual(c.warnings.filter((w) => w.includes('places')), []);
  assert.deepEqual(readBack(renderProjectMd({ type: 'docs' })).places, {});
  const odd = readBack('---\nplaces:\n  espec: x\n---\n');
  assert.ok(odd.warnings.includes('places: tipo desconocido "espec" (se ignora)'));
  assert.deepEqual(odd.places, {});
});

test('places: merge adds the missing kind and never overwrites a declared one', () => {
  const src = '---\ntype: docs\nplaces:\n  spec: docs/specs/\n---\nnotas\n';
  const r = mergeProjectMd(src, { places: { spec: 'doc/specs/', plan: 'docs/plans/' } });
  assert.deepEqual(r.conflicts.map((c) => c.key), ['places.spec']);
  assert.deepEqual(r.added, ['places.plan']);
  assert.equal(r.text, '---\ntype: docs\nplaces:\n  spec: docs/specs/\n  plan: docs/plans/\n---\nnotas\n');
});

test('revertPlaces: table', () => {
  const base = '---\ntype: docs\nplaces:\n  spec: docs/specs/\n  plan: docs/plans/\n---\nnotas\n';
  let r = revertPlaces({ text: base, edits: [{ kind: 'spec', before: 'doc/specs/', after: 'docs/specs/' }] });
  assert.deepEqual(r.reverted, ['spec']);
  assert.equal(r.text, base.replace('spec: docs/specs/', 'spec: doc/specs/'));

  r = revertPlaces({ text: base, edits: [{ kind: 'spec', before: null, after: 'docs/specs/' }] });
  assert.equal(r.text, base.replace('  spec: docs/specs/\n', ''));

  const only = '---\ntype: docs\nplaces:\n  spec: docs/specs/\ngates:\n  on-done: x\n---\nnotas\n';
  r = revertPlaces({ text: only, edits: [{ kind: 'spec', before: null, after: 'docs/specs/' }] });
  assert.equal(r.text, '---\ntype: docs\ngates:\n  on-done: x\n---\nnotas\n');

  r = revertPlaces({ text: base, edits: [{ kind: 'spec', before: 'doc/specs/', after: 'otra/' }] });
  assert.equal(r.text, base);
  assert.deepEqual(r.left, [{ kind: 'spec', current: 'docs/specs/' }]);
  assert.deepEqual(r.reverted, []);

  const none = '---\ntype: docs\n---\nnotas\n';
  r = revertPlaces({ text: none, edits: [{ kind: 'spec', before: null, after: 'docs/specs/' }] });
  assert.equal(r.text, none);

  const crlf = '---\r\nplaces:\r\n  spec: "docs/specs/"\r\n  plan: docs/plans/\r\n---\r\nn\r\n';
  r = revertPlaces({ text: crlf, edits: [{ kind: 'spec', before: 'doc/specs/', after: 'docs/specs/' }] });
  assert.equal(r.text, '---\r\nplaces:\r\n  spec: doc/specs/\r\n  plan: docs/plans/\r\n---\r\nn\r\n');
});
