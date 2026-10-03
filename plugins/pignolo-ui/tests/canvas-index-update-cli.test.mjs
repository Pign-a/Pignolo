// canvas-index in subprocesses, stage 2 (T7d): one canvas per project that grows by a page per run,
// merge with the live index, diff and refusal. Synthetic data; the URLs are made up at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runScript } from './helpers.mjs';
import { makeRun, addRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl, TYPE_URL, walkJson } from './support/canvas-plan.mjs';
import { writeConfig } from '../lib/project-config.mjs';

const FORBIDDEN = ['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities'];
const MB = 1024 * 1024;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const canvasFile = (r, ...p) => path.join(r.run, 'canvas', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const step = (res) => res.json.step;

function ready(opts = {}) {
  const r = makeRun(opts);
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  return { r, kit: planKit(r) };
}

// run 1 of a new project through create, merge --live none and publish
function publishFirst(r, kit, n = 1) {
  const url = fakeUrl(n);
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  return url;
}

// what the tool would have saved after read-live: the index (edited by `mutate`) and the artboards that were published
function saveLive(r, kit, mutate = (j) => j) {
  const live = path.join(kit.dir, 'live.json');
  const index = readJson(canvasFile(r, 'project', 'canvas.json'));
  fs.writeFileSync(live, JSON.stringify(mutate(index), null, 2));
  const liveDir = path.join(kit.dir, 'live-files');
  fs.rmSync(liveDir, { recursive: true, force: true });
  fs.cpSync(canvasFile(r, 'project'), path.join(liveDir, 'project'), { recursive: true });
  return { live, liveDir };
}
const mergeWith = (kit, saved, extra = []) => kit.merge(['--live', saved.live, '--live-dir', saved.liveDir, ...extra]);
const rebuild = (r, extra = {}) => assert.equal(canvasIndex(BUILD_ARGS(r, extra)).status, 0);
const regenerate = (r, letter, tag, { leak = false } = {}) => {
  fs.mkdirSync(r.optionDir(letter), { recursive: true });
  for (const f of ['inicio.html', 'detalle.html']) {
    fs.writeFileSync(path.join(r.optionDir(letter), f), screenHtml(`${letter} ${tag}`, { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html', extra: leak ? '<p>Persona Ejemplo</p>\n' : '' }));
  }
};

test('a foreign note with the leak value does not block plan (and a repeated plan neither); a leak of ours does; then read-live, merge and only the files of B (A4C-03)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 11);
  assert.equal(kit.plan().json.done, true);
  const saved = saveLive(r, kit, (j) => { j.notes['nota-ajena'] = { x: 5, y: 5, text: 'Persona Ejemplo lo dijo', kind: 'title1', maxW: 300 }; return j; });
  // regenerate B with a seeded leak: plan refuses, no step
  regenerate(r, 'B', 'x', { leak: true });
  rebuild(r, { first: 'no' });
  const leaked = kit.plan();
  assert.deepEqual([leaked.status, leaked.json.step, leaked.json.problems.some((p) => p.code === 'leak')], [1, null, true]);
  assert.ok(!leaked.stdout.includes('Persona Ejemplo'));
  // clean again: never a canvas-publish before reading
  regenerate(r, 'B', 'limpio');
  rebuild(r, { first: 'no' });
  const read = kit.plan();
  assert.equal(step(read).id, 'canvas-read-live');
  assert.equal(step(read).params.url, url);
  assert.ok(step(read).params.paths.includes('project/canvas.json'));
  assert.ok(step(read).params.paths.includes('project/Main.dc.html'), 'the artboards of this run that were published are read too');
  const m = mergeWith(kit, saved);
  assert.equal(m.status, 0, m.stdout);
  const pub1 = kit.plan();
  assert.equal(pub1.status, 0, pub1.stdout);
  assert.equal(step(pub1).id, 'canvas-publish');
  assert.deepEqual(Object.keys(step(pub1).params.files).sort().every((f) => f.includes('-b-')), true);
  assert.equal(Object.keys(step(pub1).params.files).length, 2);
  // the foreign note travels in the index and was not looked at again; a second plan says the same
  assert.ok(fs.readFileSync(canvasFile(r, 'project', 'canvas.json'), 'utf8').includes('nota-ajena'));
  assert.equal(step(kit.plan()).id, 'canvas-publish');
  assert.equal(fs.existsSync(path.join(r.run, 'canvas', 'merge')), false, 'live.json lives in <run>/merge/, never inside canvas/');
  assert.ok(fs.existsSync(path.join(r.run, 'merge', 'live.json')));
});

test('the merged index is checked by difference: a new string in it that the live index did not have is a leak, fail closed', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 12);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'otro');
  rebuild(r, { first: 'no' });
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.equal(step(kit.plan()).id, 'canvas-publish');
  // a bug or a hand edit puts a new string into the merged index and keeps merge.json consistent with it
  const file = canvasFile(r, 'project', 'canvas.json');
  const index = readJson(file);
  index.extra = { quien: 'Persona Ejemplo' };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  fs.writeFileSync(file, text);
  const info = path.join(r.run, 'merge', 'merge.json');
  fs.writeFileSync(info, JSON.stringify({ ...readJson(info), canvasSha256: sha(text) }));
  const p = kit.plan();
  assert.deepEqual([p.status, p.json.step, p.json.problems.some((x) => x.code === 'leak')], [1, null, true]);
  assert.ok(!p.stdout.includes('Persona Ejemplo'));
});

