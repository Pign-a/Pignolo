// compare.mjs heights (R-15, D-4c-9). Browser cases skip visibly when there is none.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, runScript, BROWSER_SKIP } from './helpers.mjs';
import { makeRun, screenHtml } from './support/canvas-run.mjs';
import { clampHeight, heightKey } from '../lib/page-height.mjs';

const NO_BROWSER = () => ({ ...process.env, PIGNOLO_UI_BROWSER: path.join(makeTempDir(), 'no-existe', 'chrome.exe') });
const heights = (r, extra = [], env = undefined) => runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html,detalle.html', '--options', 'A,B', '--platform', 'desktop', '--out', path.join(r.run, 'heights.json'), ...extra], { env, timeout: 120000 });

const FONT_LINKS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">\n';

test('clampHeight: 100 -> 400, 99999 -> 8000, NaN -> null, 2310.4 -> 2311', () => {
  assert.equal(clampHeight(100), 400);
  assert.equal(clampHeight(99999), 8000);
  assert.equal(clampHeight(Number.NaN), null);
  assert.equal(clampHeight(2310.4), 2311);
  assert.equal(clampHeight('900'), null);
  assert.equal(clampHeight(Infinity), null);
  assert.equal(clampHeight(400), 400);
  assert.equal(clampHeight(8000), 8000);
});

test('heightKey is the key that build --heights reads', () => {
  assert.equal(heightKey('A', 'inicio.html', 1440), 'A/inicio.html@1440');
});

test('without a browser: unverified, exit 0, no file, and an old answer is removed', () => {
  const r = makeRun();
  fs.writeFileSync(path.join(r.run, 'heights.json'), '{"A/inicio.html@1440":999}');
  const h = heights(r, [], NO_BROWSER());
  assert.equal(h.status, 0, h.stderr);
  assert.match(h.json.unverified, /./);
  assert.ok(!fs.existsSync(path.join(r.run, 'heights.json')), 'a stale answer would be trusted by build');
  assert.equal(h.json.heights, undefined);
  const fresh = makeRun();
  assert.equal(heights(fresh, [], NO_BROWSER()).status, 0);
  assert.ok(!fs.existsSync(path.join(fresh.run, 'heights.json')));
});

test('the pages it opens are the copies under local/ without the remote font links', () => {
  const r = makeRun();
  for (const l of ['A', 'B']) fs.writeFileSync(path.join(r.optionDir(l), 'inicio.html'), screenHtml(`${l} inicio`, { head: FONT_LINKS }));
  const h = heights(r, [], NO_BROWSER());
  assert.equal(h.status, 0, h.stderr);
  for (const l of ['A', 'B']) {
    const copy = fs.readFileSync(path.join(r.run, 'local', `option-${l}`, 'inicio.html'), 'utf8');
    assert.ok(!copy.includes('fonts.googleapis.com'), `copy of ${l}`);
    assert.ok(fs.readFileSync(path.join(r.optionDir(l), 'inicio.html'), 'utf8').includes('fonts.googleapis.com'), 'the original keeps its fonts');
  }
});

test('usage errors exit 2 and write nothing', () => {
  const r = makeRun();
  const base = ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'h.json')];
  const swap = (key, value) => { const a = [...base]; a[a.indexOf(key) + 1] = value; return a; };
  const run = (a) => runScript('compare.mjs', a, { env: NO_BROWSER() }).status;
  assert.equal(run(base), 0);
  assert.equal(run(swap('--kind', 'tile')), 2);
  assert.equal(run(swap('--platform', 'tablet')), 2);
  assert.equal(run(swap('--options', 'A,D')), 2, 'option-D does not exist');
  assert.equal(run(swap('--options', 'a')), 2);
  assert.equal(run(swap('--screens', 'nada.html')), 2);
  assert.equal(run(swap('--screens', '../inicio.html')), 2);
  assert.equal(run(swap('--screens', 'inicio.html,inicio.html')), 2);
  assert.equal(run(swap('--out', path.join(makeTempDir(), 'h.json'))), 2, '--out outside the run');
  assert.equal(run(swap('--out', path.join(r.run, '..', 'h.json'))), 2);
  assert.equal(run([...base, '--zzz', '1']), 2);
  assert.equal(run(base.slice(0, -2)), 2);
  assert.equal(run(swap('--run', path.join(r.run, 'no-existe'))), 2);
});

test('an --out that is a link is never written through', (t) => {
  const r = makeRun();
  const target = path.join(makeTempDir(), 'afuera.json');
  fs.writeFileSync(target, 'intacto');
  try { fs.symlinkSync(target, path.join(r.run, 'heights.json')); } catch { t.skip('no se pueden crear enlaces simbólicos aquí'); return; }
  assert.equal(heights(r, [], NO_BROWSER()).status, 2);
  assert.equal(fs.readFileSync(target, 'utf8'), 'intacto');
});

test('with a browser: a page of 3000 px draws 3000 at its width, mobile and desktop rows apart', { skip: BROWSER_SKIP }, () => {
  const r = makeRun({ options: ['A', 'B'], screens: ['inicio.html'] });
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), '<!doctype html><html><head><meta charset="utf-8"><title>a</title><style>body{margin:0}.t{height:3000px}</style></head><body><div class="t">alto</div></body></html>');
  fs.writeFileSync(path.join(r.optionDir('B'), 'inicio.html'), '<!doctype html><html><head><meta charset="utf-8"><title>b</title><style>body{margin:0}.t{height:200px}</style></head><body><div class="t">bajo</div></body></html>');
  const h = runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A,B', '--platform', 'both', '--out', path.join(r.run, 'heights.json')], { timeout: 120000 });
  assert.equal(h.status, 0, h.stderr);
  const written = JSON.parse(fs.readFileSync(path.join(r.run, 'heights.json'), 'utf8'));
  assert.equal(written['A/inicio.html@1440'], 3000);
  assert.equal(written['A/inicio.html@390'], 3000);
  assert.equal(written['B/inicio.html@1440'], 900, 'a short page fills the viewport of the row: the default of R-3');
  assert.equal(written['B/inicio.html@390'], 844);
  assert.deepEqual(h.json.heights, written);
  assert.equal(h.json.cleanup.profileRemoved, true);
  assert.equal(fs.existsSync(h.json.cleanup.profile), false, 'no profile is left');
});

test('with a browser: the heights feed build --heights', { skip: BROWSER_SKIP }, () => {
  const r = makeRun({ options: ['A'], screens: ['inicio.html'] });
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>a</title><style>body{margin:0}.t{height:2310px}</style></head><body><main><div class="t">alto</div></main></body></html>');
  const h = runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'heights.json')], { timeout: 120000 });
  assert.equal(h.status, 0, h.stderr);
  const b = runScript('canvas-index.mjs', ['build', '--project', r.project, '--run', r.run, '--options', 'A', '--screens', 'inicio.html', '--platform', 'desktop', '--page-name', 'p', '--design', 'none', '--first', 'yes', '--heights', path.join(r.run, 'heights.json'), '--now', '2026-10-01T18:00:00Z']);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const page = JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'page.json'), 'utf8'));
  assert.equal(Object.values(page.boards)[0].h, 2310);
});
