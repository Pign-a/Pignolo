// scripts/browser.mjs end to end (spec §11, §16.1): usage, degraded paths without a browser,
// and the three subcommands against pages served on 127.0.0.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { makeTempDir, writeTree, serveRoutes, runScript, BROWSER_SKIP, PLUGIN_ROOT } from './helpers.mjs';
import { checkPng } from '../lib/png.mjs';
import { BROWSER_RULES } from '../lib/browser-run.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const GOOD = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inicio</title><style>body{margin:0;padding:0 24px;background:#fff;color:#111}</style></head><body><main><h1>Inicio</h1><p>Texto</p></main></body></html>';
const LOW = GOOD.replace('<p>Texto</p>', '<p id="low" style="color:#aaa">Texto claro</p>');

// Async run: the test server lives in this process, so the CLI must not block the event loop.
function cli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'browser.mjs'), ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ status, stdout, stderr, json });
    });
  });
}

function project(extra = {}) {
  const root = writeTree(makeTempDir(), { 'index.html': GOOD, ...extra });
  return { root, run: path.join(root, '.pignolo-ui', 'runs', 'r1') };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('usage errors exit 2 with a message and no stack', async () => {
  const { root, run } = project();
  const CASES = [
    [[], /falta el subcomando/],
    [['measure', '--project', root, '--run', run], /indicá --url o --file/],
    [['measure', '--project', root, '--run', run, '--url', 'https://example.com/'], /solo acepta direcciones locales/],
    [['measure', '--project', root, '--run', path.join(root, 'out'), '--url', 'http://127.0.0.1:9/'], /dentro de \.pignolo-ui\/runs\//],
    [['measure', '--project', root, '--run', run, '--file', path.join(root, '..', 'x.html')], /no existe|fuera del proyecto/],
    [['capture', '--project', root, '--run', run, '--url', 'http://127.0.0.1:9/', '--before', path.join(root, 'index.html')], /--before no es un browser.json/],
    [['measure', '--project', root, '--run', run, '--url', 'http://127.0.0.1:9/', '--platform', 'tv'], /--platform debe ser/],
    [['measure', '--project', root, '--run', run, '--url', 'http://127.0.0.1:9/', '--register', 'airy'], /--register debe ser brand o product/],
  ];
  for (const [args, message] of CASES) {
    const r = await cli(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, message);
    assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
  }
});

test('without a browser: every browser rule is unverified with the reason, never a pass (A-07)', async () => {
  const { root, run } = project();
  const env = { PIGNOLO_UI_BROWSER: path.join(root, 'no-browser.exe') };
  const r = await cli(['measure', '--project', root, '--run', run, '--file', path.join(root, 'index.html')], env);
  assert.equal(r.status, 0);
  assert.match(r.json.degraded, /no browser: PIGNOLO_UI_BROWSER points to a missing file/);
  const json = readJson(path.join(run, 'browser.json'));
  assert.deepEqual(json.entries.map((e) => [e.id, e.status]), BROWSER_RULES.map((id) => [id, 'unverified']));
  assert.deepEqual([json.browser, json.cleanup], [null, null]);
  assert.equal(fs.readFileSync(path.join(root, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  writeTree(root, { 'pages/a/index.html': GOOD });
  await cli(['measure', '--project', root, '--run', run, '--file', path.join(root, 'pages', 'a', 'index.html')], env);
  assert.equal(readJson(path.join(run, 'browser.json')).entries[0].fingerprint, 'COLOR-03|pages/a/index.html|||run', 'a file is named by its project path');
  const c = await cli(['capture', '--project', root, '--run', run, '--file', path.join(root, 'index.html')], env);
  assert.equal(c.status, 0);
  assert.deepEqual(readJson(path.join(run, 'captures.json')).captures, []);
});

test('a URL that does not answer is unverified before any browser starts (§11.2)', async () => {
  const { root, run } = project();
  const site = await serveRoutes({});
  const url = `${site.base}/`;
  await site.close(); // nothing listens there now
  const r = await cli(['measure', '--project', root, '--run', run, '--url', url], { PIGNOLO_UI_BROWSER: path.join(root, 'must-not-start.exe') });
  assert.equal(r.status, 0);
  assert.match(r.json.degraded, /the URL did not respond in 5 s/);
});

test('measure: B1-B4 at every width of the plan, fingerprints without values, exit 1 on a new bloquea', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: LOW } });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop']);
    assert.equal(r.status, 1, r.stderr);
    const json = readJson(path.join(run, 'browser.json'));
    assert.match(json.browser, /Chrome|Edg/);
    assert.deepEqual(json.plan, { widths: [{ width: 1440, height: 900, capture: true }, { width: 320, height: 640, capture: false }], themes: ['light'] });
    const fail = json.entries.find((e) => e.id === 'COLOR-03' && e.status === 'fail' && e.measure.width === 1440);
    assert.deepEqual(fail, {
      id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', selector: '#low',
      fingerprint: 'COLOR-03|/|1440|light|#low',
      measure: { ratio: 2.32, required: 4.5, fontSizePx: 16, width: 1440, theme: 'light', page: '/' },
    });
    for (const id of BROWSER_RULES) assert.ok(json.entries.some((e) => e.id === id && e.measure.width === 320), `${id} at 320`);
    assert.equal(json.entries.filter((e) => e.status === 'unverified').length, 0);
    assert.equal(json.cleanup.profileRemoved, true, 'the temporary profile is removed and said so');
    assert.equal(fs.existsSync(json.cleanup.profile), false);
    assert.equal(r.json.leftoverProfile, undefined);

    // The same page measured again with the first run as "before": the fail is debt, alto, exit 0.
    const before = path.join(run, 'before.json');
    fs.copyFileSync(path.join(run, 'browser.json'), before);
    const again = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop', '--before', before]);
    assert.equal(again.status, 0, again.stderr);
    const debt = readJson(path.join(run, 'browser.json')).entries.find((e) => e.fingerprint === 'COLOR-03|/|1440|light|#low');
    assert.deepEqual([debt.scope, debt.severity], ['debt', 'alto']);
  } finally {
    await site.close();
  }
});

