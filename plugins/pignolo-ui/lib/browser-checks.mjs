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
// visibleTextSelectors(page) -> selectors of the first two viewports with opacity > 0 (normal load)
// runReducedMotionCheck(page, visible) -> raw findings of B4 (the caller navigated again with
//   prefers-reduced-motion: reduce; only text in `visible` is flagged).
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
  // Text hidden on purpose from the eye (sr-only, visually-hidden): a 1 px box that clips, a zero clip.
  const hiddenOnPurpose = new Map();
  const isVisuallyHidden = (el) => {
    if (hiddenOnPurpose.has(el)) return hiddenOnPurpose.get(el);
    let hidden = false;
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible';
      const zeroClip = /^rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)$/.test(s.clip) || /^inset\(\s*(50|100)%/.test(s.clipPath);
      if ((clips && r.width <= 1 && r.height <= 1) || (zeroClip && (s.position === 'absolute' || s.position === 'fixed'))) { hidden = true; break; }
    }
    hiddenOnPurpose.set(el, hidden);
    return hidden;
  };
  const textNodes = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement || SKIP.has(n.parentElement.tagName)) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.display === 'none' || cs.visibility !== 'visible' || isVisuallyHidden(n.parentElement)) continue;
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
export const inPage = (fn, arg) => `(() => { ${PAGE_HELPERS}; return (${fn.toString()})(${JSON.stringify(arg ?? null)}); })()`;

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
      // A bar is a header/nav/footer or a short strip: a painted wrapper as tall as the page is not.
      const barLike = ['HEADER', 'NAV', 'FOOTER'].includes(e.tagName) || r.height < innerHeight * 0.25;
      if (painted && barLike && r.left <= 0 && r.right >= vw) return true;
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

// B4: text of the first two viewports with its effective opacity. In the normal load the finite
// animations are finished first (the settled page); under reduced motion nothing is touched.
function collectOpacities(settle) {
  if (settle) for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinite */ } }
  const limit = innerHeight * 2;
  const text = [];
  const seen = new Set();
  for (const { el, rect } of textNodes()) {
    if (rect.top >= limit || rect.bottom <= 0 || seen.has(el)) continue;
    seen.add(el);
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    text.push({ selector: selectorOf(el), opacity });
  }
  return text;
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
    // Tab enters a radio group once; the arrows move inside it (HTML focus order).
    const group = el.matches('input[type="radio"][name]') ? `${el.form ? selectorOf(el.form) : ''}|${el.name}` : null;
    list.push({ selector: selectorOf(el), style: styleOf(el), focusable: el.tabIndex >= 0, group });
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


// T2: interactive targets with their boxes. Inline links inside running text are marked (exempt
// from the size rule); a checkbox or radio with a label is measured with the union of both boxes.
function collectTargets() {
  const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || s.visibility !== 'visible' || isDisabled(el) || isVisuallyHidden(el)) continue;
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (el.matches('input[type="checkbox"], input[type="radio"]') && el.labels && el.labels.length) {
      for (const label of el.labels) {
        const l = label.getBoundingClientRect();
        if (l.width > 0 && l.height > 0) box = { left: Math.min(box.left, l.left), top: Math.min(box.top, l.top), right: Math.max(box.right, l.right), bottom: Math.max(box.bottom, l.bottom) };
      }
    }
    let inline = false;
    if (s.display === 'inline' && el.parentElement) {
      const own = (el.textContent || '').trim();
      const around = (el.parentElement.textContent || '').trim();
      inline = around.length > own.length && own.length > 0;
    }
    out.push({ selector: selectorOf(el), left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top, inline });
  }
  return out;
}

// T2: text fields with their computed font size (iOS zooms a page when the field is under 16 px).
function collectFields() {
  const out = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.matches('input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], input[type="file"], input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]')) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || s.visibility !== 'visible' || isDisabled(el)) continue;
    out.push({ selector: selectorOf(el), fontSize: parseFloat(s.fontSize) });
  }
  return out;
}

