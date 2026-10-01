import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { parseFontLinks, stripRemoteFonts } from '../lib/remote-fonts.mjs';

const fontsHtml = fs.readFileSync(path.join(FIXTURES, 'canvas', 'fuentes.html'), 'utf8');
const wrap = (links) => `<!doctype html><html><head><meta charset="utf-8">${links}</head><body></body></html>`;
const CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap';

test('the allowed form is accepted and returned in canonical form', () => {
  const r = parseFontLinks(fontsHtml, { requireHead: true });
  assert.equal(r.ok, true);
  assert.equal(r.links.length, 3);
  assert.equal(r.links[2], `<link rel="stylesheet" href="${CSS}">`);
  assert.equal(parseFontLinks(wrap(`<link rel="stylesheet" href="${CSS}">`)).ok, true);
});

test('another host, no display=swap, 5 families, extra attributes and a second stylesheet are bad-font-link', () => {
  const bad = [
    '<link rel="stylesheet" href="https://fonts.example.com/css2?family=Inter&display=swap">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=A&family=B&family=C&family=D&family=E&display=swap">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=In ter&display=swap">',
    `<link rel="stylesheet" href="${CSS}" onload="x()">`,
    '<link rel="preconnect" href="https://fonts.gstatic.com">',
  ];
  for (const link of bad) {
    const r = parseFontLinks(wrap(link));
    assert.equal(r.ok, false, link);
    assert.equal(r.problems[0].code, 'bad-font-link', link);
  }
  const twice = parseFontLinks(wrap(`<link rel="stylesheet" href="${CSS}"><link rel="stylesheet" href="${CSS}">`));
  assert.equal(twice.ok, false);
});

test('a link that is not a font link is left alone (remote-resource is for screenProblems)', () => {
  const r = parseFontLinks(wrap('<link rel="stylesheet" href="https://cdn.x.test/a.css">'));
  assert.deepEqual([r.ok, r.links.length], [true, 0]);
});

test('requireHead: a font link in the body is a bad-font-link', () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><link rel="stylesheet" href="${CSS}"></body></html>`;
  assert.equal(parseFontLinks(html, { requireHead: true }).ok, false);
  assert.equal(parseFontLinks(html).ok, true);
});

test('stripRemoteFonts removes the three allowed links (own lines included) and counts them', () => {
  const r = stripRemoteFonts(fontsHtml);
  assert.equal(r.removed, 3);
  assert.ok(!r.html.includes('fonts.googleapis.com') && !r.html.includes('fonts.gstatic.com'));
  assert.ok(r.html.includes('<title>Fuentes</title>\n<style>'), 'whole lines go away, no blank lines left');
  const plain = fs.readFileSync(path.join(FIXTURES, 'canvas', 'inicio.html'), 'utf8');
  assert.deepEqual(stripRemoteFonts(plain), { html: plain, removed: 0 });
});

test('stripRemoteFonts leaves other remote resources and badly formed font links in place', () => {
  const html = wrap('<link rel="stylesheet" href="https://cdn.x.test/a.css"><link rel="stylesheet" href="https://fonts.example.com/css2?family=A&display=swap">');
  const r = stripRemoteFonts(html);
  assert.equal(r.removed, 0);
  assert.equal(r.html, html);
});
