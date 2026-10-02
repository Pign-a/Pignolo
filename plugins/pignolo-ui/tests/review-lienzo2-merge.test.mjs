// Findings of the final review of stage 2 of the canvas (hito 4c), as tests that FAIL on the reviewed code
// (4de0366) and pass with the right behaviour. Synthetic data; the URLs are made up at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runScript } from './helpers.mjs';
import { makeRun, addRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl } from './support/canvas-plan.mjs';
import { mergeIndex } from '../lib/canvas-merge.mjs';

const canvasFile = (r, ...p) => path.join(r.run, 'canvas', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const stepId = (res) => (res.json && res.json.step ? res.json.step.id : null);
const stepFiles = (res) => (res.json && res.json.step && res.json.step.params.files ? Object.keys(res.json.step.params.files) : []);

function ready(opts = {}) {
  const r = makeRun(opts);
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  return { r, kit: planKit(r) };
}

// run 1 of a new project through create, merge --live none and publish
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

// what the tool would have saved after read-live: the index (edited by `mutate`) and the artboards of the run
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

// RL2-01 (crítico). mergeLive returns on a problem without removing <run>/merge/: the merge of BEFORE stays
// "current" and plan offers canvas-publish with the very artboard that the last merge found edited by hand.
test('RL2-01: a merge that stops (artboard-edited-by-hand) leaves no earlier merge as current: plan never offers canvas-publish after it', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 61);
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(mergeWith(kit, saved).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  // the live canvas is read again (some time went by): now somebody has edited an artboard of B by hand
  const edited = fs.readdirSync(path.join(saved.liveDir, 'project')).find((n) => n.includes('-b-'));
  fs.appendFileSync(path.join(saved.liveDir, 'project', edited), '<!-- edited by hand -->');
  const again = mergeWith(kit, saved);
  assert.equal(again.status, 1);
  assert.deepEqual(again.json.problems.map((p) => p.code), ['artboard-edited-by-hand']);
  const p = kit.plan();
  assert.notEqual(stepId(p), 'canvas-publish', `after a merge that stopped, plan offered canvas-publish with ${stepFiles(p).join(', ')}`);
});

// RL2-02 (crítico). publish.json.deleted takes a frame out of read-live AND out of the hash comparison for good:
// if the user puts the frame back and edits its artboard, a regeneration replaces it without asking.
test('RL2-02: a frame of ours that the user deleted, put back and edited by hand is never sent without the hash comparison or their yes', () => {
  const { r, kit } = ready();
  const url = publishFirst(r, kit, 62);
  const X = readJson(canvasFile(r, 'manifest.json')).files.map((f) => f.path.replace('project/', '')).find((n) => n.includes('-b-detalle'));
  // the user deletes the frame X; A is regenerated and published: publish.json remembers X as deleted
  const s1 = saveLive(r, kit, (j) => { delete j.boards[X]; j.order = j.order.filter((n) => n !== X); return j; }, '1');
  fs.rmSync(path.join(s1.liveDir, 'project', X));
  regenerate(r, 'A', 'v2');
  rebuild(r, { first: 'no' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(mergeWith(kit, s1).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.deepEqual(kit.published().deleted, [X]);
  // the user puts X back in the canvas (undo) and edits it by hand; then B is regenerated
  const s2 = saveLive(r, kit, (j) => { j.boards[X] = { x: 0, y: 2000, w: 1440, h: 900, title: 'lo mío', page: j.pages[0].id }; j.order.push(X); return j; }, '2');
  fs.writeFileSync(path.join(s2.liveDir, 'project', X), '<!doctype html><title>edited by hand</title>');
  regenerate(r, 'B', 'v3');
  rebuild(r, { first: 'no' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const m = mergeWith(kit, s2);
  const p = kit.plan();
  const overwritten = m.status === 0 ? readJson(path.join(r.run, 'merge', 'merge.json')).overwritten : [];
  const sendsX = stepId(p) === 'canvas-publish' && stepFiles(p).includes(`project/${X}`);
  assert.ok(!sendsX || overwritten.includes(X), `plan sends ${X}, which is live and edited by hand, and merge neither stopped (exit ${m.status}) nor recorded an accepted overwrite`);
});

// RL2-03 (importante). main-exists-live only happens when the state says first (created / pages 0 / new canvas), and
// there plan demands first true: the advice of merge (build --first no) and the advice of plan (build --first yes) loop.
test('RL2-03: after main-exists-live, following the advice (build --first no) does not end in first-mismatch asking for first true again', () => {
  const { r, kit } = ready();
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', fakeUrl(63)).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  // the canvas that was just created already has an index with a Main.dc.html that is not of this run
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify({ v: 3, title: 'Untitled', pages: [], boards: { 'Main.dc.html': { x: 0, y: 0, w: 800, h: 600, title: 'Main' } }, order: ['Main.dc.html'], notes: {} }));
  const m = kit.merge(['--live', live, '--live-dir', 'none']);
  assert.deepEqual([m.status, m.json.problems.map((p) => p.code)], [1, ['main-exists-live']]);
  rebuild(r, { first: 'no' });
  const p = kit.plan();
  const codes = (p.json.problems ?? []).map((x) => `${x.code}:${x.expectedFirst}`);
  assert.ok(!codes.includes('first-mismatch:true'), 'merge says build --first no, plan says build --first yes: there is no way out of the two');
});

// RL2-04 (importante). The `owned` of mergeIndex comes from a plan.json whose id is canvas-publish, but the plan that
// gives canvas-read-live (always run before merge) overwrites plan.json: at the CLI `owned` is always empty.
test('RL2-04: a publication that was never recorded does not lock the run: after build again, merge does not call its own page a collision', () => {
  const { r, kit } = ready();
  const url = fakeUrl(64);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  // Artifact published and the session was cut before `record`. The live canvas holds the page of this run.
  const saved = saveLive(r, kit);
  regenerate(r, 'B', 'v2');
  rebuild(r, { first: 'yes' });
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const m = mergeWith(kit, saved);
  const codes = [...new Set((m.json.problems ?? []).map((p) => p.code))];
  assert.deepEqual([m.status, codes], [0, []], 'the page and the artboards that this same run planned and published are taken for a collision');
});

// RL2-05 (importante). --new-canvas is honoured on every plan: after the canvas-create it asked for was recorded,
// the same command line creates another canvas, and another, without end (each one is a real artifact).
test('RL2-05: plan --new-canvas does not create a second canvas when this run has just created and recorded an empty one', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 65);
  const r2 = addRun(r);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'yes', now: '2026-10-02T09:00:00Z' })).status, 0);
  const k2 = planKit(r2, { dataDir: kit.data });
  assert.equal(stepId(k2.plan(['--new-canvas'])), 'canvas-create');
  assert.equal(k2.record('canvas-create', fakeUrl(66)).status, 0);
  assert.deepEqual([k2.canvas().url, k2.canvas().state, k2.canvas().pages], [fakeUrl(66), 'created', 0]);
  assert.notEqual(stepId(k2.plan(['--new-canvas'])), 'canvas-create', 'the canvas of the project is the empty one this run has just created: opening another leaves an orphan per repetition');
});