// T3: title, body size, text blocks (characters per line, leading) and tiny text.
function collectType() {
  const out = { title: null, body: null, blocks: [], tiny: [] };
  const sizes = new Map();
  const h1 = [...document.querySelectorAll('h1')].find((h) => {
    const r = h.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(h).visibility === 'visible' && !isVisuallyHidden(h);
  });
  if (h1) out.title = { selector: selectorOf(h1), fontSize: parseFloat(getComputedStyle(h1).fontSize) };
  const seen = new Set();
  for (const { node, el } of textNodes()) {
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const chars = node.nodeValue.trim().length;
    if (el.closest('p, li')) sizes.set(px, (sizes.get(px) || 0) + chars);
    if (px < 12 && !seen.has('t' + selectorOf(el))) { seen.add('t' + selectorOf(el)); out.tiny.push({ selector: selectorOf(el), fontSize: px }); }
  }
  let best = 0;
  for (const [px, n] of sizes) if (n > best) { best = n; out.body = { fontSize: px }; }
  for (const el of document.querySelectorAll('p, li, blockquote')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.visibility !== 'visible' || isVisuallyHidden(el)) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length <= 80 || el.querySelector('p, ul, ol, li, div, blockquote, table, pre')) continue;
    const fontSize = parseFloat(cs.fontSize);
    const lineHeight = cs.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(cs.lineHeight);
    if (!(lineHeight > 0)) continue;
    const inner = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    const lines = Math.max(1, Math.round(inner / lineHeight));
    out.blocks.push({ selector: selectorOf(el), chars: text.length, lines, leading: lineHeight / fontSize, fontSize, tag: el.tagName.toLowerCase() });
  }
  return out;
}

// T10: the interactive elements with an accessible name, for the desktop/phone comparison.
// `disclosed`: the element sits inside what a visible disclosure control opens (aria-controls or
// id target of a button, summary or role=button with aria-expanded/aria-controls, or a closed
// <details> whose <summary> is visible).
function collectInteractive() {
  const SEL = 'a[href], button, [role="button"], [role="link"], [role="menuitem"], [role="tab"], summary, input:not([type="hidden"])';
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility === 'visible' && !isVisuallyHidden(el);
  };
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return norm(label);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ');
      if (norm(text)) return norm(text);
    }
    if (el.labels && el.labels.length) return norm([...el.labels].map((l) => l.textContent).join(' '));
    const own = norm(el.textContent);
    if (own) return own;
    const img = el.querySelector('img[alt]');
    if (img && norm(img.getAttribute('alt'))) return norm(img.getAttribute('alt'));
    return norm(el.getAttribute('title') || el.getAttribute('placeholder') || '');
  };
  const controls = [...document.querySelectorAll('button, summary, [role="button"]')].filter((c) => (c.hasAttribute('aria-expanded') || c.hasAttribute('aria-controls') || c.tagName === 'SUMMARY') && shown(c));
  const targets = [];
  for (const c of controls) {
    if (c.tagName === 'SUMMARY') continue;
    const ids = (c.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
    for (const id of ids) { const t = document.getElementById(id); if (t) targets.push(t); }
  }
  const disclosedBy = (el) => {
    if (targets.some((t) => t.contains(el))) return true;
    const details = el.closest('details');
    if (details && !details.open) { const sum = details.querySelector(':scope > summary'); if (sum && shown(sum) && sum !== el) return true; }
    return false;
  };
  const byKey = new Map();
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest('[aria-hidden="true"]') || isDisabled(el)) continue;
    const name = nameOf(el);
    if (!name) continue;
    let href = '';
    if (el.tagName === 'A') { try { const u = new URL(el.href); href = u.pathname + u.search + u.hash; } catch { href = el.getAttribute('href') || ''; } }
    const kind = el.getAttribute('role') || el.tagName.toLowerCase();
    const key = `${kind}|${name}|${href}`;
    const item = byKey.get(key) || { key, name, visible: false, disclosed: false };
    if (shown(el)) item.visible = true;
    else if (disclosedBy(el)) item.disclosed = true;
    byKey.set(key, item);
  }
  return { items: [...byKey.values()] };
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

