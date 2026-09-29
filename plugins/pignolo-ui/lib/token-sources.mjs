// Token sources that already exist in a project (spec §4.5). pignolo-ui reads them and
// never creates a second one. Reading never executes project code:
//   - CSS variables in :root, .dark, [data-theme] (css-vars)
//   - Tailwind v4 @theme / @theme inline blocks (tailwind-v4)
//   - shadcn: the CSS named by components.json, bare HSL included (shadcn)
//   - Tailwind v3 tailwind.config.*: only a literal theme object; otherwise unverified
//   - CSS-in-JS, MUI and Chakra themes: declared unsupported
//
// readTokenSources(root) -> { sources, unsupported, unverified, darkDetected }
// scanCss(text) -> { blocks, dark }        parseTailwindConfig(text) -> { ok, theme, leaves } | { ok: false, reason }
//
// Writes (v1): setCssVar edits a variable inside an existing block; replaceTailwindLiteral
// replaces an existing literal value. Neither creates a block, a key or a new source.
import fs from 'node:fs';
import path from 'node:path';
import { detectFormat, formatColor } from './color.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage', '.pignolo-ui', '.turbo', '.cache']);
const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
const UNSUPPORTED_DEPS = {
  '@mui/material': 'mui',
  '@chakra-ui/react': 'chakra',
  'styled-components': 'css-in-js',
  '@emotion/react': 'css-in-js',
  '@emotion/styled': 'css-in-js',
  '@stitches/react': 'css-in-js',
  '@vanilla-extract/css': 'css-in-js',
};
const THEME_AT_RULE = /^@theme(\s+(inline|static|reference))*$/;
const TOKEN_SELECTOR = /^(:root|html|:host|\.dark|\.light|(:root|html)(\.dark|\.light)|(:root|html)?\[data-theme(=(["']?)[\w-]+\6)?\])$/;
const DARK_PRELUDE = /\.dark(?![\w-])|\[data-theme|prefers-color-scheme\s*:\s*dark/;

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Same length as the input: comments become spaces (newlines kept), strings untouched.
export function blankComments(text, { js = false } = {}) {
  const out = text.split('');
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || (js && c === '`')) { quote = c; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (let j = i; j < stop; j++) if (out[j] !== '\n' && out[j] !== '\r') out[j] = ' ';
      i = stop - 1;
    } else if (js && c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') out[j++] = ' ';
      i = j - 1;
    }
  }
  return out.join('');
}

function themeOf(selector, context) {
  if (THEME_AT_RULE.test(selector)) return 'light';
  const attr = /\[data-theme=(["']?)([\w-]+)\1\]/.exec(selector);
  if (attr) return attr[2];
  if (/\.dark(?![\w-])/.test(selector)) return 'dark';
  if (context.some((c) => /prefers-color-scheme\s*:\s*dark/.test(c))) return 'dark';
  return 'light';
}

function isTokenBlock(selector) {
  if (THEME_AT_RULE.test(selector)) return true;
  return selector.split(',').every((part) => TOKEN_SELECTOR.test(part.trim()));
}

export function scanCss(text) {
  const src = blankComments(text);
  const lineAt = lineIndex(text);
  const blocks = [];
  const stack = [];
  let dark = false;
  let seg = 0;
  let paren = 0;
  let quote = null;

  const decl = (start, end) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    const raw = src.slice(start, end);
    const m = /^(\s*)(--[A-Za-z0-9_-]+)(\s*:\s*)([\s\S]*?)\s*$/.exec(raw);
    if (!m) return;
    const nameStart = start + m[1].length;
    const valueStart = nameStart + m[2].length + m[3].length;
    const value = m[4].replace(/\s+/g, ' ').trim();
    top.vars.push({ name: m[2], value, line: lineAt(nameStart), valueStart, valueEnd: valueStart + m[4].length });
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(') { paren++; continue; }
    if (c === ')') { if (paren > 0) paren--; continue; }
    if (paren > 0) continue;
    if (c === '{') {
      const rawPrelude = src.slice(seg, i);
      const lead = rawPrelude.length - rawPrelude.trimStart().length;
      const selector = rawPrelude.replace(/\s+/g, ' ').trim();
      if (DARK_PRELUDE.test(selector)) dark = true;
      stack.push({ selector, context: stack.map((b) => b.selector), line: lineAt(seg + lead), open: i, vars: [] });
      seg = i + 1;
    } else if (c === ';') {
      decl(seg, i);
      seg = i + 1;
    } else if (c === '}') {
      decl(seg, i);
      const b = stack.pop();
      if (b && isTokenBlock(b.selector)) {
        blocks.push({ selector: b.selector, context: b.context, theme: themeOf(b.selector, b.context), line: b.line, endLine: lineAt(i), open: b.open, close: i, vars: b.vars });
      }
      seg = i + 1;
    }
  }
  blocks.sort((a, b) => a.open - b.open);
  return { blocks, dark };
}

// ---- Tailwind v3 config: literal object reader, never executes anything -------------------

class NotLiteral extends Error {}

class JsLiteral {
  constructor(src, text) {
    this.src = src;
    this.text = text;
    this.lineAt = lineIndex(text);
    this.leaves = [];
    this.nonLiteral = [];
  }

  ws(i) {
    while (i < this.src.length && /\s/.test(this.src[i])) i++;
    return i;
  }

  // Skips any expression up to a depth-0 , } ] or ).
  skip(i) {
    let depth = 0;
    let quote = null;
    for (; i < this.src.length; i++) {
      const c = this.src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if ('{[('.includes(c)) depth++;
      else if ('}])'.includes(c)) {
        if (depth === 0) return i;
        depth--;
      } else if (c === ',' && depth === 0) return i;
    }
    return i;
  }

  string(i) {
    const q = this.src[i];
    let out = '';
    for (let j = i + 1; j < this.src.length; j++) {
      const c = this.src[j];
      if (c === '\\') { out += this.src[j + 1]; j++; continue; }
      if (q === '`' && c === '$' && this.src[j + 1] === '{') throw new NotLiteral('template with ${}');
      if (c === q) return { value: out, end: j + 1 };
      out += c;
    }
    throw new NotLiteral('unterminated string');
  }

  value(i, p) {
    i = this.ws(i);
    const c = this.src[i];
    if (c === '{') return this.object(i, p);
    if (c === '[') return this.array(i, p);
    try {
      if (c === '"' || c === "'" || c === '`') {
        const s = this.string(i);
        this.leaves.push({ path: p, value: s.value, line: this.lineAt(i), start: i, end: s.end, quote: c });
        return { value: s.value, end: s.end };
      }
    } catch (e) {
      if (!(e instanceof NotLiteral)) throw e;
      this.nonLiteral.push({ path: p, what: e.message });
      return { value: undefined, end: this.skip(i + 1) };
    }
    const num = /^-?(\d+\.?\d*|\.\d+)(?![\w$])/.exec(this.src.slice(i));
    if (num) {
      this.leaves.push({ path: p, value: Number(num[0]), line: this.lineAt(i), start: i, end: i + num[0].length, quote: null });
      return { value: Number(num[0]), end: i + num[0].length };
    }
    const kw = /^(true|false|null)(?![\w$])/.exec(this.src.slice(i));
    if (kw) return { value: JSON.parse(kw[1]), end: i + kw[1].length };
    const end = this.skip(i);
    this.nonLiteral.push({ path: p, what: `expression "${this.src.slice(i, end).trim().slice(0, 40)}"` });
    return { value: undefined, end };
  }

  object(i, p) {
    const obj = {};
    i = this.ws(i + 1);
    while (this.src[i] !== '}') {
      if (i >= this.src.length) throw new NotLiteral('unterminated object');
      if (this.src.startsWith('...', i)) {
        const end = this.skip(i + 3);
        this.nonLiteral.push({ path: p, what: 'spread' });
        i = end;
      } else {
        let key;
        const c = this.src[i];
        if (c === '"' || c === "'") {
          const s = this.string(i);
          key = s.value;
          i = s.end;
        } else {
          const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(this.src.slice(i));
          if (!m) {
            const end = this.skip(i);
            this.nonLiteral.push({ path: p, what: 'computed or unknown key' });
            i = end;
            if (this.src[i] === ',') i = this.ws(i + 1);
            continue;
          }
          key = m[0];
          i += key.length;
        }
        i = this.ws(i);
        if (this.src[i] === ':') {
          const v = this.value(i + 1, [...p, key]);
          if (v.value !== undefined) obj[key] = v.value;
          i = this.ws(v.end);
        } else {
          this.nonLiteral.push({ path: [...p, key], what: 'shorthand or method' });
          i = this.skip(i);
        }
      }
      i = this.ws(i);
      if (this.src[i] === ',') i = this.ws(i + 1);
      else if (this.src[i] !== '}') throw new NotLiteral(`unexpected "${this.src[i]}"`);
    }
    return { value: obj, end: i + 1 };
  }

  array(i, p) {
    const arr = [];
    i = this.ws(i + 1);
    while (this.src[i] !== ']') {
      if (i >= this.src.length) throw new NotLiteral('unterminated array');
      const v = this.value(i, [...p, arr.length]);
      arr.push(v.value);
      i = this.ws(v.end);
      if (this.src[i] === ',') i = this.ws(i + 1);
      else if (this.src[i] !== ']') throw new NotLiteral(`unexpected "${this.src[i]}"`);
    }
    return { value: arr, end: i + 1 };
  }
}

export function parseTailwindConfig(text) {
  const src = blankComments(String(text), { js: true });
  const m = /module\.exports\s*=\s*|export\s+default\s+/.exec(src);
  if (!m) return { ok: false, reason: 'no module.exports or export default' };
  let start = m.index + m[0].length;
  if (src[start] !== '{') {
    const id = /^([A-Za-z_$][\w$]*)\s*(;|$|\n)/.exec(src.slice(start));
    const decl = id && new RegExp(`(?:const|let|var)\\s+${id[1].replace(/\$/g, '\\$')}\\s*(?::\\s*[\\w.<>\\[\\]]+\\s*)?=\\s*\\{`).exec(src);
    if (!decl) return { ok: false, reason: 'the exported config is not an object literal' };
    start = decl.index + decl[0].length - 1;
  }
  const reader = new JsLiteral(src, String(text));
  let root;
  try {
    root = reader.object(start, []).value;
  } catch (e) {
    if (e instanceof NotLiteral) return { ok: false, reason: `config is not a literal (${e.message})` };
    throw e;
  }
  const bad = reader.nonLiteral.find((n) => n.path.length === 0 || n.path[0] === 'theme');
  if (bad) return { ok: false, reason: `theme is not a literal at "${bad.path.join('.') || '(root)'}": ${bad.what}` };
  const leaves = reader.leaves
    .filter((l) => l.path[0] === 'theme' && l.path.length > 1)
    .map((l) => ({ ...l, path: l.path.slice(1) }));
  return { ok: true, theme: root.theme || {}, leaves };
}

// ---- project scan -----------------------------------------------------------------------

export function listCss(root, max) {
  const out = [];
  let truncated = false;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= max) { truncated = true; return; }
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || rel === 'design/approved') continue;
        walk(full);
      } else if (ent.name.endsWith('.css')) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return { files: out.sort(), truncated };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function readTokenSources(root, { maxFiles = 2000 } = {}) {
  const sources = [];
  const unsupported = [];
  const unverified = [];
  let darkDetected = false;

  const components = readJson(path.join(root, 'components.json'));
  const shadcnCss = components && components.tailwind && typeof components.tailwind.css === 'string'
    ? path.posix.normalize(components.tailwind.css.replace(/\\/g, '/').replace(/^\.\//, ''))
    : null;

  const { files, truncated } = listCss(root, maxFiles);
  if (truncated) unverified.push({ kind: 'css', file: '.', reason: `more than ${maxFiles} CSS files; scan truncated` });
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
    const scan = scanCss(text);
    darkDetected ||= scan.dark;
    const theme = scan.blocks.filter((b) => THEME_AT_RULE.test(b.selector));
    const vars = scan.blocks.filter((b) => !THEME_AT_RULE.test(b.selector));
    if (vars.length) {
      const src = { kind: file === shadcnCss ? 'shadcn' : 'css-vars', file, blocks: vars };
      if (src.kind === 'shadcn') src.baseColor = components.tailwind.baseColor ?? null;
      sources.push(src);
    }
    if (theme.length) sources.push({ kind: 'tailwind-v4', file, blocks: theme });
  }

  for (const name of TAILWIND_CONFIGS) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    const r = parseTailwindConfig(fs.readFileSync(full, 'utf8'));
    if (r.ok) sources.push({ kind: 'tailwind-v3', file: name, theme: r.theme, leaves: r.leaves });
    else unverified.push({ kind: 'tailwind-v3', file: name, reason: r.reason });
  }

  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const seen = new Set();
    for (const [dep, kind] of Object.entries(UNSUPPORTED_DEPS)) {
      if (deps[dep] === undefined || seen.has(kind)) continue;
      seen.add(kind);
      unsupported.push({ kind, file: 'package.json', reason: `${dep}: tokens that live in JavaScript are not supported` });
    }
  }

  return { sources, unsupported, unverified, darkDetected };
}

// ---- writes ------------------------------------------------------------------------------

// True when a quote opened in `s` is never closed (a CSS string would swallow the block).
function hasOpenQuote(s) {
  let q = null;
  for (const c of s) {
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
  }
  return q !== null;
}

// Offset just after the last declaration's last character in text[from, to) when a ';' must
// be added before appending (comments and whitespace ignored); null when it is not needed.
function semicolonPos(text, from, to) {
  const masked = text.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).trimEnd();
  if (!masked || masked.endsWith(';') || masked.endsWith('}')) return null;
  return from + masked.length;
}

// Sets `name: value` inside the first token block whose selector equals `selector`
// (':root', '.dark', '@theme', '@theme inline'...). Only the value span or one new line
// changes; a missing block is refused (never a second source).
export function setCssVar(text, { selector, name, value }) {
  if (!/^--[A-Za-z0-9_-]+$/.test(name || '')) return { ok: false, reason: 'invalid-name' };
  if (typeof value !== 'string' || !value.trim() || /[;{}\r\n\\]|\/\*|\*\//.test(value) || hasOpenQuote(value)) return { ok: false, reason: 'invalid-value' };
  const want = String(selector).replace(/\s+/g, ' ').trim();
  const block = scanCss(text).blocks.find((b) => b.selector === want);
  if (!block) return { ok: false, reason: 'block-not-found' };
  const lineAt = lineIndex(text);
  const existing = block.vars.find((v) => v.name === name);
  if (existing) {
    const before = text.slice(existing.valueStart, existing.valueEnd);
    return { ok: true, text: text.slice(0, existing.valueStart) + value + text.slice(existing.valueEnd), line: existing.line, before, after: value };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const closeLineStart = text.lastIndexOf('\n', block.close - 1) + 1;
  const beforeClose = text.slice(closeLineStart, block.close);
  const last = block.vars[block.vars.length - 1];
  if (closeLineStart > block.open && /^[ \t]*$/.test(beforeClose)) {
    let indent = `${beforeClose}  `;
    if (last) {
      const ls = text.lastIndexOf('\n', last.valueStart) + 1;
      indent = /^[ \t]*/.exec(text.slice(ls))[0];
    }
    const semi = semicolonPos(text, block.open + 1, closeLineStart);
    const head = semi === null ? text.slice(0, closeLineStart) : `${text.slice(0, semi)};${text.slice(semi, closeLineStart)}`;
    const out = `${head}${indent}${name}: ${value};${eol}${text.slice(closeLineStart)}`;
    return { ok: true, text: out, line: lineAt(closeLineStart), before: null, after: value };
  }
  const semi = semicolonPos(text, block.open + 1, block.close);
  const at = block.open + 1 + text.slice(block.open + 1, block.close).trimEnd().length;
  const head = semi === null ? text.slice(0, at) : `${text.slice(0, semi)};${text.slice(semi, at)}`;
  const out = `${head} ${name}: ${value}; ${text.slice(block.close)}`;
  return { ok: true, text: out, line: lineAt(block.open), before: null, after: value };
}

const WRITABLE_FORMATS = { hex: 'hex', rgb: 'rgb', hsl: 'hsl', 'hsl-bare': 'hsl-bare', oklch: 'oklch' };

// Writes `rgba` in the notation of `sample` (shadcn bare HSL stays bare HSL). null when
// that notation is not one pignolo-ui writes (var(), color-mix(), lab()...).
export function formatLike(sample, rgba) {
  const f = WRITABLE_FORMATS[detectFormat(sample)];
  return f ? formatColor(rgba, f) : null;
}

function quoteJs(s, q) {
  let body = s.replace(/\\/g, '\\\\').split(q).join(`\\${q}`);
  if (q === '`') body = body.replace(/\$\{/g, '\\${');
  return `${q}${body}${q}`;
}

// Replaces one literal value of a literal Tailwind v3 theme; never adds keys.
export function replaceTailwindLiteral(text, keyPath, newValue) {
  const r = parseTailwindConfig(text);
  if (!r.ok) return { ok: false, reason: `unverified: ${r.reason}` };
  if (/[\r\n\u2028\u2029]/.test(String(newValue))) return { ok: false, reason: 'invalid-value' };
  const leaf = r.leaves.find((l) => l.path.length === keyPath.length && l.path.every((p, i) => String(p) === String(keyPath[i])));
  if (!leaf) return { ok: false, reason: 'not-a-literal-value' };
  const lit = typeof newValue === 'number' && !leaf.quote ? String(newValue) : quoteJs(String(newValue), leaf.quote || "'");
  return { ok: true, text: text.slice(0, leaf.start) + lit + text.slice(leaf.end), line: leaf.line, before: leaf.value, after: newValue };
}
