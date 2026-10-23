// Minimal XML well-formedness checker (XML 1.0 fifth edition, the subset a sitemap uses) and
// the sitemap shape of sitemaps.org 0.9. Linear in the size of the text; never throws.
//
// checkXml(text) -> { ok: true, root } | { ok: false, error, line }
//   Accepts: XML declaration, comments, processing instructions, a DOCTYPE without internal
//   subset, CDATA, elements with quoted attributes, the five predefined entities and numeric
//   references. Refuses: unbalanced or crossed tags, a second root, text outside the root,
//   a raw `<` or an unknown `&name;` in text or attributes, duplicate attributes.
// checkSitemap(text) -> { ok: true, kind: 'urlset'|'sitemapindex', count } | { ok: false, error, line }
//   Well-formed, root urlset or sitemapindex (any prefix), and every url/sitemap child has a
//   non-empty loc.

const NAME = /^[A-Za-z_:À-￯][-A-Za-z0-9_:.·À-￯]*/;
const REF = /&(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/y;

function lineAt(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Checks `&` and `<` in character data between from and to; returns the bad index or -1.
function badChars(text, from, to) {
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '<') return i;
    if (c === '&') {
      REF.lastIndex = i;
      if (!REF.test(text)) return i;
      i = REF.lastIndex - 1;
    }
  }
  return -1;
}

export function parseXml(text, { onOpen, onClose, onText } = {}) {
  const src = String(text ?? '');
  const n = src.length;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack = [];
  let root = null;
  let rootClosed = false;
  const err = (message, at) => ({ ok: false, error: message, line: lineAt(src, at) });

  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt < 0 ? n : lt;
    if (end > i) {
      const chunk = src.slice(i, end);
      if (!stack.length) {
        if (chunk.trim() !== '') return err('text outside the root element', i);
      } else {
        const bad = badChars(src, i, end);
        if (bad >= 0) return err(src[bad] === '&' ? 'invalid entity reference' : 'raw < in text', bad);
        if (onText) onText(chunk, stack.length);
      }
    }
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      if (close < 0) return err('unclosed comment', i);
      i = close + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      if (!stack.length) return err('CDATA outside the root element', i);
      const close = src.indexOf(']]>', i + 9);
      if (close < 0) return err('unclosed CDATA section', i);
      if (onText) onText(src.slice(i + 9, close), stack.length);
      i = close + 3;
    } else if (src.startsWith('<?', i)) {
      const close = src.indexOf('?>', i + 2);
      if (close < 0) return err('unclosed processing instruction', i);
      if (src.startsWith('<?xml', i) && /\s/.test(src[i + 5] ?? '') && i !== (src.charCodeAt(0) === 0xfeff ? 1 : 0)) {
        return err('XML declaration not at the start', i);
      }
      i = close + 2;
    } else if (src.startsWith('<!DOCTYPE', i)) {
      if (root) return err('DOCTYPE after the root element', i);
      const close = src.indexOf('>', i);
      if (close < 0) return err('unclosed DOCTYPE', i);
      if (src.slice(i, close).includes('[')) return err('DOCTYPE internal subset not supported', i);
      i = close + 1;
    } else if (src[i + 1] === '/') {
      const m = NAME.exec(src.slice(i + 2, i + 2 + 256));
      if (!m) return err('invalid closing tag', i);
      const name = m[0];
      let j = i + 2 + name.length;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] !== '>') return err('invalid closing tag', i);
      const open = stack.pop();
      if (open !== name) return err(open ? `closing </${name}> does not match <${open}>` : `closing </${name}> without an open tag`, i);
      if (onClose) onClose(name, stack.length);
      if (!stack.length) rootClosed = true;
      i = j + 1;
    } else {
      const m = NAME.exec(src.slice(i + 1, i + 1 + 256));
      if (!m) return err('invalid tag', i);
      const name = m[0];
      if (!stack.length) {
        if (rootClosed || root) return err('more than one root element', i);
        root = name;
      }
      let j = i + 1 + name.length;
      const seen = new Set();
      let selfClosing = false;
      for (;;) {
        const ws = j;
        while (j < n && /\s/.test(src[j])) j++;
        if (j >= n) return err(`unclosed tag <${name}>`, i);
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { j += 2; selfClosing = true; break; }
        if (j === ws) return err(`missing space between attributes in <${name}>`, j);
        const a = NAME.exec(src.slice(j, j + 256));
        if (!a) return err(`invalid attribute in <${name}>`, j);
        if (seen.has(a[0])) return err(`duplicate attribute ${a[0]} in <${name}>`, j);
        seen.add(a[0]);
        j += a[0].length;
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] !== '=') return err(`attribute ${a[0]} without value`, j);
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q !== '"' && q !== "'") return err(`unquoted attribute ${a[0]}`, j);
        const close = src.indexOf(q, j + 1);
        if (close < 0) return err(`unclosed attribute ${a[0]}`, j);
        const bad = badChars(src, j + 1, close);
        if (bad >= 0) return err(`invalid character in attribute ${a[0]}`, bad);
        j = close + 1;
      }
      if (onOpen) onOpen(name, stack.length);
      if (selfClosing) {
        if (onClose) onClose(name, stack.length);
        if (!stack.length) rootClosed = true;
      } else stack.push(name);
      i = j;
    }
  }
  if (stack.length) return err(`unclosed element <${stack[stack.length - 1]}>`, n);
  if (!root) return err('no root element', 0);
  return { ok: true, root };
}

export function checkXml(text) {
  return parseXml(text);
}

const local = (name) => name.slice(name.lastIndexOf(':') + 1);

export function checkSitemap(text) {
  let kind = null;
  let count = 0;
  let inItem = false;
  let locText = null;
  let problem = null;
  const res = parseXml(text, {
    onOpen(name, depth) {
      const l = local(name);
      if (depth === 0) kind = l;
      else if (depth === 1 && (l === 'url' || l === 'sitemap')) { inItem = true; locText = null; count++; }
      else if (depth === 2 && inItem && l === 'loc') locText = '';
    },
    onText(chunk, depth) {
      if (depth === 3 && locText !== null) locText += chunk;
    },
    onClose(name, depth) {
      const l = local(name);
      if (depth === 1 && (l === 'url' || l === 'sitemap')) {
        if (!problem && (locText === null || locText.trim() === '')) problem = `a <${l}> without <loc>`;
        inItem = false;
      }
    },
  });
  if (!res.ok) return res;
  if (kind !== 'urlset' && kind !== 'sitemapindex') return { ok: false, error: `root <${res.root}> is not urlset or sitemapindex`, line: 1 };
  if (problem) return { ok: false, error: problem, line: 1 };
  return { ok: true, kind, count };
}
