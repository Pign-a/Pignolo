// Labelled sample data (spec §7.1): the data the user gave is used literally; the data not given is filled with
// realistic SAMPLE values, each one marked with `data-sample` on its element, and the screen carries one small
// visible line "Datos de muestra". This is what a script can decide about that rule:
//
//   no-sample-strip      the screen has `data-sample` but no visible text "Datos de muestra"
//   empty-sample         a `data-sample` element with no text and no value (the mark says nothing)
//   bare-placeholder     a `‹…›` pair in the text (the old form: it is no longer a sample value); a single `‹` or `›`
//                        is an ordinary back/next sign and does not count
//   unmarked-sample      (only with `provided`, the literal values of the brief) a money amount, a thousands-grouped
//                        number or a date in the visible text or in a `value` attribute that is neither one of
//                        `provided` nor inside a `data-sample`. The comparison is by value, not by text: amounts
//                        by their digits and decimals (`3200`, `$ 3.200`, `$3.200,00` are the same), dates by day,
//                        month and year (`5 de noviembre de 2026`, `2026-11-05` and `05/11/2026` are the same),
//                        whole values only (`10` does not excuse `$ 9.810,10`). Sizes (`1.200 px`) are not data.
//   real-looking-contact an email outside the reserved domains, or a phone number, in the visible text of one element
//                        (inline tags included, never across elements) or in the attributes `value`, `placeholder`,
//                        `title`, `alt`, `aria-label` and `href` (`mailto:`, `tel:`). A phone has a phone shape: a `+`
//                        prefix, an area code in parentheses, hyphen or dot groups (`011-5555-1234`, `555.123.4567`,
//                        `5555-1234`) or ten digits in a row. Dates, times, grouped numbers, tax ids and year ranges
//                        are not phones.
//   warning maybe-unmarked-sample   the same values as unmarked-sample when no `provided` list was given
//
// What it cannot decide: whether a value is realistic, whether a name is a real person or a brand, whether an
// invented item name (not a number or a date) was left unmarked, and whether a number of the text came from the
// brief. Without `provided` it cannot tell a sample amount from one the user gave. A phone written with plain
// spaces and no `+` (`11 5555 1234`) is not told from a list of quantities, so it passes. A line "Datos de muestra"
// hidden by a class, `visibility`, `opacity` or a closed `<details>` still counts as visible: only `hidden`,
// `aria-hidden="true"` and an inline `display:none` hide it.
//
// checkSampleData(html, { provided }) -> { problems: [string], warnings: [string] }
import { parseMarkup, ancestors, staticText } from './markup.mjs';

export const STRIP = /datos\s+de\s+muestra/i;
const HEAD_TAGS = new Set(['head', 'title', 'style', 'script', 'template', 'noscript']);
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
const CONTACT_ATTRS = ['value', 'placeholder', 'title', 'alt', 'aria-label'];
const BRACKET_PAIR = /‹[^‹›]*›/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const RESERVED_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|[a-z0-9-]+\.(?:test|invalid|example|localhost))$/i;

// Phone shapes. Each one is tried on the text of ONE element, whitespace already collapsed.
const PHONE_FORMS = [
  { re: /\+\d[\d ()-]{7,}\d/g, digits: [9, 15] },
  { re: /\(\d{2,4}\)\s?\d{3,4}[ -]?\d{3,4}/g },
  { re: /(?<![\d.,/-])\d{2,4}-\d{3,4}-\d{3,4}(?![\d-])/g },
  { re: /(?<![\d.,/-])\d{4}-\d{4}(?![\d-])/g, notYears: true },
  { re: /(?<![\d.,$-])\d{3}\.\d{3}\.\d{4}(?![\d.,])/g },
  { re: /(?<![\d.,$/-])\d{10}(?![\d.,/-])/g },
];
const YEAR = /^(?:19|20)\d\d$/;

