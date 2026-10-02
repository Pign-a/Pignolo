import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIndex, callLimitProblems, LIMITS } from '../lib/canvas-publish.mjs';
import { collectLeakOrigins } from '../lib/leak-values.mjs';
import { buildCanvas } from '../lib/canvas-layout.mjs';
import { screenHtml } from './support/canvas-run.mjs';

const ours = () => buildCanvas({
  options: [{ id: 'A', kind: 'option', screens: [{ file: 'inicio.html', html: screenHtml('A', { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml('B') }] }],
  platform: 'desktop', pageId: 'r1', pageName: 'new · 2026-10-01', canvasTitle: 'Proyecto', first: true,
}).fragment;

test('mergeIndex from scratch: v3, createdOnFiles.at = now, one page, launch.view canvas, no mutation of ours', () => {
  const fragment = ours();
  const snapshot = JSON.stringify(fragment);
  const r = mergeIndex({ ours: fragment, live: null, title: 'Proyecto', now: '2026-10-01T18:00:00Z' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.index.v, r.index.createdOnFiles, r.index.title, r.index.launch.view], [3, { v: 1, at: '2026-10-01T18:00:00Z' }, 'Proyecto', 'canvas']);
  assert.deepEqual(r.index.pages, [{ id: 'r1', name: 'new · 2026-10-01' }]);
  assert.deepEqual(r.index.order, fragment.order);
  assert.deepEqual(Object.keys(r.index.boards), Object.keys(fragment.boards));
  assert.deepEqual(r.index.designSystems, []);
  assert.equal(JSON.stringify(fragment), snapshot);
  r.index.boards['Main.dc.html'].x = 99;
  assert.equal(JSON.stringify(fragment), snapshot, 'the index is a copy');
});

test('limits of one call (A4C-15, A4C2-18): 255 entries, a 17 MB file, two 9 MB files', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(callLimitProblems({ entries: 254, sizes: [] }), []);
  assert.deepEqual(callLimitProblems({ entries: 255, sizes: [] }).map((p) => p.code), ['too-many-paths']);
  assert.deepEqual(callLimitProblems({ entries: 1, sizes: [{ path: 'a', size: 17 * MB }] }).map((p) => p.code), ['file-too-big', 'call-too-big']);
  assert.deepEqual(callLimitProblems({ entries: 2, sizes: [{ path: 'a', size: 9 * MB }, { path: 'b', size: 9 * MB }] }).map((p) => p.code), ['call-too-big']);
  assert.deepEqual(callLimitProblems({ entries: 2, sizes: [{ path: 'a', size: 8 * MB }, { path: 'b', size: 8 * MB }] }), []);
  assert.equal(LIMITS.call, 16 * MB);
});

const fakeOs = { userInfo: () => ({ username: 'usuario-ejemplo' }), homedir: () => '/home/usuario-ejemplo' };
const gitAnswers = (answers) => (args) => {
  const a = answers[args[1]];
  if (a instanceof Error) throw a;
  return a;
};

test('collectLeakOrigins: which origins gave a value and how git behaved (ok, unset, failed)', () => {
  const ok = collectLeakOrigins({ project: '/p', email: 'cuenta@ejemplo.test', exec: gitAnswers({ 'user.name': 'Persona Ejemplo\n', 'user.email': 'persona@ejemplo.test\n' }), os: fakeOs });
  assert.deepEqual(ok, { 'os-user': true, home: true, 'git-name': true, 'git-email': true, 'account-email': true, git: 'ok' });
  const unsetErr = Object.assign(new Error('exit 1'), { status: 1 });
  const unset = collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': unsetErr, 'user.email': unsetErr }), os: fakeOs });
  assert.equal(unset.git, 'unset');
  assert.deepEqual([unset['git-name'], unset['git-email'], unset['account-email']], [false, false, false]);
  const noGit = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
  const failed = collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': noGit, 'user.email': noGit }), os: fakeOs });
  assert.equal(failed.git, 'failed');
  const timeout = Object.assign(new Error('timed out'), { status: null, signal: 'SIGTERM' });
  assert.equal(collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': timeout, 'user.email': 'a@b.test' }), os: fakeOs }).git, 'failed');
});

// ---- stage 2 (T7d): the canvas of the project grows; merge never loses what the user did -----------------

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { diffPublished, noteRefusal, canvasFullFields, CANVAS_LIMITS, PublishError } from '../lib/canvas-publish.mjs';
import { layoutSha256 } from '../lib/canvas-layout.mjs';
import { makeTempDir } from './helpers.mjs';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const NOW = '2026-10-02T10:00:00Z';
const mkOptions = (letters) => letters.map((id) => ({
  id, kind: 'option',
  screens: ['inicio.html', 'detalle.html'].map((file, i) => ({ file, html: screenHtml(`${id} ${file}`, { link: i === 0 ? 'detalle.html' : 'inicio.html' }) })),
}));
// a page of a run: the fragment, its files and what publish.json would say after publishing it
function pageOf(pageId, { first = false, letters = ['A', 'B'], heights = null } = {}) {
  const built = buildCanvas({ options: mkOptions(letters), platform: 'desktop', pageId, pageName: `new · ${pageId}`, canvasTitle: 'Proyecto', first, heights });
  const files = Object.fromEntries(Object.entries(built.files).map(([n, c]) => [`project/${n}`, sha256(c)]));
  const published = {
    pageId, files, layoutSha256: layoutSha256(built.fragment), ownsMain: first,
    boards: Object.fromEntries(Object.entries(built.fragment.boards).map(([n, b]) => [n, { x: b.x, y: b.y, w: b.w, h: b.h, title: b.title }])),
    notes: Object.fromEntries(Object.entries(built.fragment.notes).map(([id, n]) => [id, { x: n.x, y: n.y, text: n.text, maxW: n.maxW }])),
  };
  return { ...built, published };
}
const merged = (r) => { assert.equal(r.ok, true, JSON.stringify(r.problems)); return r; };
const clone = (v) => JSON.parse(JSON.stringify(v));
// the canvas after run 1 was published and nobody touched it
const liveAfter = (p1) => merged(mergeIndex({ ours: p1.fragment, live: null, title: 'Proyecto', now: NOW })).index;

test('diffPublished: nothing published, same, one artboard, a taller option, a new page, a file that is gone', () => {
  const p1 = pageOf('r1', { first: true });
  const manifest = { files: Object.entries(p1.published.files).map(([p, s]) => ({ path: p, sha256: s })) };
  const args = { manifest, layoutSha256: p1.published.layoutSha256, pageId: 'r1', published: p1.published };
  const all = Object.keys(p1.published.files).sort();
  assert.deepEqual(diffPublished({ ...args, published: null }), { changed: all, removed: [], sendIndex: true });
  assert.deepEqual(diffPublished(args), { changed: [], removed: [], sendIndex: false });
  const one = { ...manifest, files: manifest.files.map((f) => (f.path === 'project/r1-b-inicio.dc.html' ? { ...f, sha256: 'x'.repeat(64) } : f)) };
  assert.deepEqual(diffPublished({ ...args, manifest: one }), { changed: ['project/r1-b-inicio.dc.html'], removed: [], sendIndex: false });
  assert.equal(diffPublished({ ...args, layoutSha256: 'taller' }).sendIndex, true);
  assert.deepEqual(diffPublished({ ...args, pageId: 'r2' }), { changed: all, removed: [], sendIndex: true });
  const gone = { ...manifest, files: manifest.files.slice(1) };
  assert.deepEqual(diffPublished({ ...args, manifest: gone }), { changed: [], removed: [manifest.files[0].path], sendIndex: false });
});

test('mergeIndex with an adverse live: everything of the user stays, our page r2 is added after r1 (A4C-07)', () => {
  const p1 = pageOf('r1', { first: true });
  const live = liveAfter(p1);
  live.pages[0].name = 'new · 2026-09-30';
  live.boards['Main.dc.html'].x += 55; // the user moved a frame of r1
  live.boards['boceto.dc.html'] = { x: 9000, y: 0, w: 300, h: 200, title: 'Boceto' };
  live.order.push('boceto.dc.html');
  live.notes['note-x'] = { x: 0, y: -400, text: 'Una nota mía', kind: 'title1', maxW: 400 };
  live.notes['r1-row-a'].x += 20;
  live.designSystems = [{ namespace: 'ajeno', path: 'project/ds/ajeno' }];
  live.launch.page = 'r1';
  live.title = 'Mi lienzo';
  live.extra = { a: 1 };
  const before = JSON.stringify(live);
  const p2 = pageOf('r2');
  const r = merged(mergeIndex({ ours: p2.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'Proyecto', now: NOW, changed: Object.keys(p2.files).map((n) => `project/${n}`), launchPage: 'r1' }));
  const idx = r.index;
  assert.equal(JSON.stringify(live), before, 'live is not mutated');
  assert.deepEqual(idx.pages, [{ id: 'r1', name: 'new · 2026-09-30' }, { id: 'r2', name: 'new · r2' }]);
  assert.equal(idx.title, 'Mi lienzo');
  assert.deepEqual(idx.extra, { a: 1 });
  assert.deepEqual(idx.boards['boceto.dc.html'], live.boards['boceto.dc.html']);
  assert.deepEqual(idx.boards['Main.dc.html'], live.boards['Main.dc.html']);
  assert.deepEqual(idx.notes['note-x'], live.notes['note-x']);
  assert.deepEqual(idx.notes['r1-row-a'], live.notes['r1-row-a']);
  assert.deepEqual(idx.designSystems, live.designSystems);
  for (const n of Object.keys(p1.fragment.boards)) assert.deepEqual(idx.boards[n], live.boards[n], n);
  assert.deepEqual(idx.order.slice(0, live.order.length), live.order, 'the order of the live canvas comes first');
  assert.deepEqual(idx.order.slice(live.order.length), p2.fragment.order, 'ours goes at the end');
  for (const [n, b] of Object.entries(p2.fragment.boards)) assert.deepEqual(idx.boards[n], b, n);
  for (const [id, n] of Object.entries(p2.fragment.notes)) assert.deepEqual(idx.notes[id], n, id);
  assert.equal(idx.launch.page, 'r2', 'launch was ours (equal to canvas.launchPage): it moves to the new page');
  // returning ours as is would drop boceto.dc.html and the page r1: that is what this case protects
  assert.notDeepEqual(idx, merged(mergeIndex({ ours: p2.fragment, live: null, title: 'x', now: NOW })).index);
});

test('A4C-07 case by case: a renamed page, a deleted frame, a taller option that pushes the rows down, a launch page that the user changed', () => {
  const p1 = pageOf('r1', { first: true });
  const same = (live, ours, extra = {}) => mergeIndex({ ours: ours.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: [], launchPage: 'r1', first: true, ownsMain: true, ...extra });
  // (a) the user renamed page r1: a merge of the same run leaves their name
  const a = liveAfter(p1);
  a.pages[0].name = 'Mi nombre';
  assert.equal(merged(same(a, p1)).index.pages[0].name, 'Mi nombre');
  // (b) the user deleted a frame of ours: it does not come back, not in boards and not in order; nothing lingers without a file
  const b = liveAfter(p1);
  delete b.boards['r1-b-detalle.dc.html'];
  b.order = b.order.filter((n) => n !== 'r1-b-detalle.dc.html');
  const liveFilesB = { ...p1.published.files };
  delete liveFilesB['project/r1-b-detalle.dc.html'];
  const rb = merged(mergeIndex({ ours: p1.fragment, live: b, liveFiles: liveFilesB, published: p1.published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true }));
  assert.ok(!('r1-b-detalle.dc.html' in rb.index.boards) && !rb.index.order.includes('r1-b-detalle.dc.html'));
  assert.deepEqual(rb.kept.userDeleted, ['r1-b-detalle.dc.html']);
  // ... unless its file is regenerated in this very call: then it comes back and is noted
  const rb2 = merged(mergeIndex({ ours: p1.fragment, live: b, liveFiles: liveFilesB, published: p1.published, title: 'P', now: NOW, changed: ['project/r1-b-detalle.dc.html'], first: true, ownsMain: true }));
  assert.ok('r1-b-detalle.dc.html' in rb2.index.boards && rb2.index.order.includes('r1-b-detalle.dc.html'));
  assert.deepEqual(rb2.kept.restored, ['r1-b-detalle.dc.html']);
  // (c) option A grows from 900 to 1500: row B goes down when untouched, stays when the user moved it
  const tall = pageOf('r1', { first: true, heights: { 'A/inicio.html@1440': 1500, 'A/detalle.html@1440': 1500 } });
  assert.ok(tall.fragment.boards['r1-b-inicio.dc.html'].y > p1.fragment.boards['r1-b-inicio.dc.html'].y);
  const c1 = merged(same(liveAfter(p1), tall));
  assert.equal(c1.index.boards['r1-b-inicio.dc.html'].y, tall.fragment.boards['r1-b-inicio.dc.html'].y);
  assert.equal(c1.index.notes['r1-row-b'].y, tall.fragment.notes['r1-row-b'].y, 'the note of the row goes down too');
  assert.deepEqual(c1.kept.keptMoved, []);
  const moved = liveAfter(p1);
  moved.boards['r1-b-inicio.dc.html'].y += 33;
  moved.notes['r1-row-b'].y -= 7;
  const c2 = merged(same(moved, tall));
  assert.equal(c2.index.boards['r1-b-inicio.dc.html'].y, moved.boards['r1-b-inicio.dc.html'].y);
  assert.equal(c2.index.notes['r1-row-b'].y, moved.notes['r1-row-b'].y);
  assert.deepEqual([...c2.kept.keptMoved].sort(), ['r1-b-inicio.dc.html', 'r1-row-b']);
  // (e) launch.page: equal to canvas.launchPage moves to the new page, another one stays
  const p2 = pageOf('r2');
  const e1 = liveAfter(p1);
  const toNew = (live, launchPage) => merged(mergeIndex({ ours: p2.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: Object.keys(p2.files).map((n) => `project/${n}`), launchPage })).index.launch.page;
  assert.equal(toNew(e1, 'r1'), 'r2');
  e1.launch.page = 'boceto';
  assert.equal(toNew(e1, 'r1'), 'boceto');
});

test('an artboard of ours that the user edited by hand is found before publishing, on the hash (A4C2-01)', () => {
  const p1 = pageOf('r1', { first: true });
  const live = liveAfter(p1);
  const file = 'project/r1-a-detalle.dc.html';
  const edited = { ...p1.published.files, [file]: sha256('otro contenido') };
  const run = (extra) => mergeIndex({ ours: p1.fragment, live, liveFiles: edited, published: p1.published, title: 'P', now: NOW, first: true, ownsMain: true, ...extra });
  // (i) it is not being replaced: it is left alone and noted
  const i = merged(run({ changed: [] }));
  assert.deepEqual(i.kept.editedByHand, [file]);
  // (ii) it is being replaced (the option was regenerated): stop and ask, nothing is built
  const ii = run({ changed: [file] });
  assert.deepEqual([ii.ok, ii.index, ii.problems.map((p) => [p.code, p.file])], [false, null, [['artboard-edited-by-hand', file]]]);
  // (iii) with the yes of the user (the path, or its bare name) it goes ahead and says so; another path does not help
  assert.deepEqual(merged(run({ changed: [file], acceptOverwrite: [file] })).kept.overwritten, [file]);
  assert.deepEqual(merged(run({ changed: [file], acceptOverwrite: ['r1-a-detalle.dc.html'] })).kept.overwritten, [file]);
  assert.equal(run({ changed: [file], acceptOverwrite: ['project/r1-a-inicio.dc.html'] }).ok, false);
  // (iv) a published file that was not read: incomplete when its frame is still there, deleted when it is not
  const missing = { ...p1.published.files };
  delete missing[file];
  assert.deepEqual(mergeIndex({ ours: p1.fragment, live, liveFiles: missing, published: p1.published, title: 'P', now: NOW, first: true, ownsMain: true, changed: [] }).problems.map((p) => p.code), ['live-incomplete']);
  const noFrame = liveAfter(p1);
  delete noFrame.boards['r1-a-detalle.dc.html'];
  noFrame.order = noFrame.order.filter((n) => n !== 'r1-a-detalle.dc.html');
  assert.deepEqual(merged(mergeIndex({ ours: p1.fragment, live: noFrame, liveFiles: missing, published: p1.published, title: 'P', now: NOW, first: true, ownsMain: true, changed: [] })).kept.userDeleted, ['r1-a-detalle.dc.html']);
  // (v) nothing edited: no editedByHand
  const clean = merged(mergeIndex({ ours: p1.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, first: true, ownsMain: true, changed: [] }));
  assert.deepEqual([clean.kept.editedByHand, clean.kept.overwritten], [[], []]);
  // the artboards that were never read cannot be compared: closed, not "fine"
  assert.deepEqual(mergeIndex({ ours: p1.fragment, live, liveFiles: null, published: p1.published, title: 'P', now: NOW, first: true, ownsMain: true, changed: [] }).problems.map((p) => p.code), ['live-incomplete']);
});

test('what the user changed in a frame or note of ours stays, field by field (A4C2-13); is_interactive is always ours', () => {
  const p1 = pageOf('r1', { first: true });
  const board = 'r1-a-detalle.dc.html';
  const note = 'r1-row-a';
  for (const [kind, id, field] of [['boards', board, 'title'], ['boards', board, 'w'], ['boards', board, 'h'], ['notes', note, 'text'], ['notes', note, 'maxW']]) {
    const live = liveAfter(p1);
    live[kind][id][field] = field === 'title' || field === 'text' ? 'cambiado por el usuario' : live[kind][id][field] + 11;
    const r = merged(mergeIndex({ ours: p1.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true }));
    assert.equal(r.index[kind][id][field], live[kind][id][field], `${id}.${field} is kept`);
    assert.ok(r.kept.keptEdited.some((e) => e.id === id && e.field === field), `${field} is listed`);
  }
  // equal to what was published: the new value of ours is applied
  const tall = pageOf('r1', { first: true, heights: { 'A/detalle.html@1440': 1700 } });
  const live = liveAfter(p1);
  const r = merged(mergeIndex({ ours: tall.fragment, live, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true }));
  assert.equal(r.index.boards[board].h, 1700);
  assert.deepEqual(r.kept.keptEdited, []);
  // is_interactive: the user's value is overwritten with ours
  const l2 = liveAfter(p1);
  l2.boards[board].is_interactive = !p1.fragment.boards[board].is_interactive;
  const r2 = merged(mergeIndex({ ours: p1.fragment, live: l2, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true }));
  assert.equal(r2.index.boards[board].is_interactive, p1.fragment.boards[board].is_interactive);
});

test('merge of the same run again keeps the move of the user, does not duplicate, is idempotent and mutates nothing', () => {
  const p1 = pageOf('r1', { first: true });
  const live = liveAfter(p1);
  live.boards['r1-b-inicio.dc.html'].x += 40;
  live.notes['r1-row-b'].x += 5;
  const tall = pageOf('r1', { first: true, heights: { 'B/inicio.html@1440': 1900 } });
  const args = { ours: tall.fragment, liveFiles: p1.published.files, published: p1.published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true };
  const snapshotOurs = JSON.stringify(tall.fragment);
  const snapshotLive = JSON.stringify(live);
  const once = merged(mergeIndex({ ...args, live }));
  assert.equal(JSON.stringify(tall.fragment), snapshotOurs);
  assert.equal(JSON.stringify(live), snapshotLive);
  assert.equal(once.index.boards['r1-b-inicio.dc.html'].x, live.boards['r1-b-inicio.dc.html'].x);
  assert.equal(once.index.notes['r1-row-b'].x, live.notes['r1-row-b'].x);
  assert.equal(once.index.boards['r1-b-inicio.dc.html'].h, 1900, 'what the user did not touch takes the new value');
  assert.equal(once.index.pages.length, 1, 'the page is not duplicated');
  assert.equal(new Set(once.index.order).size, once.index.order.length);
  const twice = merged(mergeIndex({ ...args, live: once.index }));
  assert.equal(JSON.stringify(twice.index), JSON.stringify(once.index), 'byte for byte');
});

test('mergeIndex refuses without writing: a full canvas, a name that collides, a live that is not a canvas, a page that is not ours', () => {
  const p2 = pageOf('r2');
  const base = liveAfter(pageOf('r1', { first: true }));
  const codes = (live, extra = {}) => mergeIndex({ ours: p2.fragment, live, liveFiles: {}, published: null, title: 'P', now: NOW, changed: null, ...extra }).problems.map((p) => p.code);
  const forty = clone(base);
  forty.pages = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: `p ${i}` }));
  assert.deepEqual(codes(forty), ['canvas-full']);
  const notes = clone(base);
  for (let i = 0; i < 199; i++) notes.notes[`n${i}`] = { x: 0, y: 0, text: 'x', kind: 'title1', maxW: 10 };
  assert.deepEqual(codes(notes), ['canvas-full']);
  const collide = clone(base);
  collide.boards['R2-A-Inicio.dc.html'] = { x: 0, y: 0, w: 100, h: 100 };
  collide.order.push('R2-A-Inicio.dc.html');
  assert.deepEqual(codes(collide), ['name-collision']);
  for (const bad of [[], { v: 2, boards: {} }, { v: 3 }, 'texto', 7]) {
    const r = mergeIndex({ ours: p2.fragment, live: bad, liveFiles: {}, published: null, title: 'P', now: NOW });
    assert.deepEqual([r.ok, r.index, r.problems.map((p) => p.code)], [false, null, ['bad-live']]);
  }
  const disorder = clone(base);
  disorder.order.pop();
  assert.deepEqual(codes(disorder), ['bad-order']);
  // the live canvas already carries OUR page id and neither publish.json nor plan.json of the run mention it
  const ours2 = clone(base);
  ours2.pages.push({ id: 'r2', name: 'ajena' });
  assert.deepEqual(codes(ours2), ['page-collision']);
  assert.deepEqual(codes(ours2, { knownPage: true }), []);
  assert.deepEqual(codes(ours2, { published: { pageId: 'r2', files: {} } }), []);
  // 37 pages + ours is not full, 38 + ours is
  const pages = (n) => ({ ...clone(base), pages: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: 'x' })) });
  assert.deepEqual(codes(pages(37)), []);
  assert.deepEqual(codes(pages(38)), ['canvas-full']);
});

