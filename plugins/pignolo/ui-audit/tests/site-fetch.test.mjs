// Fetch of the development URL (lib/site-fetch.mjs): loopback only, same-origin redirects,
// byte cap and timeouts. The server runs on 127.0.0.1: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes } from './helpers.mjs';
import { isLoopbackUrl, fetchSite } from '../lib/site-fetch.mjs';

test('isLoopbackUrl accepts only local http(s) addresses', async (t) => {
  const CASES = [
    ['http://localhost:3000/', true], ['http://127.0.0.1/', true], ['http://[::1]:5173/x', true], ['http://LOCALHOST:3000/', true],
    ['http://127.1.2.3/', true], ['http://2130706433/', true], // WHATWG URL normalizes to 127.0.0.1
    ['https://example.com/', false], ['http://10.0.0.1/', false], ['http://192.168.0.10:3000/', false],
    ['http://127.0.0.1.example.com/', false], ['http://app.localhost/', false], ['http://localhost.example.com/', false], ['file:///c:/x.html', false], ['http://u:p@localhost/', false], ['nope', false],
  ];
  for (const [u, ok] of CASES) await t.test(u, () => assert.equal(isLoopbackUrl(u), ok));
});

test('fetchSite: pages, robots.txt, sitemaps by path, redirects, caps and timeouts', async () => {
  const html = (body, headers = {}) => ({ headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
  const srv = await serveRoutes({
    '/': html('<!doctype html><html lang="es"><head><title>Inicio</title></head><body>ñ</body></html>', { 'x-robots-tag': 'noindex' }),
    '/same': { status: 301, headers: { location: '/' } },
    '/away': { status: 302, headers: { location: 'https://www.example.com/login' } },
    '/big': { body: 'x'.repeat(3 * 1024 * 1024) },
    '/hang': () => {},
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nSitemap: https://www.example.com/sitemap.xml\n' },
    '/sitemap.xml': { headers: { 'content-type': 'application/xml' }, body: '<urlset></urlset>' },
  });
  try {
    const u = (p) => `${srv.base}${p}`;
    const site = await fetchSite({ urls: [u('/'), u('/same'), u('/away'), u('/big'), u('/hang'), u('/missing')], timeoutMs: 400 });
    const [root, same, away, big, hang, missing] = site.pages;
    assert.equal(root.status, 200);
    assert.equal(root.headers['x-robots-tag'], 'noindex');
    assert.match(root.text, /ñ/);
    assert.match(root.sha256, /^[0-9a-f]{64}$/);
    assert.equal(new URL(same.finalUrl).pathname, '/');
    assert.equal(same.path, '/same');
    assert.equal(away.error, 'redirected outside the development origin');
    assert.match(big.error, /larger than/);
    assert.match(hang.error, /no response in 400 ms/);
    assert.equal(missing.status, 404);
    assert.equal(site.robots.status, 200);
    // the production URL in robots.txt is never requested: its path is fetched on the dev origin
    assert.deepEqual(site.sitemaps.map((s) => [s.path, s.status, s.declared]), [['/sitemap.xml', 200, 'https://www.example.com/sitemap.xml']]);
  } finally {
    await srv.close();
  }
});

test('fetchSite refuses a non-loopback URL and URLs of two origins', async () => {
  await assert.rejects(fetchSite({ urls: ['https://example.com/'] }), /not a loopback URL/);
  await assert.rejects(fetchSite({ urls: ['http://127.0.0.1:1/', 'http://localhost:2/'] }), /one origin/);
  assert.equal(await fetchSite({ urls: [] }), null);
});

test('fetchSite: one deadline for the whole fetch; what does not arrive in time is deadline', async () => {
  const srv = await serveRoutes({
    '/': { headers: { 'content-type': 'text/html' }, body: '<!doctype html><html><head><title>A</title></head></html>' },
    '/hang': () => {},
  });
  try {
    const u = (p) => `${srv.base}${p}`;
    const site = await fetchSite({ urls: [u('/'), u('/hang'), u('/b')], timeoutMs: 5000, deadlineMs: 300 });
    const [root, hang, b] = site.pages;
    assert.equal(root.status, 200);
    assert.equal(hang.error, 'deadline (300 ms for the whole --url fetch)');
    assert.equal(b.error, 'deadline (300 ms for the whole --url fetch)');
    assert.match(site.robots.error, /^deadline/);
  } finally {
    await srv.close();
  }
});
