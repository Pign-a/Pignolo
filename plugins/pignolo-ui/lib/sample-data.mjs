// Labelled sample data (spec §7.1): the data the user gave is used literally; the data not given is filled with
// realistic SAMPLE values, each one marked with `data-sample` on its element, and the screen carries one small
// visible line "Datos de muestra". This is what a script can decide about that rule:
//
//   no-sample-strip      the screen has `data-sample` but no visible text "Datos de muestra"
//   empty-sample         a `data-sample` element with no text and no value (the mark says nothing)
//   bare-placeholder     a lone `‹…›` marker in the text (the old form: it is no longer a sample value)
//   unmarked-sample      (only with `provided`, the literal values of the brief) a money amount, a thousands-grouped
//                        number or a date in the visible text that is neither in `provided` nor inside a `data-sample`
//   real-looking-contact an email outside the reserved domains, or a phone number, anywhere in the visible text
//   warning maybe-unmarked-sample   the same values as unmarked-sample when no `provided` list was given
//
// What it cannot decide: whether a value is realistic, whether a name is a real person or a brand, whether an
// invented item name (not a number or a date) was left unmarked, and whether a number of the text came from the
// brief. Without `provided` it cannot tell a sample amount from one the user gave.
//
// checkSampleData(html, { provided }) -> { problems: [string], warnings: [string] }
import { parseMarkup, ancestors, staticText } from './markup.mjs';

export const STRIP = /datos\s+de\s+muestra/i;
const HEAD_TAGS = new Set(['head', 'title', 'style', 'script', 'template', 'noscript']);
const BRACKETS = /[‹›]/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const RESERVED_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|[a-z0-9-]+\.(?:test|invalid|example|localhost))$/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const SAMPLE_VALUES = [
  /[$€£]\s?\d[\d.,]*/g,
  /\b(?:ARS|USD|EUR)\s?\d[\d.,]*/g,
  /\b\d{1,3}(?:\.\d{3})+(?:,\d+)?/g,
  /\b\d+,\d{2}\b/g,
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

function isPhone(raw) {
  const digits = raw.replace(/\D/g, '').length;
  if (digits < 9 || digits > 15 || /[.,]/.test(raw)) return false;
  return raw.startsWith('+') || /[\s()-]/.test(raw);
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
      || e.attrs.get('aria-hidden')?.value === 'true'
      || /display\s*:\s*none/i.test(String(e.attrs.get('style')?.value ?? '')));
  };
  const marked = (el) => [el, ...ancestors(markup, el)].some((e) => e.attrs.has('data-sample'));
  const own = (el) => el.textParts.filter((p) => !p.dynamic).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();

  const samples = els.filter((e) => e.attrs.has('data-sample') && !HEAD_TAGS.has(e.tag));
  const stripEls = els.filter((e) => visible(e) && STRIP.test(own(e)));
  if (samples.length && !stripEls.length) add(problems, 'no-sample-strip');
  for (const s of samples) {
    if (!staticText(markup, s).text && !s.attrs.has('value')) { add(problems, 'empty-sample'); break; }
  }

  const known = (provided ?? []).map(norm).filter(Boolean);
  const isProvided = (token) => { const t = norm(token); return known.some((k) => k.includes(t) || t.includes(k)); };
  let visibleText = '';
  for (const el of els) {
    if (!visible(el)) continue;
    const text = own(el);
    if (!text) continue;
    visibleText += `${text}\n`;
    if (BRACKETS.test(text)) add(problems, 'bare-placeholder');
    if (marked(el) || stripEls.includes(el)) continue;
    for (const re of SAMPLE_VALUES) {
      for (const m of text.matchAll(re)) {
        if (provided === null) add(warnings, 'maybe-unmarked-sample');
        else if (!isProvided(m[0])) add(problems, 'unmarked-sample');
      }
    }
  }
  for (const m of visibleText.matchAll(EMAIL)) if (!RESERVED_DOMAIN.test(m[1])) add(problems, 'real-looking-contact');
  for (const m of visibleText.matchAll(PHONE)) if (isPhone(m[0])) add(problems, 'real-looking-contact');
  return { problems, warnings };
}