test('next run of the same project: read-live and publish on the SAME canvas, no canvas-create, no type_url, the page is added (R-7, R-16)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 13);
  assert.deepEqual([kit.canvas().state, kit.canvas().pages, kit.canvas().url], ['published', 1, url]);
  const saved = saveLive(r, kit);
  // a later day, same project, same data folder
  const r2 = addRun(r);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { 'page-name': 'improve · 2026-10-02', first: 'no', now: '2026-10-02T09:00:00Z' })).status, 0);
  const k2 = planKit(r2, { dataDir: kit.data });
  const p1 = k2.plan();
  assert.equal(p1.status, 0, p1.stdout);
  assert.equal(step(p1).id, 'canvas-read-live');
  assert.deepEqual(step(p1).params, { action: 'read', url, paths: ['project/canvas.json'] });
  const pageIds = [readJson(canvasFile(r, 'page.json')).page.id, readJson(canvasFile(r2, 'page.json')).page.id];
  assert.notEqual(pageIds[0], pageIds[1]);
  const m = k2.merge(['--live', saved.live, '--live-dir', 'none']);
  assert.equal(m.status, 0, m.stdout);
  const p2 = k2.plan();
  assert.equal(step(p2).id, 'canvas-publish');
  assert.equal(step(p2).params.url, url);
  assert.ok(!('type_url' in step(p2).params));
  assert.ok(!('project/Main.dc.html' in step(p2).params.files), 'a run that joins a canvas never writes another Main.dc.html');
  assert.equal(Object.keys(step(p2).params.files).length, 6);
  walkJson(step(p2).params, (k) => assert.ok(!FORBIDDEN.includes(k), k));
  const merged = readJson(canvasFile(r2, 'project', 'canvas.json'));
  assert.deepEqual(merged.pages.map((p) => p.id), pageIds);
  assert.equal(merged.title, 'Proyecto');
  assert.equal(k2.record('canvas-publish', url).status, 0);
  assert.deepEqual([k2.canvas().pages, k2.canvas().files, k2.canvas().state, k2.canvas().url], [2, 12, 'published', url]);
  assert.equal(k2.published().ownsMain, false);
  assert.equal(k2.plan().json.done, true);
});

