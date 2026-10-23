// SEO-02, SEO-04, SEO-06, SEO-09 and SEO-18 on the development URL (server on 127.0.0.1),
// on --dom documents, and the cost on deep trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree, serveRoutes } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const DMW = '---\nversion: alpha\nname: Fixture\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nFixture.\n';
const page = (title, head = '') => `<!doctype html><html lang="es"><head><title>${title}</title><link rel="canonical" href="https://www.example.com/">${head}</head><body><main><a href="/x">x</a></main></body></html>`;
const html = (body, headers = {}) => ({ headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
const strip = (e) => ({ ...e, file: (e.file ?? '').replace(/^http:\/\/127\.0\.0\.1:\d+/, '') });
const of = (entries, id) => entries.filter((e) => e.id === id).map(strip);

async function withSite(routes, urls) {
  const srv = await serveRoutes(routes);
  try {
    const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW });
    return await runCheck({ project, files: [], design: 'DESIGN.md', urls: urls.map((u) => `${srv.base}${u}`), inject: { fetchOptions: { timeoutMs: 1000 } } });
  } finally {
    await srv.close();
  }
}

test('dev URL: noindex seen only there is detalle; titles repeated across routes fail; redirects to login are unverified', async () => {
  const r = await withSite({
    '/': html(page('Inicio'), { 'x-robots-tag': 'noindex' }),
    '/productos': html(page('Inicio', '<meta name="robots" content="noindex">')),
    '/cuenta': { status: 307, headers: { location: '/login' } },
    '/login': html(page('Entrar')),
  }, ['/', '/productos', '/cuenta']);
  assert.deepEqual(of(r.entries, 'SEO-02').map((e) => [e.file, e.status, e.severity]), [
    ['/', 'fail', 'detalle'], ['/cuenta', 'unverified', 'alto'], ['/productos', 'fail', 'detalle'],
  ]);
  assert.deepEqual(of(r.entries, 'SEO-06').filter((e) => e.status === 'fail').map((e) => e.file), ['/', '/productos']);
  assert.match(of(r.entries, 'SEO-04').find((e) => e.file === '/cuenta').reason, /redirected to \/login/);
  assert.equal(r.exitCode, 0);
});

test('a --dom document is checked like a page of the dev URL (noindex -> detalle)', async () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, '.pignolo-ui/runs/r1/dom-1440.html': page('A', '<meta name="robots" content="noindex">') });
  const r = await runCheck({ project, files: [], dom: ['.pignolo-ui/runs/r1/dom-1440.html'], design: 'DESIGN.md' });
  assert.deepEqual(of(r.entries, 'SEO-02').map((e) => [e.status, e.severity]), [['fail', 'detalle']]);
});

test('without web.public every SEO id is one pass that says why', async () => {
  const project = writeTree(makeTempDir(), { 'index.html': page('A', '<meta name="robots" content="noindex">') });
  const r = await runCheck({ project, files: ['index.html'] });
  for (const id of ['SEO-02', 'SEO-04', 'SEO-06', 'SEO-09', 'SEO-18']) {
    assert.deepEqual(of(r.entries, id).map((e) => [e.status, e.reason]), [['pass', 'no DESIGN.md: the site is not declared public (static SEO does not apply)']], id);
  }
});

test('only fragments among the inputs: page rules are unverified; SEO-09 still checks their links', async () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'Card.tsx': 'export const C = () => <a onClick={go}>x</a>;\n' });
  const r = await runCheck({ project, files: ['Card.tsx'], design: 'DESIGN.md' });
  for (const id of ['SEO-02', 'SEO-04', 'SEO-06', 'SEO-18']) {
    assert.deepEqual(of(r.entries, id).map((e) => e.status), ['unverified'], id);
  }
  assert.deepEqual(of(r.entries, 'SEO-09').map((e) => [e.file, e.status]), [['Card.tsx', 'fail']]);
});

