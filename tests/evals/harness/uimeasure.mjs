// Browser measures of a rendered screen (ui tasks). The harness computes them, never the agent: injected JS over the page loaded
// in the browser library of ui-audit (plugins/pignolo/ui-audit/lib/browser-session.mjs, injected here as `browser`).
//
// Everything that cannot be computed is the string "not_verified" (with its reason in `notVerified`), never zero.
//
// measureScreen({ browser, tab, url, slug, shotsDir, tokens }) -> { shots, measures, notVerified }
//   at 1280x800 : screenshot, native widgets, interactive controls, hover / focus-visible styles, primary buttons, font sizes and weights,
//                 text size ratio, controls above the fold, colors outside the design.md tokens, content states, heading and main action
//   at 390x844  : screenshot, smallest interactive target
// Hover and focus-visible are FORCED through the DevTools protocol (DOM.getDocument + CSS.forcePseudoState on each interactive element,
// computed styles compared with the resting ones, transitions and animations switched off in the page for that pass). If the protocol
// is not reachable the two metrics are "not_verified".
import fs from 'node:fs';
import path from 'node:path';

export const NOT_VERIFIED = 'not_verified';
export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };
export const MAX_MARKED = 300;

// ---- page side: helpers shared by every expression (the page functions only read the DOM; the marker attribute is the one write) ------

const PAGE_HELPERS = String.raw`
const INTERACTIVE = 'a, button, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])';
const isVisible = (el) => {
  if (!el || !el.isConnected) return false;
  let cs;
  try { cs = getComputedStyle(el); } catch (e) { return false; }
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  if (typeof el.checkVisibility === 'function') {
    try { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; } catch (e) { /* older browser */ }
  }
  return true;
};
const interactive = () => [...document.querySelectorAll(INTERACTIVE)].filter(isVisible);
const cv = document.createElement('canvas');
cv.width = 1; cv.height = 1;
const cx = cv.getContext('2d', { willReadFrequently: true });
const colorCache = new Map();
// Any CSS color (rgb(), color(), oklch(), ...) as [r, g, b, a] with a in 0..1; null when it cannot be read.
const toRgba = (str) => {
  if (str === undefined || str === null) return null;
  if (colorCache.has(str)) return colorCache.get(str);
  let out = null;
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,\/]\s*([\d.]+%?))?\s*\)$/i.exec(String(str).trim());
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    out = [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
  } else if (cx) {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = '#010203';
    cx.fillStyle = String(str);
    if (!(cx.fillStyle === '#010203' && String(str).trim().toLowerCase() !== '#010203')) {
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    }
  }
  colorCache.set(str, out);
  return out;
};
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'OPTION']);
const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a, b) => { const l1 = lum(a); const l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const round = (v, d) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
const SNAP_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopWidth', 'boxShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'opacity', 'transform', 'textDecorationLine',
  'textDecorationColor', 'filter', 'textShadow'];
const snap = (el) => { const cs = getComputedStyle(el); return SNAP_PROPS.map((p) => cs[p]).join('|'); };
`;

const expr = (tag, arg, body) => `/*ui:${tag}*/ (() => { ${PAGE_HELPERS} const arg = ${JSON.stringify(arg ?? null)}; ${body} })()`;

