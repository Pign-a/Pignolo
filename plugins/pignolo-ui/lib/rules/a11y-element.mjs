// Element accessibility rules (spec §5.4): A11Y-04 accessible name, A11Y-16 field labels,
// A11Y-26 image text alternatives, A11Y-39 focusable content inside aria-hidden.
// Only what is static in the file is judged. Dynamic values, spreads and own components are
// `unverified` (spec §5.5); the rendered DOM covers them when a browser is available.
import { fail, unverified } from './api.mjs';
import { ancestors, descendants, staticText } from '../markup.mjs';

const FORM_TAGS = new Set(['input', 'select', 'textarea']);
// Roles that do not take their name from content: they need aria-label, aria-labelledby or a label.
const NO_CONTENT_ROLES = new Set(['combobox', 'listbox', 'textbox', 'searchbox', 'slider', 'spinbutton']);
const BUTTON_INPUTS = new Set(['button', 'submit', 'reset', 'image']);

const attr = (el, name) => el.attrs.get(name);
const isStatic = (a) => a && !a.dynamic;
const value = (a) => (isStatic(a) && typeof a.value === 'string' ? a.value.trim() : '');
const isTrue = (el, name) => value(attr(el, name)).toLowerCase() === 'true';

// Stable part of the fingerprint: tag + sorted static attributes (no class) + first 40 chars of text.
function keyOf(markup, el) {
  const attrs = [...el.attrs.entries()]
    .filter(([name, a]) => name !== 'class' && !a.dynamic)
    .map(([name, a]) => (a.value === null ? name : `${name}=${a.value}`))
    .sort();
  const text = staticText(markup, el).text.slice(0, 40);
  return `${el.tag}|${attrs.join(',')}|${text}`;
}

const at = (markup, el, extra = {}) => ({ line: el.line, selector: el.tag, ...extra });
const hiddenByAria = (markup, el) => isTrue(el, 'aria-hidden') || ancestors(markup, el).some((a) => isTrue(a, 'aria-hidden'));

// Labels of the file: { element, forId (static) | forDynamic }.
function labelsOf(markup) {
  return markup.elements.filter((e) => e.tag === 'label' && !e.component);
}

// Name given by aria-label / aria-labelledby. -> 'named' | 'dynamic' | null
function ariaName(el) {
  let dynamic = false;
  for (const name of ['aria-labelledby', 'aria-label']) {
    const a = attr(el, name);
    if (!a) continue;
    if (a.dynamic) dynamic = true;
    else if (value(a)) return 'named';
  }
  return dynamic ? 'dynamic' : null;
}

// Label association (label[for], wrapping label). -> 'named' | 'dynamic' | null
function labelName(markup, el) {
  const id = attr(el, 'id');
  let dynamic = false;
  for (const label of labelsOf(markup)) {
    const f = attr(label, 'for');
    const wraps = ancestors(markup, el).includes(label);
    const targets = wraps || (f && !f.dynamic && id && !id.dynamic && value(f) !== '' && value(f) === value(id));
    if (f && f.dynamic && !wraps) {
      if (id) dynamic = true;
      continue;
    }
    if (!targets) continue;
    const t = staticText(markup, label, { skipAriaHidden: true });
    if (t.text) return 'named';
    if (t.dynamic) dynamic = true;
  }
  if (id && id.dynamic && labelsOf(markup).some((l) => attr(l, 'for'))) dynamic = true;
  return dynamic ? 'dynamic' : null;
}

// Name from the content of the element. -> 'named' | 'dynamic' | 'component' | null
function contentName(markup, el) {
  const t = staticText(markup, el, { skipAriaHidden: true });
  if (t.text) return 'named';
  let dynamic = t.dynamic;
  for (const d of descendants(markup, el)) {
    // hidden descendants (or descendants of hidden ones) never name the element
    if (isTrue(d, 'aria-hidden') || ancestors(markup, d).some((x) => x !== el && x.index > el.index && isTrue(x, 'aria-hidden'))) continue;
    if (d.component) continue;
    const al = attr(d, 'aria-label');
    if (al && (al.dynamic || value(al))) { if (al.dynamic) dynamic = true; else return 'named'; }
    if (d.tag === 'img') {
      const alt = attr(d, 'alt');
      if (alt && alt.dynamic) dynamic = true;
      else if (value(alt)) return 'named';
      if (d.spread) dynamic = true;
    }
  }
  if (!dynamic) return null;
  const hasComponent = descendants(markup, el).some((d) => d.component);
  const dynamicText = [el, ...descendants(markup, el)].some((e) => e.textParts.some((p) => p.dynamic));
  return hasComponent && !dynamicText ? 'component' : 'dynamic';
}

