// Fixes of the final review of stage 2 of the canvas (RL2-01 .. RL2-08): the paths that the review's own tests
// do not exercise, and the guards that the review's mutation run found without a test (publishing, overwriting,
// writing outside the run). Synthetic data; the URLs are made up at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runScript, makeTempDir } from './helpers.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl } from './support/canvas-plan.mjs';
import { mergeIndex, MERGE_LIMITS } from '../lib/canvas-merge.mjs';
import { buildCanvas } from '../lib/canvas-layout.mjs';

const canvasFile = (r, ...p) => path.join(r.run, 'canvas', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const stepId = (res) => (res.json && res.json.step ? res.json.step.id : null);
const codes = (res) => (res.json && res.json.problems ? res.json.problems.map((p) => p.code) : []);
const mergeDirOf = (r) => path.join(r.run, 'merge');

function ready() {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  return { r, kit: planKit(r) };
}
function publishFirst(r, kit, n) {
  const url = fakeUrl(n);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  return url;
}
function saveLive(r, kit, mutate = (j) => j, tag = '') {
  const live = path.join(kit.dir, `live${tag}.json`);
  fs.writeFileSync(live, JSON.stringify(mutate(readJson(canvasFile(r, 'project', 'canvas.json'))), null, 2));
  const liveDir = path.join(kit.dir, `live-files${tag}`);
  fs.rmSync(liveDir, { recursive: true, force: true });
  fs.cpSync(canvasFile(r, 'project'), path.join(liveDir, 'project'), { recursive: true });
  return { live, liveDir };
}
const mergeWith = (kit, saved, extra = []) => kit.merge(['--live', saved.live, '--live-dir', saved.liveDir, ...extra]);
const rebuild = (r, extra = {}) => assert.equal(canvasIndex(BUILD_ARGS(r, extra)).status, 0);
const regenerate = (r, letter, tag) => {
  for (const f of ['inicio.html', 'detalle.html']) {
    fs.writeFileSync(path.join(r.optionDir(letter), f), screenHtml(`${letter} ${tag}`, { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html' }));
  }
};
// a project that published run 1, with run 1 regenerated (B) and the live canvas read: ready for a merge
function secondRound(n) {
  const { r, kit } = ready();
  publishFirst(r, kit, n);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  return { r, kit, saved };
}

// ---- RL2-01: every exit leaves no merge as current -------------------------------------------------------

test('RL2-01: a merge that fails for another reason (bad-live) and a refusal that stops leave no merge/ behind; plan does not publish', () => {
  const { r, kit, saved } = secondRound(71);
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.ok(fs.existsSync(mergeDirOf(r)));
  const bad = path.join(kit.dir, 'bad.json');
  fs.writeFileSync(bad, '{ no es json');
  const m = kit.merge(['--live', bad, '--live-dir', saved.liveDir]);
  assert.deepEqual([m.status, codes(m)], [1, ['bad-live']]);
  assert.equal(fs.existsSync(mergeDirOf(r)), false, 'a merge that stopped left the earlier merge/');
  assert.notEqual(stepId(kit.plan()), 'canvas-publish');
  // and a refusal that names an artboard of ours (it stops at once) clears the merge that was made after it
  assert.equal(mergeWith(kit, saved).status, 0);
  const ours = readJson(canvasFile(r, 'manifest.json')).files[0].path.replace('project/', '');
  const ref = kit.refusal(['--named', ours]);
  assert.equal(ref.status, 1);
  assert.equal(fs.existsSync(mergeDirOf(r)), false, 'a refusal that stopped left merge/');
  assert.notEqual(stepId(kit.plan()), 'canvas-publish');
});

test('RL2-01: a merge/ that is a link is not a current merge', (t) => {
  const { r, kit, saved } = secondRound(72);
  assert.equal(mergeWith(kit, saved).status, 0);
  const outside = makeTempDir();
  fs.cpSync(mergeDirOf(r), outside, { recursive: true });
  fs.rmSync(mergeDirOf(r), { recursive: true, force: true });
  try { fs.symlinkSync(outside, mergeDirOf(r), 'junction'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  assert.notEqual(stepId(kit.plan()), 'canvas-publish', 'plan took a merge/ that is a junction as current');
});

// ---- RL2-02: a deleted frame that comes back is read and compared again ----------------------------------

test('RL2-02: merge stops with live-incomplete for a frame that came back; publish.json forgets it as deleted and the next read-live asks for it', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 73);
  const X = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path.replace('project/', '')).find((n) => n.includes('-b-detalle'));
  const s1 = saveLive(r, kit, (j) => { delete j.boards[X]; j.order = j.order.filter((n) => n !== X); return j; }, '1');
  fs.rmSync(path.join(s1.liveDir, 'project', X));
  regenerate(r, 'A', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(mergeWith(kit, s1).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.deepEqual(kit.published().deleted, [X]);
  // it comes back and is edited by hand; B is regenerated. While publish.json says deleted the read does not ask for it
  const s2 = saveLive(r, kit, (j) => { j.boards[X] = { x: 0, y: 2000, w: 1440, h: 900, title: 'lo mío', page: j.pages[0].id }; j.order.push(X); return j; }, '2');
  fs.writeFileSync(path.join(s2.liveDir, 'project', X), '<!doctype html><title>edited by hand</title>');
  regenerate(r, 'B', 'v3');
  rebuild(r, { first: 'no' });
  assert.ok(!kit.plan().json.step.params.paths.includes(`project/${X}`), 'read-live asks for a frame the user deleted');
  const m = mergeWith(kit, s2);
  assert.deepEqual([m.status, codes(m)], [1, ['live-incomplete']]);
  assert.deepEqual(kit.published().deleted, []);
  assert.ok(kit.plan().json.step.params.paths.includes(`project/${X}`), 'the next read-live does not ask for the frame that came back');
  // with it read, the hash comparison is the one of every frame of ours
  const m2 = mergeWith(kit, s2);
  assert.deepEqual([m2.status, codes(m2)], [1, ['artboard-edited-by-hand']]);
});

// ---- RL2-03: the way out of main-exists-live goes all the way to a publication ---------------------------

test('RL2-03: after main-exists-live, build --first no, merge and publish reach record; a plan without the note still asks first yes', () => {
  const { r, kit } = ready();
  const url = fakeUrl(74);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify({ v: 3, title: 'Untitled', pages: [], boards: { 'Main.dc.html': { x: 0, y: 0, w: 800, h: 600, title: 'Main' } }, order: ['Main.dc.html'], notes: {} }));
  assert.deepEqual(codes(kit.merge(['--live', live, '--live-dir', 'none'])), ['main-exists-live']);
  assert.equal(kit.published().mainTaken, true);
  rebuild(r, { first: 'no' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const m = kit.merge(['--live', live, '--live-dir', 'none']);
  assert.equal(m.status, 0, JSON.stringify(m.json));
  const merged = readJson(canvasFile(r, 'project', 'canvas.json'));
  assert.deepEqual(merged.boards['Main.dc.html'], { x: 0, y: 0, w: 800, h: 600, title: 'Main' }, 'the Main of the user is untouched');
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.equal(kit.published().ownsMain, false);
});

test('RL2-03: without the note of merge, a canvas that was just created still asks for first true', () => {
  const { r, kit } = ready();
  assert.equal(kit.record('canvas-create', fakeUrl(75)).status, 1);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', fakeUrl(75)).status, 0);
  rebuild(r, { first: 'no' });
  const p = kit.plan();
  assert.deepEqual(p.json.problems.map((x) => [x.code, x.expectedFirst, x.reason]), [['first-mismatch', true, 'state']]);
});

// ---- RL2-04: planned.json ---------------------------------------------------------------------------------

test('RL2-04: planned.json is written by the plan of canvas-publish, ignored when it is of another canvas and cleared by record', () => {
  const { r, kit } = ready();
  const url = fakeUrl(76);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(fs.existsSync(path.join(r.run, 'planned.json')), false, 'a read plan writes no planned.json');
  assert.equal(kit.merge().status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  const planned = readJson(path.join(r.run, 'planned.json'));
  assert.equal(planned.canvasUrl, url);
  assert.ok(planned.paths.length > 0 && planned.paths.every((p) => p.startsWith('project/') && p !== 'project/canvas.json'));
  // the live canvas holds what was planned; the canvas of the project changes: the old plan owns nothing in the new one
  const saved = saveLive(r, kit);
  const other = fakeUrl(77);
  fs.writeFileSync(path.join(r.run, 'planned.json'), JSON.stringify({ ...planned, canvasUrl: other }));
  rebuild(r, { first: 'yes' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const m = mergeWith(kit, saved);
  assert.ok(codes(m).includes('page-collision'), 'a planned.json of another canvas made the page ours');
});

test('RL2-04: record clears planned.json (publish and create)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 86);
  assert.equal(fs.existsSync(path.join(r.run, 'planned.json')), false);
  assert.equal(kit.published().canvasUrl, url);
});

// ---- RL2-05 / RL2-07: the way out of an invalid canvas record --------------------------------------------

function breakRecord(kit) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const file = walk(kit.data).find((f) => path.basename(f) === 'project.json');
  const cfg = readJson(file);
  cfg.canvas.url = `${cfg.canvas.url}?x=1`;
  fs.writeFileSync(file, JSON.stringify(cfg));
}

test('RL2-07: with an invalid record, plan --new-canvas creates and records a canvas that replaces it; without the option everything stops; present says local without the notice', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 78);
  breakRecord(kit);
  const present = runScript('run.mjs', ['present', '--data', kit.data, '--project', r.project, '--presentation', 'auto', '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes', '--run', r.run]);
  assert.equal(present.status, 0, present.stderr);
  assert.deepEqual([present.json.mode, present.json.destination, present.json.canvasInvalid, present.json.notice], ['local', 'local', true, undefined]);
  assert.ok(present.json.reasons.includes('canvas-invalid'));
  rebuild(r, { first: 'yes' });
  assert.deepEqual(codes(kit.plan()), ['bad-canvas-state']);
  assert.deepEqual(codes(kit.merge()), ['bad-canvas-state']);
  assert.equal(stepId(kit.plan(['--new-canvas'])), 'canvas-create');
  assert.equal(kit.record('canvas-create', fakeUrl(79)).status, 0);
  assert.deepEqual([kit.canvas().url, kit.canvas().state, kit.canvas().pages], [fakeUrl(79), 'created', 0]);
  assert.equal(stepId(kit.plan(['--new-canvas'])), 'canvas-read-live', 'the option is done once the new canvas is recorded');
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
});

test('RL2-05: --new-canvas is still honoured on a published canvas of an earlier run', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 80);
  assert.equal(stepId(kit.plan(['--new-canvas'])), 'canvas-create');
});

// ---- guards that had no test (surviving mutations of the review) ----------------------------------------

test('guard (M14, M15): --live-dir that is a junction, or with an artboard that is a link, is refused with exit 2', (t) => {
  const { r, kit, saved } = secondRound(81);
  const real = path.join(kit.dir, 'real-live-files');
  fs.cpSync(saved.liveDir, real, { recursive: true });
  const junction = path.join(kit.dir, 'junction-live-files');
  try { fs.symlinkSync(real, junction, 'junction'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  const m = kit.merge(['--live', saved.live, '--live-dir', junction]);
  assert.equal(m.status, 2, m.stdout);
  // an artboard of the live folder that is a symlink to a file
  const dir = path.join(kit.dir, 'link-live-files');
  fs.cpSync(saved.liveDir, dir, { recursive: true });
  const name = fs.readdirSync(path.join(dir, 'project')).find((n) => n.includes('-a-'));
  const target = path.join(kit.dir, 'target.html');
  fs.copyFileSync(path.join(dir, 'project', name), target);
  fs.rmSync(path.join(dir, 'project', name));
  try { fs.symlinkSync(target, path.join(dir, 'project', name), 'file'); } catch { return; }
  const m2 = kit.merge(['--live', saved.live, '--live-dir', dir]);
  assert.equal(m2.status, 2, m2.stdout);
});

test('guard (M16, M11, M12): after publishing, --live-dir none and --live none are refused, and a merge made with none is not current', () => {
  const { r, kit, saved } = secondRound(82);
  const none = kit.merge(['--live', saved.live, '--live-dir', 'none']);
  assert.equal(none.status, 2, none.stdout);
  const live = kit.merge(['--live', 'none', '--live-dir', 'none']);
  assert.deepEqual([live.status, codes(live)], [1, ['not-created']]);
  // a merge.json that says "no live index" on a canvas that is already published: plan reads again
  assert.equal(mergeWith(kit, saved).status, 0);
  const file = path.join(mergeDirOf(r), 'merge.json');
  fs.writeFileSync(file, JSON.stringify({ ...readJson(file), liveSha256: null }));
  fs.rmSync(path.join(mergeDirOf(r), 'live.json'));
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
});

test('guard (M09): a merge of another canvas is not a current merge', () => {
  const { r, kit, saved } = secondRound(83);
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  const file = path.join(mergeDirOf(r), 'merge.json');
  fs.writeFileSync(file, JSON.stringify({ ...readJson(file), canvasUrl: fakeUrl(99) }));
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
});

test('guard (M32): merge with an invalid canvas record stops with bad-canvas-state', () => {
  const { r, kit, saved } = secondRound(84);
  breakRecord(kit);
  const m = mergeWith(kit, saved);
  assert.deepEqual([m.status, codes(m)], [1, ['bad-canvas-state']]);
});

test('guard (M24): while the frame is deleted, read-live does not ask for it (the tool fails on a path that does not exist)', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 85);
  const X = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path.replace('project/', '')).find((n) => n.includes('-b-detalle'));
  const s1 = saveLive(r, kit, (j) => { delete j.boards[X]; j.order = j.order.filter((n) => n !== X); return j; }, '1');
  fs.rmSync(path.join(s1.liveDir, 'project', X));
  regenerate(r, 'A', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(mergeWith(kit, s1).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.deepEqual(kit.published().deleted, [X]);
  regenerate(r, 'A', 'v3');
  rebuild(r, { first: 'no' });
  assert.ok(!kit.plan().json.step.params.paths.includes(`project/${X}`));
});

test('guard (M22): heights refuses an --out that is a link', (t) => {
  const r = makeRun({ options: ['A'], screens: ['inicio.html'] });
  const target = path.join(makeTempDir(), 'afuera.json');
  fs.writeFileSync(target, 'x');
  try { fs.symlinkSync(target, path.join(r.run, 'heights.json'), 'file'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  const res = runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'heights.json')], { timeout: 120000 });
  assert.equal(res.status, 2, res.stdout.slice(0, 300));
  assert.equal(fs.readFileSync(target, 'utf8'), 'x');
});

// ---- mergeIndex units: M01 (cap of artboards), M05 (a note the user deleted does not come back) ----------

const NOW = '2026-10-01T18:00:00Z';
const screens = (id) => [{ file: 'inicio.html', html: screenHtml(`${id} i`, { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml(`${id} d`) }];
const mk = (pageId, first = false) => buildCanvas({ options: [{ id: 'A', kind: 'option', screens: screens('A') }, { id: 'B', kind: 'option', screens: screens('B') }], platform: 'desktop', pageId, pageName: 'new', canvasTitle: 'Proyecto', first });

test('guard (M01): mergeIndex stops with canvas-full when the artboards go over the cap', () => {
  const ours = mk('r2').fragment;
  const boards = {};
  for (let i = 0; i < MERGE_LIMITS.boards - 1; i++) boards[`u-${i}.dc.html`] = { x: i, y: 0, w: 10, h: 10, title: `u${i}` };
  const live = { v: 3, pages: [{ id: 'u', name: 'u' }], boards, order: Object.keys(boards), notes: {} };
  const res = mergeIndex({ ours, live, title: 'P', now: NOW, changed: [], first: false });
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => p.code === 'canvas-full' && p.detail === 'boards'), JSON.stringify(res.problems));
});

test('guard (M05): a note of ours that the user deleted does not come back', () => {
  const r1 = mk('r1', true);
  const live = mergeIndex({ ours: r1.fragment, live: null, title: 'P', now: NOW }).index;
  const id = Object.keys(live.notes)[0];
  delete live.notes[id];
  const sub = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
  const published = {
    pageId: 'r1', files: {},
    boards: Object.fromEntries(Object.entries(r1.fragment.boards).map(([n, b]) => [n, sub(b, ['x', 'y', 'w', 'h', 'title'])])),
    notes: Object.fromEntries(Object.entries(r1.fragment.notes).map(([i, n]) => [i, sub(n, ['x', 'y', 'text', 'maxW'])])),
  };
  const res = mergeIndex({ ours: r1.fragment, live, published, title: 'P', now: NOW, changed: [], first: true, ownsMain: true });
  assert.equal(res.ok, true, JSON.stringify(res.problems));
  assert.ok(!(id in res.index.notes), 'the note came back');
  assert.ok(res.kept.userDeleted.includes(id));
});

// ---- minors that cost a line --------------------------------------------------------------------------

test('minor: --live cannot be a file of the own canvas/ or merge/ of the run (exit 2); a canvas url with an underscore is one url for every command', () => {
  const { r, kit, saved } = secondRound(87);
  assert.equal(mergeWith(kit, saved).status, 0);
  const own = kit.merge(['--live', canvasFile(r, 'project', 'canvas.json'), '--live-dir', saved.liveDir]);
  assert.equal(own.status, 2, own.stdout);
  assert.match(own.stderr, /de esta corrida/);
  const under = 'https://claude.ai/artifact/abc_def-1234';
  const fresh = ready();
  assert.equal(stepId(fresh.kit.plan()), 'canvas-create');
  assert.equal(fresh.kit.record('canvas-create', under).status, 0);
  assert.equal(fresh.kit.canvas().url, under);
});