// Desktop pass: everything but the forced states. Marks the interactive elements (data-uim) and returns their resting styles.
const DESKTOP_BODY = String.raw`
const out = {};
out.native = {
  select: document.querySelectorAll('select').length,
  dateInputs: document.querySelectorAll('input[type=date], input[type=month], input[type=time], input[type=datetime-local], input[type=week]').length,
};
// interactive controls
const controls = interactive();
out.interactive = controls.length;
const vw = window.innerWidth;
const vh = window.innerHeight;
out.aboveFold = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0; }).length;
// buttons: the most prominent fill (contrast against the page background) and how many buttons share it
const buttons = [...document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a[class*="btn"], a[class*="button"]')].filter(isVisible);
let pageBg = [255, 255, 255, 1];
for (const el of [document.body, document.documentElement]) {
  const c = toRgba(getComputedStyle(el).backgroundColor);
  if (c && c[3] > 0.99) { pageBg = c; break; }
}
const filled = [];
for (const b of buttons) {
  const bg = toRgba(getComputedStyle(b).backgroundColor);
  if (bg && bg[3] >= 0.5 && dist(bg, pageBg) >= 24) { const r = b.getBoundingClientRect(); filled.push({ bg, area: r.width * r.height }); }
}
let top = null;
for (const f of filled) {
  const c = contrast(f.bg, pageBg);
  if (!top || c > top.c + 0.01 || (Math.abs(c - top.c) <= 0.01 && f.area > top.area)) top = { c, area: f.area, bg: f.bg };
}
out.buttons = { total: buttons.length, filled: filled.length, primary: top ? filled.filter((f) => dist(f.bg, top.bg) <= 6).length : 0, fill: top ? 'rgb(' + top.bg.slice(0, 3).join(', ') + ')' : null };
// text: distinct font sizes and weights, ratio between the largest and the smallest
const sizes = new Set();
const weights = new Set();
const seen = new Map();
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
for (let n = walker.nextNode(); n; n = walker.nextNode()) {
  if (!n.nodeValue.trim()) continue;
  const el = n.parentElement;
  if (!el || SKIP_TEXT.has(el.tagName)) continue;
  if (!seen.has(el)) seen.set(el, isVisible(el));
  if (!seen.get(el)) continue;
  const cs = getComputedStyle(el);
  sizes.add(round(parseFloat(cs.fontSize), 2));
  const w = parseInt(cs.fontWeight, 10);
  weights.add(Number.isFinite(w) ? w : cs.fontWeight);
}
out.text = { sizes: [...sizes].sort((a, b) => a - b), weights: [...weights].sort() };
// colors in use (text, background, visible borders, outline, svg fill and stroke) that are not in the design.md tokens
const tokens = (arg && arg.tokens) || [];
const used = new Map();
const note = (str) => {
  const c = toRgba(str);
  if (!c || c[3] <= 0) return;
  used.set(c[0] + ',' + c[1] + ',' + c[2], [c[0], c[1], c[2]]);
};
const all = [...document.body.querySelectorAll('*')].slice(0, 4000);
let colorsOk = Boolean(cx);
for (const el of all) {
  if (SKIP_TEXT.has(el.tagName) || !isVisible(el)) continue;
  const cs = getComputedStyle(el);
  note(cs.color);
  note(cs.backgroundColor);
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    if (cs['border' + side + 'Style'] !== 'none' && parseFloat(cs['border' + side + 'Width']) > 0) note(cs['border' + side + 'Color']);
  }
  if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) note(cs.outlineColor);
  if (el instanceof SVGElement) {
    if (cs.fill && cs.fill !== 'none' && !/^url\(/.test(cs.fill)) note(cs.fill);
    if (cs.stroke && cs.stroke !== 'none' && !/^url\(/.test(cs.stroke)) note(cs.stroke);
  }
}
let off = 0;
for (const c of used.values()) if (!tokens.some((t) => Math.abs(t[0] - c[0]) <= 2 && Math.abs(t[1] - c[1]) <= 2 && Math.abs(t[2] - c[2]) <= 2)) off += 1;
out.colors = colorsOk && tokens.length ? { used: used.size, offToken: off } : null;
// empty / loading / error states anywhere in the text or the markup (heuristic)
const clone = document.body.cloneNode(true);
clone.querySelectorAll('script, style, noscript, template').forEach((e) => e.remove());
const blob = (clone.outerHTML || '').toLowerCase();
out.states = {
  empty: /\b(empty|no (results?|items?|data|entries|records|messages|notifications|\w+ yet)|nothing (here|to show|yet)|zero.state|vac[ií][oa]|sin (resultados|datos|elementos|registros)|no hay|a[uú]n no)\b/.test(blob),
  loading: /\b(loading|spinner|skeleton|shimmer|cargando|progressbar|please wait)\b|aria-busy="true"/.test(blob),
  error: /\b(error|failed|failure|went wrong|try again|invalid|inv[aá]lid[oa]|fall[oó]|reintent\w*|no se pudo|couldn['’]t|could not|unable to)\b/.test(blob),
};
out.heading = [...document.querySelectorAll('h1, h2, h3, [role=heading]')].some(isVisible);
// the interactive elements get a marker and their resting style (for the forced-state pass)
const marked = controls.slice(0, arg && arg.maxMarked ? arg.maxMarked : 300);
const style = document.createElement('style');
style.setAttribute('data-uim-style', '1');
style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
document.head.appendChild(style);
marked.forEach((el, i) => el.setAttribute('data-uim', String(i)));
void document.body.offsetHeight;
out.markedCount = marked.length;
out.rest = marked.map((el) => snap(el));
return out;
`;

