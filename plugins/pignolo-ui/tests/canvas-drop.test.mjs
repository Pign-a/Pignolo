// Hito 4i, T1: what the user did not choose leaves the canvas (R-4i-1 to R-4i-3). merge takes the artboards and the row
// notes that THIS run published and no longer builds out of the live index; plan sends `null` for them in `files`;
// record takes them out of publish.json and lowers the figures. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mergeIndex, diffPublished } from '../lib/canvas-merge.mjs';
import { assertParams } from '../lib/canvas-publish.mjs';
import { buildCanvas, layoutSha256 } from '../lib/canvas-layout.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl } from './support/canvas-plan.mjs';

const NOW = '2026-10-02T10:00:00Z';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));
const SUBSET = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const screens = (id) => [{ file: 'inicio.html', html: screenHtml(`${id} i`, { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml(`${id} d`) }];
const mk = (letters, pageId = 'r1') => buildCanvas({
  options: letters.map((id) => ({ id, kind: 'option', screens: screens(id) })),
  platform: 'desktop', pageId, pageName: 'new · 2026-10-02', canvasTitle: 'Proyecto', first: false,
});
const manifestOf = (built) => ({ files: Object.entries(built.files).map(([n, html]) => ({ path: `project/${n}`, sha256: sha(html) })).sort((a, b) => (a.path < b.path ? -1 : 1)) });
const publishedOf = (built) => ({
  pageId: built.fragment.page.id,
  files: Object.fromEntries(manifestOf(built).files.map((f) => [f.path, f.sha256])),
  boards: Object.fromEntries(Object.entries(built.fragment.boards).map(([n, b]) => [n, SUBSET(b, ['x', 'y', 'w', 'h', 'title'])])),
  notes: Object.fromEntries(Object.entries(built.fragment.notes).map(([i, n]) => [i, SUBSET(n, ['x', 'y', 'text', 'maxW'])])),
});
const liveFilesOf = (built, over = {}) => ({ ...Object.fromEntries(manifestOf(built).files.map((f) => [f.path, f.sha256])), ...over });
const nameOf = (p) => p.replace(/^project\//, '');

// a canvas that holds run r1 with options A, B and C, and the second build of the run with only B
function setup() {
  const full = mk(['A', 'B', 'C']);
  const live = mergeIndex({ ours: full.fragment, live: null, title: 'Proyecto', now: NOW }).index;
  const only = mk(['B']);
  const published = publishedOf(full);
  const diff = diffPublished({ manifest: manifestOf(only), layoutSha256: layoutSha256(only.fragment), pageId: 'r1', published });
  const merge = (over = {}) => mergeIndex({
    ours: only.fragment, live: over.live ?? live, liveFiles: over.liveFiles ?? liveFilesOf(full), published: over.published ?? published,
    title: 'Proyecto', now: NOW, changed: diff.changed, removed: over.removed ?? diff.removed, acceptOverwrite: over.acceptOverwrite ?? [],
  });
  const ofLetter = (l) => Object.keys(full.fragment.boards).filter((n) => n.includes(`-${l}-`));
  return { full, only, live, published, diff, merge, ofLetter };
}

test('diffPublished: removed lists the unchosen paths', () => {
  const s = setup();
  assert.deepEqual(s.diff.removed, [...s.ofLetter('a'), ...s.ofLetter('c')].map((n) => `project/${n}`).sort());
});

test('mergeIndex: a board of ours that is no longer built leaves boards and order of the live index', () => {
  const s = setup();
  const r = s.merge();
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  for (const n of [...s.ofLetter('a'), ...s.ofLetter('c')]) {
    assert.ok(!(n in r.index.boards), `${n} left boards`);
    assert.ok(!r.index.order.includes(n), `${n} left order`);
  }
  for (const n of s.ofLetter('b')) { assert.ok(n in r.index.boards); assert.ok(r.index.order.includes(n)); }
  assert.deepEqual([...r.kept.dropped].sort(), [...s.ofLetter('a'), ...s.ofLetter('c')].sort());
  assert.equal(r.index.order.length, Object.keys(r.index.boards).length);
});

test('mergeIndex: a moved board that was not chosen is removed, a board of the user with another name is kept', () => {
  const s = setup();
  const live = clone(s.live);
  const [a1] = s.ofLetter('a');
  live.boards[a1].x += 700;
  live.boards['boceto.dc.html'] = { x: -900, y: 0, w: 500, h: 400, title: 'Boceto mío', page: 'r1' };
  live.order.push('boceto.dc.html');
  const r = s.merge({ live });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(!(a1 in r.index.boards));
  assert.deepEqual(r.index.boards['boceto.dc.html'], live.boards['boceto.dc.html']);
  assert.ok(r.index.order.includes('boceto.dc.html'));
});

test('mergeIndex: a removed board edited by hand stops with artboard-edited-by-hand and goes with --accept-overwrite', () => {
  const s = setup();
  const [c1] = s.ofLetter('c');
  const liveFiles = liveFilesOf(s.full, { [`project/${c1}`]: sha('lo editó el usuario') });
  const stopped = s.merge({ liveFiles });
  assert.equal(stopped.ok, false);
  assert.deepEqual(stopped.problems, [{ code: 'artboard-edited-by-hand', files: [c1] }]);
  const accepted = s.merge({ liveFiles, acceptOverwrite: [c1] });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.problems));
  assert.ok(!(c1 in accepted.index.boards));
  assert.ok(accepted.kept.overwritten.includes(c1));
});

test('mergeIndex: the row note of a removed option is removed, unless the user changed its text', () => {
  const s = setup();
  const live = clone(s.live);
  const rowA = 'r1-row-a';
  const rowC = 'r1-row-c';
  assert.ok(rowA in live.notes && rowC in live.notes);
  live.notes[rowC].text = 'Esta me gusta, la dejo';
  const r = s.merge({ live });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(!(rowA in r.index.notes), 'the untouched row note goes');
  assert.equal(r.index.notes[rowC].text, 'Esta me gusta, la dejo');
  assert.deepEqual(r.kept.dropKept, [rowC]);
  assert.ok('r1-row-b' in r.index.notes);
});

test('mergeIndex: a board that is not in publish.json is never removed', () => {
  const s = setup();
  const live = clone(s.live);
  live.boards['ajeno.dc.html'] = { x: 5, y: 5, w: 300, h: 300, title: 'Ajeno', page: 'r1' };
  live.order.push('ajeno.dc.html');
  // a "removed" list that names it anyway, and a board of this page that publish.json does not list
  const [a1] = s.ofLetter('a');
  const published = clone(s.published);
  delete published.files[`project/${a1}`];
  delete published.boards[a1];
  const r = s.merge({ live, published, removed: ['project/ajeno.dc.html', `project/${a1}`] });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok('ajeno.dc.html' in r.index.boards);
  assert.ok(a1 in r.index.boards, 'not in publish.json: not ours to remove');
  assert.ok(!r.kept.dropped.includes('ajeno.dc.html') && !r.kept.dropped.includes(a1));
});

test('mergeIndex: names that differ only in capitals are not removed', () => {
  const s = setup();
  const live = clone(s.live);
  const [a1] = s.ofLetter('a');
  const variant = a1.toUpperCase().replace(/\.DC\.HTML$/, '.dc.html');
  assert.notEqual(variant, a1);
  const board = live.boards[a1];
  delete live.boards[a1];
  live.order = live.order.filter((n) => n !== a1);
  live.boards[variant] = board;
  live.order.push(variant);
  const r = s.merge({ live, liveFiles: liveFilesOf(s.full, { [`project/${a1}`]: null }) });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(variant in r.index.boards, 'the board of the user with other capitals stays');
  assert.ok(!r.kept.dropped.includes(variant));
});

test('mergeIndex: a removed path with .. or a backslash is never dropped', () => {
  const s = setup();
  const live = clone(s.live);
  live.boards['..\\x.dc.html'] = { x: 0, y: 0, w: 300, h: 300, title: 'X', page: 'r1' };
  live.order.push('..\\x.dc.html');
  const published = clone(s.published);
  published.files['project/..\\x.dc.html'] = sha('x');
  const r = s.merge({ live, published, removed: ['project/..\\x.dc.html', 'project/../y.dc.html'], liveFiles: liveFilesOf(s.full, { 'project/..\\x.dc.html': sha('x') }) });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok('..\\x.dc.html' in r.index.boards);
  assert.deepEqual(r.kept.dropped, []);
});

// ---- plan, record and the CLI ---------------------------------------------------------------------------

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const canvasFile = (r, ...p) => path.join(r.run, 'canvas', ...p);

function publishFirst(r, kit, n = 1) {
  const url = fakeUrl(n);
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  return url;
}

function saveLive(r, kit, mutate = (j) => j) {
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify(mutate(readJson(canvasFile(r, 'project', 'canvas.json'))), null, 2));
  const liveDir = path.join(kit.dir, 'live-files');
  fs.rmSync(liveDir, { recursive: true, force: true });
  fs.cpSync(canvasFile(r, 'project'), path.join(liveDir, 'project'), { recursive: true });
  return { live, liveDir };
}
const mergeWith = (kit, saved, extra = []) => kit.merge(['--live', saved.live, '--live-dir', saved.liveDir, ...extra]);

