import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFile } from '../lib/route.mjs';

const CASES = [
  ['a.html', { markup: 'html', utilities: 'markup', style: 'embedded', unsupported: null }],
  ['pages/a.HTM', { markup: 'html', utilities: 'markup', style: 'embedded', unsupported: null }],
  ['app/page.tsx', { markup: 'jsx', utilities: 'markup', style: 'embedded', unsupported: null }],
  ['src/B.jsx', { markup: 'jsx', utilities: 'markup', style: 'embedded', unsupported: null }],
  ['x.css', { markup: null, utilities: null, style: 'css', unsupported: null }],
  ['src/C.vue', { markup: null, utilities: 'sfc', style: 'embedded', unsupported: null }],
  ['D.svelte', { markup: null, utilities: 'sfc', style: 'embedded', unsupported: null }],
  ['p.astro', { markup: null, utilities: null, style: null, unsupported: 'unsupported extension .astro' }],
  ['x.js', { markup: null, utilities: null, style: null, unsupported: 'unsupported extension .js' }],
];

for (const [file, want] of CASES) {
  test(`route ${file}`, () => {
    const got = routeFile(file);
    for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, k);
    assert.equal(typeof got.ext, 'string');
  });
}

test('route ext is lowercase without the dot', () => {
  assert.equal(routeFile('a/B.TSX').ext, 'tsx');
});
