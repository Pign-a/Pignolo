// Comment stripping per syntax (spec §5.5). The result has the same length as the input:
// comments become spaces, line endings are kept, strings are untouched. So offsets and
// line numbers computed on the result are valid for the original file.
//
// stripComments(text, syntax) with syntax in css | js | html | jsx | vue | svelte
import { blankComments } from './token-sources.mjs';

// Words after which a "<" or "/" starts an expression (JSX element, regex), not an operator.
const KEYWORDS = new Set(['return', 'typeof', 'case', 'default', 'else', 'in', 'of', 'do', 'yield', 'await', 'void', 'delete', 'new', 'instanceof', 'throw', 'extends']);
const WORD = /[A-Za-z0-9_$]/;
const JSX_START = /[A-Za-z_$>]/;

function stripScript(src, jsx) {
  const out = src.split('');
  const n = src.length;
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };

  function skipQuote() {
    const q = src[i++];
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      i++;
      if (c === q || c === '\n') return;
    }
  }

  function skipTemplate() {
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        scanCode();
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

  function lineComment() {
    let j = i;
    while (j < n && src[j] !== '\n') j++;
    blank(i, j);
    i = j;
  }

  function blockComment() {
    const end = src.indexOf('*/', i + 2);
    const stop = end < 0 ? n : end + 2;
    blank(i, stop);
    i = stop;
  }

  // Scans JavaScript until an unmatched "}" (left in place) or the end.
  function scanCode() {
    let depth = 0;
    let prevEnd = false; // the previous token ends an expression
    let prevElem = false; // the previous token is a JSX element (adjacent siblings)
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const wasElem = prevElem;
      prevElem = false;
      if (c === '/' && src[i + 1] === '*') { blockComment(); continue; }
      if (c === '/' && src[i + 1] === '/') { lineComment(); continue; }
      if (c === '"' || c === "'") { skipQuote(); prevEnd = true; continue; }
      if (c === '`') { skipTemplate(); prevEnd = true; continue; }
      if (c === '{') { depth++; i++; prevEnd = false; continue; }
      if (c === '}') {
        if (depth === 0) return;
        depth--; i++; prevEnd = false; continue;
      }
      if (c === '/' && !prevEnd && skipRegex()) { prevEnd = true; continue; }
      if (jsx && c === '<' && (!prevEnd || wasElem) && JSX_START.test(src[i + 1] ?? '')) { scanElement(); prevEnd = true; prevElem = true; continue; }
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

  function scanElement() {
    i++; // "<"
    if (src[i] === '>') { i++; scanChildren(); return; }
    while (i < n && /[\w$.:-]/.test(src[i])) i++;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '>') { i += 2; return; }
      if (c === '>') { i++; scanChildren(); return; }
      if (c === '/' && src[i + 1] === '*') { blockComment(); continue; }
      if (c === '/' && src[i + 1] === '/') { lineComment(); continue; }
      if (c === '"' || c === "'") {
        i++;
        while (i < n && src[i] !== c) i++;
        i++;
        continue;
      }
      if (c === '{') {
        i++;
        scanCode();
        if (src[i] === '}') i++;
        continue;
      }
      i++;
    }
  }

  function scanChildren() {
    while (i < n) {
      const c = src[i];
      if (c === '{') {
        i++;
        scanCode();
        if (src[i] === '}') i++;
        continue;
      }
      if (c === '<') {
        if (src[i + 1] === '/') {
          while (i < n && src[i] !== '>') i++;
          i++;
          return;
        }
        if (JSX_START.test(src[i + 1] ?? '')) { scanElement(); continue; }
      }
      i++;
    }
  }

  while (i < n) {
    scanCode();
    if (i < n) i++; // a stray "}" at the top level
  }
  return out.join('');
}

// <!-- --> everywhere; /* */ inside <style>; <script> content is left as is.
function stripHtml(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  while (i < n) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const stop = end < 0 ? n : end + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    const raw = /^<(style|script)(?=[\s>/])/i.exec(src.slice(i, i + 9));
    if (raw) {
      const open = src.indexOf('>', i);
      if (open < 0) break;
      const closer = new RegExp(`</${raw[1]}`, 'gi');
      closer.lastIndex = open + 1;
      const m = closer.exec(src);
      const end = m ? m.index : n;
      if (raw[1].toLowerCase() === 'style') {
        const cleaned = blankComments(src.slice(open + 1, end));
        for (let k = 0; k < cleaned.length; k++) out[open + 1 + k] = cleaned[k];
      }
      i = end;
      continue;
    }
    i++;
  }
  return out.join('');
}

export function stripComments(text, syntax) {
  const s = String(text);
  switch (syntax) {
    case 'css': return blankComments(s);
    case 'js': return stripScript(s, false);
    case 'jsx': return stripScript(s, true);
    case 'html':
    case 'vue':
    case 'svelte': return stripHtml(s);
    default: throw new Error(`stripComments: unknown syntax ${syntax}`);
  }
}
