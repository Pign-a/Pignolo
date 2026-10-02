// Stress test of the rendered page (lib/browser-stress.mjs, hito 4e, R-4e-17 and R-4e-18).
// The Node side runs always; the pages need Chrome or Edge and are a visible skip without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serveRoutes, BROWSER_SKIP, browserPath, FIXTURES } from './helpers.mjs';
import { withBrowser } from '../lib/browser-session.mjs';
import { stressPage } from '../lib/browser-run.mjs';
import { shotPlan } from '../lib/shot-plan.mjs';
import { stressFindings, LONG_FACTOR, MAX_STRESS_CHARS, HOLE_MIN_PX, STRESS_ZOOM, FIXED_MAX_RATIO } from '../lib/browser-stress.mjs';

const skip = BROWSER_SKIP;
const page = (over = {}) => ({ scrollWidth: 1440, clientWidth: 1440, innerHeight: 900, fixed: [], ...over });
const text = (selector, over = {}) => ({ selector, scrollWidth: 100, clientWidth: 100, overflow: 'visible', ellipsis: false, rect: { left: 0, top: 0, width: 100, height: 20 }, ...over });
const data = (over = {}) => ({ text: [], targets: [], page: page(), ...over });
const cut = { scrollWidth: 320, clientWidth: 200, overflow: 'hidden' };
const box = (selector, left, top, width = 100, height = 40) => ({ selector, left, top, width, height });

test('constants of the stress test', () => {
  assert.deepEqual([LONG_FACTOR, MAX_STRESS_CHARS, HOLE_MIN_PX, STRESS_ZOOM, FIXED_MAX_RATIO], [3, 120, 96, 2, 0.4]);
});

test('STRESS-01 long-text: cut text that was fine before is clipped; ellipsis and what already overflowed are not', () => {
  const run = (before, after) => stressFindings({ scenario: 'long-text', before, after, width: 1440 });
  const f = run(data({ text: [text('h1')] }), data({ text: [text('h1', cut)] }));
  assert.deepEqual(f.map((x) => [x.id, x.status, x.key]), [['STRESS-01', 'fail', 'long-text|clipped']]);
  assert.deepEqual(f[0].measure, { count: 1, selectors: ['h1'] });
  assert.deepEqual(run(data({ text: [text('h1')] }), data({ text: [text('h1', { ...cut, ellipsis: true })] })).map((x) => x.status), ['pass']);
  assert.deepEqual(run(data({ text: [text('h1', cut)] }), data({ text: [text('h1', cut)] })).map((x) => x.status), ['pass'], 'already overflowed: LAYOUT-11, not this');
  assert.deepEqual(run(data({ text: [text('h1')] }), data({ text: [text('h1', { ...cut, overflow: 'visible' })] })).map((x) => x.status), ['pass'], 'visible overflow is not a cut');
});

test('STRESS-01 long-text: a button that now covers a neighbor, and a page that gains horizontal scroll', () => {
  const run = (before, after) => stressFindings({ scenario: 'long-text', before, after, width: 375 });
  const apart = data({ targets: [box('#a', 0, 0), box('#b', 120, 0)] });
  const hit = run(apart, data({ targets: [box('#a', 0, 0, 150), box('#b', 120, 0)] }));
  assert.deepEqual(hit.map((x) => x.key), ['long-text|covers']);
  assert.deepEqual(hit[0].measure.selectors.sort(), ['#a', '#b']);
  const already = data({ targets: [box('#a', 0, 0, 150), box('#b', 120, 0)] });
  assert.deepEqual(run(already, already).map((x) => x.status), ['pass'], 'crossed before too');
  assert.deepEqual(run(data(), data({ page: page({ scrollWidth: 500, clientWidth: 375 }) })).map((x) => x.key), ['long-text|page-scroll']);
  assert.deepEqual(run(data({ page: page({ scrollWidth: 500, clientWidth: 375 }) }), data({ page: page({ scrollWidth: 500, clientWidth: 375 }) })).map((x) => x.status), ['pass']);
});

test('STRESS-01 long-text: forty cut cells are one entry with the count and five selectors', () => {
  const cells = Array.from({ length: 40 }, (_, i) => `td:nth-of-type(${i})`);
  const f = stressFindings({ scenario: 'long-text', before: data({ text: cells.map((c) => text(c)) }), after: data({ text: cells.map((c) => text(c, cut)) }), width: 1440 });
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].key, f[0].measure.count, f[0].measure.selectors.length], ['long-text|clipped', 40, 5]);
});

