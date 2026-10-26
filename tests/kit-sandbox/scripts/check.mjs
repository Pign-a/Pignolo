// Kit sandbox check: build, serve dist, open in headless Chrome, fail on any console or page error.
//
//   node scripts/check.mjs [--route <slug>] [--interact <module>] [--reduced] [--no-build]
//
// --route     preview page slug (file name in src/preview/pages), default "foundation".
// --interact  a module whose default export is `async (t) => {}`; see the `t` helpers below.
//             It runs at 1280 px, light, and again with reduced motion when --reduced is given.
// Screenshots: shots/<route>-<width>-<theme>.png at 1280 and 390, light and dark.
// Also fails on horizontal overflow at 390 px.
//
// Helpers on `t` (selectors are CSS, or "text=Visible text"):
//   click, hover, mouseDown, mouseUp, drag(from, {dx,dy}|to, {steps}), press(key), type(text), focus(sel)
//   wait(ms), waitFor(sel, {timeout}), exists, count, text, attr, rect, style(sel, prop), eval(fn, arg)
//   cdp(method, params) raw DevTools call
//   emulate([{ name, value }]) extra media features (forced-colors), coarse(on) finger pointer (pointer: coarse)
//   screenshot(name), expect(cond, message), expectEqual(actual, expected, message)
//   reducedMotion (boolean), theme, route, raw (the browser-session page)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const shots = path.join(root, "shots");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const route = opt("route", "foundation").replace(/^#?\/?/, "") || "foundation";
const interactPath = opt("interact", "");
const LIB = process.env.PIGNOLO_UI_LIB || path.resolve(root, "../../plugins/pignolo/ui-audit/lib/browser-session.mjs");
const CHROME = process.env.PIGNOLO_UI_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const failures = [];
const fail = (msg) => { failures.push(msg); console.error(`FAIL ${msg}`); };
const ok = (msg) => console.log(`ok   ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function build() {
  return new Promise((resolve, reject) => {
    const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
    const child = spawn(process.execPath, [vite, "build"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build failed\n${out}`))));
  });
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Installed in the page after each navigation.
const FINDER = `(() => {
  window.__kitFind = (sel) => {
    if (sel.startsWith('text=')) {
      const want = sel.slice(5).trim();
      const hits = [...document.body.querySelectorAll('*')].filter((e) => e.textContent.trim() === want);
      return hits.find((e) => ![...e.children].some((c) => c.textContent.trim() === want)) || null;
    }
    return document.querySelector(sel);
  };
})()`;

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
};

function makeHelpers({ browser, page, origin, theme, reducedMotion }) {
  const cdp = browser.cdp;
  const send = (method, params) => cdp.send(method, params, { sessionId: page.sessionId });
  const evalIn = (fn, arg) => page.evaluate(fn, arg);

  async function rect(sel) {
    const r = await page.evaluate(`(() => {
      const el = window.__kitFind(${JSON.stringify(sel)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    })()`);
    if (!r) throw new Error(`no element for ${sel}`);
    return r;
  }
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
  let last = { x: 0, y: 0 };

  const t = {
    raw: page, route, theme, reducedMotion, origin,
    eval: evalIn,
    /** Raw CDP call on this page: t.cdp('Input.dispatchMouseEvent', {...}). */
    cdp: (method, params) => send(method, params),
    wait: sleep,
    rect,
    async waitFor(sel, { timeout = 5000 } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await page.evaluate(`!!window.__kitFind(${JSON.stringify(sel)})`)) return;
        await sleep(50);
      }
      throw new Error(`timeout waiting for ${sel}`);
    },
    exists: (sel) => page.evaluate(`!!window.__kitFind(${JSON.stringify(sel)})`),
    count: (sel) => page.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    text: (sel) => page.evaluate(`(window.__kitFind(${JSON.stringify(sel)}) || {}).textContent ?? null`),
    attr: (sel, name) => page.evaluate(`(window.__kitFind(${JSON.stringify(sel)}) || document.createElement('i')).getAttribute(${JSON.stringify(name)})`),
    style: (sel, prop) => page.evaluate(`getComputedStyle(window.__kitFind(${JSON.stringify(sel)})).getPropertyValue(${JSON.stringify(prop)})`),
    async hover(sel) {
      const r = await rect(sel);
      await mouse('mouseMoved', r.cx, r.cy);
      last = { x: r.cx, y: r.cy };
    },
    async mouseDown(sel) {
      const r = await rect(sel);
      await mouse('mouseMoved', r.cx, r.cy);
      await mouse('mousePressed', r.cx, r.cy, { button: 'left', buttons: 1, clickCount: 1 });
      last = { x: r.cx, y: r.cy };
    },
    async mouseUp() {
      await mouse('mouseReleased', last.x, last.y, { button: 'left', buttons: 0, clickCount: 1 });
    },
    async click(sel) {
      await t.mouseDown(sel);
      await sleep(30);
      await t.mouseUp();
    },
    /** drag(from, { dx, dy }) or drag(from, toSelector); moves in `steps` pointer events. */
    async drag(from, to, { steps = 12 } = {}) {
      const a = await rect(from);
      let bx, by;
      if (typeof to === 'string') { const b = await rect(to); bx = b.cx; by = b.cy; }
      else { bx = a.cx + (to.dx || 0); by = a.cy + (to.dy || 0); }
      await mouse('mouseMoved', a.cx, a.cy);
      await mouse('mousePressed', a.cx, a.cy, { button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', a.cx + ((bx - a.cx) * i) / steps, a.cy + ((by - a.cy) * i) / steps, { buttons: 1 });
        await sleep(16);
      }
      await mouse('mouseReleased', bx, by, { button: 'left', buttons: 0, clickCount: 1 });
      last = { x: bx, y: by };
    },
    /** Emulate extra media features, e.g. emulate([{ name: 'forced-colors', value: 'active' }]). */
    async emulate(features) {
      const base = [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
      ];
      await send('Emulation.setEmulatedMedia', { features: [...base, ...features] });
    },
    /** Pretend the primary pointer is a finger (`pointer: coarse`, `hover: none`) until switched off. */
    async coarse(on) {
      await send('Emulation.setTouchEmulationEnabled', on ? { enabled: true, maxTouchPoints: 1 } : { enabled: false });
      await send('Emulation.setEmitTouchEventsForMouse', { enabled: on, configuration: 'mobile' });
    },
    async focus(sel) { await page.evaluate(`window.__kitFind(${JSON.stringify(sel)}).focus()`); },
    async press(key) {
      const k = KEYS[key] || (key.length === 1
        ? { key, code: /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : '', vk: key.toUpperCase().charCodeAt(0), text: key }
        : null);
      if (!k) throw new Error(`unknown key ${key}`);
      const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
      await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async type(text) { for (const ch of text) await t.press(ch); },
    async screenshot(name) {
      fs.mkdirSync(shots, { recursive: true });
      const file = path.join(shots, `${name}.png`);
      fs.writeFileSync(file, await page.screenshot());
      return file;
    },
    expect(cond, message) { if (!cond) throw new Error(`expect failed: ${message}`); },
    expectEqual(actual, expected, message) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expect failed: ${message} (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);
      }
    },
  };
  return t;
}

