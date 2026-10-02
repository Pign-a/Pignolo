import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompareHtml, openFile } from '../lib/compare-html.mjs';

const options = [{ id: 'A', screens: ['zocalo.html', 'detalle.html'] }, { id: 'B', screens: ['zocalo.html', 'detalle.html'] }];
const count = (s, re) => (s.match(re) || []).length;

test('desktop: one iframe per screen and option, in the order of screens, no scripts, nothing remote', () => {
  const html = buildCompareHtml({ options, kind: 'option', platform: 'desktop', title: 'Comparación' });
  assert.equal(count(html, /<iframe/g), 4);
  assert.equal(count(html, /width="1440"/g), 4);
  assert.equal(count(html, /<script/gi), 0);
  assert.equal(count(html, /http/gi), 0);
  assert.ok(html.includes('Opción A') && html.includes('Opción B'));
  assert.ok(html.indexOf('option-A/zocalo.html') < html.indexOf('option-A/detalle.html'), 'screens keep the order of --screens, not the alphabetical one');
  assert.match(html, /<meta charset="utf-8">/);
});

test('direction kind points to direction-<id>/; both puts the two widths', () => {
  const dir = buildCompareHtml({ options: [{ id: 'a', screens: ['inicio.html'] }], kind: 'direction', platform: 'desktop', title: 't' });
  assert.ok(dir.includes('src="local/direction-a/inicio.html"'));
  assert.ok(dir.includes('Dirección A'));
  const both = buildCompareHtml({ options, kind: 'option', platform: 'both', title: 't' });
  assert.equal(count(both, /<iframe/g), 8);
  assert.equal(count(both, /width="1440"/g), 4);
  assert.equal(count(both, /width="375"/g), 4);
  assert.throws(() => buildCompareHtml({ options, platform: 'tablet' }));
});

test('every frame points to the copies under local/ (A4C2-03), never to the original folder', () => {
  const html = buildCompareHtml({ options, kind: 'option', platform: 'both', title: 't' });
  const srcs = [...html.matchAll(/<iframe src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 8);
  for (const src of srcs) assert.ok(src.startsWith('local/option-'), src);
});

test('the title is escaped', () => {
  assert.ok(!buildCompareHtml({ options, title: '<b>x</b>' }).includes('<b>x</b>'));
});

test('openFile spawns without a shell, detached, with the path as an argument', () => {
  const calls = [];
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { unref() { calls.push('unref'); } }; };
  openFile('C:\\x\\compare.html', { platform: 'win32', spawn });
  assert.equal(calls[0].cmd, 'explorer.exe');
  assert.deepEqual(calls[0].args, ['C:\\x\\compare.html']);
  assert.equal(calls[0].opts.detached, true);
  assert.equal(calls[0].opts.stdio, 'ignore');
  assert.ok(!('shell' in calls[0].opts) || calls[0].opts.shell !== true);
  assert.equal(calls[1], 'unref');
  openFile('/x/compare.html', { platform: 'linux', spawn });
  assert.equal(calls[2].cmd, 'xdg-open');
  openFile('/x/compare.html', { platform: 'darwin', spawn });
  assert.equal(calls[4].cmd, 'open');
});
