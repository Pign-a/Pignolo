// Tolerant markup reader for HTML and JSX (spec §5.5). It builds an element tree with static
// and dynamic attributes and text; what it does not understand stays as text or dynamic.
// It never throws. Comments are stripped first (same length), so lines are the file's lines.
//
// parseMarkup(text, { syntax: 'html' | 'jsx' }) -> { elements, hasHtmlRoot, styles, exportsText }
//   elements[i] { index, tag, component, attrs: Map, spread, line, parent, children, textParts, selfClosing }
//     parent is the index of the parent element or null; children are indexes.
//     attrs: normalized name -> { value, dynamic, line }. value null = boolean attribute; for a
//     dynamic attribute value is the expression source (check `dynamic` first).
//     textParts: [{ text, dynamic, line }] of the direct content.
//     JSX elements written inside an attribute expression are detached (parent null).
//   styles: [{ text, line }] (line = file line where the content starts; walkCss wants line - 1
//     as lineOffset)
//   exportsText: JSX only, the text of `export const metadata|viewport = ...` or null
// staticText(markup, el, { skipAriaHidden }) -> { text, dynamic }
// ancestors(markup, el) (nearest first), descendants(markup, el) (document order)
import { stripComments } from './strip-comments.mjs';
import { lineIndex } from './token-sources.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const AUTO_CLOSE = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], option: ['option'], p: ['p'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'] };
const KEYWORDS = new Set(['return', 'typeof', 'case', 'default', 'else', 'in', 'of', 'do', 'yield', 'await', 'void', 'delete', 'new', 'instanceof', 'throw', 'extends']);
const WORD = /[A-Za-z0-9_$]/;
const JSX_START = /[A-Za-z_$>]/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const hidden = (target, key, value) => Object.defineProperty(target, key, { value, enumerable: false });

function decodeEntities(s) {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => {
    if (dec || hex) {
      const code = dec ? Number(dec) : parseInt(hex, 16);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

function createBuilder(src) {
  const lineAt = lineIndex(src);
  const elements = [];
  const styles = [];
  const el = (tag, component, offset, parent) => {
    const e = { index: elements.length, tag, component, attrs: new Map(), spread: false, line: lineAt(offset), parent: parent ? parent.index : null, children: [], textParts: [], selfClosing: false };
    hidden(e, 'offset', offset);
    elements.push(e);
    if (parent) parent.children.push(e.index);
    return e;
  };
  // raw text starting at `offset`; whitespace is normalized, whitespace-only text is dropped
  const addText = (e, raw, dynamic, offset) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const part = { text, dynamic, line: lineAt(offset + (raw.length - raw.trimStart().length)) };
    hidden(part, 'offset', offset);
    e.textParts.push(part);
  };
  return { lineAt, elements, styles, el, addText };
}

// ---- HTML ---------------------------------------------------------------------------------

function parseHtml(src, b) {
  const n = src.length;
  const stack = [];
  const top = () => stack[stack.length - 1] ?? null;
  let i = 0;

  function openTag() {
    const start = i;
    i++;
    const ns = i;
    while (i < n && /[^\s/>]/.test(src[i])) i++;
    const tag = src.slice(ns, i).toLowerCase();
    while (top() && AUTO_CLOSE[tag]?.includes(top().tag)) stack.pop();
    const e = b.el(tag, false, start, top());
    let closed = false;
    while (i < n) {
      while (i < n && /\s/.test(src[i])) i++;
      const c = src[i];
      if (c === '>') { i++; break; }
      if (c === '/') {
        if (src[i + 1] === '>') { closed = true; i += 2; break; }
        i++;
        continue;
      }
      const as = i;
      while (i < n && !/[\s=/>]/.test(src[i])) i++;
      if (i === as) { i++; continue; }
      const key = src.slice(as, i).toLowerCase();
      while (i < n && /\s/.test(src[i])) i++;
      let value = null;
      if (src[i] === '=') {
        i++;
        while (i < n && /\s/.test(src[i])) i++;
        const q = src[i];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, i + 1);
          const stop = end < 0 ? n : end;
          value = decodeEntities(src.slice(i + 1, stop));
          i = stop + 1;
        } else {
          const vs = i;
          while (i < n && !/[\s>]/.test(src[i])) i++;
          value = decodeEntities(src.slice(vs, i));
        }
      }
      if (!e.attrs.has(key)) e.attrs.set(key, { value, dynamic: false, line: b.lineAt(as) });
    }
    e.selfClosing = closed || VOID.has(tag);
    if (e.selfClosing) return;
    if (tag === 'script' || tag === 'style') {
      const closer = new RegExp(`</${tag}`, 'gi');
      closer.lastIndex = i;
      const m = closer.exec(src);
      const end = m ? m.index : n;
      const raw = src.slice(i, end);
      if (raw.length) {
        const part = { text: raw, dynamic: false, line: b.lineAt(i) };
        hidden(part, 'offset', i);
        e.textParts.push(part);
        if (tag === 'style') b.styles.push({ text: raw, line: b.lineAt(i) });
      }
      const gt = src.indexOf('>', end);
      i = gt < 0 ? n : gt + 1;
      return;
    }
    stack.push(e);
  }

  function closeTag() {
    i += 2;
    const ns = i;
    while (i < n && /[^\s>]/.test(src[i])) i++;
    const tag = src.slice(ns, i).toLowerCase();
    const gt = src.indexOf('>', i);
    i = gt < 0 ? n : gt + 1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].tag === tag) { stack.length = k; return; }
    }
  }

  while (i < n) {
    if (src[i] === '<') {
      const nx = src[i + 1] ?? '';
      if (/[A-Za-z]/.test(nx)) { openTag(); continue; }
      if (nx === '/' && /[A-Za-z]/.test(src[i + 2] ?? '')) { closeTag(); continue; }
      if (nx === '!' || nx === '?') {
        const gt = src.indexOf('>', i);
        i = gt < 0 ? n : gt + 1;
        continue;
      }
    }
    const ts = i;
    i++;
    while (i < n && !(src[i] === '<' && /[A-Za-z/!?]/.test(src[i + 1] ?? ''))) i++;
    if (top()) b.addText(top(), decodeEntities(src.slice(ts, i)), false, ts);
  }
}

