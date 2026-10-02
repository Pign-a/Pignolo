import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { scanMarkup, splitDocument, CanvasError } from '../lib/canvas-html.mjs';

const codes = (html) => scanMarkup(html).problems.map((p) => p.code);

test('well-formed documents are ok; an unclosed, crossed or self-closed element is malformed', () => {
  assert.ok(codes('<div><p>x</div>').includes('malformed'));
  assert.ok(codes('<ul><li>a<li>b</ul>').includes('malformed'));
  assert.ok(codes('<div/>').includes('malformed'));
  assert.equal(scanMarkup(fs.readFileSync(path.join(FIXTURES, 'canvas', 'inicio.html'), 'utf8')).ok, true);
  for (const ok of ['<input disabled>', '<br>', '<img src="a.png" alt="">', '<style>a{color:red}</style>', '<svg><path d="M0 0"/></svg>']) {
    assert.equal(scanMarkup(ok).ok, true, ok);
  }
});

test('unquoted attribute, braces, reserved tags and controls inside a link', () => {
  assert.ok(codes('<div class=a>x</div>').includes('unquoted-attr'));
  assert.ok(codes('<p>{{nombre}}</p>').includes('braces'));
  assert.ok(codes('<p>}}</p>').includes('braces'));
  assert.ok(codes('<a href="b.html"><button>Ir</button></a>').includes('control-in-link'));
  assert.ok(codes('<a href="b.html"><div><input></div></a>').includes('control-in-link'));
  assert.ok(codes('<x-dc></x-dc>').includes('reserved-tag'));
  assert.ok(codes('<sc-for></sc-for>').includes('reserved-tag'));
  assert.ok(codes('<helmet></helmet>').includes('reserved-tag'));
  assert.ok(codes('<dc-import></dc-import>').includes('reserved-tag'));
});

test('braces in <style>: {{ is rejected (same rule as verifyCanvas), }} only warns', () => {
  assert.ok(codes('<style>a{{color:red}}</style>').includes('braces'));
  const close = scanMarkup('<style>@media (max-width:600px){a{color:red}}</style>');
  assert.equal(close.ok, true);
  assert.deepEqual(close.warnings.map((w) => w.code), ['css-close-braces']);
});

test('warnings never reject', () => {
  const cases = [
    ['<div style="position:fixed">x</div>', 'fixed-position'],
    ['<div style="height:100vh">x</div>', 'viewport-units'],
    ['<style>body{margin:0}</style>', 'body-rule'],
    ['<html><body class="x"><p>a</p></body></html>', 'body-attr'],
  ];
  for (const [html, code] of cases) {
    const r = scanMarkup(html);
    assert.equal(r.ok, true, html);
    assert.ok(r.warnings.some((w) => w.code === code), code);
  }
});

test('splitDocument reads lang, title, styles, font links and the body without comments', () => {
  const d = splitDocument(fs.readFileSync(path.join(FIXTURES, 'canvas', 'inicio.html'), 'utf8'));
  assert.equal(d.lang, 'es');
  assert.equal(d.title, 'Inicio');
  assert.equal(d.styles.length, 1);
  assert.ok(!d.body.includes('<!--') && d.body.includes('Mi cuenta'));
  assert.throws(() => splitDocument('<p>x</p>'), (e) => e instanceof CanvasError && e.code === 'no-body');
  const f = splitDocument(fs.readFileSync(path.join(FIXTURES, 'canvas', 'fuentes.html'), 'utf8'));
  assert.equal(f.fontLinks.length, 3);
});
