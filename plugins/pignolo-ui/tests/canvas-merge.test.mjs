// diffPublished, mergeIndex, planLimits and liveSha256 (T7d): adding our page to the live index without
// touching what the user did. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mergeIndex, diffPublished, planLimits, liveSha256, PLAN_LIMITS, MERGE_LIMITS } from '../lib/canvas-merge.mjs';
import { buildCanvas, layoutSha256 } from '../lib/canvas-layout.mjs';
import { screenHtml } from './support/canvas-run.mjs';

const NOW = '2026-10-01T18:00:00Z';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const screens = (id) => [{ file: 'inicio.html', html: screenHtml(`${id} i`, { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml(`${id} d`) }];
const mk = (pageId, { first = false, heights = null, name = 'new · 2026-10-01' } = {}) => buildCanvas({
  options: [{ id: 'A', kind: 'option', screens: screens('A') }, { id: 'B', kind: 'option', screens: screens('B') }],
  platform: 'desktop', pageId, pageName: name, canvasTitle: 'Proyecto', first, heights,
});
const clone = (v) => JSON.parse(JSON.stringify(v));
const manifestOf = (built) => ({ files: Object.entries(built.files).map(([n, html]) => ({ path: `project/${n}`, sha256: sha(html) })).sort((a, b) => (a.path < b.path ? -1 : 1)) });
const SUBSET = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
// what recordStep writes for a run that published `built`
const publishedOf = (built, extra = {}) => ({
  pageId: built.fragment.page.id,
  files: Object.fromEntries(manifestOf(built).files.map((f) => [f.path, f.sha256])),
  boards: Object.fromEntries(Object.entries(built.fragment.boards).map(([n, b]) => [n, SUBSET(b, ['x', 'y', 'w', 'h', 'title'])])),
  notes: Object.fromEntries(Object.entries(built.fragment.notes).map(([i, n]) => [i, SUBSET(n, ['x', 'y', 'text', 'maxW'])])),
  ...extra,
});
const liveFilesOf = (built, over = {}) => ({ ...Object.fromEntries(manifestOf(built).files.map((f) => [f.path, f.sha256])), ...over });
// the index of a canvas that holds run r1, as the tool would have saved it
const liveWithR1 = () => {
  const r1 = mk('r1', { first: true });
  return { r1, live: mergeIndex({ ours: r1.fragment, live: null, title: 'Proyecto', now: NOW }).index };
};

test('diffPublished: nothing published, same, one artboard changed, taller option, new page, removed file', () => {
  const r1 = mk('r1', { first: true });
  const m = manifestOf(r1);
  const all = m.files.map((f) => f.path);
  const lay = layoutSha256(r1.fragment);
  assert.deepEqual(diffPublished({ manifest: m, layoutSha256: lay, pageId: 'r1', published: null }), { changed: all, removed: [], sendIndex: true });
  const pub = { pageId: 'r1', layoutSha256: lay, files: publishedOf(r1).files };
  assert.deepEqual(diffPublished({ manifest: m, layoutSha256: lay, pageId: 'r1', published: pub }), { changed: [], removed: [], sendIndex: false });
  const one = { files: m.files.map((f, i) => (i === 1 ? { ...f, sha256: sha('otro') } : f)) };
  assert.deepEqual(diffPublished({ manifest: one, layoutSha256: lay, pageId: 'r1', published: pub }), { changed: [one.files[1].path], removed: [], sendIndex: false });
  const taller = mk('r1', { first: true, heights: { 'A/inicio.html@1440': 2310 } });
  assert.equal(diffPublished({ manifest: manifestOf(taller), layoutSha256: layoutSha256(taller.fragment), pageId: 'r1', published: pub }).sendIndex, true);
  assert.deepEqual(diffPublished({ manifest: m, layoutSha256: lay, pageId: 'r2', published: pub }), { changed: all, removed: [], sendIndex: true }, 'a new page');
  const gone = { files: m.files.slice(1) };
  const d = diffPublished({ manifest: gone, layoutSha256: lay, pageId: 'r1', published: pub });
  assert.deepEqual([d.changed, d.removed], [[], [m.files[0].path]]);
  const added = { ...pub, files: Object.fromEntries(Object.entries(pub.files).slice(1)) };
  assert.equal(diffPublished({ manifest: m, layoutSha256: lay, pageId: 'r1', published: added }).sendIndex, true, 'a file never published needs its entry');
});

test('mergeIndex with an adverse live index keeps EVERYTHING of the user and adds our page after theirs (A4C-07)', () => {
  const { live } = liveWithR1();
  live.title = 'Mi lienzo';
  live.extra = { a: 1 };
  live.boards['r1-b-inicio.dc.html'].x += 300;
  live.boards['boceto.dc.html'] = { x: -900, y: 0, w: 500, h: 400, title: 'Boceto mío' };
  live.order.push('boceto.dc.html');
  live.notes['note-x'] = { x: 5, y: 5, text: 'Nota ajena', kind: 'title1', maxW: 300 };
  live.notes['r1-row-a'].x = 40;
  live.designSystems = [{ title: 'Sistema ajeno', namespace: 'otro', artifact: 'x', version: null, copiedAt: NOW }];
  const before = clone(live);
  const r2 = mk('r2', { name: 'improve · 2026-10-02' });
  const ours = clone(r2.fragment);
  const res = mergeIndex({ ours: r2.fragment, live, published: null, title: 'Proyecto', now: NOW, changed: Object.keys(r2.files).map((n) => `project/${n}`) });
  assert.equal(res.ok, true, JSON.stringify(res.problems));
  const out = res.index;
  for (const k of ['title', 'extra', 'designSystems', 'createdOnFiles', 'launch']) assert.deepEqual(out[k], before[k], k);
  for (const [n, b] of Object.entries(before.boards)) assert.deepEqual(out.boards[n], b, n);
  for (const [n, b] of Object.entries(before.notes)) assert.deepEqual(out.notes[n], b, n);
  assert.deepEqual(out.pages, [...before.pages, { id: 'r2', name: 'improve · 2026-10-02' }]);
  assert.deepEqual(out.order.slice(0, before.order.length), before.order);
  assert.deepEqual(out.order.slice(before.order.length), r2.fragment.order);
  for (const n of r2.fragment.order) assert.deepEqual(out.boards[n], { ...r2.fragment.boards[n] }, `a frame of r2: ${n}`);
  assert.ok(Object.keys(r2.fragment.notes).every((i) => out.notes[i].page === 'r2'));
  assert.deepEqual(live, before, 'live is not mutated');
  assert.deepEqual(r2.fragment, ours, 'ours is not mutated');
});

test('mergeIndex: what A4C-07 broke, case by case (renamed page, deleted frame, taller option, launch)', () => {
  const { r1, live } = liveWithR1();
  const published = publishedOf(r1);
  const base = { ours: r1.fragment, published, title: 'Proyecto', now: NOW, changed: [] };
  // (a) the user renamed the page: its name stays
  const renamed = clone(live);
  renamed.pages[0].name = 'Mi página';
  assert.equal(mergeIndex({ ...base, live: renamed }).index.pages[0].name, 'Mi página');
  // (b) the user deleted a frame of ours: it does not come back, and the list says so
  const gone = clone(live);
  delete gone.boards['r1-b-detalle.dc.html'];
  gone.order = gone.order.filter((n) => n !== 'r1-b-detalle.dc.html');
  const b1 = mergeIndex({ ...base, live: gone });
  assert.equal('r1-b-detalle.dc.html' in b1.index.boards, false);
  assert.equal(b1.index.order.includes('r1-b-detalle.dc.html'), false);
  assert.deepEqual(b1.kept.userDeleted, ['r1-b-detalle.dc.html']);
  // ... unless its file goes in this very call (an explicit regeneration)
  const b2 = mergeIndex({ ...base, live: gone, changed: ['project/r1-b-detalle.dc.html'] });
  assert.equal('r1-b-detalle.dc.html' in b2.index.boards, true);
  assert.equal(b2.index.order.filter((n) => n === 'r1-b-detalle.dc.html').length, 1);
  assert.deepEqual([b2.kept.userDeleted, b2.kept.restored], [[], ['r1-b-detalle.dc.html']]);
  // (c) option A regenerated taller: row B (not moved) goes down, notes too; a row the user moved stays
  const taller = mk('r1', { first: true, heights: { 'A/inicio.html@1440': 1500, 'A/detalle.html@1440': 1500 } });
  const c1 = mergeIndex({ ...base, ours: taller.fragment, live: clone(live), changed: ['project/Main.dc.html'] });
  assert.equal(c1.index.boards['r1-b-inicio.dc.html'].y, taller.fragment.boards['r1-b-inicio.dc.html'].y);
  assert.ok(c1.index.boards['r1-b-inicio.dc.html'].y > live.boards['r1-b-inicio.dc.html'].y);
  assert.equal(c1.index.notes['r1-row-b'].y, taller.fragment.notes['r1-row-b'].y);
  const moved = clone(live);
  moved.boards['r1-b-inicio.dc.html'].y += 77;
  moved.boards['r1-b-detalle.dc.html'].y += 77;
  const c2 = mergeIndex({ ...base, ours: taller.fragment, live: moved, changed: ['project/Main.dc.html'] });
  assert.equal(c2.index.boards['r1-b-inicio.dc.html'].y, moved.boards['r1-b-inicio.dc.html'].y);
  assert.ok(c2.kept.keptMoved.includes('r1-b-inicio.dc.html'));
  // (e) launch.page: equal to what we last wrote moves to the new page; one the user chose stays
  const r2 = mk('r2');
  const e = { ours: r2.fragment, published: null, title: 'Proyecto', now: NOW, changed: [] };
  assert.equal(mergeIndex({ ...e, live: clone(live), launchPage: 'r1' }).index.launch.page, 'r2');
  const chosen = clone(live);
  chosen.launch.page = 'otra';
  assert.equal(mergeIndex({ ...e, live: chosen, launchPage: 'r1' }).index.launch.page, 'otra');
  const nopage = clone(live);
  delete nopage.launch.page;
  assert.equal(mergeIndex({ ...e, live: nopage, launchPage: null }).index.launch.page, 'r2');
});

test('mergeIndex: an artboard of ours edited by hand is found by hash BEFORE publishing (A4C2-01)', () => {
  const { r1, live } = liveWithR1();
  const published = publishedOf(r1);
  const edit = 'project/r1-a-detalle.dc.html';
  const base = { ours: r1.fragment, live, published, title: 'Proyecto', now: NOW };
  const edited = liveFilesOf(r1, { [edit]: sha('lo editó el usuario') });
  // (i) not in changed: not sent, written down
  const i = mergeIndex({ ...base, liveFiles: edited, changed: [] });
  assert.equal(i.ok, true);
  assert.deepEqual(i.kept.editedByHand, ['r1-a-detalle.dc.html']);
  // (ii) in changed (A is regenerated): it stops and asks, nothing is produced
  const ii = mergeIndex({ ...base, liveFiles: edited, changed: [edit] });
  assert.equal(ii.ok, false);
  assert.equal(ii.index, null);
  assert.deepEqual(ii.problems, [{ code: 'artboard-edited-by-hand', files: ['r1-a-detalle.dc.html'] }]);
  // (iii) with the user's yes it goes through; with another path it does not
  const iii = mergeIndex({ ...base, liveFiles: edited, changed: [edit], acceptOverwrite: ['r1-a-detalle.dc.html'] });
  assert.equal(iii.ok, true);
  assert.deepEqual(iii.kept.overwritten, ['r1-a-detalle.dc.html']);
  assert.equal(mergeIndex({ ...base, liveFiles: edited, changed: [edit], acceptOverwrite: ['r1-b-inicio.dc.html'] }).ok, false);
  // (iv) a published file missing from the folder but still in boards: read again; missing in both: the user deleted it
  const missing = liveFilesOf(r1, { [edit]: null });
  assert.deepEqual(mergeIndex({ ...base, liveFiles: missing, changed: [] }).problems.map((p) => p.code), ['live-incomplete']);
  const gone = clone(live);
  delete gone.boards['r1-a-detalle.dc.html'];
  gone.order = gone.order.filter((n) => n !== 'r1-a-detalle.dc.html');
  const iv = mergeIndex({ ...base, live: gone, liveFiles: missing, changed: [] });
  assert.equal(iv.ok, true);
  assert.deepEqual(iv.kept.userDeleted, ['r1-a-detalle.dc.html']);
  // (v) nothing edited: clean
  const v = mergeIndex({ ...base, liveFiles: liveFilesOf(r1), changed: [] });
  assert.deepEqual([v.ok, v.kept.editedByHand, v.kept.overwritten], [true, [], []]);
});

test('mergeIndex: first against the live canvas: main-exists-live, no-main-live, and Main of this run is fine (A4C2-02)', () => {
  const { r1, live } = liveWithR1();
  const r2 = mk('r2', { first: true });
  const m1 = mergeIndex({ ours: r2.fragment, live, published: null, title: 'Proyecto', now: NOW, changed: [], first: true });
  assert.deepEqual(m1.problems.map((p) => p.code), ['main-exists-live']);
  const mine = mergeIndex({ ours: r1.fragment, live, published: publishedOf(r1), title: 'Proyecto', now: NOW, changed: [], first: true, ownsMain: true });
  assert.equal(mine.ok, true);
  const nomain = mergeIndex({ ours: mk('r2').fragment, live: { ...clone(live), boards: {}, order: [] }, published: null, title: 'Proyecto', now: NOW, changed: [], first: false });
  assert.deepEqual([nomain.ok, nomain.kept.warnings], [true, ['no-main-live']]);
});

test('mergeIndex by field: what the user changed stays (title, h, w, text, maxW, x/y); what they did not touch takes ours (A4C2-13)', () => {
  const { r1, live } = liveWithR1();
  const published = publishedOf(r1);
  const taller = mk('r1', { first: true, heights: { 'A/detalle.html@1440': 1700 } });
  const base = { ours: taller.fragment, published, title: 'Proyecto', now: NOW, changed: ['project/r1-a-detalle.dc.html'] };
  const touched = clone(live);
  touched.boards['r1-a-detalle.dc.html'].title = 'Mi título';
  touched.boards['r1-a-detalle.dc.html'].w = 1000;
  touched.notes['r1-row-a'].text = 'Mi nota';
  touched.notes['r1-row-a'].maxW = 5;
  const t = mergeIndex({ ...base, live: touched });
  const kept = t.index.boards['r1-a-detalle.dc.html'];
  assert.deepEqual([kept.title, kept.w, kept.h], ['Mi título', 1000, 1700], 'title and w stay, h (untouched) takes ours');
  assert.deepEqual([t.index.notes['r1-row-a'].text, t.index.notes['r1-row-a'].maxW], ['Mi nota', 5]);
  assert.ok(t.kept.keptEdited.some((e) => e.name === 'r1-a-detalle.dc.html' && e.field === 'title'));
  assert.ok(t.kept.keptEdited.some((e) => e.name === 'r1-a-detalle.dc.html' && e.field === 'w'));
  assert.ok(t.kept.keptEdited.some((e) => e.name === 'r1-row-a' && e.field === 'text'));
  // an untouched live takes every new value; is_interactive is always ours
  const flipped = clone(live);
  delete flipped.boards['Main.dc.html'].is_interactive;
  flipped.boards['r1-b-detalle.dc.html'].is_interactive = true;
  const u = mergeIndex({ ...base, live: flipped });
  assert.equal(u.ok, true, JSON.stringify(u.problems));
  assert.equal(u.index.boards['r1-a-detalle.dc.html'].h, 1700);
  assert.equal(u.index.boards['r1-b-detalle.dc.html'].is_interactive, undefined, 'ours has none, so the live one goes');
  assert.equal(u.index.boards['Main.dc.html'].is_interactive, true, 'ours has it');
});

test('mergeIndex in the same run again: moved frames stay, nothing is duplicated, and it is idempotent byte for byte', () => {
  const { r1, live } = liveWithR1();
  const moved = clone(live);
  moved.boards['r1-b-inicio.dc.html'].x += 123;
  moved.notes['r1-row-b'].y += 9;
  moved.boards['r1-b-detalle.dc.html'].title = 'Cambiado';
  const args = { ours: r1.fragment, published: publishedOf(r1), title: 'Proyecto', now: NOW, changed: [] };
  const once = mergeIndex({ ...args, live: moved });
  assert.equal(once.index.boards['r1-b-inicio.dc.html'].x, moved.boards['r1-b-inicio.dc.html'].x);
  assert.equal(once.index.notes['r1-row-b'].y, moved.notes['r1-row-b'].y);
  assert.equal(once.index.boards['r1-b-detalle.dc.html'].title, 'Cambiado');
  assert.equal(once.index.pages.length, 1);
  assert.equal(new Set(once.index.order).size, once.index.order.length);
  const twice = mergeIndex({ ...args, live: once.index });
  assert.equal(JSON.stringify(twice.index), JSON.stringify(once.index));
});

test('mergeIndex refuses before writing: full canvas, name collision, bad live, page collision; live null builds a new index', () => {
  const { r1, live } = liveWithR1();
  const r2 = mk('r2');
  const args = { ours: r2.fragment, published: null, title: 'Proyecto', now: NOW, changed: [] };
  const codes = (r) => r.problems.map((p) => p.code);
  const forty = clone(live);
  for (let n = 0; n < MERGE_LIMITS.pages - 1; n++) forty.pages.push({ id: `p${n}`, name: `p${n}` });
  assert.equal(forty.pages.length, 40);
  const full = mergeIndex({ ...args, live: forty });
  assert.deepEqual([codes(full), full.index], [['canvas-full'], null]);
  const manyNotes = clone(live);
  for (let n = 0, have = Object.keys(manyNotes.notes).length; n < 199 - have; n++) manyNotes.notes[`n${n}`] = { x: 0, y: 0, text: 'x', maxW: 1 };
  assert.equal(Object.keys(manyNotes.notes).length, 199);
  assert.deepEqual(codes(mergeIndex({ ...args, live: manyNotes })), ['canvas-full']);
  const clash = clone(live);
  const target = Object.keys(r2.fragment.boards)[0];
  const upper = target.replace(/^r-?/, (m) => m.toUpperCase());
  clash.boards[upper.replace('r2', 'R2')] = { x: 0, y: 0, w: 100, h: 100 };
  clash.order.push(upper.replace('r2', 'R2'));
  assert.deepEqual(codes(mergeIndex({ ...args, live: clash })), ['name-collision']);
  for (const bad of [{ v: 3 }, { ...clone(live), v: 2 }, [], 'x', { ...clone(live), boards: [] }, { ...clone(live), pages: {} }, { ...clone(live), notes: [] }]) {
    const r = mergeIndex({ ...args, live: bad });
    assert.deepEqual([r.ok, r.index, codes(r)], [false, null, ['bad-live']], JSON.stringify(bad).slice(0, 40));
  }
  const badOrder = clone(live);
  badOrder.order = badOrder.order.slice(1);
  assert.deepEqual(codes(mergeIndex({ ...args, live: badOrder })), ['bad-order']);
  const noOrder = clone(live);
  delete noOrder.order;
  assert.deepEqual(codes(mergeIndex({ ...args, live: noOrder })), ['bad-order']);
  // a live that already has our page id, with nothing of this run saying it is ours
  assert.ok(codes(mergeIndex({ ...args, ours: r1.fragment, live, published: null })).includes('page-collision'));
  assert.equal(mergeIndex({ ...args, ours: r1.fragment, live, published: publishedOf(r1) }).ok, true);
  assert.equal(mergeIndex({ ...args, ours: r1.fragment, live, published: null, owned: Object.keys(r1.files).map((n) => `project/${n}`) }).ok, true, 'a plan that was never recorded');
  const fresh = mergeIndex({ ...args, live: null });
  assert.deepEqual([fresh.ok, fresh.index.createdOnFiles.at, fresh.index.pages.length, fresh.index.launch.view], [true, NOW, 1, 'canvas']);
  assert.deepEqual(codes(mergeIndex({ ...args, ours: { ...r2.fragment, page: { id: 'x'.repeat(41), name: 'n' } }, live: null })), ['bad-id']);
});

test('mergeIndex adds the page name once and makes it unique only when it is added (R-3)', () => {
  const { live } = liveWithR1();
  const r2 = mk('r2', { name: 'new · 2026-10-01' });
  const added = mergeIndex({ ours: r2.fragment, live, published: null, title: 'Proyecto', now: NOW, changed: [] });
  assert.equal(added.index.pages[1].name, 'new · 2026-10-01 (2)');
  const again = mergeIndex({ ours: r2.fragment, live: added.index, published: publishedOf(r2), title: 'Proyecto', now: NOW, changed: [] });
  assert.equal(again.index.pages[1].name, 'new · 2026-10-01 (2)', 'not renamed again');
  assert.equal(again.index.pages.length, 2);
});

test('planLimits (A4C-15): 37 pages is fine, 38 is full; 479 files + 3; 200 MB + 1; 190 notes + 2; a roomy canvas goes on', () => {
  const c = (over = {}) => ({ pages: 0, files: 0, bytes: 0, notes: 0, ...over });
  const MB = 1024 * 1024;
  assert.deepEqual(planLimits({ canvas: c({ pages: 37 }), addPage: true, newFiles: 0, newBytes: 0, newNotes: 0 }), []);
  assert.deepEqual(planLimits({ canvas: c({ pages: 38 }), addPage: true, newFiles: 0, newBytes: 0, newNotes: 0 }), ['pages']);
  assert.deepEqual(planLimits({ canvas: c({ pages: 38 }), addPage: false, newFiles: 0, newBytes: 0, newNotes: 0 }), [], 'regenerating its own page adds none');
  assert.deepEqual(planLimits({ canvas: c({ files: 479 }), addPage: false, newFiles: 3, newBytes: 0, newNotes: 0 }), ['files']);
  assert.deepEqual(planLimits({ canvas: c({ files: 477 }), addPage: false, newFiles: 3, newBytes: 0, newNotes: 0 }), []);
  assert.deepEqual(planLimits({ canvas: c({ bytes: 200 * MB }), addPage: false, newFiles: 0, newBytes: 1, newNotes: 0 }), ['bytes']);
  assert.deepEqual(planLimits({ canvas: c({ notes: 190 }), addPage: false, newFiles: 0, newBytes: 0, newNotes: 2 }), ['notes']);
  assert.deepEqual(planLimits({ canvas: c({ pages: 37, files: 400, bytes: 10 * MB, notes: 20 }), addPage: true, newFiles: 6, newBytes: MB, newNotes: 3 }), []);
  assert.deepEqual([PLAN_LIMITS.pages, PLAN_LIMITS.files, PLAN_LIMITS.notes], [38, 480, 190]);
});

test('liveSha256 ignores a byte order mark and CRLF (a save may add them) and nothing else (self-check: BOM, CRLF)', () => {
  const text = '<!doctype html>\n<p>hola</p>\n';
  const want = sha(text);
  assert.equal(liveSha256(Buffer.from(text)), want);
  assert.equal(liveSha256(Buffer.from(text.replace(/\n/g, '\r\n'))), want);
  assert.equal(liveSha256(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])), want);
  assert.notEqual(liveSha256(Buffer.from(`${text} `)), want);
  assert.notEqual(liveSha256(Buffer.from(text.replace('hola', 'chau'))), want);
  // not UTF-8: it is hashed as the bytes it is, and it is not "equal" to anything of ours
  assert.notEqual(liveSha256(Buffer.from([0xff, 0xfe, 0x00, 0x41])), want);
});