test('resumption (A4C-10): record leaves created with only the url, then published with figures; created with pages 0 asks for first true', () => {
  const { r, kit } = ready();
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', fakeUrl(14)).status, 0);
  assert.deepEqual(kit.canvas(), { url: fakeUrl(14), state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
  // the next session: nothing in publish.json about Main, project.json says created
  rebuild(r, { first: 'no' });
  const mismatch = kit.plan();
  assert.deepEqual(mismatch.json.problems.map((p) => [p.code, p.expectedFirst, p.reason]), [['first-mismatch', true, 'state']]);
  rebuild(r, { first: 'yes' });
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  const pub = kit.plan();
  assert.ok('project/Main.dc.html' in step(pub).params.files);
  assert.equal(kit.record('canvas-publish', fakeUrl(14)).status, 0);
  const c = kit.canvas();
  assert.deepEqual([c.state, c.pages, c.files, c.notes], ['published', 1, 6, 3]);
  assert.ok(c.bytes > 0);
  assert.equal(c.launchPage, readJson(canvasFile(r, 'page.json')).page.id);
});

test('first belongs to the page of the run: regenerating B after publishing keeps Main.dc.html and the same names; another run has none (A4C2-02)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 15);
  const names = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v2');
  rebuild(r, { first: 'no' });
  assert.deepEqual(readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path), names, 'ownsMain keeps every name');
  assert.equal(readJson(canvasFile(r, 'manifest.json')).first, true);
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  assert.equal(mergeWith(kit, saved).status, 0);
  const pub = kit.plan();
  assert.equal(pub.status, 0, pub.stdout);
  const sent = Object.keys(step(pub).params.files);
  assert.equal(sent.length, 2);
  assert.ok(!sent.includes('project/Main.dc.html'));
  // record: ownsMain stays true (the manifest said first) and the page is the one of the run
  const manifest = readJson(canvasFile(r, 'manifest.json'));
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.equal(kit.published().ownsMain, true);
  assert.equal(kit.published().pageId, manifest.pageId);
  // a canvas built as if the run did not own Main (publish.json said no when it was built) and then the run does: first-mismatch (owns-main)
  const own = kit.published();
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ ...own, ownsMain: false }));
  rebuild(r, { first: 'no' });
  assert.equal(readJson(canvasFile(r, 'manifest.json')).first, false);
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify(own));
  const owns = kit.plan();
  assert.deepEqual(owns.json.problems.map((p) => [p.code, p.reason, p.expectedFirst]), [['first-mismatch', 'owns-main', true]]);
  rebuild(r, { first: 'no' });
  assert.equal(readJson(canvasFile(r, 'manifest.json')).first, true);
});

