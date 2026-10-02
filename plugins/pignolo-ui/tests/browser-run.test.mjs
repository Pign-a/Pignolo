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

// ---- Hito 4e, T12: capture validity in capturePage (real browser) ------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, BROWSER_SKIP, browserPath } from './helpers.mjs';
import { withBrowser } from '../lib/browser-session.mjs';
import { capturePage } from '../lib/browser-run.mjs';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
async function capture(html) {
  const site = await serveRoutes({ '/': { headers: HTML, body: html } });
  const outDir = path.join(makeTempDir(), 'captures');
  try {
    const open = (fn) => withBrowser({ executable: browserPath() }, fn);
    const r = await capturePage({ url: `${site.base}/`, plan: shotPlan({ platform: 'desktop' }), open, outDir });
    return { ...r, outDir };
  } finally {
    await site.close();
  }
}
const busy = (extra = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title><style>body{margin:0;font:16px sans-serif}.b{background:#0b6bcb;color:#fff;padding:60px}.c{background:#eee;padding:80px}${extra}</style></head><body><div class="b"><h1 id="t">Título grande</h1></div><div class="c"><p>Texto de ejemplo con contenido real para llenar la página.</p></div></body></html>`;

test('capturePage: an empty white page is a capture with valid false, kept on disk and unverified', { skip: BROWSER_SKIP }, async () => {
  const r = await capture('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title></head><body style="margin:0;background:#fff"></body></html>');
  assert.equal(r.captures.length, 1);
  assert.deepEqual([r.captures[0].valid, r.captures[0].reason], [false, 'uniform']);
  assert.equal(r.captures[0].settled.readyState, 'complete');
  assert.ok(fs.existsSync(path.join(path.dirname(r.outDir), r.captures[0].path)), 'an invalid capture is not deleted');
  assert.deepEqual(r.unverified.map((u) => [u.width, u.theme, u.reason]), [[1440, 'light', 'capture invalid: uniform']]);
});

test('capturePage: a page with content is valid and has nothing unverified', { skip: BROWSER_SKIP }, async () => {
  const r = await capture(busy());
  assert.deepEqual(r.captures.map((c) => c.valid), [true]);
  assert.deepEqual(r.unverified, []);
});

test('capturePage: a one-shot entry animation is waited for with a single recapture', { skip: BROWSER_SKIP }, async () => {
  const r = await capture(busy('#t{animation:in 1.3s ease-out both}@keyframes in{from{opacity:0}to{opacity:1}}'));
  assert.equal(r.captures[0].valid, true);
  assert.equal(r.captures[0].recaptured, true, 'the first read saw the animation running');
  assert.deepEqual(r.unverified, []);
});
