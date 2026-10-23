// Cross tests of hito 2b through the CLIs, in temporary git repos: a realistic public Next.js
// site (SEO never blocks, no false fail on common patterns) and one batch of §9 + §12 end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { makeTempDir, writeTree, runScript, serveRoutes, PLUGIN_ROOT } from './helpers.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function repo(tree) {
  const dir = writeTree(makeTempDir(), tree);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return dir;
}
const porcelain = (dir) => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' });

// Async subprocess: the dev server of the test lives in this process.
function runAsync(script, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const DESIGN = '---\nversion: alpha\nname: Tienda\npignolo:\n  schema: 1\n  web:\n    public: true\n---\n\n## Overview\n\nTienda.\n';
const LAYOUT = `import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.example.com'),
  title: { template: '%s | Tienda', default: 'Tienda' },
  alternates: { canonical: '/' },
  openGraph: { title: 'Tienda', type: 'website', url: '/', images: ['/og.png'] },
  robots: process.env.VERCEL_ENV === 'preview' ? { index: false } : undefined,
};

export default function RootLayout({ children, preview }: { children: React.ReactNode; preview: boolean }) {
  return (
    <html lang="es">
      <head>{preview && <meta name="robots" content="noindex" />}</head>
      <body>
        <nav><a href="/">Inicio</a><a href={'/productos'}>Productos</a><Link href="/ayuda">Ayuda</Link></nav>
        <main>{children}</main>
        <footer>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</footer>
      </body>
    </html>
  );
}
`;

test('realistic public Next.js site: no SEO fail from common patterns; the dev URL adds detalle only', async () => {
  const dir = repo({
    'DESIGN.md': DESIGN, 'app/layout.tsx': LAYOUT, 'app/page.tsx': 'export default function Page() { return <section><h1>Hola</h1></section>; }\n',
    'public/robots.txt': 'User-agent: *\nDisallow: /api/\n\nSitemap: https://www.example.com/sitemap.xml\n',
    'public/sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.com/</loc></url></urlset>\n',
  });
  const run = path.join(dir, '.pignolo-ui', 'runs', 'r1');
  const files = runScript('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--files', 'app/layout.tsx', '--files', 'app/page.tsx'], { cwd: dir });
  assert.equal(files.status, 0, files.stderr);
  const seo = (report) => report.entries.filter((e) => e.id.startsWith('SEO-'));
  const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
  assert.deepEqual(seo(report).filter((e) => e.status === 'fail'), [], JSON.stringify(seo(report), null, 1));
  assert.ok(seo(report).some((e) => e.id === 'SEO-02' && e.status === 'unverified'), 'conditional/env robots are unverified');

  const page = '<!doctype html><html lang="es"><head><title>Tienda</title><link rel="canonical" href="https://www.example.com/"></head><body><main>x</main></body></html>';
  const srv = await serveRoutes({ '/': { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' }, body: page } });
  try {
    const r = await runAsync('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--url', `${srv.base}/`], dir);
    assert.equal(r.status, 0, r.stderr);
    const withUrl = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
    const noindex = seo(withUrl).filter((e) => e.id === 'SEO-02' && e.status === 'fail');
    assert.deepEqual(noindex.map((e) => e.severity), ['detalle']);
  } finally {
    await srv.close();
  }
  assert.equal(porcelain(dir), '');
});

test('one batch end to end: save, edit, verify, ui-check, report-check (0, then 1), restore', () => {
  const MANIFEST = 'a'.repeat(64);
  const approved = `${DESIGN}\n## Decisions\n\n- 2026-09-29 — approved \`design/approved/tienda/\` (manifest sha256 \`${MANIFEST}\`): "A"\n`;
  const implemented = { implemented: true, implements: { path: 'design/approved/tienda', manifestSha256: MANIFEST } };
  const dir = repo({ 'DESIGN.md': approved, 'src/Save.tsx': 'export const S = () => <button><svg /></button>;\n' });
  const run = path.join(dir, '.pignolo-ui', 'runs', 'r1');
  writeTree(run, { 'expected.json': JSON.stringify([{ path: 'src/Save.tsx', exists: true, change: 'structure' }]) });
  const batch = path.join(run, 'batch-1');
  assert.equal(runScript('files.mjs', ['save', '--project', dir, '--batch', batch, '--expected', path.join(run, 'expected.json')]).status, 0);
  writeTree(dir, { 'src/Save.tsx': 'export const S = () => <button aria-label="Guardar"><svg /></button>;\n' });
  assert.equal(runScript('files.mjs', ['verify', '--project', dir, '--batch', batch]).status, 0);
  const check = runScript('ui-check.mjs', ['--project', dir, '--run', run, '--design', 'DESIGN.md', '--files', 'src/Save.tsx'], { cwd: dir });
  assert.equal(check.status, 0, check.stderr);
  const uiBuf = fs.readFileSync(path.join(run, 'ui-check.json'));
  const entry = JSON.parse(uiBuf).entries.find((e) => e.id === 'A11Y-04' && e.status === 'pass');
  const claim = { id: 'c1', text: 'El botón Guardar tiene nombre accesible', rule: 'A11Y-04', status: 'pass', ref: { source: 'ui-check', fingerprint: entry.fingerprint } };
  const edited = { id: 'c2', text: 'Se editó Save.tsx', ref: { source: 'file', path: 'src/Save.tsx', sha256: sha(fs.readFileSync(path.join(dir, 'src/Save.tsx'))) } };
  writeTree(run, { 'report.json': JSON.stringify({ version: 1, ...implemented, evidence: { 'ui-check.json': sha(uiBuf) }, claims: [claim, edited] }) });
  const ok = runScript('report-check.mjs', ['--project', dir, '--run', run]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  writeTree(run, { 'report.json': JSON.stringify({ version: 1, ...implemented, evidence: { 'ui-check.json': sha(uiBuf) }, claims: [{ ...claim, status: 'fail' }] }) });
  assert.equal(runScript('report-check.mjs', ['--project', dir, '--run', run]).status, 1);
  // the verified batch says something was implemented: declaring the opposite is not accepted
  writeTree(run, { 'report.json': JSON.stringify({ version: 1, implemented: false, evidence: { 'ui-check.json': sha(uiBuf) }, claims: [claim] }) });
  const denied = runScript('report-check.mjs', ['--project', dir, '--run', run]);
  assert.deepEqual([denied.status, denied.json.implements], [1, 'missing']);
  assert.equal(runScript('files.mjs', ['restore', '--project', dir, '--batch', batch]).status, 0);
  assert.equal(porcelain(dir), '');
});