// ---- JSX ----------------------------------------------------------------------------------

const STRING_LITERAL = /^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")$/s;
const TEMPLATE_LITERAL = /^`((?:[^`$\\]|\\.|\$(?!\{))*)`$/s;

const LITERAL = /^(?:-?\d+(?:\.\d+)?|true|false)$/;

// Static when the expression is one string literal (or a template without ${}), a number
// literal or true/false (the value is kept as text: {-1} -> '-1', {true} -> 'true').
function classifyExpr(expr) {
  const t = expr.trim();
  if (LITERAL.test(t)) return { value: t, dynamic: false };
  const s = STRING_LITERAL.exec(t);
  if (s) return { value: s[1] ?? s[2], dynamic: false };
  const tpl = TEMPLATE_LITERAL.exec(t);
  if (tpl) return { value: tpl[1], dynamic: false };
  return { value: t, dynamic: true };
}

function normalizeJsxAttr(name) {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  return name.toLowerCase();
}

function parseJsx(src, b) {
  const n = src.length;
  let i = 0;

  function skipQuote() {
    const q = src[i++];
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      i++;
      if (c === q || c === '\n') return;
    }
  }

  function skipTemplate(parent) {
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        scanJs(parent);
        if (src[i] === '}') i++;
        continue;
      }
      i++;
    }
  }

  function skipRegex() {
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const c = src[j];
      if (c === '\n') return false;
      if (c === '\\') { j += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        i = j;
        return true;
      }
      j++;
    }
    return false;
  }

  // Scans JavaScript until an unmatched "}" (left in place) or the end. JSX elements found on
  // the way are parsed with `parent` (null = detached).
  function scanJs(parent) {
    let depth = 0;
    let prevEnd = false;
    let prevElem = false; // the previous token is a JSX element (adjacent siblings)
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const wasElem = prevElem;
      prevElem = false;
      if (c === '"' || c === "'") { skipQuote(); prevEnd = true; continue; }
      if (c === '`') { skipTemplate(parent); prevEnd = true; continue; }
      if (c === '{') { depth++; i++; prevEnd = false; continue; }
      if (c === '}') {
        if (depth === 0) return;
        depth--; i++; prevEnd = false; continue;
      }
      if (c === '/' && !prevEnd && skipRegex()) { prevEnd = true; continue; }
      if (c === '<' && (!prevEnd || wasElem) && JSX_START.test(src[i + 1] ?? '')) { parseElement(parent); prevEnd = true; prevElem = true; continue; }
      if (WORD.test(c)) {
        let j = i;
        while (j < n && WORD.test(src[j])) j++;
        prevEnd = !KEYWORDS.has(src.slice(i, j));
        i = j;
        continue;
      }
      if (c === ')' || c === ']') prevEnd = true;
      else if (!/\s/.test(c)) prevEnd = false;
      i++;
    }
  }

  // "{" already consumed: returns the expression source and its offset; consumes the "}".
  function expression(parent) {
    const start = i;
    scanJs(parent);
    const expr = src.slice(start, i);
    if (src[i] === '}') i++;
    return { expr, start };
  }

  function parseElement(parent) {
    const start = i;
    i++;
    if (src[i] === '>') { i++; parseChildren(parent); return; }
    const ns = i;
    while (i < n && /[\w$.:-]/.test(src[i])) i++;
    const name = src.slice(ns, i);
    const component = /^[A-Z]/.test(name) || name.includes('.');
    const e = b.el(component ? name : name.toLowerCase(), component, start, parent);
    while (i < n) {
      while (i < n && /\s/.test(src[i])) i++;
      const c = src[i];
      if (c === '/' && src[i + 1] === '>') { i += 2; e.selfClosing = true; return; }
      if (c === '>') { i++; break; }
      if (c === '{') {
        i++;
        const { expr } = expression(null);
        if (expr.trimStart().startsWith('...')) e.spread = true;
        continue;
      }
      if (c === '/') { i++; continue; }
      const as = i;
      while (i < n && !/[\s=/>{}"']/.test(src[i])) i++;
      if (i === as) { i++; continue; }
      const key = normalizeJsxAttr(src.slice(as, i));
      while (i < n && /\s/.test(src[i])) i++;
      // a bare JSX attribute is {true}; only aria-* take it as the text 'true' (React renders
      // aria-hidden as aria-hidden="true"), the rest keep null like HTML boolean attributes
      let value = key.startsWith('aria-') ? 'true' : null;
      let dynamic = false;
      if (src[i] === '=') {
        i++;
        while (i < n && /\s/.test(src[i])) i++;
        const q = src[i];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, i + 1);
          const stop = end < 0 ? n : end;
          value = src.slice(i + 1, stop);
          i = stop + 1;
        } else if (q === '{') {
          i++;
          ({ value, dynamic } = classifyExpr(expression(null).expr));
        } else {
          const vs = i;
          while (i < n && !/[\s>]/.test(src[i])) i++;
          value = src.slice(vs, i);
        }
      }
      if (!e.attrs.has(key)) e.attrs.set(key, { value, dynamic, line: b.lineAt(as) });
    }
    parseChildren(e);
  }

  function parseChildren(parent) {
    const isStyle = Boolean(parent) && !parent.component && parent.tag === 'style';
    while (i < n) {
      const c = src[i];
      if (c === '<') {
        if (src[i + 1] === '/') {
          while (i < n && src[i] !== '>') i++;
          i++;
          return;
        }
        if (JSX_START.test(src[i + 1] ?? '')) { parseElement(parent); continue; }
      }
      if (c === '{') {
        i++;
        const { expr, start } = expression(parent);
        const lead = expr.length - expr.trimStart().length;
        if (!expr.trim() || !parent) continue;
        const cls = classifyExpr(expr);
        if (isStyle) {
          if (!cls.dynamic) b.styles.push({ text: cls.value, line: b.lineAt(start + lead + 1) });
        } else if (!cls.dynamic) {
          b.addText(parent, cls.value, false, start + lead + 1);
        } else {
          b.addText(parent, expr.trim(), true, start + lead);
        }
        continue;
      }
      const ts = i;
      i++;
      while (i < n && src[i] !== '{' && !(src[i] === '<' && (src[i + 1] === '/' || JSX_START.test(src[i + 1] ?? '')))) i++;
      if (!parent) continue;
      const raw = src.slice(ts, i);
      if (isStyle) {
        if (raw.trim()) b.styles.push({ text: raw, line: b.lineAt(ts) });
      } else {
        b.addText(parent, raw, false, ts);
      }
    }
  }

  while (i < n) {
    scanJs(null);
    if (i < n) i++; // a stray "}" at the top level
  }
}

