import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, runScript, BROWSER_SKIP } from './helpers.mjs';
import { makeRun, screenHtml } from './support/canvas-run.mjs';
import { clampHeight } from '../lib/page-height.mjs';

const heights = (r, extra = [], opts = {}) => runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html,detalle.html', '--options', 'A,B', '--platform', 'desktop', '--out', path.join(r.run, 'heights.json'), ...extra], opts);
const NO_BROWSER = () => ({ env: { ...process.env, PIGNOLO_UI_BROWSER: path.join(makeTempDir(), 'no-existe', 'chrome.exe') } });

test('clampHeight: 100 -> 400, 99999 -> 8000, NaN and non-numbers -> null, 2310.4 -> 2311', () => {
  assert.equal(clampHeight(100), 400);
  assert.equal(clampHeight(99999), 8000);
  assert.equal(clampHeight(2310.4), 2311);
  assert.equal(clampHeight(400), 400);
  assert.equal(clampHeight(8000), 8000);
  for (const bad of [NaN, Infinity, -Infinity, '900', null, undefined, {}]) assert.equal(clampHeight(bad), null, String(bad));
});

test('heights without a browser is unverified with the reason, exit 0, and writes no file', () => {
  const r = makeRun({ options: ['A', 'B'] });
  const res = heights(r, [], NO_BROWSER());
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.json.unverified, /./);
  assert.equal(fs.existsSync(path.join(r.run, 'heights.json')), false);
});

test('heights: usage errors are exit 2 (kind, screens, options, platform, --out outside the run, a missing screen, a missing option)', () => {
  const r = makeRun({ options: ['A', 'B'] });
  const base = { ...NO_BROWSER() };
  assert.equal(runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'tile', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'h.json')], base).status, 2);
  assert.equal(heights(r, ['--platform', 'tablet'], base).status, 2);
  assert.equal(heights(r, ['--out', path.join(makeTempDir(), 'h.json')], base).status, 2);
  assert.equal(heights(r, ['--screens', '../x.html'], base).status, 2);
  assert.equal(heights(r, ['--options', 'a'], base).status, 2);
  assert.equal(heights(r, ['--options', 'A,C'], base).status, 2, 'option C has no folder');
  assert.equal(heights(r, ['--screens', 'inicio.html,nada.html'], base).status, 2);
  assert.equal(heights(r, ['--nope', 'x'], base).status, 2);
  const noRun = runScript('compare.mjs', ['heights', '--run', path.join(r.run, 'no'), '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'h.json')], base);
  assert.equal(noRun.status, 2);
});

test('heights opens only the copies without the font links: the originals keep them', { skip: BROWSER_SKIP }, () => {
  const r = makeRun({ options: ['A', 'B'] });
  const head = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap">\n';
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('A', { link: 'detalle.html', head }));
  const res = heights(r, [], { timeout: 120000 });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.json.count >= 1);
  assert.deepEqual(res.json.opened, ['local/option-A/detalle.html', 'local/option-A/inicio.html', 'local/option-B/detalle.html', 'local/option-B/inicio.html'], 'only copies under <run>/local/');
  assert.ok(!fs.readFileSync(path.join(r.run, 'local', 'option-A', 'inicio.html'), 'utf8').includes('fonts.googleapis.com'));
  assert.ok(fs.readFileSync(path.join(r.optionDir('A'), 'inicio.html'), 'utf8').includes('fonts.googleapis.com'));
});

test('heights: a page 3000 px tall measures 3000 at the width of its row; no process or profile is left (browser)', { skip: BROWSER_SKIP }, () => {
  const r = makeRun({ options: ['A', 'B'] });
  const tall = screenHtml('A', { link: 'detalle.html', extra: '<div style="height:3000px">alta</div>\n' }).replace('body{margin:0;', 'body{margin:0;');
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), tall);
  const res = heights(r, ['--platform', 'both'], { timeout: 180000 });
  assert.equal(res.status, 0, res.stderr);
  const saved = JSON.parse(fs.readFileSync(path.join(r.run, 'heights.json'), 'utf8'));
  assert.ok(saved['A/inicio.html@1440'] >= 3000 && saved['A/inicio.html@1440'] <= 3500, JSON.stringify(saved));
  assert.ok(saved['A/inicio.html@390'] >= 3000, 'at 390 it is at least as tall');
  assert.ok(saved['B/inicio.html@1440'] >= 400);
  // the width of the row is the width of the page: 200vw is taller at 1440 than at 390
  fs.writeFileSync(path.join(r.optionDir('B'), 'inicio.html'), screenHtml('B', { link: 'detalle.html', extra: '<div style="height:200vw">ancha</div>' }));
  assert.equal(heights(r, ['--platform', 'both'], { timeout: 180000 }).status, 0);
  const wide = JSON.parse(fs.readFileSync(path.join(r.run, 'heights.json'), 'utf8'));
  assert.ok(wide['B/inicio.html@1440'] > wide['B/inicio.html@390'] + 1500, JSON.stringify(wide));
  assert.deepEqual(Object.keys(saved).sort(), ['A/detalle.html@1440', 'A/detalle.html@390', 'A/inicio.html@1440', 'A/inicio.html@390', 'B/detalle.html@1440', 'B/detalle.html@390', 'B/inicio.html@1440', 'B/inicio.html@390']);
  assert.equal(res.json.cleanup.profileRemoved, true);
  assert.equal(fs.existsSync(res.json.cleanup.profile), false);
});
