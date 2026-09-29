// Document rules (spec §5.4, level document): A11Y-01, A11Y-02, A11Y-05, A11Y-28, META-01.
// The runner only calls checkFile on documents (ctx.isDocument); other files never reach here.
import { pass, fail, unverified } from './api.mjs';
import { staticText, ancestors } from '../markup.mjs';

// BCP 47 (RFC 5646) shape only, not the IANA registry: language, optional script, region,
// variants, extensions and private use. Grandfathered tags are not accepted.
const BCP47 = new RegExp(
  '^[a-z]{2,3}(-[a-z]{4})?(-(?:[a-z]{2}|\\d{3}))?(-(?:[a-z0-9]{5,8}|\\d[a-z0-9]{3}))*' +
  '(-[a-wyz0-9](-[a-z0-9]{2,8})+)*(-x(-[a-z0-9]{1,8})+)?$', 'i');

export function isBcp47Shape(tag) {
  return typeof tag === 'string' && BCP47.test(tag);
}

// META-01 lists. Sources: the default <title> and favicon files that the project generators
// ship (create-next-app, create-vite for react/vue/svelte, SvelteKit, the HTML5 boilerplate),
// and the attribution strings that site builders and AI page generators leave behind.
const TEMPLATE_TITLES = new Set([
  'create next app', 'react app', 'vite app', 'vite + react', 'vite + react + ts', 'vite + vue',
  'vite + vue + ts', 'vite + svelte', 'vite + svelte + ts', 'sveltekit app', 'document', 'untitled',
]);
const DEFAULT_FAVICONS = new Set(['vite.svg', 'next.svg']);
const ATTRIBUTION = /(made|built|generated) (with|by) (v0|lovable|bolt|framer|webflow|wix)/i;

const isTag = (el, tag) => el.tag === tag && !el.component;
const staticAttr = (el, name) => {
  const a = el.attrs.get(name);
  return a && !a.dynamic ? a.value : undefined;
};
const inSvg = (markup, el) => ancestors(markup, el).some((a) => a.tag === 'svg');
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

function a11y01(ctx) {
  const html = ctx.markup.elements.find((e) => isTag(e, 'html'));
  if (!html) return [unverified('not a document')];
  const lang = html.attrs.get('lang');
  const at = { line: html.line, selector: 'html' };
  if (lang && lang.dynamic) return [unverified('dynamic lang', { ...at, key: 'html lang dynamic' })];
  if (!lang || lang.value === null || lang.value.trim() === '') {
    return [fail('html lang missing', { ...at, reason: 'html has no lang or it is empty' })];
  }
  if (!isBcp47Shape(lang.value.trim())) {
    return [fail('html lang=' + lang.value, { ...at, reason: 'lang "' + lang.value + '" is not a well-formed BCP 47 tag' })];
  }
  return [pass('html lang=' + lang.value, at)];
}

function a11y02(ctx) {
  const titles = ctx.markup.elements.filter((e) => isTag(e, 'title') && !inSvg(ctx.markup, e));
  if (titles.length === 0) {
    if (ctx.syntax === 'jsx') return [unverified('title may come from framework metadata (no <title> in the file)')];
    return [fail('title missing', { reason: 'the document has no <title>' })];
  }
  const el = titles[0];
  const t = staticText(ctx.markup, el);
  if (t.dynamic) return [unverified('dynamic title', { line: el.line, selector: 'title', key: 'title dynamic' })];
  if (t.text.trim() === '') return [fail('title empty', { line: el.line, selector: 'title', reason: '<title> is empty' })];
  return [pass('title', { line: el.line, selector: 'title' })];
}

function a11y05(ctx) {
  const mains = ctx.markup.elements.filter((e) => {
    if (isTag(e, 'main')) return true;
    const role = e.attrs.get('role');
    return !!role && !role.dynamic && typeof role.value === 'string' && role.value.trim().toLowerCase() === 'main';
  });
  const n = mains.length;
  if (n === 1) return [pass('main', { line: mains[0].line })];
  if (n === 0 && ctx.syntax === 'jsx') return [unverified('no main landmark in this file (a component or layout may provide it)')];
  return [fail('main x' + n, { line: mains[1]?.line ?? 1, reason: n + ' main landmarks (exactly one expected)', measure: { count: n } })];
}

