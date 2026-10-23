// Real browser over the pipe (lib/browser-session.mjs, spec §11.1, §16.1). Without Chrome or
// Edge every test here is a visible skip ("sin navegador"), never a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { serveRoutes, BROWSER_SKIP, browserPath, leftoverProcesses, PLUGIN_ROOT } from './helpers.mjs';
import { openBrowser, withBrowser, BrowserUnavailable, PageLoadError } from '../lib/browser-session.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('opens a headless browser with its own profile, UTF-8 over the pipe, closes clean', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>Título ñandú — á é</title><p>x</p>' } });
  let browser;
  try {
    browser = await openBrowser({ executable: browserPath() });
    assert.match(browser.product, /(Chrome|Edg|HeadlessChrome)\//);
    assert.ok(fs.existsSync(browser.profile));
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setMedia({ theme: 'light' });
    const { finalUrl } = await page.navigate(`${site.base}/`);
    assert.equal(finalUrl, `${site.base}/`);
    await page.waitReady();
    assert.equal(await page.evaluate(() => document.title), 'Título ñandú — á é');
  } finally {
    const cleanup = await browser.close();
    await site.close();
    assert.equal(cleanup.profileRemoved, true);
    assert.equal(alive(browser.pid), false);
    assert.equal(fs.existsSync(browser.profile), false);
    assert.deepEqual(await leftoverProcesses(browser.profile), []);
  }
});

test('theme is always set explicitly, whatever the OS uses (§11.1)', { skip }, async () => {
  await withBrowser({ executable: browserPath() }, async (browser) => {
    const page = await browser.newPage();
    const dark = () => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
    const reduce = () => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.setMedia({ theme: 'light' });
    assert.equal(await dark(), false);
    await page.setMedia({ theme: 'dark', reducedMotion: true });
    assert.deepEqual([await dark(), await reduce()], [true, true]);
    await page.setMedia({ theme: 'light' });
    assert.deepEqual([await dark(), await reduce()], [false, false]);
    assert.throws(() => page.setMedia({ theme: 'auto' }), /light or dark/);
  });
});

test('widths are emulated with mobile: false, so 320 means 320 without a viewport meta', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>w</title><p>x</p>' } });
  try {
    await withBrowser({ executable: browserPath() }, async (browser) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 320, height: 640 });
      await page.navigate(`${site.base}/`);
      assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), [320, 640, 1]);
    });
  } finally {
    await site.close();
  }
});

test('when Browser.close is not honored the process tree is killed and the profile removed', { skip }, async () => {
  const browser = await openBrowser({ executable: browserPath() });
  const cleanup = await browser.close({ graceful: false });
  assert.deepEqual(cleanup, { graceful: false, killed: true, profileRemoved: true });
  assert.equal(alive(browser.pid), false);
  assert.equal(fs.existsSync(browser.profile), false);
  assert.deepEqual(await leftoverProcesses(browser.profile), []);
});

test('after close nothing keeps Node alive (no timer left waiting for the close deadline)', { skip }, async () => {
  const lib = pathToFileURL(path.join(PLUGIN_ROOT, 'lib', 'browser-session.mjs')).href;
  const code = `import { withBrowser } from ${JSON.stringify(lib)};
await withBrowser({ executable: ${JSON.stringify(browserPath())}, closeTimeoutMs: 60000 }, async (b) => { await b.newPage(); });`;
  const t = Date.now();
  const status = await new Promise((resolve) => spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' }).on('close', resolve));
  assert.equal(status, 0);
  assert.ok(Date.now() - t < 30000, `the process took ${Date.now() - t} ms to exit`);
});

test('a missing executable is BrowserUnavailable and leaves no profile', async () => {
  await assert.rejects(openBrowser({ executable: 'Z:/no/such/browser.exe', startTimeoutMs: 5000 }), (e) => {
    assert.ok(e instanceof BrowserUnavailable, e.message);
    assert.equal(fs.existsSync(e.profile), false);
    return true;
  });
});

test('a page that never answers is PageLoadError, and cleanup still happens', { skip }, async () => {
  const site = await serveRoutes({ '/hang': () => { /* never answers */ } });
  let browser;
  try {
    browser = await openBrowser({ executable: browserPath() });
    const page = await browser.newPage();
    await assert.rejects(page.navigate(`${site.base}/hang`, { timeoutMs: 1500 }), PageLoadError);
  } finally {
    const cleanup = await browser.close();
    await site.close();
    assert.equal(cleanup.profileRemoved, true);
  }
});

test('Tab is dispatched as keyDown and keyUp and moves the focus', { skip }, async () => {
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><title>t</title><a href="#a" id="a">a</a><button id="b">b</button>' } });
  try {
    await withBrowser({ executable: browserPath() }, async (browser) => {
      const page = await browser.newPage();
      await page.navigate(`${site.base}/`);
      await page.evaluate(() => {
        window.keys = [];
        addEventListener('keydown', (e) => keys.push(`down:${e.key}`));
        addEventListener('keyup', (e) => keys.push(`up:${e.key}`));
      });
      await page.pressTab();
      await page.pressTab();
      assert.deepEqual(await page.evaluate(() => [document.activeElement.id, keys]), ['b', ['down:Tab', 'up:Tab', 'down:Tab', 'up:Tab']]);
    });
  } finally {
    await site.close();
  }
});
