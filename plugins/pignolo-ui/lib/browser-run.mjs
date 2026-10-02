// The three browser subcommands of spec §11.1 over one page, for every width and theme of
// §11.3. Nothing here decides "passed": what could not be measured is `unverified` with its
// reason (principle 1), and the caller writes the JSON.
//
// measurePage({ url, plan, open, before, page }) -> { browser, finalUrl, entries, degraded }
//   page  the label in fingerprints: the URL path, or the project-relative path of a --file.
// capturePage({ url, plan, open, outDir }) -> { browser, finalUrl, captures, unverified, degraded }
// dumpDom({ url, plan, open, outDir })     -> { browser, finalUrl, doms, unverified, degraded }
//   plan  shotPlan() result; open(fn) runs fn(browser) with a fresh browser and always closes it
//         (withBrowser bound to the executable), or throws BrowserUnavailable.
//   before  a previous browser.json (object) or null: its fails are debt (multiset by fingerprint).
//   A page that does not load (PageLoadError) is not tried again at the other widths and themes:
//   the rest is `unverified` with the same reason (a hanging URL costs one timeout, not sixteen).
//   A client redirect after `load` (history.replaceState to /login) is seen: the URL is read again
//   after a short settle (settleMs) and after the checks; if it left the page, all is `unverified`.
// preflight(url, { timeoutMs = 5000, fetchImpl }) -> null | reason   (spec §11.2: 5 s)
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from './catalog.mjs';
import { runChecks, runReducedMotionCheck, visibleTextSelectors, interactiveItems, respFindings, RESP_WIDE_MIN, RESP_NARROW_MAX } from './browser-checks.mjs';
import { PageLoadError } from './browser-session.mjs';
import { checkPng } from './png.mjs';
import { checkCapture } from './captures-check.mjs';
import { STRESS_RULES, readBefore, growTextIn, emptyListsIn, stressFindings, STRESS_ZOOM } from './browser-stress.mjs';

export const BROWSER_RULES = ['COLOR-03', 'STATE-04', 'NAV-01', 'LAYOUT-10', 'LAYOUT-11', 'MOTION-07', 'TARGET-01', 'FORM-01', 'TYPE-01', 'TYPE-02', 'RESP-01'];
const MAX_CROPS = 3;

export async function preflight(url, { timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  if (!/^https?:/.test(url)) return null;
  try {
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return null;
  } catch (e) {
    return `the URL did not respond in ${timeoutMs / 1000} s (${e.cause?.code || e.name})`;
  }
}

const pathOf = (u) => {
  try { const x = new URL(u); return x.protocol === 'file:' ? path.basename(decodeURIComponent(x.pathname)) : x.pathname; } catch { return u; }
};
const samePage = (a, b) => {
  const norm = (u) => { const x = new URL(u); return `${x.origin}${x.pathname.replace(/\/$/, '')}`; };
  try { return norm(a) === norm(b); } catch { return a === b; }
};

const SETTLE_MS = 500;
const RECAPTURE_REST_MS = 1000;
// Read in the page just before a screenshot: finished loading, and no one-shot animation running.
const READ_SETTLED = () => new Promise((resolve) => setTimeout(() => resolve({
  readyState: document.readyState,
  runningAnimations: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === 1).length,
}), 150));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hrefOf = (tab) => tab.evaluate(() => location.href);

// "Requires session" (spec §11.2): the final URL is another page, or a password field is visible.
async function sessionReason(page, url, finalUrl) {
  if (!samePage(url, finalUrl)) return `requires session: ${pathOf(url)} redirected to ${pathOf(finalUrl)}`;
  const pwd = await page.evaluate(() => [...document.querySelectorAll('input[type="password"]')]
    .some((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(i).visibility === 'visible'; }));
  return pwd ? 'requires session: a password field is visible' : null;
}