// Returns the reason a viewport content string blocks zoom, or null.
function zoomBlocked(content) {
  const props = new Map();
  for (const part of content.split(/[,;]/)) {
    const [k, v] = part.split('=');
    if (v !== undefined) props.set(k.trim().toLowerCase(), v.trim().toLowerCase());
  }
  const us = props.get('user-scalable');
  if (us === 'no' || us === '0') return 'user-scalable disables zoom';
  const max = parseFloat(props.get('maximum-scale'));
  if (Number.isFinite(max) && max < 2) return 'maximum-scale ' + max + ' is below 2';
  return null;
}

// Same test on the source of a Next.js `export const viewport = {...}` object.
function exportZoomBlocked(src) {
  const at = src.search(/\bviewport\b/);
  if (at < 0) return null;
  const body = src.slice(at);
  if (/userScalable\s*:\s*(false|0|['"](no|0)['"])/.test(body)) return 'userScalable disables zoom';
  const m = /maximumScale\s*:\s*([\d.]+)/.exec(body);
  if (m && parseFloat(m[1]) < 2) return 'maximumScale ' + m[1] + ' is below 2';
  return null;
}

function a11y28(ctx) {
  const out = [];
  const metas = ctx.markup.elements.filter((e) => isTag(e, 'meta') && String(staticAttr(e, 'name') ?? '').toLowerCase() === 'viewport');
  for (const meta of metas) {
    const c = meta.attrs.get('content');
    if (!c || c.dynamic) { out.push(unverified('dynamic viewport content', { line: meta.line, key: 'viewport dynamic' })); continue; }
    const why = zoomBlocked(c.value ?? '');
    out.push(why ? fail('meta viewport', { line: meta.line, selector: 'meta[name=viewport]', reason: why }) : pass('meta viewport', { line: meta.line }));
  }
  if (ctx.syntax === 'jsx' && ctx.markup.exportsText) {
    const why = exportZoomBlocked(ctx.markup.exportsText);
    if (why) out.push(fail('export viewport', { reason: why, line: lineOf(ctx.text, Math.max(0, ctx.text.indexOf('viewport'))) }));
  }
  if (out.length === 0) out.push(pass('no viewport declared'));
  return out;
}

function meta01(ctx) {
  const out = [];
  for (const el of ctx.markup.elements) {
    if (isTag(el, 'title') && !inSvg(ctx.markup, el)) {
      const t = staticText(ctx.markup, el);
      const text = t.text.trim();
      if (!t.dynamic && TEMPLATE_TITLES.has(text.toLowerCase())) {
        out.push(fail('title ' + text, { line: el.line, selector: 'title', reason: 'template title "' + text + '"' }));
      }
    } else if (isTag(el, 'link')) {
      const rel = String(staticAttr(el, 'rel') ?? '').toLowerCase().split(/\s+/);
      const href = String(staticAttr(el, 'href') ?? '');
      const base = href.split(/[?#]/)[0].split('/').pop().toLowerCase();
      if (rel.includes('icon') && DEFAULT_FAVICONS.has(base)) {
        out.push(fail('favicon ' + base, { line: el.line, selector: 'link[rel=icon]', reason: 'default favicon ' + base }));
      }
    } else if (isTag(el, 'meta') && String(staticAttr(el, 'name') ?? '').toLowerCase() === 'generator') {
      out.push(fail('generator ' + (staticAttr(el, 'content') ?? ''), { line: el.line, selector: 'meta[name=generator]', reason: 'meta generator attribution' }));
    }
  }
  const m = ATTRIBUTION.exec(ctx.text);
  if (m) out.push(fail('attribution ' + m[0].toLowerCase(), { line: lineOf(ctx.text, m.index), reason: 'generator attribution "' + m[0] + '"' }));
  if (out.length === 0) out.push(pass('no template leftovers'));
  return out;
}

const forDocument = (fn) => (ctx) => (ctx.markup ? fn(ctx) : [unverified('not a document')]);

export const RULES = [
  { id: 'A11Y-01', checkFile: forDocument(a11y01) },
  { id: 'A11Y-02', checkFile: forDocument(a11y02) },
  { id: 'A11Y-05', checkFile: forDocument(a11y05) },
  { id: 'A11Y-28', checkFile: forDocument(a11y28) },
  { id: 'META-01', checkFile: forDocument(meta01) },
];
