// STRESS-04 (lib/rules/stress.mjs): fixed width in px on a control. Folders under
// tests/fixtures/rules/STRESS-04 run in rules-fixtures.test.mjs; these are the edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

async function stress(css, file = 'a.css') {
  const root = writeTree(makeTempDir(), { [file]: css });
  const r = await runCheck({ project: root, files: [file], design: null });
  return r.entries.filter((e) => e.id === 'STRESS-04' && e.status === 'fail');
}

test('STRESS-04: 49 px fails and 48 px does not; a different height is not a square', async () => {
  assert.equal((await stress('button { width: 49px; }')).length, 1);
  assert.equal((await stress('button { width: 48px; }')).length, 0);
  assert.equal((await stress('button { width: 120px; height: 40px; }')).length, 1);
  assert.equal((await stress('button { width: 120px; height: 120px; }')).length, 0);
});

test('STRESS-04: one entry per rule, with the width measured; min-width and calc are exempt', async () => {
  const f = await stress('.btn, .link-btn { width: 200px; }\nbutton { width: 100px; min-width: 100px; }\nbutton.x { width: calc(100px + 1em); }');
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].measure.widthPx, f[0].severity], [200, 'alto']);
});

test('STRESS-04 is not measured on Tailwind utilities (declared limit)', async () => {
  assert.deepEqual(await stress('export const B = () => <button className="w-[120px]">x</button>;\n', 'B.tsx'), []);
});