test('measure: a redirect to a login page is "requires session", not a pass (§11.2)', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({
    '/panel': { status: 302, headers: { location: '/login' } },
    '/login': { headers: HTML, body: '<!doctype html><title>Entrar</title><form><input type="password" aria-label="clave"></form>' },
  });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/panel`, '--platform', 'desktop']);
    assert.equal(r.status, 0);
    assert.match(r.json.degraded, /requires session: \/panel redirected to \/login/);
    assert.ok(readJson(path.join(run, 'browser.json')).entries.every((e) => e.status === 'unverified'));
  } finally {
    await site.close();
  }
});

test('capture: valid PNGs per viewport, sha256 recorded, dark only when detected, at most 3 crops', { skip }, async () => {
  const long = GOOD.replace('<p>Texto</p>', '<p>Texto</p><div style="height:5000px;background:linear-gradient(#0b6bcb,#fff)"></div>').replace('</style>', '@media (prefers-color-scheme: dark){body{background:#000;color:#eee}}</style>');
  const { root, run } = project({ 'app.css': ':root{--bg:#fff}\n@media (prefers-color-scheme: dark){:root{--bg:#000}}\n' });
  const site = await serveRoutes({ '/': { headers: HTML, body: long } });
  try {
    const r = await cli(['capture', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'mobile']);
    assert.equal(r.status, 0, r.stderr);
    const { captures, unverified } = readJson(path.join(run, 'captures.json'));
    assert.deepEqual(unverified, []);
    assert.deepEqual(captures.map((c) => c.path), ['captures/375-light-1.png', 'captures/375-light-2.png', 'captures/375-light-3.png', 'captures/375-dark-1.png', 'captures/375-dark-2.png', 'captures/375-dark-3.png']);
    for (const c of captures) {
      const buf = fs.readFileSync(path.join(run, c.path));
      assert.deepEqual(checkPng(buf), { ok: true, width: 375, height: 812, sha256: c.sha256 });
      assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), c.sha256);
    }
    assert.notEqual(captures[0].sha256, captures[3].sha256, 'light and dark differ');
  } finally {
    await site.close();
  }
});

test('dom: the rendered DOM per width, with what scripts added, readable by ui-check --dom', { skip }, async () => {
  const withScript = GOOD.replace('</main>', '<p id="late"></p><script>document.getElementById("late").textContent = "Añadido por script";</script></main>');
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: withScript } });
  try {
    const r = await cli(['dom', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'both']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.json.doms, ['dom-1440.html', 'dom-375.html', 'dom-768.html', 'dom-320.html']);
    const dom = fs.readFileSync(path.join(run, 'dom-320.html'), 'utf8');
    assert.match(dom, /^<!doctype html>\n<html lang="es">/);
    assert.match(dom, /Añadido por script/);
    const uc = runScript('ui-check.mjs', ['--project', root, '--run', run, '--dom', path.join(run, 'dom-320.html')]);
    assert.equal(uc.status, 0, uc.stderr);
    const a11y01 = readJson(path.join(run, 'ui-check.json')).entries.find((e) => e.id === 'A11Y-01');
    assert.deepEqual([a11y01.status, a11y01.file], ['pass', '.pignolo-ui/runs/r1/dom-320.html']);
  } finally {
    await site.close();
  }
});

// Fixes of the final review of hito 3.
const SPA = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Panel</title></head><body><main><h1>Panel</h1><button id="g">Continue with Google</button></main><script>setTimeout(() => history.replaceState(null, "", "/login"), 300);</script></body></html>';

test('measure: a client redirect after load (history.replaceState to /login) is "requires session", not a pass', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/dashboard': { headers: HTML, body: SPA } });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/dashboard`, '--platform', 'desktop']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.json.degraded, /requires session: \/dashboard redirected to \/login/);
    const json = readJson(path.join(run, 'browser.json'));
    assert.ok(json.entries.length > 0 && json.entries.every((e) => e.status === 'unverified'), 'nothing is "pass"');
    assert.match(json.finalUrl, /\/login$/);
    const d = await cli(['dom', '--project', root, '--run', run, '--url', `${site.base}/dashboard`, '--platform', 'desktop']);
    assert.match(d.json.degraded, /requires session: \/dashboard redirected to \/login/);
    assert.deepEqual(d.json.doms, []);
  } finally {
    await site.close();
  }
});

