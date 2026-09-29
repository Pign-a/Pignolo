// Tailwind utility classes read from markup (spec §5.5): the rules of style also look at the
// class/className attributes.
//
// extractClassLists(markup) -> [{ element, line, classes, dynamic }]
//   element is the markup element (from parseMarkup); classes[i] = { raw, variants, base, arbitrary, line }
//   "focus-visible:ring-2" -> variants ['focus-visible'], base 'ring-2'
//   "rounded-[6px]"        -> base 'rounded', arbitrary '6px'  ("_" in an arbitrary value is a space)
//   Every occurrence counts (no deduplication). With cn("a b", cond && "c", x) the string
//   literals are read and the list is marked dynamic; a token touching a ${...} is dropped.
// extractClassListsFromSfc(text) -> same shape with element null, from .vue/.svelte text:
//   class="..." (static), :class / v-bind:class / class={...} (dynamic) and class:name (dynamic).
import { stripComments } from './strip-comments.mjs';

function splitTopLevel(raw, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of raw) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function parseClass(raw, line) {
  const parts = splitTopLevel(raw, ':');
  const variants = parts.slice(0, -1);
  let base = parts[parts.length - 1].replace(/^!/, '').replace(/!$/, '');
  let arbitrary = null;
  const m = /^(.*?)-?\[(.*)\](\/[\w.]+)?$/.exec(base);
  if (m) {
    base = m[1];
    arbitrary = m[2].replace(/_/g, ' ');
  }
  return { raw, variants, base, arbitrary, line };
}

// Tokens of a class string; `lineOf(index)` gives the line of the token starting at `index`.
function tokens(text, baseLine, { dropFirst = false, dropLast = false } = {}) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    out.push({ raw: m[0], line: baseLine + (text.slice(0, m.index).match(/\n/g) ?? []).length, start: m.index, end: m.index + m[0].length });
  }
  if (dropFirst && out.length && out[0].start === 0) out.shift();
  if (dropLast && out.length && out[out.length - 1].end === text.length) out.pop();
  return out;
}

// Static pieces of a JS/template expression: string literals and the text parts of templates.
function literalTokens(expr, baseLine) {
  const out = [];
  const lineAt = (idx) => baseLine + (expr.slice(0, idx).match(/\n/g) ?? []).length;
  let i = 0;
  const n = expr.length;
  const readString = (q) => {
    const start = i + 1;
    i++;
    while (i < n && expr[i] !== q) { if (expr[i] === '\\') i++; i++; }
    out.push(...tokens(expr.slice(start, i), lineAt(start)));
    i++;
  };
  const readTemplate = () => {
    i++;
    let start = i;
    let first = true;
    const flush = (end, more) => {
      out.push(...tokens(expr.slice(start, end), lineAt(start), { dropFirst: !first, dropLast: more }));
    };
    while (i < n && expr[i] !== '`') {
      if (expr[i] === '\\') { i += 2; continue; }
      if (expr[i] === '$' && expr[i + 1] === '{') {
        flush(i, true);
        let depth = 0;
        i += 2;
        while (i < n) {
          if (expr[i] === '{') depth++;
          else if (expr[i] === '}') { if (depth === 0) break; depth--; }
          i++;
        }
        i++;
        start = i;
        first = false;
        continue;
      }
      i++;
    }
    flush(Math.min(i, n), false);
    i++;
  };
  while (i < n) {
    const c = expr[i];
    if (c === '"' || c === "'") readString(c);
    else if (c === '`') readTemplate();
    else i++;
  }
  return out;
}

export function extractClassLists(markup) {
  const out = [];
  for (const el of markup.elements) {
    const attr = el.attrs.get('class');
    if (!attr) continue;
    const raw = attr.value ?? '';
    const list = attr.dynamic ? literalTokens(raw, attr.line) : tokens(raw, attr.line);
    out.push({ element: el, line: attr.line, classes: list.map((t) => parseClass(t.raw, t.line)), dynamic: attr.dynamic });
  }
  return out;
}

export function extractClassListsFromSfc(text) {
  let src = stripComments(String(text ?? '').replace(/^[\u{FEFF}]/u, ' '), 'html');
  // script and style content is not markup
  src = src.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (m) => m.replace(/[^\r\n]/g, ' '));
  const lineOf = (idx) => 1 + (src.slice(0, idx).match(/\n/g) ?? []).length;
  const out = [];
  const re = /(?<![\w:@.-])(class|:class|v-bind:class|class:([\w-]+))(?=\s*[=\s>/])(\s*=\s*)?/g;
  let m;
  while ((m = re.exec(src))) {
    const line = lineOf(m.index);
    const directive = m[2];
    let i = m.index + m[0].length;
    if (directive) {
      // class:name={cond} or shorthand class:name
      out.push({ element: null, line, classes: [parseClass(directive, line)], dynamic: true });
      if (m[3] && src[i] === '{') i = skipBraces(src, i);
      re.lastIndex = i;
      continue;
    }
    if (!m[3]) continue;
    const q = src[i];
    let value;
    if (q === '"' || q === "'") {
      const end = src.indexOf(q, i + 1);
      value = src.slice(i + 1, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end + 1;
    } else if (q === '{') {
      const end = skipBraces(src, i);
      value = src.slice(i + 1, end - 1);
      i = end;
    } else continue;
    re.lastIndex = i;
    const wholeDynamic = m[1] !== 'class' || q === '{';
    if (wholeDynamic) {
      out.push({ element: null, line, classes: literalTokens(value, line).map((t) => parseClass(t.raw, t.line)), dynamic: true });
    } else if (/\{[^}]*\}/.test(value)) {
      // svelte: class="a {b} c" -> static pieces around the interpolations
      const list = [];
      let from = 0;
      const holes = [...value.matchAll(/\{[^}]*\}/g)];
      for (let k = 0; k <= holes.length; k++) {
        const to = k < holes.length ? holes[k].index : value.length;
        const piece = value.slice(from, to);
        list.push(...tokens(piece, line + (value.slice(0, from).match(/\n/g) ?? []).length, { dropFirst: k > 0, dropLast: k < holes.length }));
        if (k < holes.length) from = holes[k].index + holes[k][0].length;
      }
      out.push({ element: null, line, classes: list.map((t) => parseClass(t.raw, t.line)), dynamic: true });
    } else {
      out.push({ element: null, line, classes: tokens(value, line).map((t) => parseClass(t.raw, t.line)), dynamic: false });
    }
  }
  return out;
}

// Index just past the "}" that matches the "{" at `from`.
function skipBraces(src, from) {
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
    } else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return src.length;
}
