// The four browser checks of spec §5.4 over the rendered page. The page functions run inside
// the browser (page.evaluate(inPage(fn))); they only read the DOM. The Node
// side turns what they return into entries of the ui-check shape (§5.9 browser.json).
//
// B1 contrast   -> COLOR-03   text over the solid background of its containers
// B2 keyboard   -> NAV-01 (Tab reaches it) and STATE-04 (focus changes computed styles)
// B3 reflow     -> LAYOUT-11 (horizontal scroll, clipped text) and LAYOUT-10 (16 px margin)
// B4 reduced    -> MOTION-07  text of the first two viewports with opacity > 0
//
// runChecks(page) -> raw findings [{ id, status, key, reason?, selector?, severity?, measure? }]
//   B1-B3 on the page as it is (the caller set viewport and theme and navigated);
// runReducedMotionCheck(page) -> raw findings of B4 (the caller
//   navigated again with prefers-reduced-motion: reduce).
import { parseColor, contrastRatio, composite } from './color.mjs';

// ---- page side (serialized with toString; they use the helpers below as free names) ---------

// Helpers defined in the same expression as every page function (see inPage).
const PAGE_HELPERS = String.raw`
  const selectorOf = (el) => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const tag = e.tagName.toLowerCase();
      const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [e];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(e) + 1) + ')' : tag);
    }
    return parts.join(' > ');
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'OPTION']);
  const textNodes = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || SKIP.has(n.parentElement.tagName)) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ node: n, el: n.parentElement, rect: r });
    }
    return out;
  };
  const isDisabled = (el) => Boolean(el.closest(':disabled, [aria-disabled="true"]'));
`;

// One expression that defines the helpers and runs fn: nothing is added to the page as a <script>,
// which a strict CSP would block (Runtime.evaluate itself is not subject to the page CSP).
const inPage = (fn) => `(() => { ${PAGE_HELPERS}; return (${fn.toString()})(); })()`;

// B1: foreground, background layers up to the first opaque one, font size and weight.
function collectContrast() {
  const seen = new Set();
  const out = [];
  for (const { el } of textNodes()) {
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const item = { selector: selectorOf(el), color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400, layers: [] };
    if (isDisabled(el)) { item.disabled = true; out.push(item); continue; }
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    item.opacity = opacity;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') { item.image = selectorOf(e); break; }
      if (s.backgroundColor) item.layers.push(s.backgroundColor);
    }
    item.rootScheme = getComputedStyle(document.documentElement).colorScheme;
    out.push(item);
  }
  return out;
}

// B3: horizontal scroll, clipped text and the side margin of every text run.
function collectReflow() {
  const vw = document.documentElement.clientWidth;
  const out = { innerWidth: vw, scrollWidth: document.documentElement.scrollWidth, clipped: [], margin: [], checked: 0 };
  const seen = new Set();
  const isBar = (el) => {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      const painted = (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) || s.backgroundImage !== 'none' || parseFloat(s.borderBottomWidth) > 0 || parseFloat(s.borderTopWidth) > 0;
      if (painted && r.left <= 0 && r.right >= vw) return true;
    }
    return false;
  };
  for (const { el, rect } of textNodes()) {
    out.checked++;
    const s = getComputedStyle(el);
    if (!seen.has(el)) {
      seen.add(el);
      const scrolls = /auto|scroll/.test(s.overflowX);
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && s.textOverflow !== 'ellipsis' && !scrolls && s.display !== 'inline') {
        out.clipped.push({ selector: selectorOf(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }
    // What is seen of the text: clipped by the nearest container that hides or scrolls it.
    let left = rect.left;
    let right = rect.right;
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (getComputedStyle(e).overflowX === 'visible') continue;
      const box = e.getBoundingClientRect();
      left = Math.max(left, box.left);
      right = Math.min(right, box.right);
      break;
    }
    if ((left < 16 || right > vw - 16) && !isBar(el)) {
      out.margin.push({ selector: selectorOf(el), left: Math.round(left), right: Math.round(vw - right) });
    }
  }
  return out;
}

// B4: text of the first two viewports whose effective opacity is 0.
function collectHiddenText() {
  const limit = innerHeight * 2;
  const hidden = [];
  let checked = 0;
  const seen = new Set();
  for (const { el, rect } of textNodes()) {
    if (rect.top >= limit || rect.bottom <= 0 || seen.has(el)) continue;
    seen.add(el);
    checked++;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity <= 0) hidden.push({ selector: selectorOf(el) });
  }
  return { hidden, checked };
}