test('measure: a visible password field on the page asked for is "requires session" (no redirect involved)', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/login': { headers: HTML, body: '<!doctype html><title>Entrar</title><form><input type="password" aria-label="clave"></form>' } });
  try {
    const r = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/login`, '--platform', 'desktop']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.degraded, 'requires session: a password field is visible');
    assert.ok(readJson(path.join(run, 'browser.json')).entries.every((e) => e.status === 'unverified'));
  } finally {
    await site.close();
  }
});

test('measure --register: the screen register changes the TYPE-02 threshold (28 px title over 24 px body)', { skip }, async () => {
  const { root, run } = project();
  const html = GOOD.replace('<h1>Inicio</h1><p>Texto</p>', '<h1 style="font-size:28px">Inicio</h1><p style="font-size:24px">Texto del cuerpo</p>');
  const site = await serveRoutes({ '/': { headers: HTML, body: html } });
  try {
    const type02 = (reg) => readJson(path.join(run, 'browser.json')).entries.filter((e) => e.id === 'TYPE-02' && e.measure.width === 1440 && e.measure.theme === 'light' && e.status !== 'unverified').map((e) => [e.status, e.measure.register]);
    const brand = await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop', '--register', 'brand']);
    assert.equal(brand.status, 0, brand.stderr);
    assert.deepEqual(type02(), [['fail', 'brand']]);
    await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop', '--register', 'product']);
    assert.deepEqual(type02(), [['pass', 'product']]);
    await cli(['measure', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop']);
    assert.deepEqual(type02(), [['pass', 'unset']]);
  } finally {
    await site.close();
  }
});

test('prepare-run.md: --register is added to measure only when the brief declares a register', () => {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'reference', 'prepare-run.md'), 'utf8');
  assert.match(text, /--register <brand\|product>/);
  assert.match(text, /only when the flow brief declares a `register`/);
  assert.match(text, /otherwise omit it/);
});

test('capture on a blank page: captures.json marks it invalid and browser.json stays byte for byte the same', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>v</title></head><body></body></html>' } });
  try {
    const url = `${site.base}/`;
    await cli(['measure', '--project', root, '--run', run, '--url', url, '--platform', 'desktop']);
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const before = sha(path.join(run, 'browser.json'));
    const c = await cli(['capture', '--project', root, '--run', run, '--url', url, '--platform', 'desktop']);
    assert.equal(c.status, 0, c.stderr);
    const json = readJson(path.join(run, 'captures.json'));
    assert.deepEqual(json.captures.map((x) => [x.valid, x.reason]), [[false, 'uniform']]);
    assert.deepEqual(json.unverified.map((x) => x.reason), ['capture invalid: uniform']);
    assert.equal(sha(path.join(run, 'browser.json')), before);
  } finally {
    await site.close();
  }
});