// publish A,B,C, add a board of the user to the live canvas, rebuild with only B and go as far as the canvas-publish plan
function chooseB() {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const url = publishFirst(r, kit, 21);
  const before = { canvas: kit.canvas(), published: kit.published() };
  const saved = saveLive(r, kit, (j) => { j.boards['boceto.dc.html'] = { x: -900, y: 0, w: 500, h: 400, title: 'Boceto mío' }; j.order.push('boceto.dc.html'); return j; });
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'B' })).status, 0);
  const read = kit.plan();
  assert.equal(read.json.step.id, 'canvas-read-live', read.stdout);
  const merged = mergeWith(kit, saved);
  assert.equal(merged.status, 0, merged.stdout);
  const pub = kit.plan();
  assert.equal(pub.status, 0, pub.stdout);
  return { r, kit, url, before, saved, merged, pub };
}

test('canvas-index CLI: after publishing A,B,C, build --options B then plan, merge and plan sends nulls for A and C and keeps what the user added', () => {
  const { r, kit, merged, pub } = chooseB();
  const gone = Object.keys(merged.json.kept ? Object.fromEntries(merged.json.kept.dropped.map((n) => [n, 1])) : {});
  assert.equal(gone.length, 4);
  const index = readJson(canvasFile(r, 'project', 'canvas.json'));
  assert.ok('boceto.dc.html' in index.boards, 'what the user added stays');
  for (const n of gone) assert.ok(!(n in index.boards));
  const files = pub.json.step.params.files;
  const nulls = Object.keys(files).filter((p) => files[p] === null).sort();
  assert.deepEqual(nulls, gone.map((n) => `project/${n}`).sort());
  assert.ok(!('project/boceto.dc.html' in files));
  assert.ok(Object.entries(files).filter(([, v]) => v !== null).every(([p, v]) => p === v));
  void kit;
});

