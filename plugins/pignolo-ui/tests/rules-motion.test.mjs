// MOTION-05, 06, 08, 09 (lib/rules/motion.mjs) and the control selector they share. The folders
// under tests/fixtures/rules/MOTION-0x are run by rules-fixtures.test.mjs; these cases cover the
// edges: the 500 ms limit, comma lists, keyframes, the hover gates and what is not measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { isControlSelector } from '../lib/rules/controls.mjs';

async function fails(css, id, extra = {}) {
  const root = writeTree(makeTempDir(), { 'a.css': css, ...extra });
  const r = await runCheck({ project: root, files: ['a.css'], design: extra['DESIGN.md'] ? 'DESIGN.md' : null });
  return r.entries.filter((e) => e.id === id && e.status === 'fail');
}

test('isControlSelector: tags, roles, btn classes and states; plain classes and tags are not', () => {
  for (const s of ['button', 'a:hover', '.card button', 'nav > a', '[role=button]', '.btn-primary', '.x:focus-visible', 'h1, input']) assert.equal(isControlSelector(s), true, s);
  for (const s of ['.card', 'div', '.hero p', '.data-table', 'abbr', '.nav-link']) assert.equal(isControlSelector(s), false, s);
});

test('MOTION-05 without DESIGN.md: 500 ms is the limit on a control, a longer one on a plain class is not judged', async () => {
  assert.equal((await fails('button { transition: opacity 500ms; }', 'MOTION-05')).length, 0);
  assert.equal((await fails('button { transition: opacity 0.501s; }', 'MOTION-05')).length, 1);
  assert.equal((await fails('.hero { transition: opacity 2s; }', 'MOTION-05')).length, 0);
  assert.equal((await fails('button { transition: opacity calc(var(--a) * 2); transition-duration: var(--d); }', 'MOTION-05')).length, 0);
  assert.equal((await fails('button { transition-duration: 700ms; }', 'MOTION-05')).length, 1);
});

test('MOTION-05 with DESIGN.md durations: any selector outside the set fails, 0 is fine', async () => {
  const design = '---\ncolors:\n  primary: "#0b6bcb"\npignolo:\n  schema: 1\n  motion:\n    durationMs:\n      fast: 100\n      base: 200\n---\n';
  const run = (css) => fails(css, 'MOTION-05', { 'DESIGN.md': design });
  assert.equal((await run('.x { transition: opacity 100ms, transform 200ms; }')).length, 0);
  assert.equal((await run('.x { transition: opacity 100ms, transform 250ms; }')).length, 1);
  assert.equal((await run('.x { transition: none; transition-duration: 0s; }')).length, 0);
});

test('MOTION-06: ease-in-out is fine, a bounce curve fails anywhere, a normal curve passes', async () => {
  assert.equal((await fails('button { transition: opacity 150ms ease-in-out; }', 'MOTION-06')).length, 0);
  assert.equal((await fails('.panel { transition: opacity 150ms ease-in; }', 'MOTION-06')).length, 0, 'ease-in is judged on controls only');
  assert.equal((await fails('.panel { transition-timing-function: cubic-bezier(.2, -0.5, .3, 1); }', 'MOTION-06')).length, 1);
  assert.equal((await fails('.panel { transition: opacity 150ms cubic-bezier(.2, 0, 0, 1); }', 'MOTION-06')).length, 0);
});

test('MOTION-08: comma lists, transition-property and keyframes steps; a layout name inside a longer one is not it', async () => {
  assert.equal((await fails('.x { transition: opacity 100ms, width 200ms; }', 'MOTION-08')).length, 1);
  assert.equal((await fails('.x { transition-property: height, opacity; }', 'MOTION-08')).length, 1);
  assert.equal((await fails('.x { transition: margin-left 200ms; }', 'MOTION-08')).length, 1);
  assert.equal((await fails('.x { transition: max-width-fake 200ms, border-width 100ms; }', 'MOTION-08')).length, 0);
  assert.equal((await fails('@keyframes grow { from { width: 0; } to { width: 100%; } }', 'MOTION-08')).length, 2);
  assert.equal((await fails('@keyframes fade { from { opacity: 0; } to { opacity: 1; } }', 'MOTION-08')).length, 0);
});

test('MOTION-09: any-hover gates too, and non-hover selectors with transform are not it', async () => {
  assert.equal((await fails('@media (any-hover: hover) and (pointer: fine) { a:hover { translate: 0 -2px; } }', 'MOTION-09')).length, 0);
  assert.equal((await fails('@media (min-width: 600px) { a:hover { rotate: 3deg; } }', 'MOTION-09')).length, 1);
  assert.equal((await fails('.card { transform: scale(1.02); }', 'MOTION-09')).length, 0);
});

test('Tailwind utilities are not measured (declared limit)', async () => {
  const root = writeTree(makeTempDir(), { 'Btn.tsx': 'export const B = () => <button className="duration-700 ease-in hover:scale-105 transition-[width]">x</button>;\n' });
  const r = await runCheck({ project: root, files: ['Btn.tsx'], design: null });
  assert.deepEqual(r.entries.filter((e) => /^MOTION-0[5689]$/.test(e.id) && e.status === 'fail'), []);
});
