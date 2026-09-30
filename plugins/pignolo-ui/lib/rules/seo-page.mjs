// Static SEO on pages (spec §5.4, A-06): SEO-02 noindex, SEO-04 canonical, SEO-06 title,
// SEO-09 crawlable links, SEO-18 Open Graph. Project rules: they read every page at once
// (documents and Next.js pages/layouts with metadata among the inputs, and pages fetched from
// the development URL; SEO-09 reads every input with markup, components too). Never floor.
// SEO-02 in the source is alto, except in a Next.js page or layout that is not the root layout
// or the home, where a noindex is usually intended (/admin): medio (orchestrator ruling, hito 2b).
import { pass, fail, unverified } from './api.mjs';
import { staticText } from '../markup.mjs';
import { seoGate, seoPages, seoMarkupInputs, indexable, staticAttr, metadataObject, prop, isNextRoute } from './seo-common.mjs';

const isTag = (el, tag) => el.tag === tag && !el.component;
const inSvg = (markup, el) => {
  for (let p = el.parent; p !== null && p !== undefined; p = markup.elements[p].parent) if (markup.elements[p].tag === 'svg') return true;
  return false;
};
const at = (page, extra = {}) => ({ file: page.file, ...extra });
const NOINDEX = /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i;
const INDEX_FALSE = /(?:^|[^\w$])['"]?index['"]?\s*:\s*false\b/; // index: false, 'index': false

// Runs fn over each page; a skipped page gives one unverified; no page gives one unverified.
function perPage(pctx, fn, pagesOf = seoPages) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const pages = pagesOf(pctx);
  if (!pages.length) return [unverified('no page among the inputs (static SEO checks documents and the development URL)')];
  return pages.flatMap((page) => (page.skip ? [unverified(page.skip, at(page))] : fn(page, pctx)));
}

// ---- SEO-02: accidental noindex ------------------------------------------------------------
function seo02(page, pctx) {
  const sev = page.origin !== 'file' ? { severity: 'detalle' } // seen only on the dev URL
    : isNextRoute(page.file) === 'nested' ? { severity: 'medio' } : {};
  if (!indexable(pctx)) return [pass('indexable false', at(page, { reason: 'web.indexable is false: noindex is declared' }))];
  const out = [];
  for (const el of page.markup.elements) {
    if (!isTag(el, 'meta')) continue;
    const name = (staticAttr(el, 'name') ?? '').toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    const c = el.attrs.get('content');
    if (!c || c.dynamic) { out.push(unverified('dynamic robots meta', at(page, { line: el.line }))); continue; }
    if (!NOINDEX.test(c.value ?? '')) continue;
    if (el.inExpression) { out.push(unverified('conditional robots meta', at(page, { line: el.line }))); continue; }
    out.push(fail(`noindex meta ${name}`, at(page, { line: el.line, selector: `meta[name=${name}]`, reason: `meta ${name} "${c.value}" keeps a public page out of search`, ...sev })));
  }
  const header = page.headers?.['x-robots-tag'] ?? '';
  if (NOINDEX.test(header)) out.push(fail('noindex header', at(page, { reason: `X-Robots-Tag "${header}" on the development URL`, severity: 'detalle' })));
  const meta = metadataObject(page);
  if (meta && meta.dynamic) out.push(unverified('metadata is generated at run time', at(page)));
  else if (meta) {
    const robots = prop(meta.text, 'robots');
    if (robots && robots.kind === 'dynamic') out.push(unverified('dynamic robots metadata', at(page)));
    else if (robots && robots.kind === 'string' && NOINDEX.test(robots.value)) out.push(fail('noindex metadata', at(page, { reason: `metadata.robots "${robots.value}"`, ...sev })));
    else if (robots && robots.kind === 'object' && INDEX_FALSE.test(robots.text)) out.push(fail('noindex metadata', at(page, { reason: 'metadata.robots has index: false', ...sev })));
  }
  return out.length ? out : [pass('no noindex', at(page))];
}