test('planNext: canvas-publish carries null for each removed path and for nothing else', () => {
  const { r, pub, before } = chooseB();
  const files = pub.json.step.params.files;
  const was = Object.keys(before.published.files);
  const manifest = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path);
  for (const [p, v] of Object.entries(files)) {
    if (v === null) { assert.ok(was.includes(p) && !manifest.includes(p), `${p} is a removed path`); } else assert.equal(v, p);
  }
  // only Main (B's first screen now) and B's second screen are built; everything else of the first publication goes
  assert.equal(Object.values(files).filter((v) => v === null).length, was.filter((p) => !manifest.includes(p)).length);
  assert.ok(pub.json.step.params.root.endsWith('canvas'));
});

test('assertParams: null is accepted only as a value of files, only for removed paths', () => {
  const ok = { action: 'publish', url: 'u', files: { 'project/a.dc.html': 'project/a.dc.html', 'project/r-1-b.dc.html': null } };
  assert.doesNotThrow(() => assertParams(ok, { removed: ['project/r-1-b.dc.html'] }));
  assert.throws(() => assertParams(ok, { removed: [] }), /null/);
  assert.throws(() => assertParams(ok), /null/);
  assert.throws(() => assertParams({ action: 'publish', title: null }, { removed: ['project/x.dc.html'] }), /null/);
  assert.throws(() => assertParams({ files: { 'project/x.dc.html': null }, other: { files: { 'project/x.dc.html': null } } }, { removed: ['project/x.dc.html'] }), /null/);
  assert.throws(() => assertParams({ files: { 'project/../x.dc.html': null } }, { removed: ['project/../x.dc.html'] }), /null|ruta/);
  assert.throws(() => assertParams({ files: { 'project\\x.dc.html': null } }, { removed: ['project\\x.dc.html'] }), /null|ruta/);
});

