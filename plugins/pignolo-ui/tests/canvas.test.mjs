import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { toArtboard, sizesFor, artboardName, isInteractive, CanvasError } from '../lib/canvas.mjs';

const read = (n) => fs.readFileSync(path.join(FIXTURES, 'canvas', n), 'utf8');
const links = { 'detalle.html': 'a-detalle.dc.html' };
const code = (fn) => { try { fn(); } catch (e) { return e instanceof CanvasError ? e.code : `other:${e.message}`; } return null; };
const doc = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

test('toArtboard of inicio.html at 390x844 carries the skeleton of the type and the fixed texts', () => {
  const out = toArtboard({ html: read('inicio.html'), w: 390, h: 844, links });
  for (const lit of ['<script src="./support.js"></script>', '<x-dc>', '<helmet><style>', 'body{margin:0}', ':root{--color-primary:#1a56db}', 'a:hover{color:#000}',
    'class Component extends DCLogic', 'data-dc-script', 'data-props=\'{"$preview":{"width":390,"height":844}}\'',
    'width: 390px; min-height: 844px; box-sizing: border-box', '<a class="cta" href="a-detalle.dc.html">']) {
    assert.ok(out.includes(lit), lit);
  }
  assert.ok(!out.includes('.is-hover'));
  assert.equal(out.split('<script').length - 1, 2);
  for (const bad of ['innerHTML', '{{', '<meta name="viewport"', '<!--']) assert.ok(!out.includes(bad), bad);
});

test('golden: inicio.html at 1440x900 is byte for byte Main.dc.html; the fonts artboard is Fuentes.dc.html', () => {
  assert.equal(toArtboard({ html: read('inicio.html'), w: 1440, h: 900, links }), read('Main.dc.html'));
  assert.equal(toArtboard({ html: read('fuentes.html'), w: 1440, h: 900, links: {}, allowFonts: true }), read('Fuentes.dc.html'));
  assert.ok(!read('Main.dc.html').includes('\r'));
});

test('refusals: script, handler, remote resource, braces, broken link, malformed, no body', () => {
  assert.equal(code(() => toArtboard({ html: doc('<script>alert(1)</script>'), w: 390, h: 844 })), 'script');
  assert.equal(code(() => toArtboard({ html: doc('<button onclick="x()">a</button>'), w: 390, h: 844 })), 'script');
  assert.equal(code(() => toArtboard({ html: doc('<img src="https://x.test/a.png" alt="">'), w: 390, h: 844 })), 'remote-resource');
  assert.equal(code(() => toArtboard({ html: doc('<p>{{x}}</p>'), w: 390, h: 844 })), 'braces');
  assert.equal(code(() => toArtboard({ html: doc('<a href="nada.html">x</a>'), w: 390, h: 844, links })), 'broken-link');
  assert.equal(code(() => toArtboard({ html: doc('<div><p>x</div>'), w: 390, h: 844 })), 'malformed');
  assert.equal(code(() => toArtboard({ html: '<!doctype html><html><head></head></html>', w: 390, h: 844 })), 'no-body');
});

test('boolean attributes get "", empty elements lose the slash, svg children keep theirs', () => {
  const out = toArtboard({ html: read('inicio.html'), w: 390, h: 844, links });
  assert.ok(out.includes('disabled=""'));
  assert.ok(out.includes('<br>') && !out.includes('<br/>'));
  assert.ok(out.includes('<img src="data:image/png;base64,AAAA" alt="">'));
  assert.ok(out.includes('<path d="M0 0L10 10"/>'));
  const o2 = toArtboard({ html: doc('<input disabled><br/>'), w: 390, h: 844 });
  assert.ok(o2.includes('<input disabled="">') && o2.includes('<br>') && !o2.includes('<br/>'));
});

