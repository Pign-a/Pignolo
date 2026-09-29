// Extra cases for the element accessibility rules (A11Y-04, A11Y-16, A11Y-26, A11Y-39).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

async function run(file, text, id) {
  const project = writeTree(makeTempDir(), { [file]: text });
  const { entries } = await runCheck({ project, files: [file], design: null, base: null, dom: [] });
  return entries.filter((e) => e.id === id);
}
const statuses = (entries) => entries.map((e) => e.status);

test('A11Y-04: aria-labelledby="" does not name the element', async () => {
  const r = await run('a.html', '<button aria-labelledby=""><svg></svg></button>\n', 'A11Y-04');
  assert.deepEqual(statuses(r), ['fail']);
});

test('A11Y-04: a button whose only child is an aria-hidden span fails', async () => {
  const r = await run('a.html', '<button><span aria-hidden="true">×</span></button>\n', 'A11Y-04');
  assert.deepEqual(statuses(r), ['fail']);
});

test('A11Y-04: a disabled icon-only button still fails', async () => {
  const r = await run('a.html', '<button disabled><svg/></button>\n', 'A11Y-04');
  assert.deepEqual(statuses(r), ['fail']);
});

test('the same markup in .tsx with className gives the same results', async () => {
  const html = '<button class="x"><svg viewBox="0 0 1 1"></svg></button>\n<img src="/a.png">\n<div aria-hidden="true"><a href="/x">x</a></div>\n<input type="search" placeholder="Buscar">\n';
  const tsx = 'export const A = () => (<>\n<button className="x"><svg viewBox="0 0 1 1"></svg></button>\n<img src="/a.png" />\n<div aria-hidden="true"><a href="/x">x</a></div>\n<input type="search" placeholder="Buscar" />\n</>);\n';
  for (const id of ['A11Y-04', 'A11Y-16', 'A11Y-26', 'A11Y-39']) {
    const a = await run('a.html', html, id);
    const b = await run('a.tsx', tsx, id);
    assert.deepEqual(statuses(a), ['fail'], `${id} html`);
    assert.deepEqual(statuses(b), ['fail'], `${id} tsx`);
  }
});
