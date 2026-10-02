import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeTempDir } from './helpers.mjs';
import { screenHtml } from './support/canvas-run.mjs';
import { pageIdFor, buildCanvas, layoutSha256, verifyCanvas, CanvasError } from '../lib/canvas-layout.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const mkOptions = (letters, screens = ['inicio.html', 'detalle.html']) => letters.map((id) => ({
  id, kind: 'option',
  screens: screens.map((file, i) => ({ file, html: screenHtml(`${id} ${file}`, { link: screens.length > 1 ? screens[(i + 1) % screens.length] : null }) })),
}));
const base = (over = {}) => ({ options: mkOptions(['A', 'B']), platform: 'desktop', pageId: 'r1', pageName: 'new · 2026-10-01', canvasTitle: 'Proyecto', first: true, now: '2026-10-01T18:00:00Z', ...over });

// writes what canvas-index build would write, so verifyCanvas can be run on copies
function writeCanvas(opts = {}) {
  const built = buildCanvas(base(opts));
  const dir = path.join(makeTempDir(), 'canvas');
  fs.mkdirSync(path.join(dir, 'project'), { recursive: true });
  const files = Object.keys(built.files).sort().map((name) => {
    fs.writeFileSync(path.join(dir, 'project', name), built.files[name]);
    return { path: `project/${name}`, sha256: sha(built.files[name]) };
  });
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify(built.fragment, null, 2));
  const manifest = { files, layoutSha256: layoutSha256(built.fragment), pageId: built.fragment.page.id, bytes: 0, first: opts.first ?? true };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, built, manifest };
}
const codes = (dir) => verifyCanvas({ dir }).problems.map((p) => p.code);
const editJson = (file, fn) => { const j = JSON.parse(fs.readFileSync(file, 'utf8')); fn(j); fs.writeFileSync(file, JSON.stringify(j, null, 2)); };
const editManifestToMatch = (dir) => {
  const fragment = JSON.parse(fs.readFileSync(path.join(dir, 'page.json'), 'utf8'));
  editJson(path.join(dir, 'manifest.json'), (m) => { m.layoutSha256 = layoutSha256(fragment); });
};

test('pageIdFor: the four real ids of the audit give four different 21-character ids (C-02, C-03)', () => {
  const ids = ['2026-10-01-1800-improve-checkout-flow', '2026-10-01-1800-improve-checkout-flow-rework1', '2026-10-01-1800-improve-checkout-flow-rework1-2', '2026-10-01-1800-improve-checkout-flow-rewrite'].map(pageIdFor);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) { assert.match(id, /^r-\d{12}-[0-9a-f]{6}$/); assert.equal(id.length, 21); }
  assert.throws(() => pageIdFor('sin-sello'), (e) => e instanceof CanvasError && e.code === 'bad-run-id');
});

test('numbers of the layout: desktop, 2 options, 2 screens, first', () => {
  const { fragment, files } = buildCanvas(base());
  const b = fragment.boards;
  assert.deepEqual({ x: b['Main.dc.html'].x, y: b['Main.dc.html'].y, w: b['Main.dc.html'].w, h: b['Main.dc.html'].h, page: b['Main.dc.html'].page }, { x: 0, y: 260, w: 1440, h: 900, page: 'r1' });
  assert.equal(b['r1-a-detalle.dc.html'].x, 1520);
  assert.equal(b['r1-b-inicio.dc.html'].y, 1420);
  assert.deepEqual(fragment.notes['r1-row-a'], { x: 0, y: 0, text: 'Opción A', kind: 'title1', maxW: 2960, page: 'r1' });
  assert.equal(fragment.notes['r1-row-b'].y, 1160);
  assert.deepEqual(fragment.order, ['Main.dc.html', 'r1-a-detalle.dc.html', 'r1-b-inicio.dc.html', 'r1-b-detalle.dc.html']);
  assert.deepEqual(Object.keys(files).sort(), [...fragment.order].sort());
  assert.deepEqual(fragment.page, { id: 'r1', name: 'new · 2026-10-01' });
  assert.equal(fragment.v, 3);
  assert.deepEqual(fragment.designSystems, []);
});