test('limits of the canvas (A4C-15): 37 pages go on, 38 open a new one (first-mismatch canvas-full until build --first yes); files, bytes and notes too', () => {
  const published = (over = {}) => ({ url: fakeUrl(20), state: 'published', pages: 1, files: 6, bytes: 10 * MB, notes: 3, ...over });
  const attempt = (over, { first = 'no' } = {}) => {
    const { r, kit } = ready();
    // the build of `ready` said first: yes; the project says a canvas already exists
    writeConfig({ data: kit.data, project: r.project, key: 'canvas', value: published(over) });
    rebuild(r, { first });
    return { r, kit, p: kit.plan() };
  };
  const goes = attempt({ pages: 37 });
  assert.equal(step(goes.p).id, 'canvas-read-live');
  assert.equal(step(goes.p).params.url, fakeUrl(20));
  for (const over of [{ pages: 38 }, { files: 475 }, { bytes: 200 * MB - 100 }, { notes: 188 }]) {
    const full = attempt(over);
    assert.deepEqual(full.p.json.problems.map((x) => [x.code, x.expectedFirst, x.reason]), [['first-mismatch', true, 'canvas-full']], JSON.stringify(over));
    assert.equal(full.p.json.step, null);
    rebuild(full.r, { first: 'yes' });
    const next = full.kit.plan();
    assert.equal(step(next).id, 'canvas-create', JSON.stringify(over));
    assert.equal(step(next).params.type_url, TYPE_URL);
    assert.equal(next.json.newCanvas, true);
  }
  // just inside the limits
  for (const over of [{ pages: 37 }, { files: 474 }, { bytes: 150 * MB }, { notes: 187 }, { pages: 37, files: 400, bytes: 10 * MB, notes: 20 }]) {
    assert.equal(step(attempt(over).p).id, 'canvas-read-live', JSON.stringify(over));
  }
  // --new-canvas with first: canvas-create although there is a saved url; without first it is a mismatch
  const { r, kit } = ready();
  writeConfig({ data: kit.data, project: r.project, key: 'canvas', value: published() });
  rebuild(r, { first: 'no' });
  assert.equal(kit.plan(['--new-canvas']).json.problems[0].reason, 'canvas-full');
  rebuild(r, { first: 'yes' });
  const forced = kit.plan(['--new-canvas']);
  assert.equal(step(forced).id, 'canvas-create');
  // recording the new canvas replaces the url and starts the figures over; publish.json starts over too
  assert.equal(kit.record('canvas-create', fakeUrl(21)).status, 0);
  assert.deepEqual(kit.canvas(), { url: fakeUrl(21), state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
  assert.equal(kit.published().canvasUrl, fakeUrl(21));
  assert.deepEqual(kit.published().files, {});
});

test('a publish.json of another canvas is ignored: everything is new for the canvas that is registered (R-16)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 22);
  // the project now points to another canvas (the old one was full); the run still says it published to the first
  writeConfig({ data: kit.data, project: r.project, key: 'canvas', value: { url: fakeUrl(23), state: 'published', pages: 3, files: 30, bytes: 1000, notes: 6 } });
  assert.notEqual(kit.published().canvasUrl, fakeUrl(23));
  // build is told which canvas is registered: the Main.dc.html that this run published is not in that one
  rebuild(r, { first: 'no', 'canvas-url': fakeUrl(23) });
  assert.equal(readJson(canvasFile(r, 'manifest.json')).first, false);
  const p = kit.plan();
  assert.equal(step(p).id, 'canvas-read-live', 'publish.json does not make it "done" on a canvas it never published to');
  assert.equal(step(p).params.url, fakeUrl(23));
  assert.deepEqual(step(p).params.paths, ['project/canvas.json'], 'no artboard of this run was published there');
  void url;
});

test('merge with a live index: an adverse live keeps everything of the user, writes canvas.json, live.json and merge.json with the shas', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 24);
  const saved = saveLive(r, kit, (j) => {
    j.title = 'Mi lienzo';
    j.extra = { a: 1 };
    j.boards['boceto.dc.html'] = { x: -900, y: 0, w: 500, h: 400, title: 'Boceto mío' };
    j.order.push('boceto.dc.html');
    j.notes['nota-ajena'] = { x: 5, y: 5, text: 'Nota ajena', kind: 'title1', maxW: 300 };
    return j;
  });
  const r2 = addRun(r);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'no', 'page-name': 'improve · 2026-10-02' })).status, 0);
  const k2 = planKit(r2, { dataDir: kit.data });
  const liveText = fs.readFileSync(saved.live);
  const m = k2.merge(['--live', saved.live, '--live-dir', 'none']);
  assert.equal(m.status, 0, m.stdout);
  const out = readJson(canvasFile(r2, 'project', 'canvas.json'));
  assert.equal(out.title, 'Mi lienzo');
  assert.deepEqual(out.extra, { a: 1 });
  assert.deepEqual(out.boards['boceto.dc.html'], { x: -900, y: 0, w: 500, h: 400, title: 'Boceto mío' });
  assert.equal(out.notes['nota-ajena'].text, 'Nota ajena');
  assert.equal(out.pages.length, 2);
  const info = readJson(path.join(r2.run, 'merge', 'merge.json'));
  assert.equal(info.liveSha256, sha(liveText));
  assert.equal(info.canvasSha256, sha(fs.readFileSync(canvasFile(r2, 'project', 'canvas.json'))));
  assert.equal(info.canvasUrl, kit.canvas().url);
  assert.equal(sha(fs.readFileSync(path.join(r2.run, 'merge', 'live.json'))), info.liveSha256);
  // a live that is not an index we understand: exit 1, nothing new is written
  fs.rmSync(path.join(r2.run, 'canvas', 'project', 'canvas.json'));
  const bad = path.join(kit.dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ v: 2, boards: {} }));
  const b = k2.merge(['--live', bad, '--live-dir', 'none']);
  assert.deepEqual([b.status, b.json.problems.map((p) => p.code)], [1, ['bad-live']]);
  assert.equal(fs.existsSync(canvasFile(r2, 'project', 'canvas.json')), false);
  fs.writeFileSync(bad, '{ no es json');
  assert.deepEqual([k2.merge(['--live', bad, '--live-dir', 'none']).status, fs.existsSync(canvasFile(r2, 'project', 'canvas.json'))], [1, false]);
  // a live that is a link or weighs 9 MB: exit 2 (usage), nothing is written
  const big = path.join(kit.dir, 'big.json');
  fs.writeFileSync(big, Buffer.alloc(9 * MB, 0x20));
  assert.equal(k2.merge(['--live', big, '--live-dir', 'none']).status, 2);
  assert.equal(fs.existsSync(canvasFile(r2, 'project', 'canvas.json')), false);
  const link = path.join(kit.dir, 'link.json');
  let linked = true;
  try { fs.symlinkSync(saved.live, link); } catch { linked = false; }
  if (linked) assert.equal(k2.merge(['--live', link, '--live-dir', 'none']).status, 2);
  assert.equal(fs.existsSync(canvasFile(r2, 'project', 'canvas.json')), false);
  // the folder of artboards is a required choice and a folder that is not one is exit 2
  assert.equal(k2.merge(['--live', saved.live, '--live-dir', path.join(kit.dir, 'no-existe')]).status, 2);
});

