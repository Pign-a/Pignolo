// The orphan-process oracle of the browser tests (helpers.mjs processesWith) fails closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { processesWith } from './helpers.mjs';

const PROFILE = 'C:\tmp\pignolo-ui-browser-abc123';

test('processesWith throws when the process listing did not run (timeout, did not start, non-zero exit)', () => {
  const broken = [
    { error: Object.assign(new Error('spawnSync powershell.exe ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, stdout: '' },
    { error: Object.assign(new Error('spawnSync ps ENOENT'), { code: 'ENOENT' }), status: null, stdout: null },
    { status: 1, stdout: '', stderr: 'boom' },
    { status: null, signal: 'SIGTERM', stdout: '' },
  ];
  for (const res of broken) assert.throws(() => processesWith(PROFILE, { run: () => res }), /did not run, so orphans were not measured/);
});

test('processesWith returns the ids when the listing ran, and [] only when it ran and found none', () => {
  const win = process.platform === 'win32';
  const listing = win ? '4321\r\n8765\r\n' : `  4321 /usr/bin/browser --user-data-dir=/tmp/pignolo-ui-browser-abc123\n  99 /usr/bin/other\n`;
  assert.deepEqual(processesWith(PROFILE, { run: () => ({ status: 0, stdout: listing }) }), win ? [4321, 8765] : [4321]);
  assert.deepEqual(processesWith(PROFILE, { run: () => ({ status: 0, stdout: '' }) }), []);
});