// ---- T2: TARGET-01 and FORM-01 ----------------------------------------------------------------

export const PHONE_MAX_WIDTH = 480;
export const MIN_TARGET_PX = 24;
export const RECOMMENDED_TARGET_PX = 44;
export const MIN_FIELD_FONT_PX = 16;
const MAX_SELECTORS = 5;
const round1 = (n) => Math.round(n * 10) / 10;

// Distance from a point to a box (0 inside).
const distToBox = (cx, cy, b) => Math.hypot(Math.max(b.left - cx, 0, cx - (b.left + b.width)), Math.max(b.top - cy, 0, cy - (b.top + b.height)));

// WCAG 2.5.8 spacing exception: the circle of `diameter` px centered on the box of an undersized
// target must not cross another target (touching is not crossing), nor the circle of another
// undersized one.
function circleCrosses(a, others, diameter) {
  const r = diameter / 2;
  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;
  return others.some((o) => {
    if (distToBox(cx, cy, o) < r) return true;
    if (Math.min(o.width, o.height) < diameter) {
      return Math.hypot(cx - (o.left + o.width / 2), cy - (o.top + o.height / 2)) < diameter;
    }
    return false;
  });
}

// items: collectTargets(). Under 24 px (or the DESIGN.md minimum, never lower) is alto per element
// unless the spacing exception holds; under 44 px (or recommendedPx) at phone width is one
// medio entry per width and theme. "Equivalent control" and "essential" are not measured.
export function targetFindings(items, { width, minPx = MIN_TARGET_PX, recommendedPx = RECOMMENDED_TARGET_PX }) {
  const min = Math.max(MIN_TARGET_PX, Number(minPx) || 0);
  const out = [];
  const small = [];
  const alto = new Set();
  const counted = items.filter((i) => !i.inline);
  for (const it of counted) {
    const side = Math.min(it.width, it.height);
    if (side >= min) { if (side < recommendedPx) small.push(it); continue; }
    const others = counted.filter((o) => o !== it);
    if (circleCrosses(it, others, min)) {
      alto.add(it);
      out.push({ id: 'TARGET-01', status: 'fail', key: it.selector, selector: it.selector, measure: { widthPx: round1(it.width), heightPx: round1(it.height), minPx: min } });
    } else {
      small.push(it);
    }
  }
  if (width <= PHONE_MAX_WIDTH) {
    const under = small.filter((i) => Math.min(i.width, i.height) < recommendedPx).sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height));
    if (under.length) {
      out.push({
        id: 'TARGET-01', status: 'fail', key: 'phone-targets', severity: 'medio',
        measure: { count: under.length, smallestPx: round1(Math.min(under[0].width, under[0].height)), recommendedPx, selectors: under.slice(0, MAX_SELECTORS).map((i) => i.selector) },
      });
    }
  }
  if (!out.length) out.push({ id: 'TARGET-01', status: 'pass', key: 'checked', measure: { checked: counted.length } });
  return out;
}

// items: collectFields(). Only at phone width (≤ 480): elsewhere the rule does not apply.
export function fieldFindings(items, { width }) {
  if (width > PHONE_MAX_WIDTH) return [];
  const bad = items.filter((i) => i.fontSize < MIN_FIELD_FONT_PX);
  if (!bad.length) return [{ id: 'FORM-01', status: 'pass', key: 'checked', measure: { checked: items.length } }];
  return bad.map((i) => ({ id: 'FORM-01', status: 'fail', key: i.selector, selector: i.selector, measure: { fontSizePx: i.fontSize, requiredPx: MIN_FIELD_FONT_PX } }));
}

// ---- T3: TYPE-01 and TYPE-02 --------------------------------------------------------------------

