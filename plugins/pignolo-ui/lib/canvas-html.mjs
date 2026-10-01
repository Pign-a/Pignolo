// Strict markup scan for the canvas artboards (R-4, R-5) and the document splitter of the converter.
// The canvas type fails silently on a missing closing tag, an unquoted attribute or a `{{`, so
// this tokenizer is strict on purpose (it is NOT parseMarkup, which is tolerant and auto-closes).
//
// scanMarkup(html) -> { ok, problems: [{ code, detail, line }], warnings: [{ code, line }] }
//   problems: malformed, unquoted-attr, braces, reserved-tag, control-in-link
//   warnings: fixed-position, viewport-units, body-rule, body-attr, css-close-braces
// splitDocument(html) -> { lang, title, styles, fontLinks, body }     (throws CanvasError('no-body'))
import { parseFontLinks } from './remote-fonts.mjs';

export class CanvasError extends Error {
  constructor(code, detail, problems) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
    if (problems) this.problems = problems;
  }
}

export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['style', 'script']);
const CONTROLS = new Set(['button', 'input', 'select', 'textarea']);
const RESERVED = /^(?:x-dc|helmet|dc-import|sc-[a-z0-9-]*)$/i;

const lineAt = (src, index) => src.slice(0, index).split('\n').length;

// Reads the attributes of a start tag from `from` (just after the name). Returns
// { attrs: [{ name, raw, value, quoted, bool }], end, selfClosing } or null when the tag never closes.
function readTag(src, from) {
  const attrs = [];
  let i = from;
  const n = src.length;
  for (;;) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) return null;
    if (src[i] === '>') return { attrs, end: i + 1, selfClosing: false };
    if (src[i] === '/' && src[i + 1] === '>') return { attrs, end: i + 2, selfClosing: true };
    if (src[i] === '/') { i++; continue; }
    const nameStart = i;
    while (i < n && !/[\s=>/]/.test(src[i])) i++;
    const name = src.slice(nameStart, i);
    if (!name) return null;
    let j = i;
    while (j < n && /\s/.test(src[j])) j++;
    if (src[j] !== '=') { attrs.push({ name, raw: name, value: null, quoted: true, bool: true }); continue; }
    j++;
    while (j < n && /\s/.test(src[j])) j++;
    const q = src[j];
    if (q === '"' || q === "'") {
      const close = src.indexOf(q, j + 1);
      if (close < 0) return null;
      attrs.push({ name, raw: src.slice(nameStart, close + 1), value: src.slice(j + 1, close), quoted: true, bool: false });
      i = close + 1;
    } else {
      const vs = j;
      while (j < n && !/[\s>]/.test(src[j])) j++;
      attrs.push({ name, raw: src.slice(nameStart, j), value: src.slice(vs, j), quoted: false, bool: false });
      i = j;
    }
  }
}

// One pass over the document; calls handlers and collects problems. `onStart` may veto nothing: it only observes.
function tokenize(src, { onStart, onText } = {}) {
  const problems = [];
  const stack = [];
  const open = (n) => stack.some((s) => s.name === n);
  let i = 0;
  const add = (code, detail, at) => problems.push({ code, detail, line: lineAt(src, at) });
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > i && onText) onText(src.slice(i, textEnd), i);
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) { add('malformed', 'unclosed comment', i); break; }
      i = end + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const end = src.indexOf('>', i);
      if (end < 0) { add('malformed', 'unclosed declaration', i); break; }
      i = end + 1;
      continue;
    }
    if (src[i + 1] === '/') {
      const m = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/.exec(src.slice(i, i + 80));
      if (!m) { add('malformed', 'bad closing tag', i); i += 2; continue; }
      const name = m[1].toLowerCase();
      if (VOID.has(name)) add('malformed', `</${name}> closes an empty element`, i);
      else if (!stack.length || stack[stack.length - 1].name !== name) {
        add('malformed', stack.length ? `</${name}> closes <${stack[stack.length - 1].name}>` : `</${name}> has no opening tag`, i);
        const at = stack.map((s) => s.name).lastIndexOf(name);
        if (at >= 0) stack.length = at;
      } else {
        stack.pop();
      }
      i += m[0].length;
      continue;
    }
    const nm = /^<([A-Za-z][A-Za-z0-9:-]*)/.exec(src.slice(i, i + 80));
    if (!nm) { if (onText) onText('<', i); i += 1; continue; }
    const name = nm[1].toLowerCase();
    const tag = readTag(src, i + nm[0].length);
    if (!tag) { add('malformed', `<${name}> is never closed with >`, i); break; }
    for (const at of tag.attrs) if (!at.quoted) add('unquoted-attr', `${at.name} has an unquoted value`, i);
    if (onStart) onStart({ name, attrs: tag.attrs, selfClosing: tag.selfClosing, index: i, end: tag.end, inSvg: open('svg'), stack });
    if (RESERVED.test(name)) add('reserved-tag', `<${name}> is reserved by the canvas`, i);
    if (CONTROLS.has(name) && open('a')) add('control-in-link', `<${name}> inside an <a>`, i);
    for (const at of tag.attrs) if (at.value !== null && at.value.includes('}}')) add('braces', `${at.name} holds a closing brace pair`, i);
    i = tag.end;
    if (VOID.has(name)) continue;
    if (tag.selfClosing) {
      if (open('svg') || name === 'svg') continue;
      add('malformed', `<${name}/> is not an empty element`, tag.end - 2);
      continue;
    }
    if (RAW.has(name)) {
      const close = src.toLowerCase().indexOf(`</${name}`, i);
      if (close < 0) { add('malformed', `<${name}> is never closed`, i); break; }
      const content = src.slice(i, close);
      if (name === 'style' && onStart) onStart({ name: '#style-text', content, index: i });
      if (onText) onText(content, i, name);
      const end = src.indexOf('>', close);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    stack.push({ name, index: tag.end });
  }
  for (const open of stack) add('malformed', `<${open.name}> is never closed`, open.index);
  return problems;
}