// RL2-06 (importante). Main.dc.html is left out of the check of names without regard to case (R-3): with a live
// `main.dc.html` of the user the merged index holds both, and on a store that does not tell them apart ours replaces theirs.
test('RL2-06: mergeIndex refuses our Main.dc.html when the live canvas has an artboard of the user with the same name in another capitalisation', () => {
  const ours = { page: { id: 'r1', name: 'new · 2026-10-01' }, boards: { 'Main.dc.html': { x: 0, y: 260, w: 1440, h: 900, title: 'A · inicio', page: 'r1' } }, order: ['Main.dc.html'], notes: {} };
  const live = { v: 3, pages: [], boards: { 'main.dc.html': { x: 0, y: 0, w: 800, h: 600, title: 'boceto' } }, order: ['main.dc.html'], notes: {} };
  const res = mergeIndex({ ours, live, title: 'Proyecto', now: '2026-10-01T18:00:00.000Z', changed: ['project/Main.dc.html'], first: true });
  assert.equal(res.ok, false, `merged boards: ${res.index ? Object.keys(res.index.boards).join(', ') : ''}`);
  assert.ok(res.problems.some((p) => p.code === 'name-collision' || p.code === 'main-exists-live'));
});

// RL2-07 (importante). An invalid canvas record (a hand-edited project.json) is a dead end: present goes on in canvas
// mode with the notice of publication, every plan and merge refuses with bad-canvas-state, `config set --key canvas`
// cannot clear it and plan --new-canvas refuses too. Either present must not announce a canvas, or there must be a way out.
test('RL2-07: with an invalid canvas record either present does not announce the canvas or plan --new-canvas is a way out', () => {
  const { r, kit } = ready();
  publishFirst(r, kit, 67);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const file = walk(kit.data).find((f) => path.basename(f) === 'project.json');
  const cfg = readJson(file);
  cfg.canvas.url = `${cfg.canvas.url}?x=1`;
  fs.writeFileSync(file, JSON.stringify(cfg));
  const present = runScript('run.mjs', ['present', '--data', kit.data, '--project', r.project, '--presentation', 'auto', '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes', '--run', r.run]);
  assert.equal(present.status, 0, present.stderr);
  assert.equal(present.json.canvasInvalid, true);
  rebuild(r, { first: 'yes' });
  assert.deepEqual(kit.plan().json.problems.map((p) => p.code), ['bad-canvas-state']);
  const wayOut = kit.plan(['--new-canvas']);
  assert.ok(present.json.mode !== 'canvas' || stepId(wayOut) === 'canvas-create', `present says mode ${present.json.mode} with the notice, and plan --new-canvas answers ${JSON.stringify((wayOut.json.problems ?? []).map((p) => p.code))}`);
});
