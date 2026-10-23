// lib/browser-run.mjs without a browser: measurePage over a fake browser, to count what it does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes } from './helpers.mjs';
import { measurePage, BROWSER_RULES } from '../lib/browser-run.mjs';
import { shotPlan } from '../lib/shot-plan.mjs';
import { PageLoadError } from '../lib/browser-session.mjs';

test('a URL that hangs costs one timeout: after the first PageLoadError the rest is unverified, not retried', async () => {
  const site = await serveRoutes({ '/': { body: 'ok' } });
  const navigations = [];
  const tab = {
    setViewport: async () => {},
    setMedia: async () => {},
    navigate: async (url, { timeoutMs }) => { navigations.push(timeoutMs); throw new PageLoadError(`the page did not finish loading in ${timeoutMs} ms`); },
  };
  const open = (fn) => fn({ product: 'Fake/1', newPage: async () => tab });
  const plan = shotPlan({ platform: 'both', dark: true });
  try {
    const r = await measurePage({ url: `${site.base}/`, plan, open, navTimeoutMs: 1234 });
    assert.deepEqual(navigations, [1234], 'one navigation, not one per width and theme');
    const combos = plan.widths.length * plan.themes.length;
    assert.equal(combos, 8);
    assert.equal(r.entries.length, combos * BROWSER_RULES.length);
    assert.ok(r.entries.every((e) => e.status === 'unverified' && /did not finish loading in 1234 ms/.test(e.reason)));
    assert.deepEqual([...new Set(r.entries.map((e) => `${e.measure.width}|${e.measure.theme}`))].length, combos, 'every width and theme is accounted for');
  } finally {
    await site.close();
  }
});
