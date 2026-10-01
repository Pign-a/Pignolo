// Google Fonts only for the canvas (R-19). The one allowed form is, in the <head>:
//   <link rel="preconnect" href="https://fonts.googleapis.com">
//   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
//   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...&display=swap">
// (at most one of each; 1 to 4 families made of [A-Za-z0-9+:;@,.], display=swap). Anything else
// that looks like a font link is a `bad-font-link`; any other remote resource stays a
// `remote-resource` for screenProblems.
//
// parseFontLinks(html, { requireHead }) -> { ok, links: string[], problems: [{ code: 'bad-font-link', detail }] }
//   links: the allowed tags in canonical form, in document order.
// stripRemoteFonts(html) -> { html, removed }   removes only the allowed tags (the local backup uses it)

const LINK_TAG = /<link\b[^>]*>/gi;
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const FAMILY_VALUE = /^[A-Za-z0-9+:;@,.]+$/;

const PRECONNECT_GOOGLEAPIS = '<link rel="preconnect" href="https://fonts.googleapis.com">';
const PRECONNECT_GSTATIC = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';

function attrsOf(tag) {
  const inner = tag.replace(/^<link\b/i, '').replace(/\/?>$/, '');
  const attrs = new Map();
  for (const m of inner.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (attrs.has(name)) attrs.set(name, null);
    else attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Does this link look like a font request (so a wrong form is a bad-font-link, not a plain remote resource)?
function looksLikeFont(attrs) {
  const href = attrs.get('href');
  if (typeof href !== 'string') return false;
  const m = /^\s*(?:https?:)?\/\/([^/?#:]+)/i.exec(href);
  if (!m) return false;
  const host = m[1].toLowerCase();
  return /^fonts\./.test(host) || /(?:^|\.)(?:googleapis|gstatic)\.com$/.test(host);
}

function stylesheetOk(href) {
  const m = /^https:\/\/fonts\.googleapis\.com\/css2\?(.+)$/.exec(href);
  if (!m) return 'the stylesheet must be https://fonts.googleapis.com/css2?...';
  const families = [];
  let display = 0;
  for (const part of m[1].split('&')) {
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? '' : part.slice(eq + 1);
    if (k === 'family') {
      if (!FAMILY_VALUE.test(v)) return 'a family has characters outside [A-Za-z0-9+:;@,.]';
      families.push(v);
    } else if (k === 'display' && v === 'swap') display++;
    else return 'only family= and display=swap are allowed in the query';
  }
  if (families.length < 1 || families.length > 4) return 'between 1 and 4 families are allowed';
  if (display !== 1) return 'display=swap is required';
  return null;
}

// -> { canonical } when the tag is the allowed form, { problem } when it is a font link of another form, null otherwise.
function classify(tag) {
  const attrs = attrsOf(tag);
  if (!looksLikeFont(attrs)) return null;
  const names = [...attrs.keys()];
  const href = attrs.get('href');
  const rel = String(attrs.get('rel') ?? '').trim().toLowerCase();
  if ([...attrs.values()].includes(null)) return { problem: 'a font link repeats an attribute' };
  if (rel === 'preconnect') {
    const extra = names.filter((n) => !['rel', 'href', 'crossorigin'].includes(n));
    if (extra.length) return { problem: `a preconnect carries ${extra[0]}` };
    if (href === 'https://fonts.googleapis.com' && !attrs.has('crossorigin')) return { canonical: PRECONNECT_GOOGLEAPIS, kind: 'preconnect-api' };
    if (href === 'https://fonts.gstatic.com' && attrs.has('crossorigin') && attrs.get('crossorigin') === '') return { canonical: PRECONNECT_GSTATIC, kind: 'preconnect-static' };
    return { problem: 'a preconnect must be exactly the one of fonts.googleapis.com or fonts.gstatic.com (crossorigin)' };
  }
  if (rel === 'stylesheet') {
    const extra = names.filter((n) => !['rel', 'href'].includes(n));
    if (extra.length) return { problem: `the stylesheet carries ${extra[0]}` };
    const bad = stylesheetOk(href);
    if (bad) return { problem: bad };
    return { canonical: `<link rel="stylesheet" href="${href}">`, kind: 'stylesheet' };
  }
  return { problem: `rel="${rel}" is not allowed for a font link` };
}

function headRange(html) {
  const open = /<head\b[^>]*>/i.exec(html);
  if (!open) return null;
  const close = html.toLowerCase().indexOf('</head>', open.index);
  return { from: open.index, to: close < 0 ? html.length : close };
}

export function parseFontLinks(html, { requireHead = false } = {}) {
  const links = [];
  const problems = [];
  const seen = new Set();
  const head = requireHead ? headRange(html) : null;
  for (const m of String(html).matchAll(LINK_TAG)) {
    const c = classify(m[0]);
    if (!c) continue;
    if (c.problem) { problems.push({ code: 'bad-font-link', detail: c.problem }); continue; }
    if (head && (m.index < head.from || m.index > head.to)) { problems.push({ code: 'bad-font-link', detail: 'font links belong in the <head>' }); continue; }
    if (seen.has(c.kind)) { problems.push({ code: 'bad-font-link', detail: 'each font link may appear only once' }); continue; }
    seen.add(c.kind);
    links.push(c.canonical);
  }
  return { ok: problems.length === 0, links, problems };
}

export function stripRemoteFonts(html) {
  const src = String(html);
  const cuts = [];
  for (const m of src.matchAll(LINK_TAG)) {
    const c = classify(m[0]);
    if (!c || c.problem) continue;
    let from = m.index;
    let to = m.index + m[0].length;
    let a = from;
    while (a > 0 && (src[a - 1] === ' ' || src[a - 1] === '\t')) a--;
    let b = to;
    while (b < src.length && (src[b] === ' ' || src[b] === '\t')) b++;
    const startsLine = a === 0 || src[a - 1] === '\n';
    const endsLine = b >= src.length || src[b] === '\n' || (src[b] === '\r' && src[b + 1] === '\n');
    if (startsLine && endsLine) {
      from = a;
      to = b < src.length ? (src[b] === '\r' ? b + 2 : b + 1) : b;
    }
    cuts.push([from, to]);
  }
  let out = '';
  let at = 0;
  for (const [from, to] of cuts) { out += src.slice(at, from); at = to; }
  out += src.slice(at);
  return { html: out, removed: cuts.length };
}
