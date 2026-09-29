// Development test against the official linter (spec §0.1 criterion 2, A-09). It only runs
// when a developer installed @google/design.md@0.4.0 by hand, outside package.json, and
// points PIGNOLO_UI_DESIGNMD at it. Without it the test is a visible skip, never a green.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { findOfficialLinter, runOfficialLint, PINNED_VERSION } from '../lib/official-lint.mjs';
import { extractDesign } from '../lib/design-extract.mjs';

const TEMPLATE = path.join(PLUGIN_ROOT, 'templates', 'DESIGN.md');
const NO_LINTER = 'sin linter oficial: instalar @google/design.md@0.4.0 a mano fuera del repo y fijar PIGNOLO_UI_DESIGNMD';

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

test(`the template passes the official linter ${PINNED_VERSION} with 0 errors and 0 warnings (development)`, (t) => {
  const found = findOfficialLinter({ env: process.env });
  if (!found) {
    t.skip(NO_LINTER);
    return;
  }
  assert.equal(found.version, PINNED_VERSION);
  const r = runOfficialLint(TEMPLATE, { env: process.env });
  assert.equal(r.status, 'ran');
  assert.deepEqual([r.errors, r.warnings], [0, 0], JSON.stringify(r.findings));
  assert.ok(fs.existsSync(found.entry));
});

test(`extract outputs of the fixtures pass the official linter ${PINNED_VERSION} with 0/0 (development)`, (t) => {
  const found = findOfficialLinter({ env: process.env });
  if (!found) {
    t.skip(NO_LINTER);
    return;
  }
  for (const name of ['tailwind-v4', 'tailwind-v3', 'css-root', 'shadcn', 'frequency']) {
    const r = extractDesign(path.join(FIXTURES, 'extract', name), { date: '2026-09-28' });
    const file = path.join(makeTempDir(), 'DESIGN.md');
    fs.writeFileSync(file, r.text);
    const lint = runOfficialLint(file, { env: process.env });
    assert.equal(lint.status, 'ran', name);
    assert.deepEqual([lint.errors, lint.warnings], [0, 0], `${name}: ${JSON.stringify(lint.findings)}`);
  }
});
