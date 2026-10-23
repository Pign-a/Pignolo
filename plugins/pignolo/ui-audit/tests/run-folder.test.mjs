import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree } from './helpers.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

test('ensureRunRoot creates .pignolo-ui/.gitignore with * and is idempotent', () => {
  const root = makeTempDir();
  const dir = ensureRunRoot(root);
  assert.equal(dir, path.join(root, RUN_ROOT));
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '*\n');
  assert.equal(ensureRunRoot(root), dir);
});

test('ensureRunRoot never rewrites an existing .gitignore', () => {
  const root = writeTree(makeTempDir(), { '.pignolo-ui/.gitignore': '*\n# kept\n' });
  ensureRunRoot(root);
  assert.equal(fs.readFileSync(path.join(root, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n# kept\n');
});

test('isInsideRunRoot resolves .. before deciding', () => {
  const root = makeTempDir();
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui', 'runs', 'x', 'a.md')), true);
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui', '..', 'src', 'a.md')), false);
  assert.equal(isInsideRunRoot(root, path.join(root, '.pignolo-ui-other', 'a.md')), false);
  assert.equal(isInsideRunRoot(root, path.join(makeTempDir(), 'a.md')), false);
});