test('mergeIndex: Main.dc.html is ours only for a run that opens the canvas or already owns it (A4C2-02)', () => {
  const p1 = pageOf('r1', { first: true });
  const live = liveAfter(p1);
  const p2 = pageOf('r2', { first: true });
  const r = mergeIndex({ ours: p2.fragment, live, liveFiles: p1.published.files, published: null, title: 'P', now: NOW, changed: null, first: true, ownsMain: false });
  assert.deepEqual(r.problems.map((p) => p.code), ['main-exists-live']);
  const noMain = clone(live);
  delete noMain.boards['Main.dc.html'];
  noMain.order = noMain.order.filter((n) => n !== 'Main.dc.html');
  const warn = mergeIndex({ ours: pageOf('r2').fragment, live: noMain, liveFiles: {}, published: null, title: 'P', now: NOW, changed: null, first: false, ownsMain: false });
  assert.equal(warn.ok, true);
  assert.deepEqual(warn.warnings.map((w) => w.code), ['no-main-live']);
});

test('mergeIndex from scratch lists nothing as kept', () => {
  const p1 = pageOf('r1', { first: true });
  const r = merged(mergeIndex({ ours: p1.fragment, live: null, title: 'P', now: NOW }));
  assert.deepEqual(Object.keys(r.index.notes), Object.keys(p1.fragment.notes));
  assert.deepEqual(r.kept, { keptMoved: [], keptEdited: [], userDeleted: [], editedByHand: [], overwritten: [], restored: [] });
});