// Values that look like data (amounts, grouped numbers, dates).
const SAMPLE_VALUES = [
  /[$€£]\s?\d[\d.,]*/g,
  /\b(?:ARS|USD|EUR)\s?\d[\d.,]*/g,
  /\b\d{1,3}(?:\.\d{3})+(?:,\d+)?/g,
  /\b\d+,\d{2}\b/g,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];
const DATE_DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const UNIT_AFTER = /^\s?(?:px|rem|em|%|ms|vh|vw|pt|kb|mb|gb|x)(?![a-z])/i;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DATE_WORDS = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')}|setiembre)(?:\\s+de)?\\s+(\\d{4})\\b`, 'gi');

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');

function dateKey(d, m, y) {
  const year = String(y).length === 2 ? `20${y}` : String(y);
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return null;
  return `D${year}-${pad(m)}-${pad(d)}`;
}

// The canonical form of a written date, or of an amount (digits and decimals; `.` or `,` as thousands or decimal mark).
function canonical(token) {
  const t = token.trim().replace(/[.,]+$/, '');
  let m = t.match(DATE_ISO);
  if (m) return dateKey(+m[3], +m[2], m[1]);
  m = t.match(DATE_DMY);
  if (m) return dateKey(+m[1], +m[2], m[3]);
  const s = t.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let int = s;
  let dec = '';
  const count = (c) => s.split(c).length - 1;
  const split = (at) => { int = s.slice(0, at); dec = s.slice(at + 1); };
  if (lastDot >= 0 && lastComma >= 0) split(Math.max(lastDot, lastComma));
  else if (lastDot >= 0 || lastComma >= 0) {
    const at = Math.max(lastDot, lastComma);
    const tail = s.length - at - 1;
    // one separator followed by exactly three digits is a thousands mark, otherwise a decimal one
    if (!(count(s[at]) > 1 || (tail === 3 && at >= 1 && at <= 3))) split(at);
  }
  int = int.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  dec = dec.replace(/[.,]/g, '').replace(/0+$/, '');
  return `N${int || '0'}${dec ? `.${dec}` : ''}`;
}

// What the user gave, as canonical values: the dates (any written form) and every number left after taking them out.
function canonicalSet(provided) {
  const set = new Set();
  for (const raw of provided) {
    let s = String(raw);
    set.add(`T${norm(s)}`);
    s = s.replace(DATE_WORDS, (m, d, mo, y) => {
      const idx = MONTHS.indexOf(mo.toLowerCase());
      const k = dateKey(+d, idx >= 0 ? idx + 1 : 9, y);
      if (k) set.add(k);
      return ' ';
    });
    s = s.replace(/\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, (m) => { const k = canonical(m); if (k) set.add(k); return ' '; });
    for (const m of s.matchAll(/\d[\d.,]*/g)) { const k = canonical(m[0]); if (k) set.add(k); }
  }
  return set;
}

function hasPhone(text) {
  for (const form of PHONE_FORMS) {
    for (const m of text.matchAll(form.re)) {
      const digits = m[0].replace(/\D/g, '').length;
      if (form.digits && (digits < form.digits[0] || digits > form.digits[1])) continue;
      if (form.notYears) { const [a, b] = m[0].split('-'); if (YEAR.test(a) && YEAR.test(b)) continue; }
      return true;
    }
  }
  return false;
}

function hasRealEmail(text) {
  for (const m of text.matchAll(EMAIL)) if (!RESERVED_DOMAIN.test(m[1])) return true;
  return false;
}

// The attributes that can carry a contact: the plain ones as they are, `mailto:` and `tel:` links by their address.
function attributeTexts(el) {
  const out = [];
  for (const name of CONTACT_ATTRS) {
    const a = el.attrs.get(name);
    if (a && !a.dynamic && typeof a.value === 'string') out.push(a.value);
  }
  const href = el.attrs.get('href');
  if (href && !href.dynamic && typeof href.value === 'string') {
    let h = href.value.trim();
    try { h = decodeURIComponent(h); } catch { /* keep the raw text */ }
    const tel = h.match(/^tel:(.*)$/i);
    const mail = h.match(/^mailto:([^?]*)/i);
    if (tel) out.push(`+${tel[1].replace(/\D/g, '')}`);
    if (mail) out.push(mail[1]);
  }
  return out;
}

