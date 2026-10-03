// Revisión final del hito 4i: hallazgos de T1 (quitar lo no elegido) como tests que fallan. Datos sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mergeIndex, diffPublished } from '../lib/canvas-merge.mjs';
import { buildCanvas, layoutSha256 } from '../lib/canvas-layout.mjs';
import { screenHtml } from './support/canvas-run.mjs';

const NOW = '2026-10-02T10:00:00Z';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));
const SUBSET = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const screens = (id) => [{ file: 'inicio.html', html: screenHtml(`${id} i`, { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml(`${id} d`) }];
const mk = (letters, first) => buildCanvas({
  options: letters.map((id) => ({ id, kind: 'option', screens: screens(id) })),
  platform: 'desktop', pageId: 'r1', pageName: 'new · 2026-10-02', canvasTitle: 'Proyecto', first,
});
const manifestOf = (built) => ({ files: Object.entries(built.files).map(([n, html]) => ({ path: `project/${n}`, sha256: sha(html) })).sort((a, b) => (a.path < b.path ? -1 : 1)) });
const publishedOf = (built) => ({
  pageId: built.fragment.page.id,
  files: Object.fromEntries(manifestOf(built).files.map((f) => [f.path, f.sha256])),
  boards: Object.fromEntries(Object.entries(built.fragment.boards).map(([n, b]) => [n, SUBSET(b, ['x', 'y', 'w', 'h', 'title'])])),
  notes: Object.fromEntries(Object.entries(built.fragment.notes).map(([i, n]) => [i, SUBSET(n, ['x', 'y', 'text', 'maxW'])])),
});

// R4i-01. Causa: en la corrida que abrió el lienzo (first), `build --options B` le da a la primera pantalla de B el nombre
// Main.dc.html, así que el marco de B que ya estaba publicado (r1-b-inicio) queda en `removed` y `merge` lo quita: el marco
// ELEGIDO que el usuario movió desaparece y Main toma la posición calculada, no la suya.
test('R4i-01: choosing B in the run that opened the canvas keeps where the user moved the chosen first frame', () => {
  const full = mk(['A', 'B', 'C'], true);
  const live = clone(mergeIndex({ ours: full.fragment, live: null, title: 'Proyecto', now: NOW }).index);
  const only = mk(['B'], true);
  const published = publishedOf(full);
  const diff = diffPublished({ manifest: manifestOf(only), layoutSha256: layoutSha256(only.fragment), pageId: 'r1', published });
  const chosen = 'r1-b-inicio.dc.html';
  assert.ok(chosen in live.boards);
  live.boards[chosen].x += 700;
  live.boards[chosen].y += 50;
  const moved = { x: live.boards[chosen].x, y: live.boards[chosen].y };
  const r = mergeIndex({
    ours: only.fragment, live, liveFiles: Object.fromEntries(manifestOf(full).files.map((f) => [f.path, f.sha256])), published,
    title: 'Proyecto', now: NOW, changed: diff.changed, removed: diff.removed,
  });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  // the frame that shows the chosen first screen, whatever its name, is where the user left it
  const shown = Object.entries(r.index.boards).filter(([, b]) => b.title === 'B · inicio');
  assert.equal(shown.length, 1, JSON.stringify(Object.keys(r.index.boards)));
  assert.deepEqual({ x: shown[0][1].x, y: shown[0][1].y }, moved, `${shown[0][0]} lost the position the user gave to the chosen frame`);
  assert.ok(!r.kept.dropped.includes(chosen) || r.kept.keptMoved.length > 0, 'the chosen frame was dropped as if it were not chosen');
});