test('an artboard of ours edited by hand: merge stops (exit 1) when it would be replaced and only goes on with --accept-overwrite (A4C2-01)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 25);
  const names = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path.replace('project/', ''));
  const edit = names.find((n) => n.includes('-a-detalle'));
  const saved = saveLive(r, kit);
  fs.appendFileSync(path.join(saved.liveDir, 'project', edit), '<!-- editado a mano -->\n');
  // (i) A is not regenerated: merge goes on, writes it down, and the next plan does not send it
  regenerate(r, 'B', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  const i = mergeWith(kit, saved);
  assert.equal(i.status, 0, i.stdout);
  assert.deepEqual(readJson(path.join(r.run, 'merge', 'merge.json')).editedByHand, [edit]);
  const p = kit.plan();
  assert.ok(!Object.keys(step(p).params.files).some((f) => f.endsWith(edit)));
  // (ii) A is regenerated too: it stops and asks, and there is no new canvas.json
  regenerate(r, 'A', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  fs.rmSync(canvasFile(r, 'project', 'canvas.json'), { force: true });
  const ii = mergeWith(kit, saved);
  assert.equal(ii.status, 1);
  const stopped = ii.json.problems.find((x) => x.code === 'artboard-edited-by-hand');
  assert.ok(stopped && stopped.files.length >= 1);
  assert.ok(stopped.files.every((f) => names.includes(f)));
  assert.equal(fs.existsSync(canvasFile(r, 'project', 'canvas.json')), false);
  // (iii) with the user's yes for the right names it goes through; for another name it does not
  assert.equal(mergeWith(kit, saved, ['--accept-overwrite', 'r-no-es-un-artboard.dc.html']).status, 1);
  const yes = mergeWith(kit, saved, ['--accept-overwrite', stopped.files.join(',')]);
  assert.equal(yes.status, 0, yes.stdout);
  assert.deepEqual(readJson(path.join(r.run, 'merge', 'merge.json')).overwritten, stopped.files);
  assert.ok(Object.keys(step(kit.plan()).params.files).some((f) => f.endsWith(edit)));
  void url;
});

test('read-back tolerance: a live artboard saved with CRLF and a BOM is not "edited"; one in <live-dir>/<name> is found too (self-check)', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 26);
  const saved = saveLive(r, kit);
  const flat = path.join(kit.dir, 'flat');
  fs.mkdirSync(flat, { recursive: true });
  for (const f of fs.readdirSync(path.join(saved.liveDir, 'project'))) {
    if (!f.endsWith('.dc.html')) continue;
    const text = fs.readFileSync(path.join(saved.liveDir, 'project', f), 'utf8');
    fs.writeFileSync(path.join(flat, f), `﻿${text.replace(/\n/g, '\r\n')}`);
  }
  regenerate(r, 'B', 'v3');
  rebuild(r, { first: 'no' });
  kit.plan();
  const m = kit.merge(['--live', saved.live, '--live-dir', flat]);
  assert.equal(m.status, 0, m.stdout);
  assert.deepEqual(readJson(path.join(r.run, 'merge', 'merge.json')).editedByHand, []);
  // upper-case names in the folder (Windows keeps the case it was given)
  const upper = path.join(kit.dir, 'upper');
  fs.mkdirSync(upper, { recursive: true });
  for (const f of fs.readdirSync(flat)) fs.writeFileSync(path.join(upper, f.toUpperCase().replace('.DC.HTML', '.dc.html')), fs.readFileSync(path.join(flat, f)));
  kit.plan();
  assert.equal(kit.merge(['--live', saved.live, '--live-dir', upper]).status, 0);
});

test('merge is not current when live.json changed, when build ran again or when the changed set differs: plan reads the live canvas again', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 27);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v4');
  rebuild(r, { first: 'no' });
  kit.plan();
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.equal(step(kit.plan()).id, 'canvas-publish');
  // the copy of the live index that plan will diff against was touched: not current
  fs.appendFileSync(path.join(r.run, 'merge', 'live.json'), ' ');
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.equal(step(kit.plan()).id, 'canvas-publish');
  // build ran again: merge/ is gone
  rebuild(r, { first: 'no' });
  assert.equal(fs.existsSync(path.join(r.run, 'merge')), false);
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
  // a merge for another set of changes
  assert.equal(mergeWith(kit, saved).status, 0);
  const info = path.join(r.run, 'merge', 'merge.json');
  fs.writeFileSync(info, JSON.stringify({ ...readJson(info), changed: ['project/otra.dc.html'] }));
  assert.equal(step(kit.plan()).id, 'canvas-read-live');
});