test('noteRefusal: the third refusal stops; one that names an artboard of ours stops at once and asks; a stop keeps merge/, a retry deletes it', () => {
  const run = makeTempDir();
  fs.mkdirSync(path.join(run, 'canvas'), { recursive: true });
  fs.mkdirSync(path.join(run, 'merge'));
  fs.writeFileSync(path.join(run, 'canvas', 'manifest.json'), JSON.stringify({ files: [{ path: 'project/r2-a-detalle.dc.html', sha256: 'x' }] }));
  assert.deepEqual(noteRefusal({ run, kind: 'canvas' }), { count: 1, stop: false });
  assert.ok(!fs.existsSync(path.join(run, 'merge')), 'a retry rereads and merges again: the old merge is not current');
  fs.mkdirSync(path.join(run, 'merge'));
  assert.deepEqual(noteRefusal({ run, kind: 'canvas', named: 'project/otra-cosa.dc.html' }), { count: 2, stop: false });
  fs.mkdirSync(path.join(run, 'merge'), { recursive: true });
  assert.deepEqual(noteRefusal({ run, kind: 'canvas' }), { count: 3, stop: true, reason: 'too-many-refusals' });
  assert.ok(fs.existsSync(path.join(run, 'merge')), 'a stop leaves things as they are');
  const other = makeTempDir();
  fs.mkdirSync(path.join(other, 'canvas'), { recursive: true });
  fs.writeFileSync(path.join(other, 'canvas', 'manifest.json'), JSON.stringify({ files: [{ path: 'project/r2-a-detalle.dc.html', sha256: 'x' }] }));
  assert.deepEqual(noteRefusal({ run: other, kind: 'canvas', named: 'r2-a-detalle.dc.html' }), { count: 1, stop: true, reason: 'artboard-edited-by-hand' });
  assert.throws(() => noteRefusal({ run: other, kind: 'ds' }), PublishError);
});

test('limits of the canvas (R-16, A4C-15): one rule, 38 pages, 480 files, 200 MB, 190 notes', () => {
  const MB = 1024 * 1024;
  const have = { pages: 37, files: 400, bytes: 10 * MB, notes: 20 };
  assert.deepEqual(canvasFullFields(have, { pages: 1, files: 6, bytes: 100, notes: 4 }), []);
  assert.deepEqual(canvasFullFields({ ...have, pages: 38 }, { pages: 1 }), ['pages']);
  assert.deepEqual(canvasFullFields({ ...have, files: 479 }, { files: 3 }), ['files']);
  assert.deepEqual(canvasFullFields({ ...have, bytes: 200 * MB }, { bytes: 1 }), ['bytes']);
  assert.deepEqual(canvasFullFields({ ...have, notes: 190 }, { notes: 2 }), ['notes']);
  assert.deepEqual(CANVAS_LIMITS, { pages: 38, files: 480, bytes: 200 * MB, notes: 190 });
});