// settleMs > 0: a client-side redirect right after `load` has time to happen before the URL is read.
async function load(page, { url, width, height, theme, reducedMotion = false, navTimeoutMs = 30000, settleMs = 0 }) {
  await page.setViewport({ width, height });
  await page.setMedia({ theme, reducedMotion });
  const { finalUrl } = await page.navigate(url, { timeoutMs: navTimeoutMs });
  await page.waitReady();
  if (!settleMs) return finalUrl;
  await sleep(settleMs);
  return hrefOf(page);
}

// The page left the URL asked for after the checks began (client redirect): the reason, or null.
async function leftThePage(page, url) {
  const now = await hrefOf(page);
  return samePage(url, now) ? null : `requires session: ${pathOf(url)} redirected to ${pathOf(now)}`;
}

function unverifiedAll(reason, extra = {}) {
  return BROWSER_RULES.map((id) => ({ id, status: 'unverified', key: 'run', reason, measure: { ...extra } }));
}

// Entry of the ui-check shape (spec §5.5, §5.9) with scope, effective severity and fingerprint.
function toEntries(raw, { page, catalog, before }) {
  const byId = new Map(catalog.rules.map((r) => [r.id, r]));
  const debt = new Map();
  for (const e of before && Array.isArray(before.entries) ? before.entries : []) {
    if (e.status === 'fail') debt.set(e.fingerprint, (debt.get(e.fingerprint) ?? 0) + 1);
  }
  return raw.map((f) => {
    const { width, theme } = f.measure ?? {};
    const fingerprint = [f.id, page, width ?? '', theme ?? '', f.key].join('|');
    let scope = 'new';
    if (f.status === 'fail' && debt.get(fingerprint) > 0) { scope = 'debt'; debt.set(fingerprint, debt.get(fingerprint) - 1); }
    const rule = byId.get(f.id);
    let severity = f.severity ?? rule?.severity ?? 'alto';
    if (f.status === 'fail' && scope === 'debt' && rule?.floor && severity === 'bloquea') severity = 'alto';
    const e = { id: f.id, status: f.status };
    if (f.reason) e.reason = f.reason;
    Object.assign(e, { severity, scope });
    if (f.selector) e.selector = f.selector;
    return { ...e, fingerprint, measure: { ...(f.measure ?? {}), page } };
  });
}

export async function measurePage({ url, plan, open, before = null, catalog = loadCatalog(), page = pathOf(url), navTimeoutMs = 30000, settleMs = SETTLE_MS, targets = null, register = 'unset' }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, entries: toEntries(unverifiedAll(down), { page, catalog, before }) };
  let product = null;
  let finalUrl = null;
  let degraded = null;
  const raw = [];
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      const byWidth = {}; // collectInteractive of the light theme, for RESP-01
      let unloadable = null; // reason of the first PageLoadError: the same page will not load at the rest
      for (const { width, height } of plan.widths) {
        for (const theme of plan.themes) {
          const at = { width, theme };
          if (unloadable) { raw.push(...unverifiedAll(unloadable, at)); continue; }
          try {
            finalUrl = await load(tab, { url, width, height, theme, navTimeoutMs, settleMs });
            const session = await sessionReason(tab, url, finalUrl);
            if (session) { degraded = session; raw.push(...unverifiedAll(session, at)); return; }
            const found = [];
            for (const f of await runChecks(tab, { targets, register })) found.push({ ...f, measure: { ...(f.measure ?? {}), ...at } });
            const visible = await visibleTextSelectors(tab);
            const left = await leftThePage(tab, url);
            if (left) { degraded = left; raw.push(...unverifiedAll(left, at)); return; }
            await load(tab, { url, width, height, theme, reducedMotion: true, navTimeoutMs });
            for (const f of await runReducedMotionCheck(tab, visible)) found.push({ ...f, measure: { ...(f.measure ?? {}), ...at } });
            const leftLater = await leftThePage(tab, url);
            if (leftLater) { degraded = leftLater; raw.push(...unverifiedAll(leftLater, at)); return; }
            if (theme === 'light') byWidth[width] = { items: await interactiveItems(tab) };
            raw.push(...found);
          } catch (e) {
            const reason = `not measured: ${e.message}`;
            if (e instanceof PageLoadError) unloadable = reason;
            raw.push(...unverifiedAll(reason, at));
          }
        }
      }
      if (!unloadable && !degraded) {
        const widths = plan.widths.map((w) => w.width);
        const wide = Math.max(...widths.filter((x) => x >= RESP_WIDE_MIN));
        const narrow = Math.min(...widths.filter((x) => x <= RESP_NARROW_MAX));
        raw.push(...respFindings(byWidth, { wide, narrow }));
      }
    });
  } catch (e) {
    degraded = e.message;
    raw.push(...unverifiedAll(e.message));
  }
  return { browser: product, finalUrl, degraded, entries: toEntries(raw, { page, catalog, before }) };
}