test('STRESS-02 empty-lists: a 200 px hole without text fails; collapsed, with text, or no lists do not', () => {
  const run = (after) => stressFindings({ scenario: 'empty-lists', after, width: 1440 });
  const list = (selector, height, textChars = 0) => ({ selector, height, textChars });
  assert.deepEqual(run([list('ul', 200)]).map((x) => [x.id, x.status, x.key]), [['STRESS-02', 'fail', 'empty-lists|hole']]);
  assert.deepEqual(run([list('ul', 95.9)]).map((x) => x.status), ['pass']);
  assert.deepEqual(run([list('ul', 96)]).map((x) => x.status), ['fail']);
  assert.deepEqual(run([list('ul', 200, 12)]).map((x) => x.status), ['pass']);
  assert.deepEqual(run([]), [], 'not applicable without lists of two or more children');
});

test('STRESS-03 zoom-200: new horizontal scroll, fixed bars over 40 %, and a degraded run is never a pass', () => {
  const run = (before, after) => stressFindings({ scenario: 'zoom-200', before, after, width: 1440 });
  const f = run(data(), data({ page: page({ scrollWidth: 900, clientWidth: 720, innerHeight: 450 }) }));
  assert.deepEqual(f.map((x) => [x.id, x.key]), [['STRESS-03', 'zoom-200|overflow-x']]);
  const covered = run(data(), data({ page: page({ scrollWidth: 720, clientWidth: 720, innerHeight: 450, fixed: [{ height: 150 }, { height: 120 }] }) }));
  assert.deepEqual(covered.map((x) => x.key), ['zoom-200|covered']);
  assert.deepEqual(run(data(), data({ page: page({ scrollWidth: 720, clientWidth: 720, innerHeight: 450, fixed: [{ height: 135 }] }) })).map((x) => x.status), ['pass'], '30 %');
  assert.deepEqual(run(data({ page: page({ scrollWidth: 1600 }) }), data({ page: page({ scrollWidth: 1600, clientWidth: 720 }) })).map((x) => x.status), ['pass'], 'it already scrolled at 1440');
  assert.deepEqual(run(data({ text: [text('p')] }), data({ text: [text('p', cut)] })).map((x) => x.key), ['zoom-200|clipped']);
  const none = stressFindings({ degraded: 'no browser: x' });
  assert.deepEqual(none.map((x) => [x.id, x.status, x.reason]), ['STRESS-01', 'STRESS-02', 'STRESS-03'].map((id) => [id, 'unverified', 'no browser: x']));
});

async function stressFixture(name, platform = 'both') {
  const body = fs.readFileSync(path.join(FIXTURES, 'stress', `${name}.html`), 'utf8');
  const site = await serveRoutes({ '/': { headers: { 'content-type': 'text/html; charset=utf-8' }, body } });
  try {
    const open = (fn) => withBrowser({ executable: browserPath() }, fn);
    return await stressPage({ url: `${site.base}/`, plan: shotPlan({ platform }), open, settleMs: 0 });
  } finally {
    await site.close();
  }
}
const fired = (r, id) => r.entries.filter((e) => e.id === id && e.status === 'fail');

test('stress in the browser: the three failing fixtures fire their rule', { skip }, async () => {
  const title = await stressFixture('fail-long-title');
  assert.ok(fired(title, 'STRESS-01').some((e) => e.fingerprint.endsWith('|long-text|clipped') && e.measure.width === 1440), JSON.stringify(title.entries.map((e) => [e.id, e.status, e.fingerprint])));
  const hole = await stressFixture('fail-hole');
  assert.ok(fired(hole, 'STRESS-02').length >= 1);
  const zoom = await stressFixture('fail-zoom');
  assert.deepEqual(fired(zoom, 'STRESS-03').map((e) => e.fingerprint.split('|').slice(-2).join('|')), ['zoom-200|overflow-x']);
  assert.equal(fired(zoom, 'STRESS-03')[0].measure.width, 1440, 'the zoom is measured from 1440 only');
});

test('stress in the browser: the three clean fixtures have no fail entry', { skip }, async () => {
  for (const name of ['pass-wraps', 'pass-message', 'pass-zoom']) {
    const r = await stressFixture(name);
    assert.deepEqual(r.entries.filter((e) => e.status === 'fail').map((e) => e.fingerprint), [], name);
    assert.equal(r.degraded, null);
  }
});