test('both: one row per width, 390 first, widths in the names, links stay in the row', () => {
  const { fragment, files } = buildCanvas(base({ options: mkOptions(['A']), platform: 'both' }));
  const b = fragment.boards;
  assert.equal(b['Main.dc.html'].y, 260);
  assert.deepEqual([b['Main.dc.html'].x, b['r1-a-detalle-390.dc.html'].x, b['Main.dc.html'].h], [0, 470, 844]);
  assert.deepEqual([b['r1-a-inicio-1440.dc.html'].y, b['r1-a-inicio-1440.dc.html'].x, b['r1-a-detalle-1440.dc.html'].x, b['r1-a-inicio-1440.dc.html'].h], [1364, 0, 1520, 900]);
  assert.deepEqual([fragment.notes['r1-row-a-390'].y, fragment.notes['r1-row-a-1440'].y], [0, 1104]);
  assert.deepEqual([fragment.notes['r1-row-a-390'].text, fragment.notes['r1-row-a-1440'].text], ['Opción A · 390', 'Opción A · 1440']);
  assert.deepEqual(fragment.order, ['Main.dc.html', 'r1-a-detalle-390.dc.html', 'r1-a-inicio-1440.dc.html', 'r1-a-detalle-1440.dc.html']);
  assert.ok(files['r1-a-inicio-1440.dc.html'].includes('href="r1-a-detalle-1440.dc.html"'));
  assert.ok(files['Main.dc.html'].includes('href="r1-a-detalle-390.dc.html"'));
});

test('Main comes from the first screen of the list even when it is alphabetically second; links go to the same option', () => {
  const screens = ['zocalo.html', 'detalle.html'];
  const { files, fragment } = buildCanvas(base({ options: mkOptions(['A', 'B', 'C'], screens) }));
  assert.ok(files['Main.dc.html'].includes('A zocalo.html'));
  assert.equal(Object.keys(files).length, 6);
  assert.ok(files['r1-b-zocalo.dc.html'].includes('href="r1-b-detalle.dc.html"'));
  assert.ok(!files['r1-b-zocalo.dc.html'].includes('r1-a-detalle'));
  assert.equal(fragment.order[0], 'Main.dc.html');
});

test('first false writes no Main.dc.html', () => {
  const { files } = buildCanvas(base({ first: false }));
  assert.ok(!('Main.dc.html' in files));
  assert.ok('r1-a-inicio.dc.html' in files);
});

test('measured heights: clamp 400..8000, the row height follows and the next row goes down; junk is ignored', () => {
  const { fragment } = buildCanvas(base({ heights: { 'A/inicio.html@1440': 2310 } }));
  assert.equal(fragment.boards['Main.dc.html'].h, 2310);
  assert.equal(fragment.boards['r1-b-inicio.dc.html'].y, 260 + 2310 + 260);
  assert.equal(buildCanvas(base({ heights: { 'A/inicio.html@1440': 99999 } })).fragment.boards['Main.dc.html'].h, 8000);
  assert.equal(buildCanvas(base({ heights: { 'A/inicio.html@1440': 10 } })).fragment.boards['Main.dc.html'].h, 400);
  assert.equal(buildCanvas(base({ heights: { 'A/inicio.html@1440': 'alto' } })).fragment.boards['Main.dc.html'].h, 900);
});

test('layoutSha256 ignores now and follows x, h, titles, notes and the page name', () => {
  const ref = layoutSha256(buildCanvas(base()).fragment);
  assert.equal(layoutSha256(buildCanvas(base({ now: '2030-01-01T00:00:00Z' })).fragment), ref);
  const mutate = (fn) => { const f = buildCanvas(base()).fragment; fn(f); return layoutSha256(f); };
  assert.notEqual(mutate((f) => { f.boards['Main.dc.html'].x = 5; }), ref);
  assert.notEqual(mutate((f) => { f.boards['Main.dc.html'].h = 901; }), ref);
  assert.notEqual(mutate((f) => { f.boards['Main.dc.html'].title = 'otro'; }), ref);
  assert.notEqual(mutate((f) => { f.notes['r1-row-a'].text = 'otro'; }), ref);
  assert.notEqual(mutate((f) => { f.page.name = 'otro'; }), ref);
});