export function scanMarkup(html) {
  const src = String(html);
  const problems = [];
  const warnings = [];
  const warn = (code, at) => { if (!warnings.some((w) => w.code === code)) warnings.push({ code, line: lineAt(src, at) }); };
  const inner = tokenize(src, {
    onStart(t) {
      if (t.name === '#style-text') {
        if (/(?:^|[}{,;\s])(?:html|body)(?=\s*[{,>])/i.test(t.content)) warn('body-rule', t.index);
        if (/position\s*:\s*fixed/i.test(t.content)) warn('fixed-position', t.index);
        if (/\b\d+(?:\.\d+)?\s*(?:vh|vw|dvh|svh|lvh)\b/i.test(t.content)) warn('viewport-units', t.index);
        if (t.content.includes('}}')) warn('css-close-braces', t.index);
        return;
      }
      if (t.name === 'body' && t.attrs.length) warn('body-attr', t.index);
      for (const at of t.attrs) {
        if (at.name.toLowerCase() === 'style' && at.value !== null) {
          if (/position\s*:\s*fixed/i.test(at.value)) warn('fixed-position', t.index);
          if (/\b\d+(?:\.\d+)?\s*(?:vh|vw|dvh|svh|lvh)\b/i.test(at.value)) warn('viewport-units', t.index);
        }
      }
    },
    onText(text, at, raw) {
      if (raw === 'style') return;
      if (raw === 'script') return;
      if (text.includes('}}')) problems.push({ code: 'braces', detail: 'a closing brace pair in the text', line: lineAt(src, at + text.indexOf('}}')) });
    },
  });
  problems.push(...inner);
  // `{{` anywhere (text, attributes, comments and <style>): the canvas reads it as a placeholder lookup.
  const opening = src.indexOf('{{');
  if (opening >= 0) problems.push({ code: 'braces', detail: 'an opening brace pair', line: lineAt(src, opening) });
  const seen = new Set();
  const unique = problems.filter((p) => { const k = `${p.code}|${p.detail}|${p.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ok: unique.length === 0, problems: unique, warnings };
}

const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

export function splitDocument(html) {
  const src = String(html);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(src) ?? /<body\b[^>]*>([\s\S]*)$/i.exec(src);
  if (!body) throw new CanvasError('no-body', 'the document has no <body>');
  const lang = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(src)?.[1] ?? 'es';
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src)?.[1].trim() ?? '';
  const styles = [];
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(src)?.[1] ?? '';
  for (const m of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) styles.push(m[1].trim());
  let inner = body[1];
  inner = inner.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css) => { styles.push(css.trim()); return ''; });
  const fonts = parseFontLinks(src, { requireHead: true });
  return { lang, title, styles: styles.filter(Boolean), fontLinks: fonts.links, fontProblems: fonts.problems, body: strip(inner).trim() };
}

export { tokenize, readTag };