// ---- A11Y-04 -------------------------------------------------------------------------------

function isTarget04(el) {
  if (el.component) return /(^|\.)(Icon)?Button$/.test(el.tag);
  const role = value(attr(el, 'role')).toLowerCase();
  if (el.tag === 'button') return true;
  if (el.tag === 'a') return !!attr(el, 'href');
  if (el.tag === 'input') return BUTTON_INPUTS.has(value(attr(el, 'type')).toLowerCase());
  if (FORM_TAGS.has(el.tag)) return false;
  return role === 'button' || NO_CONTENT_ROLES.has(role);
}

function check04(ctx) {
  const markup = ctx.markup;
  if (!markup) return [];
  const out = [];
  for (const el of markup.elements) {
    if (!isTarget04(el)) continue;
    const base = (extra) => at(markup, el, extra);
    const key = keyOf(markup, el);
    if (el.component) {
      if (ariaName(el) === 'named') continue;
      out.push(unverified(`custom component <${el.tag}>: its accessible name is not resolvable statically (component)`, base({ key: `component|${el.tag}` })));
      continue;
    }
    if (isTrue(el, 'aria-hidden')) continue;
    const aria = ariaName(el);
    if (aria === 'named') continue;
    const label = labelName(markup, el);
    if (label === 'named') continue;
    const role = value(attr(el, 'role')).toLowerCase();
    let content = null;
    if (el.tag === 'input') {
      const type = value(attr(el, 'type')).toLowerCase();
      const v = attr(el, 'value');
      const alt = attr(el, 'alt');
      if (type === 'submit' || type === 'reset') { continue; }
      if (type === 'image' && value(alt)) continue;
      if (v && (v.dynamic || alt?.dynamic)) content = 'dynamic';
      else if (value(v)) continue;
    } else if (!NO_CONTENT_ROLES.has(role)) {
      if (value(attr(el, 'title'))) continue;
      content = contentName(markup, el);
      if (content === 'named') continue;
    }
    if (aria === 'dynamic' || label === 'dynamic' || content === 'dynamic' || el.spread) {
      out.push(unverified('dynamic accessible name: not resolvable statically', base({ key: `dynamic|${key}` })));
    } else if (content === 'component') {
      out.push(unverified('component content: the accessible name is not resolvable statically (component)', base({ key: `component|${key}` })));
    } else {
      out.push(fail(key, base({ reason: 'no accessible name: add text, aria-label, aria-labelledby or a label' })));
    }
  }
  return out;
}

// ---- A11Y-16 -------------------------------------------------------------------------------

function check16(ctx) {
  const markup = ctx.markup;
  if (!markup) return [];
  const out = [];
  for (const el of markup.elements) {
    const isField = FORM_TAGS.has(el.tag) && !el.component;
    const isFieldComponent = el.component && /^(Input|Select|Textarea)$/.test(el.tag);
    if (!isField && !isFieldComponent) continue;
    const typeAttr = attr(el, 'type');
    const type = value(typeAttr).toLowerCase();
    if (el.tag === 'input' && !el.component) {
      if (typeAttr?.dynamic) {
        out.push(unverified('dynamic input type: not resolvable statically', at(markup, el, { key: `dynamic-type|${keyOf(markup, el)}` })));
        continue;
      }
      if (type === 'hidden' || BUTTON_INPUTS.has(type)) continue;
    }
    if (hiddenByAria(markup, el)) continue;
    const key = keyOf(markup, el);
    const aria = ariaName(el);
    if (aria === 'named') continue;
    if (value(attr(el, 'title'))) continue;
    const label = isField ? labelName(markup, el) : null;
    if (label === 'named') continue;
    if (isFieldComponent) {
      out.push(unverified(`custom component <${el.tag}>: its label is not resolvable statically (component)`, at(markup, el, { key: `component|${key}` })));
      continue;
    }
    const idAttr = attr(el, 'id');
    const dynamic = aria === 'dynamic' || label === 'dynamic' || el.spread || (idAttr && idAttr.dynamic) || attr(el, 'title')?.dynamic;
    if (dynamic) {
      out.push(unverified('dynamic label or id: the field label is not resolvable statically', at(markup, el, { key: `dynamic|${key}` })));
      continue;
    }
    const reason = attr(el, 'placeholder')
      ? 'no label: a placeholder alone is not a label'
      : 'no label: add a label, aria-label or aria-labelledby';
    out.push(fail(key, at(markup, el, { reason })));
  }
  return out;
}

