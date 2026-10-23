// Shared pieces of the SEO rules (lib/site-files.mjs, lib/rules/seo-common.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { findSiteFile, generatedBy, siteFiles } from '../lib/site-files.mjs';
import { seoGate, seoPages, prop, metadataObject } from '../lib/rules/seo-common.mjs';
import { parseMarkup } from '../lib/markup.mjs';

test('site files: root, public/ and static/; generated route handlers are not files', () => {
  const p = writeTree(makeTempDir(), { 'public/robots.txt': 'x', 'static/sitemap.xml': 'x', 'app/robots.ts': 'x', 'src/app/sitemap.ts': 'x' });
  assert.equal(findSiteFile(p, '/robots.txt'), 'public/robots.txt');
  assert.equal(findSiteFile(p, 'sitemap.xml'), 'static/sitemap.xml');
  assert.equal(findSiteFile(p, '/nope.xml'), null);
  assert.equal(findSiteFile(p, '/../x'), null);
  assert.equal(generatedBy(p, 'robots'), 'app/robots.ts');
  assert.equal(generatedBy(p, 'sitemap'), 'src/app/sitemap.ts');
  assert.deepEqual(siteFiles(p), ['public/robots.txt', 'static/sitemap.xml']);
});

const design = (web) => ({ data: { pignolo: { schema: 1, ...(web ? { web } : {}) } } });

test('seoGate: runs only when DESIGN.md declares web.public: true', () => {
  assert.match(seoGate({ design: null })[0].reason, /no DESIGN\.md/);
  assert.equal(seoGate({ design: null })[0].status, 'pass');
  assert.equal(seoGate({ design: { data: null } })[0].status, 'unverified');
  assert.match(seoGate({ design: design({ public: false }) })[0].reason, /web\.public is not true/);
  assert.match(seoGate({ design: design(null) })[0].reason, /web\.public is not true/);
  assert.equal(seoGate({ design: design({ public: true }) }), null);
});

test('seoGate: a DESIGN.md that exists but was not given says so; not-applicable passes are marked', () => {
  const withFile = writeTree(makeTempDir(), { 'DESIGN.md': '---\npignolo:\n  schema: 1\n---\n' });
  const given = seoGate({ design: null, project: withFile })[0];
  assert.deepEqual([given.status, given.reason, given.measure], ['pass', 'DESIGN.md not given: pass --design to check static SEO', { applicable: false }]);
  assert.match(seoGate({ design: null, project: makeTempDir() })[0].reason, /^no DESIGN\.md/);
  assert.deepEqual(seoGate({ design: design({ public: false }) })[0].measure, { applicable: false });
});

const ctx = (file, text, extra = {}) => {
  const syntax = file.endsWith('.tsx') ? 'jsx' : 'html';
  const markup = parseMarkup(text, { syntax });
  return { file, text, syntax, markup, isDocument: markup.hasHtmlRoot, mockup: false, origin: 'file', ...extra };
};

test('seoPages: documents among the inputs, never mockups or fragments; fetched pages with skip reasons', () => {
  const doc = '<!doctype html><html><head><title>A</title></head><body></body></html>';
  const page = (p, extra = {}) => ({ url: `http://127.0.0.1:1${p}`, path: p, finalUrl: `http://127.0.0.1:1${p}`, status: 200, headers: { 'content-type': 'text/html' }, text: doc, ...extra });
  const pages = seoPages({
    ctxs: [ctx('index.html', doc), ctx('Card.tsx', 'export const C = () => <div/>;'), ctx('design/approved/x/home.html', doc, { mockup: true })],
    site: { pages: [
      page('/'), page('/a/', { finalUrl: 'http://127.0.0.1:1/a' }), page('/cuenta', { finalUrl: 'http://127.0.0.1:1/login' }),
      page('/b', { status: 500 }), page('/c', { headers: { 'content-type': 'application/json' } }),
      page('/d', { text: '<html><body><form><input type="password"></form></body></html>' }), { url: 'http://127.0.0.1:1/e', path: '/e', error: 'no response in 5000 ms' },
    ] },
  });
  assert.deepEqual(pages.map((p) => [p.file.replace('http://127.0.0.1:1', ''), p.origin, p.skip]), [
    ['index.html', 'file', null], ['/', 'url', null], ['/a/', 'url', null],
    ['/cuenta', 'url', 'redirected to /login (may require a session)'], ['/b', 'url', 'HTTP 500'], ['/c', 'url', 'not an HTML response'],
    ['/d', 'url', 'requires a session (password field)'], ['/e', 'url', 'no response in 5000 ms'],
  ]);
});

test('seoPages is computed once per pctx: the seven rules share one parse', () => {
  const doc = '<!doctype html><html><head><title>A</title></head><body></body></html>';
  const pctx = { ctxs: [ctx('index.html', doc)], site: { pages: [{ url: 'http://127.0.0.1:1/', path: '/', finalUrl: 'http://127.0.0.1:1/', status: 200, headers: { 'content-type': 'text/html' }, text: doc }] } };
  const first = seoPages(pctx);
  assert.equal(seoPages(pctx), first);
  assert.notEqual(seoPages({ ...pctx }), first);
});

test('prop reads first-level literals of a metadata object and marks the rest dynamic', () => {
  const src = "{ title: { template: '%s | T', default: 'T' }, robots: { index: false, googleBot: { index: true } }, alternates: { canonical: '/' }, metadataBase: new URL('https://x.com'), description: `a${b}`, n: 2, openGraph: { title: 'T', images: ['/og.png'] } }";
  assert.deepEqual(prop(src, 'title'), { kind: 'object', text: "{ template: '%s | T', default: 'T' }" });
  assert.deepEqual(prop(prop(src, 'title').text, 'default'), { kind: 'string', value: 'T' });
  assert.equal(prop(src, 'robots').kind, 'object');
  assert.deepEqual(prop(src, 'metadataBase'), { kind: 'dynamic' });
  assert.deepEqual(prop(src, 'description'), { kind: 'dynamic' });
  assert.deepEqual(prop(src, 'n'), { kind: 'literal', value: '2' });
  assert.equal(prop(src, 'canonical'), null); // not at the first level
  assert.deepEqual(prop(prop(src, 'alternates').text, 'canonical'), { kind: 'string', value: '/' });
  assert.equal(prop("{ robots: process.env.X ? { index: false } : undefined }", 'robots').kind, 'dynamic');
  assert.equal(prop("{ robots: { index: isPreview } }", 'robots').kind, 'dynamic');
  assert.equal(prop("{ other: 'title: x' }", 'title'), null); // inside a string
});

test('metadataObject: Next.js export const metadata, typed or not; generateMetadata is dynamic', () => {
  const m = (text) => metadataObject(ctx('app/layout.tsx', text));
  assert.equal(m("export const metadata: Metadata = { title: 'A' };\nexport default function L() { return <html></html>; }").text, "{ title: 'A' }");
  assert.equal(m("export const metadata = { title: 'A' };").text, "{ title: 'A' }");
  assert.deepEqual(m('export async function generateMetadata() { return {}; }'), { dynamic: true });
  assert.equal(m('export default function L() { return <html></html>; }'), null);
  assert.equal(metadataObject(ctx('index.html', '<html></html>')), null);
});
