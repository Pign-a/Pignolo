import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';

const fixture = (name) => path.join(FIXTURES, 'product', `${name}.md`);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('validate: no PRODUCT.md is missing and exit 0; too long is exit 1', () => {
  const empty = makeTempDir();
  const r = runScript('product-md.mjs', ['validate', '--project', empty]);
  assert.equal(r.status, 0);
  assert.equal(r.json.status, 'missing');

  const long = writeTree(makeTempDir(), { 'PRODUCT.md': fs.readFileSync(fixture('fail-too-long'), 'utf8') });
  const bad = runScript('product-md.mjs', ['validate', '--project', long]);
  assert.equal(bad.status, 1);
  assert.equal(bad.json.status, 'invalid');

  const good = writeTree(makeTempDir(), { 'PRODUCT.md': fs.readFileSync(fixture('pass-complete'), 'utf8') });
  const ok = runScript('product-md.mjs', ['validate', '--project', good]);
  assert.equal(ok.status, 0);
  assert.equal(ok.json.status, 'ok');
});

test('validate with --values-file: a value present is exit 1 and the output never has it', () => {
  const project = writeTree(makeTempDir(), { 'PRODUCT.md': '## Audience\nFor Tomas Rivera and friends.\n' });
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, JSON.stringify(['Tomas Rivera']));
  const r = runScript('product-md.mjs', ['validate', '--project', project, '--values-file', values]);
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes('Tomas Rivera') && !r.stderr.includes('Tomas Rivera'));
});

test('create writes the file once and never overwrites', () => {
  const project = makeTempDir();
  const r = runScript('product-md.mjs', ['create', '--project', project, '--from', fixture('pass-complete')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = path.join(project, 'PRODUCT.md');
  assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(fixture('pass-complete'), 'utf8'));
  const before = sha(file);
  const again = runScript('product-md.mjs', ['create', '--project', project, '--from', fixture('pass-partial')]);
  assert.equal(again.status, 1);
  assert.equal(again.json.error, 'exists');
  assert.equal(sha(file), before);
});

test('create with an invalid draft exits 1 and writes nothing', () => {
  const project = makeTempDir();
  const r = runScript('product-md.mjs', ['create', '--project', project, '--from', fixture('fail-duplicate')]);
  assert.equal(r.status, 1);
  assert.equal(fs.existsSync(path.join(project, 'PRODUCT.md')), false);
  const leaked = runScript('product-md.mjs', ['create', '--project', project, '--from', fixture('fail-leak')]);
  assert.equal(leaked.status, 1);
  assert.equal(fs.existsSync(path.join(project, 'PRODUCT.md')), false);
});

test('template validates by itself with the five sections undecided; usage errors are exit 2', () => {
  const r = runScript('product-md.mjs', ['template']);
  assert.equal(r.status, 0);
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.undecided.length, 5);
  assert.equal(runScript('product-md.mjs', ['validate']).status, 2);
  assert.equal(runScript('product-md.mjs', ['nope']).status, 2);
});
