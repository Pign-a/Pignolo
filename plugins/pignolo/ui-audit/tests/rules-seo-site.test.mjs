// SEO-01 and SEO-05 on the development URL (server on 127.0.0.1) and extra cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree, serveRoutes } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const DMW = '---\nversion: alpha\nname: Fixture\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nFixture.\n';
const PAGE = '<!doctype html><html lang="es"><head><title>Inicio</title><link rel="stylesheet" href="/_next/static/css/app.css"></head><body><main>x</main><script src="/_next/static/chunks/main.js"></script></body></html>';
const html = (body) => ({ headers: { 'content-type': 'text/html; charset=utf-8' }, body });
const text = (body, type = 'text/plain') => ({ headers: { 'content-type': type }, body });
const of = (entries, id) => entries.filter((e) => e.id === id).map((e) => ({ ...e, file: (e.file ?? '').replace(/^http:\/\/127\.0\.0\.1:\d+/, '') }));

async function withSite(routes, files = {}, urls = ['/']) {
  const srv = await serveRoutes(routes);
  try {
    const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, ...files });
    return await runCheck({ project, files: [], design: 'DESIGN.md', urls: urls.map((u) => `${srv.base}${u}`), inject: { fetchOptions: { timeoutMs: 1000 } } });
  } finally {
    await srv.close();
  }
}

test('SEO-01 on the dev URL: render assets under /_next/ blocked, sitemap path fetched on the dev origin', async () => {
  const r = await withSite({
    '/': html(PAGE),
    '/robots.txt': text('User-agent: *\nDisallow: /_next/\nSitemap: https://www.example.com/sitemap.xml\n'),
    '/sitemap.xml': text('<urlset><url><loc>https://www.example.com/</loc></url></urlset>', 'application/xml'),
  });
  const seo01 = of(r.entries, 'SEO-01');
  assert.deepEqual(seo01.filter((e) => e.status === 'fail').map((e) => [e.file, e.line, e.reason]), [
    ['/robots.txt', 2, 'robots.txt blocks the render asset /_next/static/chunks/main.js (/_next/)'],
    ['/robots.txt', 2, 'robots.txt blocks the render asset /_next/static/css/app.css (/_next/)'],
  ]);
  assert.equal(seo01.some((e) => e.file === 'robots.txt'), false, 'with --url a project without robots.txt adds nothing');
  assert.deepEqual(of(r.entries, 'SEO-05').map((e) => [e.status, e.file]), [['pass', '/sitemap.xml']]);
  assert.equal(r.exitCode, 0); // SEO never blocks
});

test('SEO-01/SEO-05 on the dev URL: 404 robots passes, broken sitemap fails, errors are unverified', async () => {
  const noRobots = await withSite({ '/': html(PAGE) });
  assert.deepEqual(of(noRobots.entries, 'SEO-01').map((e) => [e.status, e.reason]), [['pass', 'no robots.txt: everything is allowed']]);
  const broken = await withSite({ '/': html(PAGE), '/robots.txt': text('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n'), '/sitemap.xml': text('<urlset>', 'application/xml') });
  assert.match(of(broken.entries, 'SEO-05')[0].reason, /unclosed element <urlset>/);
  const missing = await withSite({ '/': html(PAGE), '/robots.txt': text('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n') });
  assert.deepEqual(of(missing.entries, 'SEO-05').map((e) => [e.status, e.reason]), [['fail', 'sitemap /sitemap.xml referenced by robots.txt answers 404']]);
  const failing = await withSite({ '/': html(PAGE), '/robots.txt': { status: 500 } });
  assert.deepEqual(of(failing.entries, 'SEO-01').map((e) => [e.status, e.reason]), [['unverified', 'HTTP 500']]);
});

test('SEO-01: the public routes are / and each --url path', async () => {
  const r = await withSite({ '/': html(PAGE), '/precios': html(PAGE.replace('Inicio', 'Precios')), '/robots.txt': text('User-agent: *\nDisallow: /precios\nSitemap: /s.xml\n') }, {}, ['/', '/precios']);
  assert.deepEqual(of(r.entries, 'SEO-01').filter((e) => e.status === 'fail').map((e) => e.reason), ['robots.txt blocks the public route /precios (/precios)']);
});

test('SEO-01 and SEO-05 read the project files too: public/ and static/', () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'static/robots.txt': 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n', 'static/sitemap.xml': '<urlset><url><loc>https://e.com/</loc></url></urlset>\n' });
  return runCheck({ project, files: [], design: 'DESIGN.md' }).then((r) => {
    assert.deepEqual(of(r.entries, 'SEO-01').map((e) => [e.status, e.file]), [['pass', 'static/robots.txt']]);
    assert.deepEqual(of(r.entries, 'SEO-05').map((e) => [e.status, e.file]), [['pass', 'static/sitemap.xml']]);
  });
});
