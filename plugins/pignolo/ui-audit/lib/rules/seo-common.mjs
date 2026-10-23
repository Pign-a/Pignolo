// Shared pieces of the static SEO rules (spec §5.4, A-06): the web.public gate, the pages to
// check (documents among the inputs and pages fetched from the development URL) and a reader
// of literal values in a Next.js `export const metadata = { ... }` object.
//
// seoGate(pctx) -> null when the rules run, else the one finding each SEO rule returns; its
//   pass carries measure { applicable: false }, so report-check never accepts a claim based on it
// seoPages(pctx) -> [{ file, origin: 'file'|'dom'|'url', syntax, markup, text, headers, skip }]
//   documents among the inputs, JSX files with Next.js metadata (pages and layouts) and the
//   fetched pages. skip = reason (string) when the page cannot be checked; mockups never count
//   (spec §3.3). Computed once per pctx (the seven rules share it); callers must not change it.
// seoMarkupInputs(pctx) -> same shape: every input with markup (components too) and the fetched
//   pages, for rules on elements (SEO-09).
// isNextRoute(file) -> 'root' | 'nested' | null: a Next.js page or layout file (app/ or pages/,
//   optionally under src/); 'root' is the root layout, the home (route groups ignored) and pages/_app,
//   _document and index.
// metadataObject(ctx) -> { dynamic: true } | { text } | null   (JSX files only)
// prop(objText, key) -> { kind: 'string'|'literal'|'object'|'array'|'dynamic', value?, text? } | null
//   Only keys at the first level of objText (which starts with `{`) are found.
// staticAttr(el, name) -> string | null (null when absent, dynamic or boolean)
import fs from 'node:fs';
import { pass, unverified } from './api.mjs';
import { parseMarkup } from '../markup.mjs';
import { stripComments } from '../strip-comments.mjs';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function webOf(design) {
  const pig = design && isMap(design.data) && isMap(design.data.pignolo) ? design.data.pignolo : null;
  return pig && isMap(pig.web) ? pig.web : null;
}

const hasDesignFile = (project) => {
  try { return fs.readdirSync(project).some((n) => n.toLowerCase() === 'design.md'); } catch { return false; }
};

export function seoGate(pctx) {
  if (!pctx.design) {
    const reason = pctx.project && hasDesignFile(pctx.project)
      ? 'DESIGN.md not given: pass --design to check static SEO'
      : 'no DESIGN.md: the site is not declared public (static SEO does not apply)';
    return [pass('not public', { reason, measure: { applicable: false } })];
  }
  if (!isMap(pctx.design.data)) return [unverified('DESIGN.md not validated: cannot tell whether the site is public')];
  const web = webOf(pctx.design);
  if (!web || web.public !== true) return [pass('not public', { reason: 'web.public is not true: static SEO does not apply', measure: { applicable: false } })];
  return null;
}

export const indexable = (pctx) => webOf(pctx.design)?.indexable !== false;

export function staticAttr(el, name) {
  const a = el.attrs.get(name);
  return a && !a.dynamic && typeof a.value === 'string' ? a.value : null;
}

const samePath = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

const PAGES = new WeakMap();
const fileDoc = (ctx) => ({ file: ctx.file, origin: ctx.origin ?? 'file', syntax: ctx.syntax, markup: ctx.markup, text: ctx.text, headers: null, skip: null });
function pagesOf(pctx) {
  if (PAGES.has(pctx)) return PAGES.get(pctx);
  const inputs = (pctx.ctxs ?? []).filter((ctx) => !ctx.mockup && ctx.markup);
  // a page: a document, or a JSX file with Next.js metadata (a page or layout without <html>)
  const pages = inputs.filter((ctx) => ctx.isDocument || metadataObject(ctx)).map(fileDoc);
  const urls = urlPages(pctx);
  const all = { pages: [...pages, ...urls], withMarkup: [...inputs.map(fileDoc), ...urls] };
  PAGES.set(pctx, all);
  return all;
}
export const seoPages = (pctx) => pagesOf(pctx).pages;
// Every input with markup (components too) plus the fetched pages: for rules on elements (SEO-09).
export const seoMarkupInputs = (pctx) => pagesOf(pctx).withMarkup;

