import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { makeTempDir, runScript, BROWSER_SKIP, browserPath, leftoverProcesses } from './helpers.mjs';
import { makeRun, screenHtml, canvasIndex, BUILD_ARGS } from './support/canvas-run.mjs';
import { writeLocalCopies, pagesToOpen, LocalCopyError } from '../lib/local-copy.mjs';
import { localOptionFiles } from '../scripts/compare.mjs';

const FONT_HEAD = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">\n';

// run with option-A asking for fonts (written for the canvas) and option-B plain
function runWithFonts() {
  const r = makeRun({ options: ['A', 'B'], screens: ['inicio.html', 'detalle.html'] });
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('A inicio', { link: 'detalle.html', head: FONT_HEAD }));
  return r;
}
const compareHtml = (r, extra = []) => runScript('run.mjs', ['compare-html', '--run', r.run, '--platform', 'desktop', '--screens', 'inicio.html,detalle.html', '--no-open', ...extra]);

test('compare-html: every iframe src is a file under <run>/local/ with no font host in it; the original keeps its links (A4C2-03)', () => {
  const r = runWithFonts();
  const c = compareHtml(r);
  assert.equal(c.status, 0, c.stderr + c.stdout);
  assert.equal(c.json.line, 'fuentes remotas quitadas: 3');
  assert.equal(c.json.fontsRemoved, 3);
  const html = fs.readFileSync(path.join(r.run, 'compare.html'), 'utf8');
  const srcs = [...html.matchAll(/<iframe src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 4);
  for (const src of srcs) {
    assert.ok(src.startsWith('local/'), src);
    const text = fs.readFileSync(path.join(r.run, ...src.split('/')), 'utf8');
    assert.ok(!text.includes('fonts.googleapis.com') && !text.includes('fonts.gstatic.com'), src);
  }
  assert.ok(fs.readFileSync(path.join(r.optionDir('A'), 'inicio.html'), 'utf8').includes('fonts.googleapis.com'), 'the original is untouched');
});

test('compare-html without fonts says 0; after a canvas build with fonts it still opens only copies', () => {
  const plain = makeRun({ options: ['A', 'B'] });
  assert.equal(compareHtml(plain).json.fontsRemoved, 0);
  const r = runWithFonts();
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'A,B' })).status, 0);
  const c = compareHtml(r);
  assert.equal(c.json.line, 'fuentes remotas quitadas: 3');
  for (const f of fs.readdirSync(path.join(r.run, 'local', 'option-A'))) {
    assert.ok(!fs.readFileSync(path.join(r.run, 'local', 'option-A', f), 'utf8').includes('fonts.g'));
  }
});

test('writeLocalCopies is idempotent and pagesToOpen never leaves <run>/local/', () => {
  const r = runWithFonts();
  const bytes = () => ['inicio.html', 'detalle.html'].map((f) => fs.readFileSync(path.join(r.run, 'local', 'option-A', f), 'utf8'));
  const a = writeLocalCopies({ run: r.run, folders: ['option-A', 'option-B'] });
  assert.equal(a.removed, 3);
  const first = bytes();
  writeLocalCopies({ run: r.run, folders: ['option-A', 'option-B'] });
  assert.deepEqual(bytes(), first);
  const pages = pagesToOpen({ run: r.run, folders: ['option-A', 'option-B'], screens: ['inicio.html', 'detalle.html'] });
  assert.equal(pages.length, 4);
  for (const p of pages) {
    assert.ok(path.relative(path.join(r.run, 'local'), p).split(path.sep)[0] !== '..', p);
    assert.ok(!path.relative(r.run, p).startsWith(`option-`), 'never the original folder');
  }
});

test('compare.mjs options (fingerprints) opens only files under <run>/local/, without the font links', () => {
  const r = runWithFonts();
  const dirs = { A: r.optionDir('A'), B: r.optionDir('B') };
  const files = localOptionFiles({ run: r.run, dirs, letters: ['A', 'B'], main: 'inicio.html' });
  for (const f of Object.values(files)) {
    assert.ok(f.startsWith(path.join(r.run, 'local')), f);
    assert.ok(!fs.readFileSync(f, 'utf8').includes('fonts.g'), f);
  }
});

test('writeLocalCopies does not write through a <run>/local that is a junction or symlink', (t) => {
  const r = runWithFonts();
  const target = makeTempDir();
  try { fs.symlinkSync(target, path.join(r.run, 'local'), 'junction'); } catch (e) { t.skip(`sin permiso para crear enlaces (${e.code})`); return; }
  assert.throws(() => writeLocalCopies({ run: r.run, folders: ['option-A'] }), LocalCopyError);
  assert.deepEqual(fs.readdirSync(target), []);
  const c = compareHtml(r);
  assert.equal(c.status, 1);
});

// The browser is the oracle: with a proxy that answers 502 and logs what was asked, the backup page
// must not ask for the font hosts, and the original file (the control) must.
async function visit(file) {
  const asked = [];
  const server = http.createServer((req, res) => { asked.push(`GET ${req.url}`); res.writeHead(502); res.end(); });
  server.on('connect', (req, socket) => { asked.push(`CONNECT ${req.url}`); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const profile = makeTempDir('pignolo-ui-fonts-');
  const child = spawn(browserPath(), ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions', `--user-data-dir=${profile}`,
    `--proxy-server=http://127.0.0.1:${server.address().port}`, '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(file).href], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => { const t = setTimeout(() => { child.kill(); resolve(); }, 30000); child.on('exit', () => { clearTimeout(t); resolve(); }); });
  await new Promise((r) => server.close(r));
  await leftoverProcesses(profile, 10000);
  return asked.filter((a) => /fonts\.(googleapis|gstatic)\.com/.test(a));
}

test('with a browser: the backup page asks for no font host; the original option file does (control)', { skip: BROWSER_SKIP }, async () => {
  const r = runWithFonts();
  compareHtml(r);
  const backup = await visit(path.join(r.run, 'compare.html'));
  assert.deepEqual(backup, [], 'compare.html and its copies ask for nothing');
  const control = await visit(path.join(r.optionDir('A'), 'inicio.html'));
  assert.ok(control.length > 0, 'the control proves the proxy sees what it has to see');
});
