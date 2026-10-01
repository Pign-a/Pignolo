// Converter from the plain HTML of a ui-option screen to a canvas artboard (R-1, R-4, R-19).
// The local HTML stays the source of truth; this wraps it in the skeleton of the "Design" type.
//
// toArtboard({ html, w, h, links, allowFonts }) -> string      deterministic, LF, no dates
// sizesFor(platform) -> [{ w, h }]     artboardName({ prefix, option, screen, w, platform, isMain }) -> string
// isInteractive(html) -> boolean       CanvasError (code) for every refusal
import { scanMarkup, splitDocument, tokenize, readTag, VOID, CanvasError } from './canvas-html.mjs';
import { screenProblems } from './approved.mjs';
import { stripRemoteFonts } from './remote-fonts.mjs';

export { CanvasError };

const SIZES = {
  mobile: [{ w: 390, h: 844 }],
  desktop: [{ w: 1440, h: 900 }],
  both: [{ w: 390, h: 844 }, { w: 1440, h: 900 }],
};

export function sizesFor(platform) {
  const s = SIZES[platform];
  if (!s) throw new CanvasError('bad-platform', `platform must be mobile, desktop or both, got ${platform}`);
  return s.map((x) => ({ ...x }));
}

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.dc\.html$/;

export function artboardName({ prefix, option, screen, w, platform, isMain = false }) {
  if (isMain) return 'Main.dc.html';
  const stem = String(screen).replace(/\.html$/, '');
  const name = `${prefix}-${String(option).toLowerCase()}-${stem}${platform === 'both' ? `-${w}` : ''}.dc.html`;
  if (!NAME.test(name) || `project/${name}`.length > 80) throw new CanvasError('bad-name', `${name} is not a valid artboard name`);
  return name;
}

const isLocalHtmlHref = (href) => {
  const h = href.trim().replace(/^(?:\.\/)+/, '');
  return !(h === '' || h.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//'));
};

export function isInteractive(html) {
  const src = String(html);
  for (const m of src.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi)) if (isLocalHtmlHref(m[1])) return true;
  return /<(?:button|input|select|textarea|details)\b/i.test(src);
}

// Re-serializes the body: boolean attributes as name="", empty elements without "/>" (children of
// <svg> keep theirs), local .html links pointed to their artboard, comments dropped.
function rewriteBody(body, links) {
  let out = '';
  let at = 0;
  const edits = [];
  tokenize(body, {
    onStart(t) {
      if (t.name === '#style-text') return;
      const tag = readTag(body, t.index + 1 + t.name.length);
      if (!tag) return;
      const parts = [];
      for (const a of tag.attrs) {
        let raw = a.bool ? `${a.name}=""` : a.raw;
        if (t.name === 'a' && a.name.toLowerCase() === 'href' && a.value !== null && isLocalHtmlHref(a.value)) {
          const target = a.value.trim().replace(/^(?:\.\/)+/, '').split(/[?#]/)[0];
          if (a.value.trim().startsWith('/') || !Object.prototype.hasOwnProperty.call(links, target)) throw new CanvasError('broken-link', `the link ${a.value} points to no screen of the option`);
          raw = `href="${links[target]}"`;
        }
        parts.push(raw);
      }
      const keepSlash = tag.selfClosing && !VOID.has(t.name) && (t.inSvg || t.name === 'svg');
      edits.push({ from: t.index, to: tag.end, text: `<${body.slice(t.index + 1, t.index + 1 + t.name.length)}${parts.length ? ` ${parts.join(' ')}` : ''}${keepSlash ? '/>' : '>'}` });
    },
  });
  for (const e of edits.sort((x, y) => x.from - y.from)) {
    out += body.slice(at, e.from) + e.text;
    at = e.to;
  }
  return out + body.slice(at);
}

const props = (w, h) => `{"$preview":{"width":${w},"height":${h}}}`;

export function toArtboard({ html, w, h, links = {}, allowFonts = false }) {
  const src = String(html).replace(/\r\n/g, '\n');
  const scan = scanMarkup(src);
  if (!scan.ok) throw new CanvasError(scan.problems[0].code, scan.problems[0].detail, scan.problems);
  const bad = screenProblems(src, { allowFonts }).filter((p) => p.problem === 'script' || p.problem === 'remote-resource');
  if (bad.length) throw new CanvasError(bad[0].problem, null, bad.map((p) => ({ code: p.problem })));
  const doc = splitDocument(src);
  if (doc.fontProblems.length) throw new CanvasError('bad-font-link', doc.fontProblems[0].detail, doc.fontProblems);
  const fonts = allowFonts ? doc.fontLinks : [];
  const body = rewriteBody(stripRemoteFonts(doc.body).html, links).trim();
  const css = ['body{margin:0}', ...doc.styles].join('\n');
  return `<!doctype html>
<html lang="${doc.lang}">
<head>
<meta charset="utf-8">
<title>${doc.title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>${fonts.join('')}<style>
${css}
</style></helmet>
<div style="width: ${w}px; min-height: ${h}px; box-sizing: border-box">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props(w, h)}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;
}