// B2, step 1: the elements a keyboard user must reach, with their unfocused styles.
function collectFocusables() {
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const NATIVE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"], [tabindex]';
  const ROLES = '[role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [role="combobox"], [role="option"]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility === 'visible' && !el.closest('[inert]');
  };
  const styleOf = (el) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.backgroundColor, s.color, s.textDecorationLine].join('|');
  };
  const list = [];
  for (const el of document.querySelectorAll(`${NATIVE}, ${ROLES}`)) {
    if (!visible(el) || isDisabled(el)) continue;
    if (el.getAttribute('tabindex') !== null && el.tabIndex < 0) continue;
    list.push({ selector: selectorOf(el), style: styleOf(el), focusable: el.tabIndex >= 0 });
  }
  return list;
}

// B2, step 2: after one Tab, what has the focus and how it looks (transitions finished).
function readFocus() {
  for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinite */ } }
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const s = getComputedStyle(el);
  return { selector: selectorOf(el), style: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderTopWidth, s.backgroundColor, s.color, s.textDecorationLine].join('|') };
}

// ---- Node side --------------------------------------------------------------------------------

// Computed colors come as rgb()/rgba(), lab(), oklch()... and color(srgb r g b / a) for
// color-mix() and relative colors; parseColor does not read color(), so it is mapped to rgb().
export function parseComputedColor(value) {
  const m = /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\)$/i.exec(String(value).trim());
  if (m) {
    const [r, g, b] = m.slice(1, 4).map((x) => Number(x) * 100);
    return parseColor(`rgb(${r}% ${g}% ${b}%${m[4] !== undefined ? ` / ${m[4]}` : ''})`);
  }
  return parseColor(String(value));
}

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

export function contrastFindings(items) {
  const out = [];
  let checked = 0;
  for (const it of items) {
    if (it.disabled) continue;
    const key = it.selector;
    if (it.image) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: `text over an image or gradient (${it.image})` }); continue; }
    if (it.opacity < 1) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: 'translucent text (opacity below 1)' }); continue; }
    const fg = parseComputedColor(it.color);
    const layers = it.layers.map(parseComputedColor);
    const bad = [fg, ...layers].find((c) => !c.ok);
    if (bad) { out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: `color not understood (${bad.reason})` }); continue; }
    const opaque = layers.findIndex((c) => c.rgba.a >= 1);
    if (opaque < 0 && !/^(normal|light)$/.test(it.rootScheme || 'normal')) {
      out.push({ id: 'COLOR-03', status: 'unverified', key, selector: it.selector, reason: 'no opaque background and the canvas color is not known' });
      continue;
    }
    const stack = (opaque < 0 ? layers : layers.slice(0, opaque + 1)).reverse();
    const bg = stack.reduce((under, c) => (c.rgba.a >= 1 ? c.rgba : composite(c.rgba, under)), WHITE);
    const ratio = contrastRatio(fg.rgba, bg);
    const large = it.fontSize >= 24 || (it.fontSize >= 18.66 && it.fontWeight >= 700);
    const required = large ? 3 : 4.5;
    checked++;
    if (ratio < required) {
      out.push({ id: 'COLOR-03', status: 'fail', key, selector: it.selector, measure: { ratio: Math.round(ratio * 100) / 100, required, fontSizePx: it.fontSize } });
    }
  }
  return { findings: out, checked };
}