// Title/body ratio per register (R-4e-15): brand is airy, product is dense; an undeclared register
// takes the more permissive one so the rule adds no noise when it does not know.
export const MIN_TITLE_BODY_RATIO = { brand: 1.25, product: 1.125 };
export const DEFAULT_RATIO_REGISTER = 'product';
export const MAX_LINE_CHARS = 80;
export const MIN_LEADING = 1.3;
export const MIN_TEXT_PX = 12;

const round3 = (n) => Math.round(n * 1000) / 1000;

// data: collectType(). TYPE-02 is one entry; TYPE-01 is one entry per motive (line-length,
// leading, tiny-text) with the count and the worst case.
export function typeFindings(data, { register = 'unset' } = {}) {
  const out = [];
  const effective = MIN_TITLE_BODY_RATIO[register] ? register : DEFAULT_RATIO_REGISTER;
  const threshold = MIN_TITLE_BODY_RATIO[effective];
  if (!data.title || !data.body) {
    out.push({ id: 'TYPE-02', status: 'unverified', key: 'title-ratio', reason: data.title ? 'no body text (p or li) to compare the title with' : 'no visible h1 to compare with the body text' });
  } else {
    const ratio = data.title.fontSize / data.body.fontSize;
    const measure = { ratio: round3(ratio), titlePx: data.title.fontSize, bodyPx: data.body.fontSize, register, threshold };
    out.push(ratio < threshold
      ? { id: 'TYPE-02', status: 'fail', key: 'title-ratio', selector: data.title.selector, measure }
      : { id: 'TYPE-02', status: 'pass', key: 'checked', measure });
  }
  const motives = [
    ['line-length', data.blocks.filter((b) => b.chars / b.lines > MAX_LINE_CHARS).map((b) => ({ selector: b.selector, value: Math.round(b.chars / b.lines) })), MAX_LINE_CHARS, 'max'],
    ['leading', data.blocks.filter((b) => (b.tag === 'p' || b.tag === 'li') && b.lines >= 2 && b.leading < MIN_LEADING).map((b) => ({ selector: b.selector, value: round3(b.leading) })), MIN_LEADING, 'min'],
    ['tiny-text', data.tiny.map((t) => ({ selector: t.selector, value: t.fontSize })), MIN_TEXT_PX, 'min'],
  ];
  let failed = false;
  for (const [key, bad, threshold2, kind] of motives) {
    if (!bad.length) continue;
    failed = true;
    const worst = bad.reduce((w, b) => ((kind === 'max' ? b.value > w.value : b.value < w.value) ? b : w), bad[0]);
    out.push({ id: 'TYPE-01', status: 'fail', key, selector: worst.selector, measure: { count: bad.length, worst, threshold: threshold2 } });
  }
  if (!failed) out.push({ id: 'TYPE-01', status: 'pass', key: 'checked', measure: { checked: data.blocks.length } });
  return out;
}

// ---- T10: RESP-01, controls that exist on the wide page and are gone on the phone ------------------

export const RESP_WIDE_MIN = 1024;
export const RESP_NARROW_MAX = 480;
export const RESP_MAX_NAMES = 5;

export async function interactiveItems(page) {
  return (await page.evaluate(inPage(collectInteractive))).items;
}