export async function capturePage({ url, plan, open, outDir }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, captures: [], unverified: [{ reason: down }] };
  const captures = [];
  const unverified = [];
  let product = null;
  let finalUrl = null;
  let degraded = null;
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      fs.mkdirSync(outDir, { recursive: true });
      for (const { width, height } of plan.widths.filter((w) => w.capture)) {
        for (const theme of plan.themes) {
          finalUrl = await load(tab, { url, width, height, theme, settleMs: SETTLE_MS });
          const session = await sessionReason(tab, url, finalUrl);
          if (session) { degraded = session; unverified.push({ width, theme, reason: session }); return; }
          const total = await tab.evaluate(() => document.documentElement.scrollHeight);
          const crops = Math.min(MAX_CROPS, Math.max(1, Math.ceil(total / height)));
          for (let crop = 1; crop <= crops; crop++) {
            await tab.evaluate((y) => new Promise((r) => { scrollTo(0, y); requestAnimationFrame(() => requestAnimationFrame(() => r(true))); }), (crop - 1) * height);
            // One screenshot with its readiness read just before (spec §11.3 retry on error; hito 4e
            // validity: a flat image, a wrong width, a page still loading or animating is not evidence).
            const shoot = async () => {
              let shot = null;
              let reason = null;
              for (let attempt = 0; attempt < 2 && !shot; attempt++) { // one retry (spec §11.3)
                try {
                  const settled = await tab.evaluate(READ_SETTLED);
                  const buf = await tab.screenshot();
                  const v = checkPng(buf);
                  if (v.ok) shot = { buf, ...v, settled }; else reason = v.reason;
                } catch (e) { reason = e.message; }
              }
              return { shot, reason };
            };
            let { shot, reason } = await shoot();
            if (!shot) { unverified.push({ width, theme, crop, reason: `capture failed: ${reason}` }); continue; }
            let check = checkCapture({ png: shot.buf, width, settled: shot.settled });
            let recaptured = false;
            if (!check.valid) { // one automatic recapture after a longer rest, then it stays marked
              recaptured = true;
              await sleep(RECAPTURE_REST_MS);
              const again = await shoot();
              if (again.shot) { shot = again.shot; check = checkCapture({ png: shot.buf, width, settled: shot.settled }); }
            }
            const name = `${width}-${theme}-${crop}.png`;
            fs.writeFileSync(path.join(outDir, name), shot.buf);
            const entry = { path: `captures/${name}`, sha256: shot.sha256, width: shot.width, height: shot.height, theme, crop, valid: check.valid, settled: shot.settled };
            if (recaptured) entry.recaptured = true;
            if (!check.valid) {
              entry.reason = check.reason;
              unverified.push({ width, theme, crop, reason: `capture invalid: ${check.reason}` });
            }
            captures.push(entry);
          }
        }
      }
    });
  } catch (e) {
    degraded = e.message;
    unverified.push({ reason: e.message });
  }
  return { browser: product, finalUrl, degraded, captures, unverified };
}