test('closed gates: a bad canvas record, a bad publish.json and an unreadable project.json give no step', () => {
  const { r, kit } = ready();
  const { file } = (() => { const f = path.join(kit.data, runScript('run.mjs', ['config', 'get', '--data', kit.data, '--project', r.project]).json.repoId, 'project.json'); return { file: f }; })();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ canvas: { url: 'https://example.com/x', state: 'published', pages: 1, files: 1, bytes: 1, notes: 1 } }));
  const bad = kit.plan();
  assert.deepEqual([bad.status, bad.json.step, bad.json.problems[0].code], [1, null, 'bad-canvas-state']);
  assert.ok(!/"params"|type_url/.test(bad.stdout));
  assert.equal(kit.merge().status, 1);
  fs.writeFileSync(file, '{ roto');
  const broken = kit.plan();
  assert.deepEqual([broken.status, broken.json.step], [1, null]);
  fs.rmSync(file);
  for (const text of ['{ no es json', '[]', JSON.stringify({ v: 2, files: { 'project/x.dc.html': 'no-es-un-sha' } }), JSON.stringify({ v: 2, canvasUrl: 'https://example.com/artifact/aaaa1111' }), JSON.stringify({ v: 7 })]) {
    fs.writeFileSync(path.join(r.run, 'publish.json'), text);
    const p = kit.plan();
    assert.deepEqual([p.status, p.json.step, ['bad-state', 'bad-url'].includes(p.json.problems[0].code)], [1, null, true], text.slice(0, 30));
  }
  fs.rmSync(path.join(r.run, 'publish.json'));
  assert.equal(step(kit.plan()).id, 'canvas-create');
});

test('refusal: counts, the third one stops, one that names an artboard of ours stops and asks, record starts over, merge/ goes away (R-9)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 28);
  const names = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v5');
  rebuild(r, { first: 'no' });
  kit.plan();
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.ok(fs.existsSync(path.join(r.run, 'merge')));
  const one = kit.refusal();
  assert.deepEqual([one.status, one.json.count, one.json.stop], [0, 1, false]);
  assert.equal(fs.existsSync(path.join(r.run, 'merge')), false);
  const two = kit.refusal(['--named', 'proyecto/otra-cosa.dc.html']);
  assert.deepEqual([two.status, two.json.count, two.json.stop], [0, 2, false]);
  const three = kit.refusal();
  assert.deepEqual([three.status, three.json.count, three.json.stop, three.json.reason], [1, 3, true, 'too-many-refusals']);
  // one that names one of our artboards stops at once and does not count
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ ...kit.published(), refusals: 0 }));
  const named = kit.refusal(['--named', names[1]]);
  assert.deepEqual([named.status, named.json.stop, named.json.reason, named.json.count], [1, true, 'artboard-edited-by-hand', 0]);
  assert.equal(kit.refusal(['--named', names[1].replace('project/', '').toUpperCase().replace('.DC.HTML', '.dc.html')]).json.stop, true, 'case does not hide it');
  // a successful publication starts over
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ ...kit.published(), refusals: 2 }));
  kit.plan();
  assert.equal(mergeWith(kit, saved).status, 0);
  kit.plan();
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.equal(kit.published().refusals, 0);
  // usage: --kind ds is not available in this version, a missing kind and a run without publish.json are exit 2
  assert.equal(canvasIndex(['refusal', '--run', r.run, '--kind', 'ds']).status, 2);
  assert.equal(canvasIndex(['refusal', '--run', r.run]).status, 2);
  const fresh = ready();
  assert.equal(fresh.kit.refusal().status, 2);
});

test('diff only informs: changed, removed and sendIndex, and it never prints params', () => {
  const { r, kit } = ready();
  const before = kit.diff();
  assert.deepEqual([before.status, before.json.changed.length, before.json.sendIndex], [0, 6, true]);
  publishFirst(r, kit, 29);
  const same = kit.diff();
  assert.deepEqual([same.json.changed, same.json.removed, same.json.sendIndex], [[], [], false]);
  regenerate(r, 'B', 'v6');
  rebuild(r, { first: 'no' });
  const d = kit.diff();
  assert.equal(d.json.changed.length, 2);
  assert.ok(d.json.changed.every((f) => f.includes('-b-')));
  assert.ok(!/"params"|type_url|"step"/.test(d.stdout));
  assert.equal(canvasIndex(['diff', '--run', r.run, '--x', '1']).status, 2);
});

test('plan: --new-canvas is a flag and an unknown option is exit 2; a flag given twice is exit 2', () => {
  const { kit } = ready();
  assert.equal(kit.plan(['--new-canvas', '--new-canvas']).status, 2);
  assert.equal(kit.plan(['--force']).status, 2);
});
