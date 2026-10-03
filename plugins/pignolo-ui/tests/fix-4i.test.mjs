// Hito 4i, pasada de arreglos: R4i-02 (otra pantalla llega al mismo lienzo) y R4i-03 (--keep: lo no elegido que el usuario
// editó y quiere conservar). R4i-01 lo cubre review-4i-drop.test.mjs. Datos sintéticos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { mergeIndex, diffPublished } from '../lib/canvas-merge.mjs';
import { buildCanvas, layoutSha256 } from '../lib/canvas-layout.mjs';
import { makeRun, addRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl } from './support/canvas-plan.mjs';

const NOW = '2026-10-02T10:00:00Z';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SUBSET = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const screens = (id) => [{ file: 'inicio.html', html: screenHtml(`${id} i`, { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml(`${id} d`) }];
const mk = (letters) => buildCanvas({
  options: letters.map((id) => ({ id, kind: 'option', screens: screens(id) })),
  platform: 'desktop', pageId: 'r1', pageName: 'new · 2026-10-02', canvasTitle: 'Proyecto', first: false,
});
const manifestOf = (b) => ({ files: Object.entries(b.files).map(([n, h]) => ({ path: `project/${n}`, sha256: sha(h) })).sort((a, b2) => (a.path < b2.path ? -1 : 1)) });

test('R4i-03 mergeIndex: --keep keeps an unchosen board the user edited, drops the rest and does not stop', () => {
  const full = mk(['A', 'B', 'C']);
  const live = mergeIndex({ ours: full.fragment, live: null, title: 'Proyecto', now: NOW }).index;
  const only = mk(['B']);
  const published = {
    pageId: 'r1',
    files: Object.fromEntries(manifestOf(full).files.map((f) => [f.path, f.sha256])),
    boards: Object.fromEntries(Object.entries(full.fragment.boards).map(([n, b]) => [n, SUBSET(b, ['x', 'y', 'w', 'h', 'title'])])),
    notes: Object.fromEntries(Object.entries(full.fragment.notes).map(([i, n]) => [i, SUBSET(n, ['x', 'y', 'text', 'maxW'])])),
  };
  const diff = diffPublished({ manifest: manifestOf(only), layoutSha256: layoutSha256(only.fragment), pageId: 'r1', published });
  const c1 = Object.keys(full.fragment.boards).find((n) => n.includes('-c-inicio'));
  const a1 = Object.keys(full.fragment.boards).find((n) => n.includes('-a-detalle'));
  const liveFiles = { ...published.files, [`project/${c1}`]: sha('lo editó el usuario') };
  const run = (keep) => mergeIndex({ ours: only.fragment, live, liveFiles, published, title: 'Proyecto', now: NOW, changed: diff.changed, removed: diff.removed, keep });
  assert.equal(run([]).ok, false, 'without keep the edited board stops the merge');
  const r = run([c1]);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(c1 in r.index.boards && r.index.order.includes(c1), 'the kept board stays');
  assert.ok(!(a1 in r.index.boards), 'the other unchosen board still goes');
  assert.ok(!r.kept.dropped.includes(c1));
  assert.deepEqual(r.kept.keptOnRequest, [c1]);
});

test('R4i-03 CLI: merge --keep goes on, the null is sent only for the rest, record releases the kept frame and it never comes back', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const url = fakeUrl(31);
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  const idx = readJson(path.join(r.run, 'canvas', 'project', 'canvas.json'));
  const c1 = Object.keys(idx.boards).find((n) => n.includes('-c-inicio'));
  const a1 = Object.keys(idx.boards).find((n) => n.includes('-a-detalle'));
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify(idx));
  const liveDir = path.join(kit.dir, 'live-files');
  fs.cpSync(path.join(r.run, 'canvas', 'project'), path.join(liveDir, 'project'), { recursive: true });
  fs.appendFileSync(path.join(liveDir, 'project', c1), '<!-- editado a mano -->\n');
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'B' })).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  const args = ['--live', live, '--live-dir', liveDir];
  const stopped = kit.merge(args);
  assert.equal(stopped.status, 1, stopped.stdout);
  const ok = kit.merge([...args, '--keep', c1]);
  assert.equal(ok.status, 0, ok.stdout);
  const info = readJson(path.join(r.run, 'merge', 'merge.json'));
  assert.deepEqual(info.keptOnRequest, [c1]);
  const merged = readJson(path.join(r.run, 'canvas', 'project', 'canvas.json'));
  assert.ok(c1 in merged.boards && !(a1 in merged.boards));
  const pub = kit.plan();
  assert.equal(pub.status, 0, pub.stdout);
  const files = pub.json.step.params.files;
  assert.equal(files[`project/${a1}`], null, 'A goes out of the canvas');
  assert.ok(!(`project/${c1}` in files), 'the kept frame is not sent, not even as null');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.ok(!(`project/${c1}` in kit.published().files), 'the kept frame is the user\'s now: it left publish.json');
  // the next round of the run does not ask about it again
  const again = kit.plan();
  assert.equal(again.json.done, true, again.stdout);
});

test('R4i-02: the second screen (new run, own types.json and leak-values) reaches the same canvas', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const url = fakeUrl(32);
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  const r2 = addRun(r);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'no', 'page-name': 'new · 2026-10-02', now: '2026-10-02T09:00:00Z' })).status, 0);
  // what step 9 now says to leave in the new run: <run>/types.json and <run>/leak-values.json
  const k2 = planKit(r2, { dataDir: kit.data });
  fs.copyFileSync(k2.typesFile, path.join(r2.run, 'types.json'));
  fs.copyFileSync(k2.valuesFile, path.join(r2.run, 'leak-values.json'));
  fs.copyFileSync(path.join(path.dirname(k2.valuesFile), 'leak-origins.json'), path.join(r2.run, 'leak-origins.json'));
  const plan = canvasIndex(['plan', '--project', r2.project, '--run', r2.run, '--values-file', path.join(r2.run, 'leak-values.json'), '--types-file', path.join(r2.run, 'types.json'), '--data', kit.data]);
  assert.equal(plan.status, 0, plan.stdout);
  assert.equal(plan.json.step.id, 'canvas-read-live');
  assert.equal(plan.json.step.params.url, url, 'the same canvas');
  // and without the files it does not work, which is what the old step 9 left out
  const bare = canvasIndex(['plan', '--project', r2.project, '--run', r2.run, '--values-file', path.join(r2.run, 'leak-values.json'), '--types-file', path.join(r2.run, 'nope.json'), '--data', kit.data]);
  assert.equal(bare.status, 2);
});