// byWidth = { [width]: { items } } from collectInteractive. One entry: fail (missing-on-phone),
// pass or unverified when the plan has no wide (1024 or more) and narrow (480 or less) width.
// What the opening control does is not measured.
export function respFindings(byWidth, { wide, narrow } = {}) {
  const widths = Object.keys(byWidth).map(Number);
  const w = wide ?? Math.max(...widths.filter((x) => x >= RESP_WIDE_MIN));
  const n = narrow ?? Math.min(...widths.filter((x) => x <= RESP_NARROW_MAX));
  if (!Number.isFinite(w) || !Number.isFinite(n)) {
    return [{ id: 'RESP-01', status: 'unverified', key: 'missing-on-phone', reason: 'a desktop width and a phone width are needed to compare' }];
  }
  if (!byWidth[w] || !byWidth[n]) {
    return [{ id: 'RESP-01', status: 'unverified', key: 'missing-on-phone', reason: 'the page was not measured at both widths of the comparison' }];
  }
  const phone = new Map(byWidth[n].items.map((i) => [i.key, i]));
  const missing = byWidth[w].items.filter((i) => {
    if (!i.visible) return false;
    const there = phone.get(i.key);
    return !(there && (there.visible || there.disclosed));
  });
  const at = { width: n, theme: 'light' };
  if (!missing.length) return [{ id: 'RESP-01', status: 'pass', key: 'checked', measure: { checked: byWidth[w].items.filter((i) => i.visible).length, wide: w, narrow: n, ...at } }];
  return [{
    id: 'RESP-01', status: 'fail', key: 'missing-on-phone', severity: 'medio',
    measure: { count: missing.length, names: missing.slice(0, RESP_MAX_NAMES).map((i) => i.name), wide: w, narrow: n, ...at },
  }];
}

// ---- T11: register of one screen -------------------------------------------------------------------

export const REGISTERS = ['brand', 'product'];

// The register a measure uses: the --register flag (what the flow brief declares for the screen),
// else pignolo.register of DESIGN.md (design = its pignolo block or null), else 'unset'.
export function effectiveRegister({ flag, design } = {}) {
  if (flag !== undefined && flag !== null) {
    if (!REGISTERS.includes(flag)) throw new TypeError(`register must be one of ${REGISTERS.join(', ')}: ${flag}`);
    return flag;
  }
  return design && REGISTERS.includes(design.register) ? design.register : 'unset';
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
    // A radio of a group that Tab did enter counts as reached (the arrows get to the rest).
    if (e.group && !reached.has(e.selector) && expected.some((o) => o.group === e.group && reached.has(o.selector))) continue;
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

export async function runChecks(page, { targets, register = 'unset' } = {}) {
  const contrast = contrastFindings(await page.evaluate(inPage(collectContrast)));
  const findings = [...contrast.findings];
  if (!findings.some((f) => f.status === 'fail')) findings.push({ id: 'COLOR-03', status: 'pass', key: 'checked', measure: { checked: contrast.checked } });
  const width = await page.evaluate(() => innerWidth);
  findings.push(...reflowFindings(await page.evaluate(inPage(collectReflow)), { width }));
  findings.push(...targetFindings(await page.evaluate(inPage(collectTargets)), { width, ...(targets ?? {}) }));
  findings.push(...typeFindings(await page.evaluate(inPage(collectType)), { register }));
  findings.push(...fieldFindings(await page.evaluate(inPage(collectFields)), { width }));
  findings.push(...await keyboardFindings(page));
  return findings;
}

// Text visible (opacity > 0) in the normal, settled load: what the reduced-motion page must also show.
export async function visibleTextSelectors(page) {
  return (await page.evaluate(inPage(collectOpacities, true))).filter((t) => t.opacity > 0).map((t) => t.selector);
}

// visible: visibleTextSelectors of the same page in the normal load. Text that is already at
// opacity 0 there (a tooltip shown on hover) is not a reduced-motion problem.
export async function runReducedMotionCheck(page, visible) {
  if (!Array.isArray(visible)) throw new TypeError('runReducedMotionCheck needs the visibleTextSelectors of the normal load');
  const normal = new Set(visible);
  const text = (await page.evaluate(inPage(collectOpacities, false))).filter((t) => normal.has(t.selector));
  const checked = text.length;
  const hidden = text.filter((t) => t.opacity <= 0);
  const out = hidden.map((h) => ({ id: 'MOTION-07', status: 'fail', key: h.selector, selector: h.selector, reason: 'text with opacity 0 under prefers-reduced-motion: reduce' }));
  if (!out.length) out.push({ id: 'MOTION-07', status: 'pass', key: 'checked', measure: { checked } });
  return out;
}