test('verifyCanvas: a valid output is ok, with first and without it', () => {
  assert.deepEqual(verifyCanvas({ dir: writeCanvas().dir }), { ok: true, problems: [] });
  assert.deepEqual(verifyCanvas({ dir: writeCanvas({ first: false }).dir }), { ok: true, problems: [] });
});

test('verifyCanvas: one defect at a time, each with its code', () => {
  const proj = (dir) => path.join(dir, 'project');
  const cases = [
    ['bad-name', (d) => fs.renameSync(path.join(proj(d), 'r1-a-detalle.dc.html'), path.join(proj(d), 'A detalle.dc.html'))],
    ['name-collision', (d) => { editJson(path.join(d, 'page.json'), (j) => { j.boards['r1-A-detalle.dc.html'] = { ...j.boards['r1-a-detalle.dc.html'] }; j.order.push('r1-A-detalle.dc.html'); }); }],
    ['missing-file', (d) => fs.rmSync(path.join(proj(d), 'r1-a-detalle.dc.html'))],
    ['unlisted-file', (d) => fs.copyFileSync(path.join(proj(d), 'Main.dc.html'), path.join(proj(d), 'extra.dc.html'))],
    ['bad-skeleton', (d) => fs.writeFileSync(path.join(proj(d), 'Main.dc.html'), fs.readFileSync(path.join(proj(d), 'Main.dc.html'), 'utf8').replace('<script src="./support.js"></script>', ''))],
    ['bad-skeleton', (d) => fs.appendFileSync(path.join(proj(d), 'Main.dc.html'), '<!-- innerHTML -->')],
    ['bad-skeleton', (d) => fs.writeFileSync(path.join(proj(d), 'Main.dc.html'), fs.readFileSync(path.join(proj(d), 'Main.dc.html'), 'utf8').replace('</style>', 'a{{color:red}}</style>'))],
    ['bad-font', (d) => fs.writeFileSync(path.join(proj(d), 'Main.dc.html'), fs.readFileSync(path.join(proj(d), 'Main.dc.html'), 'utf8').replace('<div style=', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap"><div style='))],
    ['note-too-close', (d) => editJson(path.join(d, 'page.json'), (j) => { j.notes['r1-row-b'].y = 1420 - 100; })],
    ['bad-gap', (d) => editJson(path.join(d, 'page.json'), (j) => { j.boards['r1-a-detalle.dc.html'].x = 1440 + 100; })],
    ['bad-size', (d) => editJson(path.join(d, 'page.json'), (j) => { j.boards['r1-a-detalle.dc.html'].w = 20; })],
    ['manifest-mismatch', (d) => fs.appendFileSync(path.join(proj(d), 'r1-a-detalle.dc.html'), ' ')],
    ['bad-order', (d) => editJson(path.join(d, 'page.json'), (j) => { j.order.pop(); })],
    ['no-main', (d) => editJson(path.join(d, 'page.json'), (j) => { j.order.reverse(); })],
    ['bad-page', (d) => editJson(path.join(d, 'page.json'), (j) => { delete j.boards['r1-a-detalle.dc.html'].page; })],
    ['bad-prefix', (d) => { fs.renameSync(path.join(proj(d), 'r1-a-detalle.dc.html'), path.join(proj(d), 'zz-detalle.dc.html')); editJson(path.join(d, 'page.json'), (j) => { j.boards['zz-detalle.dc.html'] = j.boards['r1-a-detalle.dc.html']; delete j.boards['r1-a-detalle.dc.html']; j.order = j.order.map((n) => (n === 'r1-a-detalle.dc.html' ? 'zz-detalle.dc.html' : n)); }); }],
    ['bad-title', (d) => editJson(path.join(d, 'page.json'), (j) => { j.canvasTitle = 'x'.repeat(121); })],
    ['bad-id', (d) => editJson(path.join(d, 'page.json'), (j) => { j.notes['n'.repeat(41)] = { ...j.notes['r1-row-a'] }; })],
    ['bad-id', (d) => editJson(path.join(d, 'page.json'), (j) => { j.page.id = 'x'.repeat(41); })],
  ];
  for (const [code, mutate] of cases) {
    const { dir } = writeCanvas();
    mutate(dir);
    editManifestToMatch(dir);
    assert.ok(codes(dir).includes(code), `${code}: got ${codes(dir).join(',')}`);
  }
  // without first, a Main.dc.html is wrong
  const { dir } = writeCanvas({ first: false });
  fs.copyFileSync(path.join(dir, 'project', 'r1-a-inicio.dc.html'), path.join(dir, 'project', 'Main.dc.html'));
  assert.ok(codes(dir).includes('no-main'));
  // a file under project/ds/ is not an unlisted artboard
  const ok = writeCanvas();
  fs.mkdirSync(path.join(ok.dir, 'project', 'ds', 'x'), { recursive: true });
  fs.writeFileSync(path.join(ok.dir, 'project', 'ds', 'x', 'tokens.dc.html'), 'x');
  assert.ok(!codes(ok.dir).includes('unlisted-file'));
});

test('verifyCanvas with a merged canvas.json: a missing own entry and an entry without file', () => {
  const { dir, built } = writeCanvas();
  const index = { v: 3, title: 'Proyecto', pages: [built.fragment.page], boards: { ...built.fragment.boards }, order: built.fragment.order, notes: { ...built.fragment.notes } };
  fs.writeFileSync(path.join(dir, 'project', 'canvas.json'), JSON.stringify(index));
  assert.deepEqual(verifyCanvas({ dir }), { ok: true, problems: [] });
  delete index.boards['r1-a-detalle.dc.html'];
  fs.writeFileSync(path.join(dir, 'project', 'canvas.json'), JSON.stringify(index));
  assert.ok(codes(dir).includes('missing-own-entry'));
  index.boards['r1-a-detalle.dc.html'] = built.fragment.boards['r1-a-detalle.dc.html'];
  index.boards['r1-zz.dc.html'] = { x: 0, y: 0, w: 100, h: 100 };
  fs.writeFileSync(path.join(dir, 'project', 'canvas.json'), JSON.stringify(index));
  assert.ok(codes(dir).includes('entry-without-file'));
});

test('verifyCanvas never throws on a folder without page.json or manifest.json', () => {
  const dir = makeTempDir();
  assert.equal(verifyCanvas({ dir }).ok, false);
});

test('second run in the same canvas (T2b): no Main, own prefix, own coordinates, every frame and note on its page', () => {
  const one = buildCanvas(base({ pageId: 'r1', first: true }));
  const two = buildCanvas(base({ pageId: 'r2', first: false, pageName: 'new · 2026-10-02' }));
  assert.ok(!('Main.dc.html' in two.files));
  assert.ok(Object.keys(two.files).every((n) => n.startsWith('r2-')), 'every name carries the page id');
  const names1 = new Set(Object.keys(one.files));
  assert.deepEqual(Object.keys(two.files).filter((n) => names1.has(n)), [], 'the name sets of r1 and r2 do not meet');
  assert.equal(Math.min(...Object.values(two.fragment.boards).map((b) => b.y)), 260);
  assert.ok(Object.values(two.fragment.boards).every((b) => b.page === 'r2'));
  assert.ok(Object.values(two.fragment.notes).every((n) => n.page === 'r2'));
  assert.deepEqual(two.fragment.page, { id: 'r2', name: 'new · 2026-10-02' });
});