// ---- SEO-04: one absolute canonical -------------------------------------------------------
const ABSOLUTE = /^https?:\/\/[^/\s]+/i;
function seo04(page) {
  const links = page.markup.elements.filter((e) => isTag(e, 'link') && (staticAttr(e, 'rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'));
  if (links.some((e) => e.inExpression)) return [unverified('conditional canonical link', at(page, { line: links[0].line }))];
  if (links.length > 1) return [fail(`canonical x${links.length}`, at(page, { line: links[1].line, reason: `${links.length} canonical links (one expected)`, measure: { count: links.length } }))];
  if (links.length === 1) {
    const el = links[0];
    const href = el.attrs.get('href');
    if (!href || href.dynamic) return [unverified('dynamic canonical href', at(page, { line: el.line }))];
    if (!ABSOLUTE.test((href.value ?? '').trim())) return [fail('canonical relative', at(page, { line: el.line, selector: 'link[rel=canonical]', reason: `canonical "${href.value}" is not absolute` }))];
    return [pass('canonical', at(page, { line: el.line }))];
  }
  if (page.syntax !== 'jsx') return [fail('canonical missing', at(page, { reason: 'no link rel=canonical' }))];
  const meta = metadataObject(page);
  if (!meta) return [unverified('canonical may come from framework metadata in another file', at(page))];
  if (meta.dynamic) return [unverified('metadata is generated at run time', at(page))];
  const alt = prop(meta.text, 'alternates');
  const canonical = alt && alt.kind === 'object' ? prop(alt.text, 'canonical') : alt;
  if (!alt || !canonical) return [unverified('canonical may come from framework metadata in another file', at(page))];
  if (canonical.kind !== 'string') return [unverified('dynamic canonical metadata', at(page))];
  if (ABSOLUTE.test(canonical.value.trim())) return [pass('canonical metadata', at(page))];
  if (prop(meta.text, 'metadataBase')) return [pass('canonical metadata with metadataBase', at(page))];
  return [unverified('relative canonical: metadataBase may be set in another layout', at(page))];
}

// ---- SEO-06: title present, not empty, not duplicated ----------------------------------------
function titleOf(page) {
  const el = page.markup.elements.find((e) => isTag(e, 'title') && !inSvg(page.markup, e));
  if (el) {
    const t = staticText(page.markup, el);
    return t.dynamic ? { dynamic: true, line: el.line } : { text: t.text.replace(/\s+/g, ' ').trim(), line: el.line };
  }
  if (page.syntax !== 'jsx') return { missing: true };
  const meta = metadataObject(page);
  if (!meta) return { framework: true };
  if (meta.dynamic) return { generated: true };
  const t = prop(meta.text, 'title');
  if (!t) return { framework: true };
  if (t.kind === 'string') return { text: t.value.trim() };
  if (t.kind === 'object') {
    const d = prop(t.text, 'absolute') ?? prop(t.text, 'default');
    if (d && d.kind === 'string') return { text: d.value.trim() };
  }
  return { dynamic: true };
}

function seo06All(pctx) {
  const gate = seoGate(pctx);
  if (gate) return gate;
  const pages = seoPages(pctx);
  if (!pages.length) return [unverified('no page among the inputs (static SEO checks documents and the development URL)')];
  const out = [];
  const byTitle = new Map();
  for (const page of pages) {
    if (page.skip) { out.push(unverified(page.skip, at(page))); continue; }
    const t = titleOf(page);
    if (t.missing) out.push(fail('title missing', at(page, { reason: 'no <title>' })));
    else if (t.framework) out.push(unverified('title may come from framework metadata in another file', at(page)));
    else if (t.generated) out.push(unverified('metadata is generated at run time', at(page)));
    else if (t.dynamic) out.push(unverified('dynamic title', at(page, { line: t.line })));
    else if (t.text === '') out.push(fail('title empty', at(page, { line: t.line, reason: 'empty title' })));
    else if (page.syntax === 'jsx') out.push(pass('title', at(page, { line: t.line }))); // layouts give defaults: never compared
    else {
      const k = t.text.toLowerCase();
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push({ page, t });
    }
  }
  for (const group of byTitle.values()) {
    for (const { page, t } of group) {
      if (group.length === 1) out.push(pass('title', at(page, { line: t.line })));
      else out.push(fail(`title duplicate ${t.text.slice(0, 40)}`, at(page, { line: t.line, reason: `title "${t.text}" repeated in ${group.length} pages`, measure: { count: group.length } })));
    }
  }
  return out;
}

// ---- SEO-09: crawlable links --------------------------------------------------------------
// An a without href is a non-crawlable link when it acts as one: onClick, role="link" or a
// tabindex >= 0. Not when a Link component gives it the href (Next.js passHref/legacyBehavior),
// when its role is another one (role="button"), or when tabindex < 0 (a skip-link target).
function hrefFromParent(page, el) {
  const parent = el.parent === null ? null : page.markup.elements[el.parent];
  return Boolean(parent && parent.component && (/(^|\.)Link$/.test(parent.tag) || parent.attrs.has('passhref') || parent.attrs.has('legacybehavior')));
}
function actsAsLink(el) {
  const role = el.attrs.get('role');
  if (role && !role.dynamic && (role.value ?? '').trim().toLowerCase() !== 'link') return false;
  const tab = el.attrs.get('tabindex');
  const focusable = Boolean(tab) && (tab.dynamic || !(Number(tab.value) < 0));
  const roleLink = Boolean(role) && !role.dynamic;
  return el.attrs.has('onclick') || roleLink || focusable;
}
function seo09(page) {
  const out = [];
  for (const el of page.markup.elements) {
    if (!isTag(el, 'a')) continue;
    if (el.spread) { out.push(unverified('spread attributes on a link', at(page, { line: el.line }))); continue; }
    const href = el.attrs.get('href');
    if (!href) {
      if (!hrefFromParent(page, el) && actsAsLink(el)) out.push(fail('a without href', at(page, { line: el.line, selector: 'a', reason: 'a without href used as a link (not crawlable)' })));
      continue;
    }
    if (href.dynamic) { out.push(unverified('dynamic href', at(page, { line: el.line }))); continue; }
    if (/^\s*javascript:/i.test(href.value ?? '')) out.push(fail('a href javascript', at(page, { line: el.line, selector: 'a', reason: 'href="javascript:..." is not a crawlable link' })));
  }
  return out.some((f) => f.status === 'fail') ? out : [...out, pass('links', at(page))];
}

// ---- SEO-18: Open Graph -------------------------------------------------------------------
const OG = ['og:title', 'og:type', 'og:image', 'og:url'];
const OG_KEYS = { 'og:title': 'title', 'og:type': 'type', 'og:image': 'images', 'og:url': 'url' };
function seo18(page) {
  const found = new Map();
  for (const el of page.markup.elements) {
    if (!isTag(el, 'meta')) continue;
    const p = (staticAttr(el, 'property') ?? staticAttr(el, 'name') ?? '').toLowerCase();
    if (!OG.includes(p)) continue;
    const c = el.attrs.get('content');
    found.set(p, !c || c.dynamic || el.inExpression ? 'dynamic' : (c.value ?? '').trim() ? 'ok' : 'empty');
  }
  if (page.syntax === 'jsx' && found.size === 0) {
    const meta = metadataObject(page);
    if (!meta) return [unverified('Open Graph may come from framework metadata in another file', at(page))];
    if (meta.dynamic) return [unverified('metadata is generated at run time', at(page))];
    const og = prop(meta.text, 'openGraph');
    if (!og) return [unverified('Open Graph may come from framework metadata in another file', at(page))];
    if (og.kind !== 'object') return [unverified('dynamic openGraph metadata', at(page))];
    const missing = OG.filter((k) => !prop(og.text, OG_KEYS[k]));
    return missing.length
      ? [unverified(`openGraph without ${missing.join(', ')} (may come from other layouts or file conventions)`, at(page))]
      : [pass('openGraph metadata', at(page))];
  }
  if ([...found.values()].includes('dynamic')) return [unverified('dynamic or conditional Open Graph meta', at(page))];
  const missing = OG.filter((k) => found.get(k) !== 'ok');
  return missing.length
    ? [fail('og missing', at(page, { reason: `missing ${missing.join(', ')}`, measure: { missing } }))]
    : [pass('og', at(page))];
}

export const RULES = [
  { id: 'SEO-02', checkProject: (pctx) => perPage(pctx, seo02) },
  { id: 'SEO-04', checkProject: (pctx) => perPage(pctx, seo04) },
  { id: 'SEO-06', checkProject: seo06All },
  { id: 'SEO-09', checkProject: (pctx) => perPage(pctx, seo09, seoMarkupInputs) },
  { id: 'SEO-18', checkProject: (pctx) => perPage(pctx, seo18) },
];
