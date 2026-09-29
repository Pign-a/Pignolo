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

// Deep nesting must stay linear-ish: no rule error (stack overflow) and a generous time bound.
test('element rules handle 5000 nested levels without rule errors, quickly', async () => {
  const N = 5000;
  const shapes = {
    divs: '<div>'.repeat(N) + '<img src="/a.png" alt="a">' + '</div>'.repeat(N),
    // nested targets are inherently quadratic (each one reads its subtree text): fewer levels
    buttons: '<button>'.repeat(2000) + 'x' + '</button>'.repeat(2000),
    labels: '<label>L '.repeat(N) + '<input>' + '</label>'.repeat(N),
    hidden: '<div aria-hidden="true">'.repeat(N) + '<a href="/">x</a>'.repeat(200) + '</div>'.repeat(N),
    fields: '<div>'.repeat(N) + '<label>L</label>'.repeat(200) + '<input>'.repeat(200) + '</div>'.repeat(N),
  };
  for (const [name, html] of Object.entries(shapes)) {
    const project = writeTree(makeTempDir(), { 'a.html': html });
    const t = Date.now();
    const { entries } = await runCheck({ project, files: ['a.html'], design: null, base: null, dom: [] });
    const ms = Date.now() - t;
    const errors = entries.filter((e) => /rule error/.test(e.reason || ''));
    assert.deepEqual(errors.map((e) => `${e.id} ${e.reason}`), [], name);
    assert.ok(ms < 5000, `${name}: ${ms} ms`);
  }
});
