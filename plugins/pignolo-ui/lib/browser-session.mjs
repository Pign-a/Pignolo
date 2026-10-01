// One headless browser over --remote-debugging-pipe (spec §11.1, A-12). Always a temporary
// profile of its own (--user-data-dir, absolute), never the user's browser; cleanup in finally.
//
// openBrowser({ executable, startTimeoutMs = 15000, closeTimeoutMs = 8000 }) -> Promise<browser>
//   browser { product, pid, profile, cdp, newPage() -> Promise<page>, close({ graceful = true }) -> Promise<cleanup> }
//   cleanup { graceful, killed, profileRemoved }: close() first closes its pages, then Browser.close;
//   after closeTimeoutMs it kills the process tree; the profile is removed with retries.
//   Throws BrowserUnavailable (reason in English, for `unverified`) when the browser
//   does not start or does not answer (for example a policy that blocks remote debugging);
//   the profile is removed before throwing.
// page {
//   sessionId,
//   setViewport({ width, height })                       DPR 1, mobile: false (spike: mobile: true gives 980 px)
//   setMedia({ theme: 'light' | 'dark', reducedMotion }) always explicit: headless inherits the OS theme
//   navigate(url, { timeoutMs = 30000 }) -> { finalUrl }  PageLoadError when it does not load
//   waitReady({ timeoutMs = 10000 })                     readyState complete, fonts.ready, two frames
//   evaluate(fn, arg, { timeoutMs }) -> value            fn: a function, run as (fn)(arg), or an expression
//   screenshot() -> Buffer                               PNG of the viewport
//   pressTab()                                           keyDown + keyUp, never left pressed
// }
// withBrowser(opts, fn) -> fn's value; the browser is closed in finally whatever happens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createCdpClient } from './cdp-pipe.mjs';

export class BrowserUnavailable extends Error {}
export class PageLoadError extends Error {}

export const LAUNCH_ARGS = [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A closed or killed browser can hold its profile files for a while (Windows, under load): retry up to 20 s.
async function removeProfile(dir, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  for (;;) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* retried below */ }
    if (!fs.existsSync(dir)) return true;
    if (Date.now() > until) return false;
    await sleep(250);
  }
}

// Kills the browser's process tree without a shell (spec §11.1).
function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // detached: the browser leads its own process group
    }
  } catch { /* already gone */ }
}

// true when the process ended within ms; the timer is cleared so it never keeps Node alive.
function exited(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off('exit', onExit); resolve(false); }, ms);
    function onExit() { clearTimeout(timer); resolve(true); }
    child.once('exit', onExit);
  });
}

export async function openBrowser({ executable, startTimeoutMs = 15000, closeTimeoutMs = 8000 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-browser-'));
  let child;
  try {
    child = spawn(executable, [...LAUNCH_ARGS, `--user-data-dir=${profile}`, 'about:blank'], {
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
  } catch (e) {
    await removeProfile(profile);
    throw Object.assign(new BrowserUnavailable(`the browser could not start (${e.code || e.message})`), { profile });
  }
  const spawnError = new Promise((resolve) => child.once('error', resolve));
  const cdp = createCdpClient({ writable: child.stdio[3], readable: child.stdio[4], timeoutMs: 30000 });

  const targets = [];
  let closing = null;
  async function close({ graceful = true } = {}) {
    if (closing) return closing;
    closing = (async () => {
      let clean = false;
      if (graceful && child.pid && child.exitCode === null) {
        // Closing our pages first makes Browser.close finish sooner (measured while writing the plan).
        for (const targetId of targets) await cdp.send('Target.closeTarget', { targetId }, { timeoutMs: 2000 }).catch(() => {});
        cdp.send('Browser.close', {}, { timeoutMs: closeTimeoutMs }).catch(() => {});
        clean = await exited(child, closeTimeoutMs);
      }
      let killed = false;
      if (!clean && child.pid && child.exitCode === null && child.signalCode === null) {
        killTree(child);
        killed = true;
        if (!(await exited(child, 5000))) { killTree(child); await exited(child, 5000); } // once more under load
      }
      return { graceful: clean, killed, profileRemoved: await removeProfile(profile) };
    })();
    return closing;
  }

  let product;
  try {
    const version = await Promise.race([
      cdp.send('Browser.getVersion', {}, { timeoutMs: startTimeoutMs }),
      spawnError.then((e) => { throw new Error(e.code || e.message); }),
    ]);
    product = version.product;
  } catch (e) {
    await close({ graceful: false });
    throw Object.assign(new BrowserUnavailable(`the browser did not answer over the pipe (${e.message})`), { profile });
  }

  async function newPage() {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targets.push(targetId);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}, opts = {}) => cdp.send(method, params, { sessionId, ...opts });
    await call('Page.enable');
    await call('Runtime.enable');

    async function evaluate(fn, arg, { timeoutMs = 30000 } = {}) {
      const expression = typeof fn === 'string' ? fn : `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, { timeoutMs });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`page script failed: ${(d.exception && d.exception.description) || d.text}`);
      }
      return r.result ? r.result.value : undefined;
    }

    return {
      sessionId,
      setViewport: ({ width, height }) => call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      setMedia: ({ theme, reducedMotion = false }) => {
        if (theme !== 'light' && theme !== 'dark') throw new Error(`theme must be light or dark, got ${theme}`);
        return call('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-color-scheme', value: theme },
            { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
          ],
        });
      },
      async navigate(url, { timeoutMs = 30000 } = {}) {
        const loaded = cdp.waitFor('Page.loadEventFired', { sessionId, timeoutMs });
        loaded.catch(() => {});
        let nav;
        try { nav = await call('Page.navigate', { url }, { timeoutMs }); } catch (e) { throw new PageLoadError(`the page did not answer (${e.message})`); }
        if (nav.errorText) throw new PageLoadError(`the page did not load (${nav.errorText})`);
        try { await loaded; } catch { throw new PageLoadError(`the page did not finish loading in ${timeoutMs} ms`); }
        return { finalUrl: await evaluate(() => location.href) };
      },
      waitReady: ({ timeoutMs = 10000 } = {}) => evaluate(() => new Promise((resolve) => {
        const go = () => document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
        if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
      }), null, { timeoutMs }),
      evaluate,
      async screenshot() {
        const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        return Buffer.from(data, 'base64');
      },
      async pressTab() {
        const key = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      },
    };
  }

  return { product, pid: child.pid, profile, cdp, newPage, close };
}

export async function withBrowser(opts, fn) {
  const browser = await openBrowser(opts);
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
