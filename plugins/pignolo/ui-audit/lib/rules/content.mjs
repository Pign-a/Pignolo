// Content rules (spec §5.4, §7.1): CONTENT-01 placeholders, COPY-01 marketing filler, ICON-01
// emoji at the start of UI text. All are element rules, so ctx.markup is set (html/jsx).
import { fail, unverified } from './api.mjs';
import { staticText } from '../markup.mjs';

const MARKER = '\u2039'; // single left-pointing angle quote, the old bare marker, still detected (the new form is data-sample)
const SKIP_TAGS = new Set(['script', 'style']);
const AVATAR_HOSTS = ['pravatar.cc', 'randomuser.me', 'ui-avatars.com', 'placehold.co', 'via.placeholder.com', 'placekitten.com', 'picsum.photos'];
const ROUND_FIGURE = /\b\d{1,3}(?:[.,]\d{3})+\s*\+|\b\d+(?:[.,]\d+)?\s*[kKmM]\s*\+/;

export const COPY_EN = ['seamless', 'unlock the power', 'revolutionize', 'game-changer', 'game changer', 'cutting-edge', 'next-level', 'to the next level', 'supercharge', 'elevate your', 'effortless', "in today's fast-paced", 'world-class', 'best-in-class'];
export const COPY_ES = ['sin fisuras', 'revoluciona', 'al siguiente nivel', 'de vanguardia', 'potencia tu', 'desbloquea', 'sin esfuerzo', 'de clase mundial', 'en el mundo acelerado de hoy'];

// case- and accent-insensitive comparison; typographic apostrophes become plain ones
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase();

const ownText = (el) => el.textParts.filter((p) => !p.dynamic).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();

// tag + sorted static attributes (no class) + first 40 chars of the text
function elementKey(el, text) {
  const attrs = [...el.attrs.entries()]
    .filter(([name, a]) => name !== 'class' && name !== 'classname' && !a.dynamic)
    .map(([name, a]) => (a.value === null ? name : `${name}=${a.value}`))
    .sort();
  return [el.tag, ...attrs, text.slice(0, 40)].join('|');
}

function content01(ctx) {
  if (!ctx.markup) return [];
  const out = [];
  const markerSeverity = ctx.mockup ? 'detalle' : 'bloquea';
  for (const el of ctx.markup.elements) {
    if (SKIP_TAGS.has(el.tag)) continue;
    const text = ownText(el);
    const key = elementKey(el, text);
    const at = { line: el.line, selector: el.tag };

    const staticAttrs = [...el.attrs.entries()].filter(([, a]) => !a.dynamic && typeof a.value === 'string');
    const hasMarker = el.attrs.has('data-sample') || text.includes(MARKER) || staticAttrs.some(([, a]) => a.value.includes(MARKER));
    if (hasMarker) out.push(fail(`marker|${key}`, { ...at, severity: markerSeverity, reason: 'sample data (data-sample) or a bare marker (‹…›)' }));

    const folded = fold(text);
    const signals = [];
    if (/lorem ipsum/.test(folded)) signals.push('lorem');
    if (/\b(john|jane) doe\b/.test(folded)) signals.push('person');
    if (/\bacme\b/.test(folded)) signals.push('company');
    if (ROUND_FIGURE.test(text)) signals.push('round');
    for (const [name, a] of staticAttrs) {
      if (name === 'src' || name === 'srcset') {
        let host = null;
        for (const h of AVATAR_HOSTS) if (fold(a.value).includes(h)) host = h;
        if (host) signals.push(`avatar:${host}`);
      }
    }
    for (const s of signals) {
      out.push(fail(`${s}|${key}`, { ...at, severity: 'medio', reason: `placeholder content (${s.split(':')[0]})` }));
    }
  }
  return out;
}

function htmlLang(markup) {
  const html = markup.elements.find((e) => e.tag === 'html');
  const attr = html && html.attrs.get('lang');
  if (!attr) return { known: false };
  if (attr.dynamic || typeof attr.value !== 'string') return { known: false };
  return { known: true, lang: attr.value.trim().toLowerCase() };
}

function copy01(ctx) {
  if (!ctx.markup) return [];
  const { known, lang } = htmlLang(ctx.markup);
  let lists = [COPY_EN, COPY_ES];
  if (known) {
    if (lang.startsWith('en')) lists = [COPY_EN];
    else if (lang.startsWith('es')) lists = [COPY_ES];
    else return [unverified(`unsupported lang ${lang}`)];
  }
  // whole words only: JS \b is not Unicode-aware, so letters/digits are checked with lookarounds
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phrases = lists.flat().map((p) => [p, new RegExp(`(?<![\\p{L}\\p{N}])${escape(fold(p))}(?![\\p{L}\\p{N}])`, 'u')]);
  const out = [];
  for (const el of ctx.markup.elements) {
    if (SKIP_TAGS.has(el.tag)) continue;
    const text = ownText(el);
    if (!text) continue;
    const folded = fold(text);
    for (const [phrase, needle] of phrases) {
      if (needle.test(folded)) {
        out.push(fail(`${phrase}|${elementKey(el, text)}`, { line: el.line, selector: el.tag, reason: `marketing filler: "${phrase}"` }));
      }
    }
  }
  return out;
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Emoji shown as emoji: default emoji presentation, or a pictograph followed by U+FE0F.
// Text-presentation symbols (©, ®, ™, ❤ without FE0F) are not emoji here.
const VS16 = String.fromCharCode(0xfe0f);
const EMOJI_START = new RegExp('^(?:' + '\\p{Emoji_Presentation}|' + '\\p{Extended_Pictographic}' + VS16 + ')', 'u');
// spaces and variation selector-16 before the emoji are ignored
const LEADING = new RegExp('^[\\s' + VS16 + ']+');

function icon01(ctx) {
  if (!ctx.markup) return [];
  const { markup } = ctx;
  const out = [];
  for (const el of markup.elements) {
    if (el.component) continue;
    let applies = el.tag === 'button' || el.tag === 'li' || HEADINGS.has(el.tag);
    if (!applies && el.tag === 'a') {
      let p = el.parent;
      while (p !== null && p !== undefined) {
        const anc = markup.elements[p];
        if (anc.tag === 'nav' && !anc.component) { applies = true; break; }
        p = anc.parent;
      }
    }
    if (!applies) continue;
    const { text } = staticText(markup, el);
    const lead = text.replace(LEADING, '');
    if (EMOJI_START.test(lead)) {
      out.push(fail(elementKey(el, text), { line: el.line, selector: el.tag, reason: 'emoji at the start of UI text' }));
    }
  }
  return out;
}

export const RULES = [
  { id: 'CONTENT-01', checkFile: content01 },
  { id: 'COPY-01', checkFile: copy01 },
  { id: 'ICON-01', checkFile: icon01 },
];