// Text of `export const metadata|viewport = ...` up to its `;` or the end of its object.
function exportsOf(src) {
  const parts = [];
  const re = /^[ \t]*export\s+const\s+(?:metadata|viewport)\b/gm;
  let m;
  while ((m = re.exec(src))) {
    const end = statementEnd(src, m.index + m[0].length);
    parts.push(src.slice(m.index, end).trim());
    re.lastIndex = Math.max(end, re.lastIndex);
  }
  return parts.length ? parts.join('\n') : null;
}

function statementEnd(src, from) {
  const n = src.length;
  let depth = 0;
  let opened = false;
  let sawEq = false;
  let i = from;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (c === '=' && depth === 0) sawEq = true;
    else if (c === '(' || c === '{' || c === '[') { if (sawEq) opened = true; depth++; }
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth < 0) return i;
      if (depth === 0 && opened) {
        let j = i + 1;
        while (j < n && /[ \t]/.test(src[j])) j++;
        return src[j] === ';' ? j + 1 : i + 1;
      }
    } else if (c === ';' && depth === 0) return i + 1;
    else if (c === '\n' && depth === 0 && sawEq && !opened) return i;
    i++;
  }
  return n;
}

export function parseMarkup(text, { syntax = 'html' } = {}) {
  const raw = String(text ?? '').replace(/^[\u{FEFF}]/u, ' ');
  let src = raw;
  const empty = () => ({ elements: [], hasHtmlRoot: false, styles: [], exportsText: null });
  try {
    src = stripComments(raw, syntax === 'jsx' ? 'jsx' : 'html');
  } catch {
    return empty();
  }
  const b = createBuilder(src);
  try {
    if (syntax === 'jsx') parseJsx(src, b); else parseHtml(src, b);
  } catch {
    // partial tree: whatever was understood before the failure
  }
  let exportsText = null;
  if (syntax === 'jsx') {
    try { exportsText = exportsOf(src); } catch { exportsText = null; }
  }
  return {
    elements: b.elements,
    hasHtmlRoot: b.elements.some((e) => e.tag === 'html' && !e.component),
    styles: b.styles,
    exportsText,
  };
}