const TARGETS_BODY = String.raw`
const controls = interactive();
const inlineLink = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement
  && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length;
const sizes = [];
for (const el of controls) {
  if (inlineLink(el)) continue; // a link inside a sentence is exempt from the target size
  let r = el.getBoundingClientRect();
  if (el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type)) {
    const label = el.closest('label') || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
    if (label && isVisible(label)) { const lr = label.getBoundingClientRect(); if (lr.width * lr.height > r.width * r.height) r = lr; }
  }
  sizes.push(Math.min(r.width, r.height));
}
return { controls: controls.length, counted: sizes.length, min: sizes.length ? round(Math.min(...sizes), 1) : null, below44: sizes.filter((s) => s < 43.5).length, below24: sizes.filter((s) => s < 23.5).length };
`;

const SNAP_ONE = (i) => `/*ui:snap*/ (() => { ${PAGE_HELPERS} const el = document.querySelector('[data-uim="${i}"]'); return el ? snap(el) : null; })()`;

// ---- node side ---------------------------------------------------------------------------------------------------------------------

// Forces :hover and :focus-visible on each marked element through the DevTools protocol and compares the computed style with the resting one.
// Returns { hover, focus, both, checked } or throws (the caller turns it into "not_verified").
export async function forcedStates({ browser, tab, rest }) {
  if (!browser || !browser.cdp || typeof browser.cdp.send !== 'function' || !tab || !tab.sessionId) throw new Error('no DevTools protocol access (browser.cdp or the tab session is missing)');
  const send = (method, params = {}) => browser.cdp.send(method, params, { sessionId: tab.sessionId });
  await send('DOM.enable');
  await send('CSS.enable');
  const { root } = await send('DOM.getDocument', { depth: 0 });
  let hover = 0;
  let focus = 0;
  let both = 0;
  for (let i = 0; i < rest.length; i += 1) {
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-uim="${i}"]` });
    if (!nodeId) throw new Error(`the node ${i} was not found`);
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
    const h = await tab.evaluate(SNAP_ONE(i));
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
    const f = await tab.evaluate(SNAP_ONE(i));
    await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    if (h === null || f === null) throw new Error(`the element ${i} disappeared while its state was forced`);
    const hc = h !== rest[i];
    const fc = f !== rest[i];
    if (hc) hover += 1;
    if (fc) focus += 1;
    if (hc && fc) both += 1;
  }
  return { hover, focus, both, checked: rest.length };
}

const writeShot = (shotsDir, name, buf) => {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, name), buf);
  return name;
};

// One screen, both widths. Never throws for a metric: what cannot be measured is "not_verified" with its reason. A failure to load
// or render the page is thrown (the caller records it for the whole screen).
export async function measureScreen({ browser, tab, url, slug, shotsDir, tokens }) {
  const notVerified = {};
  const shots = [];
  const nv = (metric, reason) => { notVerified[metric] = reason; return NOT_VERIFIED; };

  await tab.setViewport(DESKTOP);
  await tab.setMedia({ theme: 'light' });
  await tab.navigate(url);
  await tab.waitReady();
  try { shots.push({ width: DESKTOP.width, file: writeShot(shotsDir, `${slug}-${DESKTOP.width}.png`, await tab.screenshot()) }); } catch (e) { nv(`shot_${DESKTOP.width}`, e.message); }
  let d = null;
  try { d = await tab.evaluate(expr('desktop', { tokens, maxMarked: MAX_MARKED }, DESKTOP_BODY), null, { timeoutMs: 60000 }); } catch (e) { d = null; nv('desktop_measures', e.message); }

  const m = {};
  if (d) {
    m.native_select = d.native.select;
    m.native_date_inputs = d.native.dateInputs;
    m.native_widgets = d.native.select + d.native.dateInputs;
    m.interactive = d.interactive;
    m.controls_above_fold = d.aboveFold;
    m.buttons = d.buttons.total;
    m.filled_buttons = d.buttons.filled;
    m.primary_buttons = d.buttons.primary;
    m.primary_fill = d.buttons.fill;
    m.font_sizes = d.text.sizes.length;
    m.font_weights = d.text.weights.length;
    m.size_ratio = d.text.sizes.length ? Math.round((d.text.sizes[d.text.sizes.length - 1] / d.text.sizes[0]) * 100) / 100 : nv('size_ratio', 'the page has no visible text');
    if (!d.text.sizes.length) { m.font_sizes = nv('font_sizes', 'the page has no visible text'); m.font_weights = nv('font_weights', 'the page has no visible text'); }
    m.off_token_colors = d.colors ? d.colors.offToken : nv('off_token_colors', tokens && tokens.length ? 'colors could not be read in the page' : 'design.md has no readable color tokens');
    m.colors_used = d.colors ? d.colors.used : NOT_VERIFIED;
    m.content_states = { empty: d.states.empty ? 'found' : 'not found', loading: d.states.loading ? 'found' : 'not found', error: d.states.error ? 'found' : 'not found' };
    m.has_heading = d.heading;
    m.single_main_action = d.buttons.primary === 1;
    if (d.interactive === 0) {
      m.hover_style = nv('hover_style', 'no interactive elements');
      m.focus_style = nv('focus_style', 'no interactive elements');
      m.states_ok = nv('states_ok', 'no interactive elements');
    } else {
      try {
        const f = await forcedStates({ browser, tab, rest: d.rest });
        m.hover_style = f.hover;
        m.focus_style = f.focus;
        m.states_ok = f.both;
        m.states_checked = f.checked;
        if (f.checked < d.interactive) m.states_sampled = true;
      } catch (e) {
        m.hover_style = nv('hover_style', `could not force the states: ${e.message}`);
        m.focus_style = nv('focus_style', `could not force the states: ${e.message}`);
        m.states_ok = nv('states_ok', `could not force the states: ${e.message}`);
      }
    }
  } else {
    for (const k of ['native_widgets', 'interactive', 'controls_above_fold', 'primary_buttons', 'font_sizes', 'font_weights', 'size_ratio', 'off_token_colors', 'hover_style', 'focus_style', 'states_ok']) m[k] = NOT_VERIFIED;
    m.content_states = NOT_VERIFIED; m.has_heading = NOT_VERIFIED; m.single_main_action = NOT_VERIFIED;
  }

  // mobile: smallest target (a fresh load: the layout answers to the width, not to a resized desktop page)
  try {
    await tab.setViewport(MOBILE);
    await tab.navigate(url);
    await tab.waitReady();
    try { shots.push({ width: MOBILE.width, file: writeShot(shotsDir, `${slug}-${MOBILE.width}.png`, await tab.screenshot()) }); } catch (e) { nv(`shot_${MOBILE.width}`, e.message); }
    const t = await tab.evaluate(expr('targets', null, TARGETS_BODY), null, { timeoutMs: 30000 });
    if (t.min === null) {
      m.min_target_px_390 = nv('min_target_px_390', t.controls ? 'only inline links, exempt from the target size' : 'no interactive elements');
      m.targets_below_44_390 = NOT_VERIFIED;
    } else {
      m.min_target_px_390 = t.min;
      m.targets_below_44_390 = t.below44;
    }
  } catch (e) {
    m.min_target_px_390 = nv('min_target_px_390', e.message);
    m.targets_below_44_390 = NOT_VERIFIED;
  }
  return { shots, measures: m, notVerified };
}

// ---- tokens of design.md -------------------------------------------------------------------------------------------------------

// The colors declared in the YAML block of design.md as [[r, g, b], ...] (0..255). `{colors.x}` references are followed.
// `libs` = { splitFrontmatter, parseYaml, parseColor } from the ui-audit lib.
export function designColorTokens(text, libs) {
  const fm = libs.splitFrontmatter(text);
  if (!fm.ok) return { tokens: [], reason: fm.reason };
  const parsed = libs.parseYaml(fm.yaml);
  if (!parsed.supported || !parsed.value || typeof parsed.value !== 'object') return { tokens: [], reason: `the YAML block could not be read (${parsed.reason || 'unsupported'})` };
  const colors = parsed.value.colors && typeof parsed.value.colors === 'object' ? parsed.value.colors : {};
  const resolve = (name, depth = 0) => {
    const v = colors[name];
    if (typeof v !== 'string' || depth > 8) return null;
    const ref = /^\{colors\.([^{}]+)\}$/.exec(v.trim());
    return ref ? resolve(ref[1], depth + 1) : v.trim();
  };
  const seen = new Set();
  const tokens = [];
  for (const name of Object.keys(colors)) {
    const raw = resolve(name);
    if (!raw) continue;
    const c = libs.parseColor(raw);
    if (!c.ok || c.rgba.a <= 0) continue;
    const rgb = [c.rgba.r, c.rgba.g, c.rgba.b].map((x) => Math.round(x * 255));
    const key = rgb.join(',');
    if (!seen.has(key)) { seen.add(key); tokens.push(rgb); }
  }
  return { tokens, reason: tokens.length ? null : 'design.md declares no color tokens' };
}