export async function dumpDom({ url, plan, open, outDir }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, doms: [], unverified: [{ reason: down }] };
  const doms = [];
  const unverified = [];
  let product = null;
  let finalUrl = null;
  let degraded = null;
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      for (const { width, height } of plan.widths) {
        finalUrl = await load(tab, { url, width, height, theme: 'light', settleMs: SETTLE_MS });
        const session = await sessionReason(tab, url, finalUrl);
        if (session) { degraded = session; unverified.push({ width, reason: session }); return; }
        const html = await tab.evaluate(() => {
          const dt = document.doctype;
          return `${dt ? `<!doctype ${dt.name}>` : ''}\n${document.documentElement.outerHTML}\n`;
        });
        const left = await leftThePage(tab, url);
        if (left) { degraded = left; unverified.push({ width, reason: left }); return; }
        const name = `dom-${width}.html`;
        fs.writeFileSync(path.join(outDir, name), html);
        doms.push({ path: name, width });
      }
    });
  } catch (e) {
    degraded = e.message;
    unverified.push({ reason: e.message });
  }
  return { browser: product, finalUrl, degraded, doms, unverified };
}

// ---- stress (hito 4e, R-4e-17): its own subcommand, so the altered DOM never reaches browser.json ----

const STRESS_WIDTHS = [1440, 375];
const unverifiedStress = (reason, extra = {}) => STRESS_RULES.map((id) => ({ id, status: 'unverified', key: 'run', reason, measure: { ...extra } }));

// stressPage({ url, plan, open, before, page }) -> { browser, finalUrl, entries, degraded }
// Light theme only, at 1440 and 375 (the zoom, at 1440 only); every scenario loads the page again,
// alters the DOM in memory and measures. Without a browser or with the URL down: all unverified.
export async function stressPage({ url, plan, open, before = null, catalog = loadCatalog(), page = pathOf(url), navTimeoutMs = 30000, settleMs = SETTLE_MS }) {
  const down = await preflight(url);
  if (down) return { browser: null, finalUrl: null, degraded: down, entries: toEntries(unverifiedStress(down), { page, catalog, before }) };
  const widths = plan.widths.filter((w) => STRESS_WIDTHS.includes(w.width));
  if (!widths.length) widths.push(plan.widths[0]);
  let product = null;
  let finalUrl = null;
  let degraded = null;
  const raw = [];
  try {
    await open(async (browser) => {
      product = browser.product;
      const tab = await browser.newPage();
      let unloadable = null;
      for (const { width, height } of widths) {
        const at = { width, theme: 'light' };
        const scenarios = ['long-text', 'empty-lists', ...(width === 1440 ? ['zoom-200'] : [])];
        for (const scenario of scenarios) {
          if (unloadable) { raw.push(...unverifiedStress(unloadable, at)); continue; }
          try {
            finalUrl = await load(tab, { url, width, height, theme: 'light', navTimeoutMs, settleMs });
            const session = await sessionReason(tab, url, finalUrl);
            if (session) { degraded = session; raw.push(...unverifiedStress(session, at)); return; }
            const found = [];
            if (scenario === 'long-text') {
              const pre = await readBefore(tab);
              await growTextIn(tab);
              found.push(...stressFindings({ scenario, before: pre, after: await readBefore(tab), width }));
            } else if (scenario === 'empty-lists') {
              found.push(...stressFindings({ scenario, after: await emptyListsIn(tab), width }));
            } else {
              const pre = await readBefore(tab);
              await tab.setViewport({ width: Math.round(width / STRESS_ZOOM), height: Math.round(height / STRESS_ZOOM) });
              await sleep(200);
              found.push(...stressFindings({ scenario, before: pre, after: await readBefore(tab), width }));
            }
            const left = await leftThePage(tab, url);
            if (left) { degraded = left; raw.push(...unverifiedStress(left, at)); return; }
            for (const f of found) raw.push({ ...f, measure: { ...(f.measure ?? {}), ...at } });
          } catch (e) {
            const reason = `not measured: ${e.message}`;
            if (e instanceof PageLoadError) unloadable = reason;
            raw.push(...unverifiedStress(reason, at));
          }
        }
      }
    });
  } catch (e) {
    degraded = e.message;
    raw.push(...unverifiedStress(e.message));
  }
  return { browser: product, finalUrl, degraded, entries: toEntries(raw, { page, catalog, before }) };
}
