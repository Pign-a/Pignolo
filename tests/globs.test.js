'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { matchGlob, matchAny } = require('../plugins/pignolo/lib/globs');

const TABLE = [
  ['*test*', 'src/a.test.js', true],
  ['*test*', 'tests/x.js', true],
  ['*test*', 'src/latest.js', true],
  ['*test*', 'src/app.js', false],
  ['fixtures/', 'a/fixtures/b.json', true],
  ['fixtures/', 'fixtures.js', false],
  ['tests/', 'tests/a.js', true],
  ['tests/', 'src/tests/a.js', true],
  ['tests/', 'tests.js', false],
  ['src/**/*.sql', 'src/db/m/1.sql', true],
  ['src/**/*.sql', 'src/1.sql', true],
  ['src/**/*.sql', 'lib/src/1.sql', false],
  ['db/migrations/*', 'db/migrations/001.sql', true],
  ['db/migrations/*', 'db/migrations/a/001.sql', false],
  ['?.md', 'a.md', true],
  ['?.md', 'ab.md', false],
  ['Package.json', 'package.json', false],
  ['package.json', 'package.json', true],
];

test('matchGlob', async (t) => {
  for (const [pattern, rel, expected] of TABLE) {
    await t.test(`${pattern} vs ${rel} = ${expected}`, () => assert.strictEqual(matchGlob(pattern, rel), expected));
  }
});

test('matchAny', () => {
  assert.strictEqual(matchAny(['docs/', '*.md'], 'src/x.md'), true);
  assert.strictEqual(matchAny(['docs/'], 'src/x.md'), false);
  assert.strictEqual(matchAny([], 'a'), false);
});