function urlPages(pctx) {
  const out = [];
  for (const page of pctx.site?.pages ?? []) {
    const doc = { file: page.url, origin: 'url', syntax: 'html', markup: null, text: '', headers: page.headers ?? null, skip: null };
    if (page.error) doc.skip = page.error;
    else if (page.status !== 200) doc.skip = `HTTP ${page.status}`;
    else if (!/\bhtml\b/i.test(page.headers?.['content-type'] ?? '')) doc.skip = 'not an HTML response';
    else if (!samePath(new URL(page.finalUrl).pathname, page.path)) doc.skip = `redirected to ${new URL(page.finalUrl).pathname} (may require a session)`;
    else {
      doc.text = stripComments(page.text, 'html');
      doc.markup = parseMarkup(doc.text, { syntax: 'html' });
      if (!doc.markup.hasHtmlRoot) doc.skip = 'not a document';
      else if (doc.markup.elements.some((e) => e.tag === 'input' && (staticAttr(e, 'type') ?? '').toLowerCase() === 'password')) doc.skip = 'requires a session (password field)';
    }
    out.push(doc);
  }
  return out;
}

// Same length as src; the content of string literals becomes spaces (quotes stay).
function maskStrings(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += c + ' '.repeat(Math.max(0, Math.min(j, src.length) - i - 1)) + (j < src.length ? c : '');
      i = j + 1;
    } else { out += c; i++; }
  }
  return out.slice(0, src.length);
}

const OPEN = { '{': '}', '[': ']', '(': ')' };
function closeOf(masked, at) {
  let depth = 0;
  for (let i = at; i < masked.length; i++) {
    if (masked[i] in OPEN) depth++;
    else if (masked[i] === '}' || masked[i] === ']' || masked[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const IDENT = /[A-Za-z_$][\w$]*/g;
const LITERALS = new Set(['true', 'false', 'null', 'undefined']);
// true when every identifier is a key (followed by `:`) or a literal: no variables, calls, spreads.
function isStaticValue(masked) {
  if (masked.includes('...') || masked.includes('${')) return false;
  const colon = /\s*:/y;
  for (const m of masked.matchAll(IDENT)) {
    colon.lastIndex = m.index + m[0].length;
    if (colon.test(masked) || LITERALS.has(m[0])) continue;
    return false;
  }
  return true;
}

export function prop(objText, key) {
  const masked = maskStrings(objText);
  let depth = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c in OPEN) { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (depth !== 1 || !masked.startsWith(key, i)) continue;
    if (/[\w$]/.test(masked[i - 1] ?? '') || /[\w$]/.test(masked[i + key.length] ?? '')) continue;
    const m = /^\s*:\s*/.exec(masked.slice(i + key.length));
    if (!m) continue;
    const v = i + key.length + m[0].length;
    const ch = masked[v];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = masked.indexOf(ch, v + 1);
      const raw = objText.slice(v + 1, end < 0 ? objText.length : end);
      if (ch === '`' && raw.includes('${')) return { kind: 'dynamic' };
      return { kind: 'string', value: raw };
    }
    if (ch === '{' || ch === '[') {
      const end = closeOf(masked, v);
      if (end < 0) return { kind: 'dynamic' };
      const text = objText.slice(v, end + 1);
      return isStaticValue(masked.slice(v, end + 1)) ? { kind: ch === '{' ? 'object' : 'array', text } : { kind: 'dynamic' };
    }
    const lit = /^(-?\d+(?:\.\d+)?|true|false|null)\b/.exec(masked.slice(v));
    if (lit) return { kind: 'literal', value: lit[1] };
    return { kind: 'dynamic' };
  }
  return null;
}

const GENERATE = /export\s+(?:async\s+)?function\s+generateMetadata\b|export\s+const\s+generateMetadata\b/;
export function metadataObject(ctx) {
  if (ctx.syntax !== 'jsx') return null;
  if (GENERATE.test(ctx.text)) return { dynamic: true };
  const src = ctx.markup?.exportsText;
  if (!src) return null;
  const m = /export\s+const\s+metadata\b[^=]*=\s*/.exec(src);
  if (!m) return null;
  const at = m.index + m[0].length;
  if (src[at] !== '{') return { dynamic: true };
  const end = closeOf(maskStrings(src), at);
  return end < 0 ? { dynamic: true } : { text: src.slice(at, end + 1) };
}

const APP_ROUTE = /^(?:src\/)?app\/((?:[^/]+\/)*)(?:page|layout)\.[jt]sx$/;
const PAGES_ROUTE = /^(?:src\/)?pages\/(.+)\.[jt]sx$/;
export function isNextRoute(file) {
  const app = APP_ROUTE.exec(String(file));
  if (app) return app[1].split('/').filter(Boolean).every((seg) => /^\(.+\)$/.test(seg)) ? 'root' : 'nested';
  const pages = PAGES_ROUTE.exec(String(file));
  if (pages && !pages[1].startsWith('api/')) return ['index', '_app', '_document'].includes(pages[1]) ? 'root' : 'nested';
  return null;
}
