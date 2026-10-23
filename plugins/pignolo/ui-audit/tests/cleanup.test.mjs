// Tests leave no temporary directories behind: each `npm run test:ui` used to leave
// ~170 pignolo-ui-test-* folders in %TEMP%. Every temporary directory comes from
// makeTempDir (helpers.mjs), which removes them when the test process exits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TESTS_DIR, makeTempDir } from './helpers.mjs';

const HELPERS = path.join(TESTS_DIR, 'helpers.mjs');
// Built in pieces so this file does not match itself.
const OWN_TEMP = new RegExp(['mk', 'dtemp|tmp', 'dir\\('].join(''));

test('no ui test file creates temporary directories except through helpers.mjs', () => {
  for (const f of fs.readdirSync(TESTS_DIR).filter((x) => /\.m?js$/.test(x) && x !== 'helpers.mjs')) {
    assert.doesNotMatch(fs.readFileSync(path.join(TESTS_DIR, f), 'utf8'), OWN_TEMP, f);
  }
});

// Protects: temp cleanup · Breaks if: makeTempDir stops registering what it creates or
// nothing removes it at exit.
test('a ui test file that uses makeTempDir leaves no pignolo-ui-test-* directory behind', () => {
  const tmp = makeTempDir('pignolo-ui-cleanup-');
  const fixture = path.join(tmp, 'fixture.test.mjs');
  fs.writeFileSync(fixture, [
    "import test from 'node:test';",
    `import { makeTempDir, writeTree } from ${JSON.stringify(pathToFileURL(HELPERS).href)};`,
    "test('uses the helpers', () => {",
    "  writeTree(makeTempDir(), { 'a/b.css': 'x' });",
    '  makeTempDir();',
    '});',
    '',
  ].join('\n'));
  // Without NODE_TEST_CONTEXT: with it, the child `node --test` does not run as its own suite.
  const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', fixture], { cwd: tmp, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\bpass 1\b/);
  assert.deepEqual(fs.readdirSync(tmp).filter((x) => x.startsWith('pignolo-ui-test-')), []);
});
