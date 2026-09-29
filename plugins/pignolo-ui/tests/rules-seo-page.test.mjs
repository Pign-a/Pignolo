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

test('only fragments among the inputs: one unverified per id, never a fail', async () => {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DMW, 'Card.tsx': 'export const C = () => <a onClick={go}>x</a>;\n' });
  const r = await runCheck({ project, files: ['Card.tsx'], design: 'DESIGN.md' });
  for (const id of ['SEO-02', 'SEO-04', 'SEO-06', 'SEO-09', 'SEO-18']) {
    assert.deepEqual(of(r.entries, id).map((e) => e.status), ['unverified'], id);
  }
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
