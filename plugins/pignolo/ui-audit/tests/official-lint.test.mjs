// The official linter (spec §0.1 criterion 2, A-09) only informs: without it the result is unverified, never a green.
// The development tests that ran it over the design flow's template and over extracted files went with that flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { runOfficialLint } from '../lib/official-lint.mjs';

// a valid design.md: the fixture of the validator (the templates of the design flow are not part of the audit)
const TEMPLATE = path.join(FIXTURES, 'design', 'valid.md');

test('without the official linter the result is unverified', () => {
  const r = runOfficialLint(TEMPLATE, { projectRoot: makeTempDir(), env: {} });
  assert.deepEqual(r, { status: 'unverified', reason: 'official linter not installed (@google/design.md)' });
});

test('a linter that prints no JSON is unverified, never approved', () => {
  const project = writeTree(makeTempDir(), {
    'node_modules/@google/design.md/package.json': JSON.stringify({ name: '@google/design.md', version: '0.4.0', bin: { designmd: 'dist/index.js' } }),
    'node_modules/@google/design.md/dist/index.js': 'process.exit(0);\n',
  });
  const r = runOfficialLint(TEMPLATE, { projectRoot: project, env: {} });
  assert.equal(r.status, 'unverified');
  assert.match(r.reason, /no JSON/);
});

test('validate --official reports the official result without changing the exit code', () => {
  const out = runScript('design-md.mjs', ['validate', '--file', TEMPLATE, '--project', makeTempDir(), '--official'], { env: { ...process.env, PIGNOLO_UI_DESIGNMD: '' } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.official.status, 'unverified');
});