// ---- helpers ------------------------------------------------------------------------------

export function ancestors(markup, el) {
  const out = [];
  let p = el.parent;
  while (p !== null && p !== undefined) {
    const e = markup.elements[p];
    if (!e) break;
    out.push(e);
    p = e.parent;
  }
  return out;
}

export function descendants(markup, el) {
  const out = [];
  const visit = (e) => {
    for (const idx of e.children) {
      const child = markup.elements[idx];
      out.push(child);
      visit(child);
    }
  };
  visit(el);
  return out;
}

// Normalized text of the whole subtree. dynamic is true when a text part or a child component
// cannot be resolved. script/style content is not text. The root itself may be a component.
export function staticText(markup, el, { skipAriaHidden = false } = {}) {
  const pieces = [];
  let dynamic = false;
  const visit = (e, isRoot) => {
    if (!isRoot) {
      if (skipAriaHidden) {
        const a = e.attrs.get('aria-hidden');
        if (a && !a.dynamic && a.value === 'true') return;
      }
      if (e.component) { dynamic = true; return; }
    }
    if (e.tag === 'script' || e.tag === 'style') return;
    const items = [
      ...e.textParts.map((part) => ({ at: part.offset ?? 0, part })),
      ...e.children.map((idx) => ({ at: markup.elements[idx].offset ?? 0, child: markup.elements[idx] })),
    ].sort((x, y) => x.at - y.at);
    for (const item of items) {
      if (item.child) visit(item.child, false);
      else if (item.part.dynamic) dynamic = true;
      else pieces.push(item.part.text);
    }
  };
  visit(el, true);
  return { text: pieces.join(' ').replace(/\s+/g, ' ').trim(), dynamic };
}
