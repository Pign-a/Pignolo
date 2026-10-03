'use strict';
// T5 del plan 2026-10-03-fuga-leak-values: la guía para quien ya tiene los archivos en git.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');

test('docs/fuga-leak-values.md exists and has the commands of the cleanup', () => {
  const doc = read('docs', 'fuga-leak-values.md');
  for (const needle of ['git reset --soft HEAD~1', 'git restore --staged', 'git filter-repo', 'leak-migrate']) assert.ok(doc.includes(needle), needle);
});

test('the README links the guide in the shell guard section', () => {
  const readme = read('README.md');
  const at = readme.indexOf('## Guardia de shell');
  assert.ok(at >= 0);
  assert.ok(readme.slice(at).includes('docs/fuga-leak-values.md'));
});

test('both changelogs name the leak-values change', () => {
  assert.match(read('CHANGELOG.md').split(/^## /m).find((e) => e.startsWith('0.21.0')), /leak-values/);
  assert.match(read('plugins', 'pignolo-ui', 'CHANGELOG.md').split(/^## /m).find((e) => e.startsWith('0.11.0')), /leak-values/);
});

test('the versions of this fix: core 0.21.0 or later and pignolo-ui 0.11.0 or later', () => {
  const atLeast = (v, min) => { const a = v.split('.').map(Number); const b = min.split('.').map(Number); return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))); };
  assert.ok(atLeast(JSON.parse(read('plugins', 'pignolo', '.claude-plugin', 'plugin.json')).version, '0.21.0'));
  assert.ok(atLeast(JSON.parse(read('plugins', 'pignolo-ui', '.claude-plugin', 'plugin.json')).version, '0.11.0'));
});

test('the guide has no personal paths', () => {
  assert.ok(!/[A-Za-z]:\Users\|\/Users\/|\/home\/[a-z]/.test(read('docs', 'fuga-leak-values.md')));
});