export function reflowFindings(data, { width }) {
  const out = [];
  if (data.scrollWidth > data.innerWidth) {
    out.push({ id: 'LAYOUT-11', status: 'fail', key: 'horizontal-scroll', measure: { scrollWidth: data.scrollWidth, innerWidth: data.innerWidth } });
  }
  for (const c of data.clipped) out.push({ id: 'LAYOUT-11', status: 'fail', key: c.selector, selector: c.selector, measure: { scrollWidth: c.scrollWidth, clientWidth: c.clientWidth } });
  for (const m of data.margin) out.push({ id: 'LAYOUT-10', status: 'fail', key: m.selector, selector: m.selector, measure: { leftPx: m.left, rightPx: m.right, requiredPx: 16 } });
  // LAYOUT-11 is floor (1.4.10) at 320 px only; at other widths it is alto (spec §5.4, B3).
  return out.map((f) => (f.id === 'LAYOUT-11' && width !== 320 ? { ...f, severity: 'alto' } : f)).concat([
    { id: 'LAYOUT-11', status: 'pass', key: 'checked', measure: { checked: data.checked } },
    { id: 'LAYOUT-10', status: 'pass', key: 'checked', measure: { checked: data.checked } },
  ].filter((p) => !out.some((f) => f.id === p.id)));
}

// Walks the page with Tab: every expected element must be reached, and look different.
export async function keyboardFindings(page, { maxSteps = 200 } = {}) {
  const expected = await page.evaluate(inPage(collectFocusables));
  const before = new Map(expected.map((e) => [e.selector, e.style]));
  const reached = new Map();
  const steps = Math.min(maxSteps, expected.length + 5);
  let first = null;
  for (let i = 0; i < steps; i++) {
    await page.pressTab();
    const now = await page.evaluate(inPage(readFocus));
    if (!now) { if (reached.size) break; continue; }
    if (now.selector === first) break;
    first ??= now.selector;
    if (!reached.has(now.selector)) reached.set(now.selector, now.style);
  }
  const out = [];
  for (const e of expected) {
    if (!reached.has(e.selector)) {
      out.push({ id: 'NAV-01', status: 'fail', key: e.selector, selector: e.selector, reason: e.focusable ? 'not reached with Tab' : 'interactive role without tabindex: not reachable with Tab' });
      continue;
    }
    if (reached.get(e.selector) === before.get(e.selector)) {
      out.push({ id: 'STATE-04', status: 'fail', key: e.selector, selector: e.selector, reason: 'focus does not change any computed style' });
    }
  }
  const passed = (id) => !out.some((f) => f.id === id);
  if (passed('NAV-01')) out.push({ id: 'NAV-01', status: 'pass', key: 'checked', measure: { checked: expected.length } });
  if (passed('STATE-04')) out.push({ id: 'STATE-04', status: 'pass', key: 'checked', measure: { checked: expected.length } });
  return out;
}

export async function runChecks(page) {
  const contrast = contrastFindings(await page.evaluate(inPage(collectContrast)));
  const findings = [...contrast.findings];
  if (!findings.some((f) => f.status === 'fail')) findings.push({ id: 'COLOR-03', status: 'pass', key: 'checked', measure: { checked: contrast.checked } });
  const width = await page.evaluate(() => innerWidth);
  findings.push(...reflowFindings(await page.evaluate(inPage(collectReflow)), { width }));
  findings.push(...await keyboardFindings(page));
  return findings;
}

export async function runReducedMotionCheck(page) {
  const { hidden, checked } = await page.evaluate(inPage(collectHiddenText));
  const out = hidden.map((h) => ({ id: 'MOTION-07', status: 'fail', key: h.selector, selector: h.selector, reason: 'text with opacity 0 under prefers-reduced-motion: reduce' }));
  if (!out.length) out.push({ id: 'MOTION-07', status: 'pass', key: 'checked', measure: { checked } });
  return out;
}