export function checkSampleData(html, { provided = null } = {}) {
  const problems = [];
  const warnings = [];
  const add = (list, code) => { if (!list.includes(code)) list.push(code); };
  const markup = parseMarkup(String(html), { syntax: 'html' });
  const els = markup.elements;
  const visible = (el) => {
    const chain = [el, ...ancestors(markup, el)];
    return !chain.some((e) => HEAD_TAGS.has(e.tag)
      || e.attrs.has('hidden')
      || String(e.attrs.get('aria-hidden')?.value ?? '').trim().toLowerCase() === 'true'
      || /display\s*:\s*none/i.test(String(e.attrs.get('style')?.value ?? '')));
  };
  const marked = (el) => [el, ...ancestors(markup, el)].some((e) => e.attrs.has('data-sample'));
  const own = (el) => el.textParts.filter((p) => !p.dynamic).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
  // The text of one element with its inline children glued as a browser shows it (`ana@<b>empresa</b>.com`).
  // Block children are other elements and are read on their own.
  const inline = (el, depth = 0) => {
    const items = [
      ...el.textParts.filter((p) => !p.dynamic).map((p) => ({ at: p.offset ?? 0, text: p.text })),
      ...el.children.map((i) => markup.elements[i]).filter((c) => INLINE_TAGS.has(c.tag) && !c.component).map((c) => ({ at: c.offset ?? 0, el: c })),
    ].sort((x, y) => x.at - y.at);
    return items.map((it) => (it.el ? (depth < 20 ? inline(it.el, depth + 1) : '') : it.text)).join('');
  };

  const samples = els.filter((e) => e.attrs.has('data-sample') && !HEAD_TAGS.has(e.tag));
  const stripEls = els.filter((e) => visible(e) && STRIP.test(own(e)));
  if (samples.length && !stripEls.length) add(problems, 'no-sample-strip');
  for (const s of samples) {
    if (!staticText(markup, s).text && !s.attrs.has('value')) { add(problems, 'empty-sample'); break; }
  }

  const known = provided === null ? null : canonicalSet(provided);
  const isProvided = (token) => {
    const k = canonical(token);
    return known.has(`T${norm(token)}`) || (k !== null && known.has(k));
  };
  const scanValues = (el, text) => {
    if (marked(el) || stripEls.includes(el)) return;
    const found = [];
    for (const re of SAMPLE_VALUES) {
      for (const m of text.matchAll(re)) found.push({ start: m.index, end: m.index + m[0].length, token: m[0] });
    }
    // overlapping readings of the same text (`$ 12.480,00` also reads as `12.480,00` and `480,00`) count once
    found.sort((x, y) => x.start - y.start || y.end - x.end);
    let upTo = -1;
    for (const f of found) {
      if (f.start < upTo) continue;
      upTo = f.end;
      if (UNIT_AFTER.test(text.slice(f.end))) continue;
      if (known === null) add(warnings, 'maybe-unmarked-sample');
      else if (!isProvided(f.token)) add(problems, 'unmarked-sample');
    }
  };
  const contact = (text) => {
    if (hasRealEmail(text) || hasPhone(text)) add(problems, 'real-looking-contact');
  };
  for (const el of els) {
    if (HEAD_TAGS.has(el.tag)) continue;
    for (const t of attributeTexts(el)) contact(collapse(t));
    if (!visible(el)) continue;
    const value = el.attrs.get('value');
    if (value && !value.dynamic && typeof value.value === 'string' && collapse(value.value)) scanValues(el, collapse(value.value));
    const text = own(el);
    if (!text) continue;
    if (BRACKET_PAIR.test(text)) add(problems, 'bare-placeholder');
    scanValues(el, text);
    contact(collapse(inline(el)));
  }
  return { problems, warnings };
}