test('fonts (R-19): the three links go inside <helmet>, before <style>; without allowFonts they are refused', () => {
  const out = toArtboard({ html: read('fuentes.html'), w: 390, h: 844, links: {}, allowFonts: true });
  const helmet = out.slice(out.indexOf('<helmet>'), out.indexOf('</helmet>'));
  assert.equal((helmet.match(/<link /g) || []).length, 3);
  assert.ok(helmet.indexOf('<link') < helmet.indexOf('<style>'));
  assert.equal(out.slice(0, out.indexOf('<body>')).includes('<link'), false, 'not in the artboard <head>');
  assert.equal(code(() => toArtboard({ html: read('fuentes.html'), w: 390, h: 844, links: {}, allowFonts: false })), 'remote-resource');
  const imp = '<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>@import url(https://fonts.googleapis.com/css2?family=Inter);</style></head><body><p>a</p></body></html>';
  assert.equal(code(() => toArtboard({ html: imp, w: 390, h: 844, allowFonts: true })), 'remote-resource');
  const cdn = read('fuentes.html').replace('</head>', '<link rel="stylesheet" href="https://cdn.x.test/a.css">\n</head>');
  assert.equal(code(() => toArtboard({ html: cdn, w: 390, h: 844, allowFonts: true })), 'remote-resource');
});

test('sizesFor and bad-platform', () => {
  assert.deepEqual(sizesFor('mobile'), [{ w: 390, h: 844 }]);
  assert.deepEqual(sizesFor('desktop'), [{ w: 1440, h: 900 }]);
  assert.deepEqual(sizesFor('both'), [{ w: 390, h: 844 }, { w: 1440, h: 900 }]);
  assert.equal(code(() => sizesFor('tablet')), 'bad-platform');
});

test('artboardName: Main for the first, width in the name with both, unique across options, widths and pages', () => {
  assert.equal(artboardName({ prefix: 'r1', option: 'A', screen: 'inicio.html', w: 1440, platform: 'desktop', isMain: true }), 'Main.dc.html');
  assert.equal(artboardName({ prefix: 'r1', option: 'A', screen: 'detalle.html', w: 1440, platform: 'desktop' }), 'r1-a-detalle.dc.html');
  assert.equal(artboardName({ prefix: 'r1', option: 'A', screen: 'detalle.html', w: 390, platform: 'both' }), 'r1-a-detalle-390.dc.html');
  assert.equal(artboardName({ prefix: 'r1', option: 'A', screen: 'inicio.html', w: 1440, platform: 'both' }), 'r1-a-inicio-1440.dc.html');
  const set = (prefix, platform) => {
    const names = [];
    for (const o of ['A', 'B', 'C']) for (const s of ['inicio.html', 'detalle.html']) for (const w of [390, 1440]) names.push(artboardName({ prefix, option: o, screen: s, w, platform }));
    return names;
  };
  assert.equal(new Set(set('r1', 'both')).size, 12);
  assert.ok(new Set(set('r1', 'desktop')).size < 12, 'control: without the width the names collide');
  const r1 = new Set(set('r1', 'both'));
  assert.ok(set('r2', 'both').every((n) => !r1.has(n)));
  assert.equal(code(() => artboardName({ prefix: 'r-202610011800-a1b2c3', option: 'A', screen: `${'x'.repeat(32)}.html`, w: 1440, platform: 'both' })), null);
  assert.equal(code(() => artboardName({ prefix: 'r'.repeat(40), option: 'A', screen: `${'x'.repeat(32)}.html`, w: 1440, platform: 'both' })), 'bad-name');
});

test('isInteractive: link to another screen, controls and details are; plain text is not', () => {
  assert.equal(isInteractive('<a href="detalle.html">x</a>'), true);
  assert.equal(isInteractive('<p>solo texto</p>'), false);
  assert.equal(isInteractive('<details><summary>a</summary>b</details>'), true);
  assert.equal(isInteractive('<button>a</button>'), true);
  assert.equal(isInteractive('<a href="#top">x</a>'), false);
});