test('planNext: a run whose only change is a removal is not done', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  publishFirst(r, kit, 22);
  assert.equal(kit.plan().json.done, true, 'nothing to do before the removal');
  // publish.json says the run published one more artboard that is no longer built; layout and files are the same
  const pubFile = path.join(r.run, 'publish.json');
  const now = readJson(pubFile);
  const ghost = `project/${now.pageId}-d-inicio.dc.html`;
  now.files[ghost] = sha('fantasma');
  fs.writeFileSync(pubFile, JSON.stringify(now));
  const res = kit.plan();
  assert.equal(res.status, 0, res.stdout);
  assert.equal(res.json.done, false);
  assert.equal(res.json.step.id, 'canvas-read-live');
  // the user already deleted it: nothing to drop, one more publication, and then it is done (no loop)
  const saved = saveLive(r, kit);
  assert.equal(mergeWith(kit, saved).status, 0);
  const pub = kit.plan();
  assert.equal(pub.json.step.id, 'canvas-publish', pub.stdout);
  assert.ok(!Object.values(pub.json.step.params.files).includes(null));
  assert.equal(kit.record('canvas-publish', now.canvasUrl).status, 0);
  assert.ok(!(ghost in kit.published().files));
  assert.equal(kit.plan().json.done, true);
});

test('recordStep: removed paths leave publish.json and lower the figures of the canvas record', () => {
  const { r, kit, url, before } = chooseB();
  const gone = Object.keys(before.published.files).filter((p) => !readJson(canvasFile(r, 'manifest.json')).files.some((f) => f.path === p));
  assert.equal(gone.length, 4);
  assert.equal(kit.record('canvas-publish', url).status, 0);
  const after = { canvas: kit.canvas(), published: kit.published() };
  for (const p of gone) {
    assert.ok(!(p in after.published.files), `${p} left files`);
    assert.ok(!(p in after.published.sizes), `${p} left sizes`);
  }
  assert.equal(Object.keys(after.published.files).length, Object.keys(before.published.files).length - 4);
  assert.equal(after.canvas.files, before.canvas.files - 4);
  assert.ok(after.canvas.bytes < before.canvas.bytes && after.canvas.bytes >= 0);
  assert.ok(after.canvas.notes < before.canvas.notes, 'the row notes of the removed options leave the figures');
  assert.deepEqual(Object.keys(after.published.notes).sort(), Object.keys(readJson(canvasFile(r, 'page.json')).notes).sort());
  assert.equal(kit.plan().json.done, true);
  void nameOf;
});
