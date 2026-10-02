// Stress test of the rendered page (hito 4e, R-4e-17, R-4e-18): long text, emptied lists and a
// zoom of 200 %. The page functions run inside the browser and only change the DOM in memory
// (the caller loads the page again before each scenario and never writes a project file); the
// Node side turns what they return into raw findings of STRESS-01, STRESS-02 and STRESS-03.
//
// measureBefore()  -> { text, targets, page }   the same read before and after altering the DOM
// growText()       -> number of elements whose text became three copies (at most 120 characters)
// emptyLists()     -> [{ selector, height, textChars }] of the containers whose children were removed
// stressFindings({ scenario, before, after, width, degraded }) -> raw[]
//   scenario: 'long-text' (STRESS-01) | 'empty-lists' (STRESS-02) | 'zoom-200' (STRESS-03).
//   degraded: a reason (no browser, page down): the three rules come back `unverified`, never pass.
// Limit declared: the stress does not run the app's real empty state (an app that re-renders does
// not redraw because nodes were removed); it measures the hole the data would leave and the
// overflow when the text grows.
import { inPage } from './browser-checks.mjs';

export const LONG_FACTOR = 3;
export const MAX_STRESS_CHARS = 120;
export const HOLE_MIN_PX = 96;
export const STRESS_ZOOM = 2;
export const FIXED_MAX_RATIO = 0.4;
export const STRESS_RULES = ['STRESS-01', 'STRESS-02', 'STRESS-03'];
const MAX_SELECTORS = 5;
const MAX_TARGETS = 300;

// ---- page side ----------------------------------------------------------------------------------


function measureBefore() {
  const LEAVES = 'h1, h2, h3, h4, h5, h6, button, a, [role="button"], label, th, td, li';
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible' && !isVisuallyHidden(el);
  };
  const text = [];
  for (const el of document.querySelectorAll(LEAVES)) {
    if (el.children.length || !el.textContent.trim() || !shown(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    text.push({
      selector: selectorOf(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      overflow: s.overflowX, ellipsis: s.textOverflow === 'ellipsis' && s.whiteSpace === 'nowrap',
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  }
  const targets = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]')) {
    if (targets.length >= 300 || isDisabled(el) || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    targets.push({ selector: selectorOf(el), left: r.left, top: r.top, width: r.width, height: r.height });
  }
  const fixed = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if ((s.position === 'fixed' || s.position === 'sticky') && shown(el)) fixed.push({ height: el.getBoundingClientRect().height });
  }
  const root = document.documentElement;
  return { text, targets, page: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, innerHeight: innerHeight, fixed } };
}

function growText() {
  const LEAVES = 'h1, h2, h3, h4, h5, h6, button, a, [role="button"], label, th, td, li';
  let changed = 0;
  for (const el of document.querySelectorAll(LEAVES)) {
    if (el.children.length) continue;
    const t = el.textContent.trim();
    if (!t) continue;
    el.textContent = `${t} ${t} ${t}`.slice(0, 120);
    changed++;
  }
  return changed;
}

function emptyLists() {
  const out = [];
  for (const el of document.querySelectorAll('ul, ol, tbody, [role="list"], [role="rowgroup"]')) {
    if (el.children.length < 2) continue;
    for (const child of [...el.children]) child.remove();
    out.push({ selector: selectorOf(el), height: el.getBoundingClientRect().height, textChars: el.textContent.trim().length });
  }
  return out;
}

export const readBefore = (page) => page.evaluate(inPage(measureBefore));
export const growTextIn = (page) => page.evaluate(inPage(growText));
export const emptyListsIn = (page) => page.evaluate(inPage(emptyLists));

// ---- Node side ----------------------------------------------------------------------------------

const clips = (t) => t.scrollWidth > t.clientWidth + 1 && t.overflow !== 'visible' && !t.ellipsis;
const scrolls = (p) => p.scrollWidth > p.clientWidth + 1;
const overlap = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// Elements whose text now overflows and was fine before (what already overflowed is LAYOUT-11).
function clippedNow(before, after) {
  const was = new Map(before.text.map((t) => [t.selector, t]));
  return after.text.filter((t) => clips(t) && !(was.has(t.selector) && was.get(t.selector).scrollWidth > was.get(t.selector).clientWidth + 1)).map((t) => t.selector);
}

// Interactive boxes that cross a neighbor now and did not before.
function coversNow(before, after) {
  const pairs = (data) => {
    const set = new Set();
    const list = data.targets.slice(0, MAX_TARGETS);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlap(list[i], list[j])) set.add(`${list[i].selector}|${list[j].selector}`);
    return set;
  };
  const was = pairs(before);
  const hit = new Set();
  for (const p of pairs(after)) if (!was.has(p)) for (const s of p.split('|')) hit.add(s);
  return [...hit];
}

const entry = (id, key, selectors) => ({ id, status: 'fail', key, selector: selectors[0], measure: { count: selectors.length, selectors: selectors.slice(0, MAX_SELECTORS) } });
const passed = (id, checked) => ({ id, status: 'pass', key: 'checked', measure: { checked } });

export function stressFindings({ scenario, before, after, width, degraded = null } = {}) {
  if (degraded) return STRESS_RULES.map((id) => ({ id, status: 'unverified', key: 'run', reason: degraded }));
  if (scenario === 'long-text') {
    const out = [];
    const clipped = clippedNow(before, after);
    if (clipped.length) out.push(entry('STRESS-01', 'long-text|clipped', clipped));
    const covers = coversNow(before, after);
    if (covers.length) out.push(entry('STRESS-01', 'long-text|covers', covers));
    if (scrolls(after.page) && !scrolls(before.page)) {
      out.push({ id: 'STRESS-01', status: 'fail', key: 'long-text|page-scroll', measure: { count: 1, selectors: [], scrollWidth: after.page.scrollWidth, clientWidth: after.page.clientWidth } });
    }
    return out.length ? out : [passed('STRESS-01', before.text.length)];
  }
  if (scenario === 'empty-lists') {
    if (!after.length) return [];
    const holes = after.filter((l) => l.height >= HOLE_MIN_PX && l.textChars === 0).map((l) => l.selector);
    return holes.length ? [entry('STRESS-02', 'empty-lists|hole', holes)] : [passed('STRESS-02', after.length)];
  }
  if (scenario === 'zoom-200') {
    const out = [];
    if (scrolls(after.page) && !scrolls(before.page)) {
      out.push({ id: 'STRESS-03', status: 'fail', key: 'zoom-200|overflow-x', measure: { count: 1, selectors: [], scrollWidth: after.page.scrollWidth, clientWidth: after.page.clientWidth, width } });
    }
    const fixed = after.page.fixed.reduce((sum, f) => sum + f.height, 0);
    if (after.page.innerHeight > 0 && fixed / after.page.innerHeight > FIXED_MAX_RATIO) {
      out.push({ id: 'STRESS-03', status: 'fail', key: 'zoom-200|covered', measure: { count: after.page.fixed.length, selectors: [], fixedRatio: Math.round((fixed / after.page.innerHeight) * 100) / 100 } });
    }
    const clipped = clippedNow(before, after);
    if (clipped.length) out.push(entry('STRESS-03', 'zoom-200|clipped', clipped));
    return out.length ? out : [passed('STRESS-03', before.text.length)];
  }
  throw new Error(`unknown stress scenario ${scenario}`);
}