test('Next.js pages and layouts with metadata are checked; noindex is alto only on the root layout or the home', async () => {
  const noindex = `export const metadata = { title: 'T', robots: { index: false } };\nexport default function P() { return <main>x</main>; }\n`;
  const project = writeTree(makeTempDir(), {
    'DESIGN.md': DMW,
    'app/layout.tsx': noindex,
    'app/page.tsx': noindex,
    'app/(marketing)/page.tsx': noindex,
    'src/app/layout.tsx': noindex,
    'app/admin/page.tsx': noindex,
    'app/admin/layout.tsx': noindex,
    'app/blog/page.tsx': `export const metadata = { title: 'Blog', robots: { 'index': false } };\nexport default function P() { return <main><a onClick={() => go()} role="link">x</a></main>; }\n`,
    'app/about/page.tsx': `export const metadata = { title: 'About', robots: { "index": true } };\nexport default function P() { return <main>x</main>; }\n`,
  });
  const files = ['app/layout.tsx', 'app/page.tsx', 'app/(marketing)/page.tsx', 'src/app/layout.tsx', 'app/admin/page.tsx', 'app/admin/layout.tsx', 'app/blog/page.tsx', 'app/about/page.tsx'];
  const r = await runCheck({ project, files, design: 'DESIGN.md' });
  assert.deepEqual(of(r.entries, 'SEO-02').map((e) => [e.file, e.status, e.severity]).sort(), [
    ['app/(marketing)/page.tsx', 'fail', 'alto'], ['app/about/page.tsx', 'pass', 'alto'], ['app/admin/layout.tsx', 'fail', 'medio'],
    ['app/admin/page.tsx', 'fail', 'medio'], ['app/blog/page.tsx', 'fail', 'medio'], ['app/layout.tsx', 'fail', 'alto'],
    ['app/page.tsx', 'fail', 'alto'], ['src/app/layout.tsx', 'fail', 'alto'],
  ]);
  assert.deepEqual(of(r.entries, 'SEO-06').filter((e) => e.file === 'app/admin/page.tsx').map((e) => e.status), ['pass']);
  assert.deepEqual(of(r.entries, 'SEO-09').filter((e) => e.status === 'fail').map((e) => e.file), ['app/blog/page.tsx']);
});

test('intentional on SEO-18 turns its fail into pass; SEO-02 and SEO-09 refuse intentional', async () => {
  const design = DMW.replace('    public: true\n', '    public: true\n  intentional:\n    - id: SEO-18\n      why: sin vista previa social\n');
  const project = writeTree(makeTempDir(), { 'DESIGN.md': design, 'index.html': page('A') });
  const r = await runCheck({ project, files: ['index.html'], design: 'DESIGN.md' });
  assert.deepEqual(of(r.entries, 'SEO-18').map((e) => [e.status, e.reason]), [['pass', 'intentional: sin vista previa social']]);
});

test('linear cost: 2000 nested elements with links and metas stay fast', async () => {
  const deep = `<!doctype html><html lang="es"><head><title>A</title></head><body>${'<div><a href="/x">x</a>'.repeat(2000)}${'</div>'.repeat(2000)}</body></html>`;
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'index.html': deep });
  const start = Date.now();
  await runCheck({ project, files: ['index.html'], design: 'DESIGN.md' });
  assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
});

test('SEO-09: an a inside Link (passHref, legacyBehavior), a skip target or a role other than link is not a fail', async () => {
  const ok = {
    'LegacyLink.tsx': 'export const A = () => <Link href="/about" passHref legacyBehavior><a onClick={go}>About</a></Link>;\n',
    'Target.tsx': 'export const B = () => <a id="main" tabIndex={-1}>target</a>;\n',
    'Toggle.tsx': 'export const C = () => <a role="button" onClick={go}>Toggle</a>;\n',
  };
  const bad = {
    'RoleLink.tsx': 'export const D = () => <a onClick={go} role="link">x</a>;\n',
    'Focusable.tsx': 'export const E = () => <a tabIndex={0}>x</a>;\n',
  };
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, ...ok, ...bad });
  const r = await runCheck({ project, files: [...Object.keys(ok), ...Object.keys(bad)], design: 'DESIGN.md' });
  const status = Object.fromEntries(Object.keys({ ...ok, ...bad }).map((f) => [f, of(r.entries, 'SEO-09').filter((e) => e.file === f).map((e) => e.status)]));
  assert.deepEqual(status, { 'LegacyLink.tsx': ['pass'], 'Target.tsx': ['pass'], 'Toggle.tsx': ['pass'], 'RoleLink.tsx': ['fail'], 'Focusable.tsx': ['fail'] });
});
