// What a screen would ask from the network or run (spec §3.3, R-19), decided on the ATTRIBUTES and the
// CSS of the page after reading them like a browser does: character references decoded, tabs and
// newlines dropped, "\" read as "/", CSS escapes undone. The rule is "anything that is not relative,
// "#" or data:" in a place that loads, so a new spelling of a URL does not need a new pattern.
//
// resourceProblems(html) -> { script: boolean, remote: boolean }
//   script: an attribute that starts with "on" (wherever it sits in the tag), or a javascript:/vbscript: URL
//   remote: a loading attribute, a <style> or a style="" that points at a scheme, "//" or a "\\" URL
// isRemoteUrl(value) -> boolean     cssRemote(css) -> boolean
import { decodeEntities, cssUnescape } from './entities.mjs';

const STRICT_TAG = /<([A-Za-z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const LOOSE_TAG = /<([A-Za-z][^\s/>]*)([^>]*)>/g;
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

// attributes that load their value (href only outside <a> and <area>, which navigate)
const LOADING = new Set(['src', 'data', 'poster', 'background', 'ping', 'xlink:href', 'longdesc', 'manifest', 'lowsrc', 'dynsrc', 'codebase', 'icon']);
const SRCSET = new Set(['srcset', 'imagesrcset']);
const NAVIGATING = new Set(['a', 'area']);
// attributes whose value can be a javascript: URL
const SCRIPT_URL = new Set([...LOADING, 'href', 'action', 'formaction']);

// the URL as the browser reads it: references decoded, whitespace and control characters dropped, "\" is "/"
const normalize = (v) => decodeEntities(String(v)).replace(/\\/g, '/').replace(/[\x00-\x20\x7f-\x9f]/g, '');

export function isRemoteUrl(value) {
  const n = normalize(value);
  if (n === '' || n.startsWith('#') || /^data:/i.test(n)) return false;
  if (n.startsWith('//')) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(n);
}

const isScriptUrl = (value) => /^(?:javascript|vbscript):/i.test(normalize(value));

export function cssRemote(css) {
  const c = cssUnescape(decodeEntities(String(css).replace(/\/\*[\s\S]*?\*\//g, '')));
  for (const m of c.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) if (isRemoteUrl(m[1] ?? m[2] ?? m[3] ?? '')) return true;
  for (const m of c.matchAll(/@import\s*(?:"([^"]*)"|'([^']*)')/gi)) if (isRemoteUrl(m[1] ?? m[2] ?? '')) return true;
  for (const m of c.matchAll(/image-set\(/gi)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < c.length && depth > 0; i++) { if (c[i] === '(') depth++; else if (c[i] === ')') depth--; }
    for (const s of c.slice(from, i).matchAll(/"([^"]*)"|'([^']*)'/g)) if (isRemoteUrl(s[1] ?? s[2] ?? '')) return true;
  }
  return false;
}

function* attributesOf(html) {
  // tags read with balanced quotes, and again loosely (an unclosed quote must not hide what follows)
  for (const re of [STRICT_TAG, LOOSE_TAG]) {
    for (const t of html.matchAll(re)) {
      const tag = t[1].toLowerCase();
      for (const a of String(t[2]).matchAll(ATTR)) yield { tag, name: a[1].toLowerCase(), value: a[2] ?? a[3] ?? a[4] ?? '' };
    }
  }
}

export function resourceProblems(html) {
  const src = String(html);
  let script = false;
  let remote = false;
  for (const { tag, name, value } of attributesOf(src)) {
    if (/^on/i.test(name)) script = true;
    if (SCRIPT_URL.has(name) && isScriptUrl(value)) script = true;
    if (LOADING.has(name) && isRemoteUrl(value)) remote = true;
    if (name === 'href' && !NAVIGATING.has(tag) && isRemoteUrl(value)) remote = true;
    if (SRCSET.has(name)) {
      for (const candidate of decodeEntities(value).split(',')) {
        const url = candidate.trim().split(/\s+/)[0] ?? '';
        if (url && isRemoteUrl(url)) remote = true;
      }
    }
    if (name === 'style' && cssRemote(value)) remote = true;
  }
  for (const m of src.matchAll(STYLE_BLOCK)) if (cssRemote(m[1])) remote = true;
  return { script, remote };
}
