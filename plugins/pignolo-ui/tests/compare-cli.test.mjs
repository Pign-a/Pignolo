// compare.mjs in a subprocess. Browser cases use BROWSER_SKIP (visible skip, never a pass).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { makeTempDir, writeTree, runScript, serveRoutes, BROWSER_SKIP, PLUGIN_ROOT, BRIEF_TEXT } from './helpers.mjs';

// async variant: the served page lives in this process, so the child must not block the event loop
function runScriptAsync(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], { windowsHide: true });
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
import { saveApproved } from '../lib/approved.mjs';

const RUN = '.pignolo-ui/runs/r1';
const tileHtml = (hue, font = 'Inter', radii = [4, 8, 12]) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>:root{--color-primary:oklch(0.6 0.15 ${hue});--font-body:"${font}",sans-serif;--radius-sm:${radii[0]}px;--radius-md:${radii[1]}px;--radius-lg:${radii[2]}px}</style></head><body><p>x</p></body></html>`;

function tilesRun(hues = [250, 262, 20]) {
  const project = makeTempDir();
  const tree = {};
  ['A', 'B', 'C'].forEach((l, i) => { tree[`${RUN}/direction-${l}/inicio.html`] = tileHtml(hues[i]); });
  writeTree(project, tree);
  return { project, run: path.join(project, RUN) };
}

test('distance between two fingerprint files prints coincide', () => {
  const d = makeTempDir();
  const fp = { v: 1, kind: 'tile', primaryHue: 250, fontFamily: 'inter', radii: [4] };
  fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify(fp));
  fs.writeFileSync(path.join(d, 'b.json'), JSON.stringify({ ...fp, primaryHue: 260 }));
  const r = runScript('compare.mjs', ['distance', '--a', path.join(d, 'a.json'), '--b', path.join(d, 'b.json')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.coincide, true);
});

test('options --kind tile finds the pair to regenerate; --second-round warns instead', () => {
  const { run } = tilesRun();
  const r = runScript('compare.mjs', ['options', '--run', run, '--kind', 'tile', '--main', 'inicio.html']);
  assert.equal(r.status, 0, r.stderr);
  const ab = r.json.pairs.find((p) => p.a === 'A' && p.b === 'B');
  assert.equal(ab.coincide, true);
  assert.equal(r.json.regenerate, 'B');
  assert.deepEqual(r.json.warn, []);
  const second = runScript('compare.mjs', ['options', '--run', run, '--kind', 'tile', '--main', 'inicio.html', '--second-round']);
  assert.equal(second.status, 0);
  assert.deepEqual(second.json.warn, ['A y B son muy parecidas']);
  assert.equal(second.json.regenerate, null);
});

test('options with three different tiles regenerates nothing', () => {
  const { run } = tilesRun([250, 20, 140]);
  const r = runScript('compare.mjs', ['options', '--run', run, '--kind', 'tile', '--main', 'inicio.html']);
  assert.equal(r.json.regenerate, null);
});

test('fingerprint --kind tile writes the JSON', () => {
  const project = makeTempDir();
  writeTree(project, { 'tile.html': tileHtml(250) });
  const out = path.join(project, 'fp.json');
  const r = runScript('compare.mjs', ['fingerprint', '--kind', 'tile', '--file', 'tile.html', '--out', out, '--project', project]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).primaryHue, 250);
});

test('fingerprint --kind mockup without a browser is unverified with the reason, exit 0', () => {
  const project = makeTempDir();
  writeTree(project, { 'm.html': '<!doctype html><title>t</title><p>x</p>' });
  const out = path.join(project, 'fp.json');
  const r = runScript('compare.mjs', ['fingerprint', '--kind', 'mockup', '--file', 'm.html', '--out', out, '--project', project], {
    env: { ...process.env, PIGNOLO_UI_BROWSER: path.join(makeTempDir(), 'no-existe', 'chrome.exe') },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.json.unverified, /./);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(written.unverified);
  assert.equal(written.blocks, undefined);
});

test('usage errors exit 2', () => {
  assert.equal(runScript('compare.mjs', ['nada']).status, 2);
  assert.equal(runScript('compare.mjs', ['distance', '--a', 'x']).status, 2);
  const project = makeTempDir();
  const r = runScript('compare.mjs', ['fingerprint', '--kind', 'mockup', '--url', 'https://example.com/', '--out', path.join(project, 'o.json')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /locales/);
  assert.equal(runScript('compare.mjs', ['distance', '--a', 'x', '--b', 'y', '--zzz', '1']).status, 2);
});

// ---- with the browser ------------------------------------------------------------------

const mockup = ({ bg = '#fff', accent = '#1a56db', font = 'sans-serif', radius = 4, primaryIn = 'header', extraHeading = false, n = 3 } = {}) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title><style>
body{margin:0;font-family:${font};background:${bg};min-height:900px}
header,footer{padding:16px;display:block}
.cta{background:${accent};color:#fff;border:0;border-radius:${radius}px;padding:8px 16px}
section{padding:16px}
</style></head><body>
<header><h1>Cuenta</h1>${primaryIn === 'header' ? '<button class="cta" data-primary="true">Pagar</button>' : ''}</header>
${Array.from({ length: n }, (_, i) => `<section><h2>Bloque ${i + 1}</h2><p>texto</p></section>`).join('')}
${extraHeading ? '<section><h2>Extra</h2></section>' : ''}
<footer><p>pie</p>${primaryIn === 'footer' ? '<button class="cta" data-primary="true">Pagar</button>' : ''}</footer>
</body></html>`;