async function main() {
  if (!flag('no-build')) { await build(); ok('build'); }
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { openBrowser } = await import(pathToFileURL(LIB).href);
  const browser = await openBrowser({ executable: CHROME });
  let current = 'startup';
  const seen = new Set();
  const record = (msg) => { const m = `[${current}] ${msg}`; if (!seen.has(m)) { seen.add(m); fail(m); } };

  try {
    const attach = async (page) => {
      await browser.cdp.send('Log.enable', {}, { sessionId: page.sessionId });
      browser.cdp.on((m) => {
        if (m.sessionId !== page.sessionId) return;
        const p = m.params || {};
        if (m.method === 'Runtime.exceptionThrown') record(`page error: ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`);
        else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
          record(`console.${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
        } else if (m.method === 'Log.entryAdded' && p.entry?.level === 'error') record(`log error: ${p.entry.text} ${p.entry.url || ''}`);
      });
    };

    const load = async (page, { width, height, theme, reducedMotion }) => {
      await page.setViewport({ width, height });
      await page.setMedia({ theme, reducedMotion });
      await page.navigate(`${origin}/?theme=${theme}#/${route}`);
      await page.waitReady();
      await page.evaluate(FINDER);
      await sleep(700);
    };

    // 1. Screenshots at 1280 and 390, light and dark, plus overflow and render checks.
    const page = await browser.newPage();
    await attach(page);
    for (const [width, height] of [[1280, 800], [390, 844]]) {
      for (const theme of ['light', 'dark']) {
        current = `${route} ${width} ${theme}`;
        await load(page, { width, height, theme, reducedMotion: false });
        const state = await page.evaluate(() => ({
          rendered: (document.getElementById('root')?.textContent || '').trim().length > 0,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          page: document.querySelector('[data-preview-page]')?.getAttribute('data-preview-page'),
        }));
        if (!state.rendered) record('root rendered nothing');
        if (state.page !== route) record(`route "${route}" not found (showing "${state.page}")`);
        if (width === 390 && state.overflow > 0) record(`horizontal overflow of ${state.overflow}px at 390`);
        // Full page: grow the viewport to the content height (capped) before the shot.
        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewport({ width, height: Math.min(Math.max(full, height), 5000) });
        await sleep(150);
        fs.mkdirSync(shots, { recursive: true });
        fs.writeFileSync(path.join(shots, `${route}-${width}-${theme}.png`), await page.screenshot());
      }
    }
    if (!failures.length) ok(`render ${route}: 1280/390, light/dark, shots in ${shots}`);

    // 2. Interaction module.
    if (interactPath) {
      const mod = await import(pathToFileURL(path.resolve(interactPath)).href);
      if (typeof mod.default !== 'function') throw new Error('--interact module must export a default function');
      for (const reducedMotion of flag('reduced') ? [false, true] : [false]) {
        current = `${route} interact${reducedMotion ? ' reduced' : ''}`;
        const p = await browser.newPage();
        await attach(p);
        await load(p, { width: 1280, height: 800, theme: 'light', reducedMotion });
        const t = makeHelpers({ browser, page: p, origin, theme: 'light', reducedMotion });
        try { await mod.default(t); ok(`interact ${path.basename(interactPath)}${reducedMotion ? ' (reduced motion)' : ''}`); }
        catch (e) { fail(`[${current}] ${e.message}`); }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main()
  .catch((e) => fail(e.stack || e.message))
  .finally(() => {
    if (failures.length) { console.error(`\n${failures.length} failure(s)`); process.exit(1); }
    console.log('\ncheck passed');
    process.exit(0);
  });
