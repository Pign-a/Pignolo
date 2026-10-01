// Mockup fingerprint taken in the browser (R-6): the page function only reads the DOM.
// The viewport (1440x900) and the light theme are set by the caller.
//
// fingerprintPage(page) -> { v: 1, kind: 'mockup', width: 1440, blocks, headings, columns, primary }
//   blocks    lowercase tag of each visible first-level child of <main> (or <body>), no script/style
//   headings  normalized text of h1..h3
//   columns   columns of the first-level grid or row flex of the content (>= 1)
//   primary   { row: top|middle|bottom, col: left|center|right } of [data-primary="true"], else the
//             first submit button, else the first opaque button; null when there is none
export const FINGERPRINT_WIDTH = 1440;
export const FINGERPRINT_HEIGHT = 900;

// Serialized and run in the page: it must not close over anything from this module.
function measure() {
  const hidden = (el) => {
    if (el.hidden) return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden';
  };
  const root = document.querySelector('main') || document.body;
  const skip = new Set(['script', 'style', 'template', 'noscript']);
  const kids = [...root.children].filter((el) => !skip.has(el.tagName.toLowerCase()) && !hidden(el));
  const blocks = kids.map((el) => el.tagName.toLowerCase());
  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .filter((el) => !hidden(el))
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim());

  let columns = 1;
  const candidates = [root, ...kids.filter((el) => !['header', 'footer', 'nav'].includes(el.tagName.toLowerCase()))];
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    let n = 1;
    if (cs.display === 'grid' || cs.display === 'inline-grid') {
      n = cs.gridTemplateColumns.split(/\s+/).filter((t) => t && t !== 'none').length || 1;
    } else if ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row')) {
      n = [...el.children].filter((c) => !skip.has(c.tagName.toLowerCase()) && !hidden(c)).length || 1;
    }
    if (n > columns) columns = n;
  }

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const opaque = (el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== bodyBg;
  };
  let el = document.querySelector('[data-primary="true"]')
    || document.querySelector('button[type=submit]');
  if (!el) el = [...document.querySelectorAll('button, a[role=button]')].find((b) => !hidden(b) && opaque(b)) || null;
  let primary = null;
  if (el) {
    const r = el.getBoundingClientRect();
    const docW = Math.max(document.documentElement.clientWidth, 1);
    const docH = Math.max(document.documentElement.scrollHeight, document.documentElement.clientHeight, 1);
    const x = r.left + window.scrollX + r.width / 2;
    const y = r.top + window.scrollY + r.height / 2;
    const third = (v, total, names) => names[Math.min(2, Math.max(0, Math.floor((v / total) * 3)))];
    primary = { row: third(y, docH, ['top', 'middle', 'bottom']), col: third(x, docW, ['left', 'center', 'right']) };
  }
  return { v: 1, kind: 'mockup', width: 1440, blocks, headings, columns, primary };
}

export function fingerprintPage(page) {
  return page.evaluate(measure);
}