// ---- A11Y-26 -------------------------------------------------------------------------------

function check26(ctx) {
  const markup = ctx.markup;
  if (!markup) return [];
  const out = [];
  for (const el of markup.elements) {
    const key = keyOf(markup, el);
    if (el.component) {
      if (/^(Image|Img)$/.test(el.tag) && !attr(el, 'alt')) {
        out.push(unverified(`custom component <${el.tag}>: its alt text is not resolvable statically (component)`, at(markup, el, { key: `component|${key}` })));
      }
      continue;
    }
    if (el.tag === 'img') {
      if (attr(el, 'alt')) continue;
      if (el.spread) {
        out.push(unverified('spread props on img: alt is not resolvable statically (spread)', at(markup, el, { key: `spread|${key}` })));
      } else {
        out.push(fail(key, at(markup, el, { reason: 'img without alt attribute' })));
      }
    } else if (el.tag === 'svg' && value(attr(el, 'role')).toLowerCase() === 'img') {
      if (ariaName(el) !== null) continue;
      const title = descendants(markup, el).some((d) => d.tag === 'title' && !d.component
        && d.parent === el.index && d.textParts.some((p) => p.dynamic || p.text));
      if (title) continue;
      if (el.spread) {
        out.push(unverified('spread props on svg: its name is not resolvable statically (spread)', at(markup, el, { key: `spread|${key}` })));
      } else {
        out.push(fail(key, at(markup, el, { reason: 'svg role=img without a name: add aria-label, aria-labelledby or a title child' })));
      }
    }
  }
  return out;
}

// ---- A11Y-39 -------------------------------------------------------------------------------

function focusable(el) {
  if (el.component) return false;
  if (attr(el, 'disabled')) return false;
  const ti = attr(el, 'tabindex');
  if (ti && isStatic(ti) && Number.isFinite(Number(value(ti))) && Number(value(ti)) < 0) return false;
  if (el.tag === 'a') return !!attr(el, 'href');
  if (el.tag === 'input') return value(attr(el, 'type')).toLowerCase() !== 'hidden';
  if (['button', 'select', 'textarea'].includes(el.tag)) return true;
  if (ti && isStatic(ti) && value(ti) !== '' && Number.isFinite(Number(value(ti)))) return Number(value(ti)) >= 0;
  const ce = attr(el, 'contenteditable');
  return !!ce && value(ce).toLowerCase() !== 'false';
}

function check39(ctx) {
  const markup = ctx.markup;
  if (!markup) return [];
  const out = [];
  for (const el of markup.elements) {
    if (el.tag === 'body' && !el.component && isTrue(el, 'aria-hidden')) {
      out.push(fail('body|aria-hidden', at(markup, el, { reason: 'aria-hidden="true" on body hides the whole page' })));
      continue;
    }
    if (!focusable(el)) continue;
    if (hiddenByAria(markup, el)) {
      const own = isTrue(el, 'aria-hidden');
      out.push(fail(keyOf(markup, el), at(markup, el, { reason: own ? 'focusable element with aria-hidden="true"' : 'focusable element inside aria-hidden="true"' })));
    }
  }
  return out;
}

export const RULES = [
  { id: 'A11Y-04', checkFile: check04 },
  { id: 'A11Y-16', checkFile: check16 },
  { id: 'A11Y-26', checkFile: check26 },
  { id: 'A11Y-39', checkFile: check39 },
];