test('mockups with the primary action in another place do not coincide; only tokens differ -> coincide', { skip: BROWSER_SKIP }, () => {
  const project = makeTempDir();
  writeTree(project, {
    [`${RUN}/option-A/inicio.html`]: mockup({ primaryIn: 'header' }),
    [`${RUN}/option-B/inicio.html`]: mockup({ primaryIn: 'footer' }),
    [`${RUN}/option-C/inicio.html`]: mockup({ primaryIn: 'header', bg: '#111', accent: '#d97706', font: 'serif', radius: 20 }),
  });
  const r = runScript('compare.mjs', ['options', '--run', path.join(project, RUN), '--kind', 'mockup', '--main', 'inicio.html'], { timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  const pair = (a, b) => r.json.pairs.find((p) => p.a === a && p.b === b);
  assert.equal(pair('A', 'B').coincide, false);
  assert.equal(pair('A', 'C').coincide, true);
  assert.equal(r.json.regenerate, 'C');
  assert.equal(r.json.cleanup.profileRemoved, true);
  assert.equal(fs.existsSync(r.json.cleanup.profile), false, "the temporary profile of this run is gone");
});

test('approved: an extra heading is a difference, exit stays 0; same structure with other tokens has none', { skip: BROWSER_SKIP }, async () => {
  const project = makeTempDir();
  const from = path.join(project, 'mock');
  writeTree(from, { 'inicio.html': mockup(), 'detalle.html': mockup({ n: 2 }) });
  const saved = saveApproved({ projectRoot: project, flow: 'flujo', from, date: '2026-10-01', brief: BRIEF_TEXT });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  writeTree(project, {
    'impl/inicio.html': mockup({ bg: '#fafafa', accent: '#be123c', font: 'serif', radius: 12, extraHeading: true }),
    'impl/detalle.html': mockup({ n: 2, accent: '#15803d', radius: 0 }),
  });
  const map = path.join(project, 'map.json');
  fs.writeFileSync(map, JSON.stringify({ 'inicio.html': 'impl/inicio.html', 'detalle.html': 'impl/detalle.html' }));
  const run = path.join(project, RUN);
  const r = runScript('compare.mjs', ['approved', '--project', project, '--approved', saved.path, '--map', map, '--run', run], { timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  const inicio = r.json.screens.find((s) => s.screen === 'inicio.html');
  assert.ok(inicio.differences.some((d) => d.kind === 'headings'));
  assert.ok(inicio.differences.some((d) => d.kind === 'blocks'));
  assert.deepEqual(r.json.screens.find((s) => s.screen === 'detalle.html').differences, []);
  assert.ok(fs.existsSync(path.join(run, 'compare-approved.json')));
  assert.equal(r.json.cleanup.profileRemoved, true);
});

test('A-18 measurement: false differences over 6 approved/implementation pairs that must coincide', { skip: BROWSER_SKIP }, () => {
  const project = makeTempDir();
  const from = path.join(project, 'mock');
  const pairs = [];
  for (let i = 1; i <= 6; i++) {
    const n = 1 + (i % 4);
    pairs.push([`s${i}.html`, { n }, { n, bg: '#f4f4f5', accent: '#be123c', font: 'Georgia, serif', radius: i * 3 }]);
  }
  writeTree(from, Object.fromEntries(pairs.map(([f, a]) => [f, mockup(a)])));
  const saved = saveApproved({ projectRoot: project, flow: 'seis', from, date: '2026-10-01', brief: BRIEF_TEXT });
  assert.equal(saved.ok, true);
  writeTree(project, Object.fromEntries(pairs.map(([f, , b]) => [`impl/${f}`, mockup(b)])));
  const map = path.join(project, 'map.json');
  fs.writeFileSync(map, JSON.stringify(Object.fromEntries(pairs.map(([f]) => [f, `impl/${f}`]))));
  const r = runScript('compare.mjs', ['approved', '--project', project, '--approved', saved.path, '--map', map, '--run', path.join(project, RUN)], { timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  const false_ = r.json.screens.filter((s) => s.differences.length > 0 || s.unverified).length;
  console.log(`A-18: diferencias falsas ${false_} de 6 (${Math.round((false_ / 6) * 100)} %)`);
  assert.equal(false_, 0);
});

test('approved against a served URL, and the exit code never depends on differences', { skip: BROWSER_SKIP }, async () => {
  const project = makeTempDir();
  const from = path.join(project, 'mock');
  writeTree(from, { 'inicio.html': mockup() });
  const saved = saveApproved({ projectRoot: project, flow: 'url', from, date: '2026-10-01', brief: BRIEF_TEXT });
  const srv = await serveRoutes({ '/': { headers: { 'content-type': 'text/html; charset=utf-8' }, body: mockup({ extraHeading: true }) } });
  try {
    const map = path.join(project, 'map.json');
    fs.writeFileSync(map, JSON.stringify({ 'inicio.html': `${srv.base}/` }));
    const args = ['approved', '--project', project, '--approved', saved.path, '--map', map, '--run', path.join(project, RUN)];
    const r = await runScriptAsync('compare.mjs', args);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.json.screens[0].differences.length > 0);
  } finally {
    await srv.close();
  }
});

test('cleanup: a page that does not load leaves no browser profile and says so', { skip: BROWSER_SKIP }, async () => {
  const closedPort = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const project = makeTempDir();
  const out = path.join(project, 'fp.json');
  const r = runScript('compare.mjs', ['fingerprint', '--kind', 'mockup', '--url', `http://127.0.0.1:${closedPort}/`, '--out', out, '--project', project], { timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.json.unverified, /./);
  assert.equal(r.json.cleanup.profileRemoved, true);
  assert.equal(fs.existsSync(r.json.cleanup.profile), false, "the temporary profile of this run is gone");
});
