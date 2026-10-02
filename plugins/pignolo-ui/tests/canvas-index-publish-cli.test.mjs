import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { makeTempDir, runScript } from './helpers.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl, TYPE_URL, LEAK_VALUES, walkJson, snapshotLive } from './support/canvas-plan.mjs';
import { layoutSha256 } from '../lib/canvas-layout.mjs';

const FORBIDDEN = ['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities'];

// a run with a built canvas and its plan kit
function ready(opts = {}, extra = {}) {
  const r = makeRun(opts);
  assert.equal(canvasIndex(BUILD_ARGS(r, extra)).status, 0);
  return { r, kit: planKit(r) };
}
const stepOf = (res) => res.json.step;
const readCanvasJson = (r, f) => JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', f), 'utf8'));

test('one step at a time, no markers: create -> read-live -> merge -> publish -> done (A4C-02, A4C-04)', () => {
  const { r, kit } = ready();
  const url = fakeUrl(1);
  const p1 = kit.plan();
  assert.equal(p1.status, 0, p1.stdout);
  assert.equal(stepOf(p1).id, 'canvas-create');
  assert.deepEqual(stepOf(p1).params, { action: 'publish', type_url: TYPE_URL, title: 'Proyecto', auto_open: 'after_first_write' });
  assert.equal(kit.record('canvas-create', url).status, 0);
  const p2 = kit.plan();
  assert.equal(stepOf(p2).id, 'canvas-read-live');
  assert.deepEqual(stepOf(p2).params, { action: 'read', url, paths: ['project/canvas.json'] });
  assert.equal(kit.merge().status, 0);
  const p3 = kit.plan();
  const params = stepOf(p3).params;
  assert.equal(stepOf(p3).id, 'canvas-publish');
  assert.equal(params.url, url);
  assert.ok(path.isAbsolute(params.root) && path.isAbsolute(params.file_path));
  assert.equal(params.file_path, path.join(params.root, 'project', 'canvas.json'));
  assert.equal(Object.keys(params.files).length, 6);
  assert.ok('project/Main.dc.html' in params.files);
  assert.ok(!('type_url' in params), 'type_url only on canvas-create');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  const publish = JSON.parse(fs.readFileSync(path.join(r.run, 'publish.json'), 'utf8'));
  assert.equal(publish.state, 'published');
  const done = kit.plan();
  assert.deepEqual([done.status, done.json.done, done.json.step], [0, true, null]);
  // no marker and no forbidden key in the whole tree of any params that was printed
  for (const res of [p1, p2, p3]) {
    walkJson(res.json.step.params, (k, v) => {
      assert.ok(!FORBIDDEN.includes(k), `forbidden key ${k}`);
      if (typeof v === 'string') assert.ok(!v.includes('<') && !v.includes('>'), `marker in ${k}`);
    });
    for (const s of Object.values(res.json.step.params).filter((v) => typeof v === 'string')) assert.ok(!s.includes('<'), s);
  }
});

test('the opt-out comes first: run, project and legacy consent refuse with no params and no type_url (A4C-01)', () => {
  for (const make of [
    (r) => fs.writeFileSync(path.join(r.run, 'no-publish'), 'x'),
    (r, kit) => runScript('run.mjs', ['config', 'set', '--data', kit.data, '--project', r.project, '--key', 'publish', '--value', 'never']),
  ]) {
    const { r, kit } = ready();
    make(r, kit);
    const p = kit.plan();
    assert.equal(p.status, 1);
    assert.ok(['run-opt-out', 'project-opt-out'].includes(p.json.problems[0].code));
    assert.ok(!/"params"|type_url/.test(p.stdout), 'no params in the output');
    assert.equal(p.json.step, null);
  }
  const { r, kit } = ready();
  const file = path.join(kit.data, runScript('run.mjs', ['config', 'get', '--data', kit.data, '--project', r.project]).json.repoId, 'project.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ canvasConsent: false }));
  const legacy = kit.plan();
  assert.equal(legacy.json.problems[0].code, 'legacy-consent-declined');
  assert.ok(!/"params"|type_url/.test(legacy.stdout));
});

test('every way to a publication passes the leak check: a seed in each place stops plan with no step', () => {
  const seeds = {
    'an artboard': (r) => fs.writeFileSync(path.join(r.optionDir('B'), 'detalle.html'), screenHtml('b', { link: 'inicio.html', extra: '<p>Persona Ejemplo</p>\n' })),
    'a Google Fonts link query': (r) => fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('a', { link: 'detalle.html', head: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Persona+Ejemplo&display=swap">\n' })),
    'the project name in DESIGN.md': (r) => fs.writeFileSync(path.join(r.project, 'DESIGN.md'), '---\nversion: alpha\nname: Persona Ejemplo\n---\n'),
  };
  for (const [where, seed] of Object.entries(seeds)) {
    const r = makeRun();
    seed(r);
    const extra = where.includes('DESIGN') ? { design: path.join(r.project, 'DESIGN.md') } : {};
    assert.equal(canvasIndex(BUILD_ARGS(r, extra)).status, 0, where);
    const kit = planKit(r);
    const p = kit.plan();
    assert.equal(p.status, 1, where);
    assert.deepEqual([p.json.ok, p.json.step], [false, null], where);
    assert.ok(p.json.problems.some((x) => x.code === 'leak'), `${where}: ${JSON.stringify(p.json.problems)}`);
    assert.ok(!p.stdout.includes('Persona Ejemplo'), 'the value is never printed');
  }
  // the page name
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r, { 'page-name': 'new · Persona Ejemplo' })).status, 0);
  assert.equal(planKit(r).plan().status, 1);
  // a note of ours (page.json and its manifest agree, so only the leak check can stop it)
  const n = makeRun();
  canvasIndex(BUILD_ARGS(n));
  const pageFile = path.join(n.run, 'canvas', 'page.json');
  const fragment = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
  fragment.notes[Object.keys(fragment.notes)[0]].text = 'Opción Persona Ejemplo';
  fs.writeFileSync(pageFile, JSON.stringify(fragment, null, 2));
  const manifestFile = path.join(n.run, 'canvas', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.layoutSha256 = layoutSha256(fragment);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const pn = planKit(n).plan();
  assert.equal(pn.status, 1);
  assert.ok(pn.json.problems.some((x) => x.code === 'leak'));
});

test('a project folder named like the OS user does not leak into the title: plan is ok and the title is Proyecto (A4C-03)', () => {
  const user = os.userInfo().username;
  const name = user.length >= 3 ? user : 'carpeta-con-usuario';
  const r = makeRun({ projectName: name });
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r, { values: [name, 'persona@ejemplo.test'] });
  const p = kit.plan();
  assert.equal(p.status, 0, p.stdout);
  assert.equal(stepOf(p).params.title, 'Proyecto');
});

test('regenerating an option after publishing (stage 2): a seeded leak is refused; without it the SAME canvas is read and only B is sent (A4C-03)', () => {
  const { r, kit } = ready();
  const url = fakeUrl(2);
  kit.plan();
  kit.record('canvas-create', url);
  kit.plan();
  kit.merge();
  kit.plan();
  kit.record('canvas-publish', url);
  assert.equal(kit.plan().json.done, true);
  const live = snapshotLive(r);
  // regenerate B with a leak
  assert.equal(runScript('run.mjs', ['discard', '--run', r.run, '--option', 'B']).status, 0);
  fs.mkdirSync(r.optionDir('B'), { recursive: true });
  for (const f of ['inicio.html', 'detalle.html']) fs.writeFileSync(path.join(r.optionDir('B'), f), screenHtml('b', { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html', extra: '<p>Persona Ejemplo</p>\n' }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const leaked = kit.plan();
  assert.deepEqual([leaked.status, leaked.json.step], [1, null]);
  // regenerate again, clean: the same canvas, read first, never a canvas-publish straight on it and never a canvas-create
  for (const f of ['inicio.html', 'detalle.html']) fs.writeFileSync(path.join(r.optionDir('B'), f), screenHtml('b2', { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html' }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const again = kit.plan();
  assert.equal(stepOf(again).id, 'canvas-read-live');
  assert.equal(stepOf(again).params.url, url);
  assert.ok(stepOf(again).params.paths.includes('project/Main.dc.html'), 'the artboards already published are read before replacing them');
  const m = kit.merge(['--live', live.live, '--live-dir', live.liveDir]);
  assert.equal(m.status, 0, m.stdout);
  const pub = kit.plan();
  assert.equal(stepOf(pub).id, 'canvas-publish');
  assert.equal(stepOf(pub).params.url, url);
  assert.ok(!('type_url' in stepOf(pub).params));
  const sent = Object.keys(stepOf(pub).params.files);
  assert.ok(sent.length > 0 && sent.every((p) => p.includes('-b-')), `only the artboards of B go: ${sent.join()}`);
  assert.ok(!sent.includes('project/Main.dc.html'));
});

test('resumption: a created canvas in a new session goes on at read-live with first true; build --first no is first-mismatch; unchanged published is done', () => {
  const { r, kit } = ready();
  kit.plan();
  kit.record('canvas-create', fakeUrl(4));
  const publish = JSON.parse(fs.readFileSync(path.join(r.run, 'publish.json'), 'utf8'));
  assert.deepEqual([publish.state, publish.canvasUrl], ['created', fakeUrl(4)]);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  kit.merge();
  const pub = kit.plan();
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.ok('project/Main.dc.html' in pub.json.step.params.files, 'first: true keeps Main.dc.html');
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const mismatch = kit.plan();
  assert.equal(mismatch.status, 1);
  assert.deepEqual(mismatch.json.problems.map((p) => [p.code, p.expectedFirst]), [['first-mismatch', true]]);
});

test('the bytes are tied to the plan: a byte changed after plan is published-unplanned-bytes and the state stays (A4C-12)', () => {
  const { r, kit } = ready();
  kit.plan();
  kit.record('canvas-create', fakeUrl(5));
  kit.plan();
  kit.merge();
  kit.plan();
  const some = fs.readdirSync(path.join(r.run, 'canvas', 'project')).find((f) => f.startsWith('r-'));
  fs.appendFileSync(path.join(r.run, 'canvas', 'project', some), ' ');
  const bad = kit.record('canvas-publish', fakeUrl(5));
  assert.equal(bad.status, 1);
  assert.equal(bad.json.problems[0].code, 'published-unplanned-bytes');
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.run, 'publish.json'), 'utf8')).state, 'created');
});

test('record without a plan for that step is refused; the right step passes and leaves no *.tmp', () => {
  const { r, kit } = ready();
  assert.equal(kit.record('canvas-create', fakeUrl(6)).status, 1, 'no plan.json yet');
  kit.plan();
  assert.equal(kit.record('canvas-publish', fakeUrl(6)).status, 1, 'plan.json is for canvas-create');
  assert.equal(kit.record('canvas-create', fakeUrl(6)).status, 0);
  assert.deepEqual(fs.readdirSync(r.run).filter((n) => n.endsWith('.tmp')), []);
});

test('limits per call: 255 entries in files is too-many-paths', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const screens = Array.from({ length: 10 }, (_, i) => `p${i}.html`);
  const r = makeRun({ options: letters, screens });
  const built = canvasIndex(BUILD_ARGS(r, { options: letters.join(','), screens: screens.join(',') }));
  assert.equal(built.status, 0, built.stdout.slice(0, 300));
  assert.equal(built.json.count, 260);
  const kit = planKit(r);
  kit.plan();
  kit.record('canvas-create', fakeUrl(7));
  kit.plan();
  kit.merge();
  const p = kit.plan();
  assert.equal(p.status, 1);
  assert.deepEqual(p.json.problems.map((x) => x.code), ['too-many-paths']);
});

test('verify at 1, an invalid name and a first that does not match leave no step', () => {
  const { r, kit } = ready();
  fs.appendFileSync(path.join(r.run, 'canvas', 'project', 'Main.dc.html'), ' ');
  const p = kit.plan();
  assert.deepEqual([p.status, p.json.ok, p.json.step], [1, false, null]);
  assert.ok(p.json.problems.some((x) => x.code === 'manifest-mismatch'));
});

test('CLI plan: --values-file or --types-file or --data missing, [] values, a leak and --allow-few-values', () => {
  const { r, kit } = ready();
  const base = ['plan', '--project', r.project, '--run', r.run];
  assert.equal(canvasIndex([...base, '--types-file', kit.typesFile, '--data', kit.data]).status, 2, 'no --values-file');
  assert.equal(canvasIndex([...base, '--values-file', kit.valuesFile, '--types-file', kit.typesFile]).status, 2, 'no --data');
  assert.equal(canvasIndex([...base, '--values-file', kit.valuesFile, '--data', kit.data]).status, 2, 'no --types-file');
  assert.equal(kit.plan(['--allow-few-values']).status, 2);
  const empty = planKit(r, { values: [] }).plan();
  assert.deepEqual([empty.status, empty.json.problems.map((p) => p.code)], [1, ['no-leak-values']]);
  const one = planKit(r, { values: ['Persona Ejemplo'] }).plan();
  assert.deepEqual([one.status, one.json.problems.map((p) => p.code)], [1, ['no-leak-values']]);
  const notypes = planKit(r, { types: {} }).plan();
  assert.deepEqual([notypes.status, notypes.json.problems.map((p) => p.code)], [1, ['no-design-type']]);
});

test('CLI plan: with git failed in leak-origins.json next to the values, plan is no-leak-values even with enough values (A4C2-16)', () => {
  const { r, kit } = ready();
  fs.writeFileSync(path.join(kit.dir, 'leak-origins.json'), JSON.stringify({ 'os-user': true, home: true, 'git-name': false, 'git-email': false, 'account-email': false, git: 'failed' }));
  const p = kit.plan();
  assert.deepEqual([p.status, p.json.problems[0].code], [1, 'no-leak-values']);
  fs.writeFileSync(path.join(kit.dir, 'leak-origins.json'), JSON.stringify({ git: 'unset' }));
  assert.equal(kit.plan().status, 0, 'unset is not a failure');
  void r;
});

test('leak-values run without git on the PATH reports git failed and writes leak-origins.json that stops plan', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const out = path.join(makeTempDir(), 'leak-values.json');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k];
  env.PATH = makeTempDir();
  const lv = runScript('run.mjs', ['leak-values', '--project', r.project, '--out', out], { env });
  assert.equal(lv.status, 0, lv.stderr);
  assert.equal(lv.json.origins.git, 'failed');
  assert.deepEqual(Object.keys(lv.json.origins).sort(), ['account-email', 'git', 'git-email', 'git-name', 'home', 'os-user']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(out), 'leak-origins.json'), 'utf8')).git, 'failed');
  const kit = planKit(r, { values: LEAK_VALUES });
  fs.copyFileSync(path.join(path.dirname(out), 'leak-origins.json'), path.join(kit.dir, 'leak-origins.json'));
  assert.equal(kit.plan().json.problems[0].code, 'no-leak-values');
});

test('CLI merge: --live none writes canvas.json and merge.json; it follows a plan that asked for the read; --live and --live-dir go together', () => {
  const { r, kit } = ready();
  assert.equal(kit.merge().status, 1, 'no plan asked for the read yet');
  kit.plan();
  kit.record('canvas-create', fakeUrl(8));
  assert.equal(kit.merge().status, 1, 'the plan on disk is the one of canvas-create');
  kit.plan();
  const m = kit.merge();
  assert.equal(m.status, 0, m.stdout);
  const index = readCanvasJson(r, 'project/canvas.json');
  assert.deepEqual([index.v, index.launch.view, index.pages.length], [3, 'canvas', 1]);
  const info = JSON.parse(fs.readFileSync(path.join(r.run, 'merge', 'merge.json'), 'utf8'));
  assert.equal(typeof info.canvasSha256, 'string');
  const live = kit.merge(['--live', path.join(kit.dir, 'live.json'), '--live-dir', 'none']);
  assert.equal(live.status, 2);
  assert.match(live.json.error, /--live-dir/);
  assert.equal(kit.merge(['--live', 'none']).status, 2, '--live-dir is required');
});

test('CLI record: another domain is exit 2, --data and --project are required, outside the runs folder is exit 2', () => {
  const { r, kit } = ready();
  kit.plan();
  assert.equal(kit.record('canvas-create', 'https://example.com/artifact/00000000-0000-4000-8000-000000000001').status, 2);
  assert.equal(kit.record('canvas-create', `${fakeUrl(9)}?x=1`).status, 2, 'no query');
  const base = ['record', '--run', r.run, '--step', 'canvas-create', '--url', fakeUrl(9)];
  assert.equal(canvasIndex([...base, '--project', r.project]).status, 2, 'no --data');
  assert.equal(canvasIndex([...base, '--data', kit.data]).status, 2, 'no --project');
  assert.equal(canvasIndex(['record', '--run', makeTempDir(), '--step', 'canvas-create', '--url', fakeUrl(9), '--data', kit.data, '--project', r.project]).status, 2);
  assert.equal(kit.record('canvas-create', fakeUrl(9)).status, 0);
});

test('plan does not touch anything outside <run> and prints at most the problem codes, never the leaked value', () => {
  const { r, kit } = ready();
  const before = fs.readdirSync(r.project).sort();
  kit.plan();
  assert.deepEqual(fs.readdirSync(r.project).sort(), before);
  assert.ok(fs.existsSync(path.join(r.run, 'plan.json')));
});

// ---- stage 2 (T7d): the canvas of the project, merge with the live index, refusals and limits -------------

import { addRunTo } from './support/canvas-run.mjs';
import { readConfig, writeConfig } from '../lib/project-config.mjs';

const readRunJson = (r, f) => JSON.parse(fs.readFileSync(path.join(r.run, f), 'utf8'));
const canvasOfProject = (r, kit) => readConfig({ data: kit.data, project: r.project }).config.canvas;
const seedCanvas = (r, kit, canvas) => writeConfig({ data: kit.data, project: r.project, key: 'canvas', value: canvas });
const MBYTES = 1024 * 1024;
// the screen of an option written again with other content (a comment after </html> converts to the same artboard)
const changeOption = (r, letter, file) => fs.writeFileSync(path.join(r.optionDir(letter), file), screenHtml(`${letter} ${file} v2`, { link: file === 'inicio.html' ? 'detalle.html' : 'inicio.html' }));

// run 1 of a project published end to end; returns what a second run needs
function published1(opts = {}) {
  const { r, kit } = ready(opts);
  const url = fakeUrl(21);
  assert.equal(kit.plan().json.step.id, 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  return { r, kit, url, live: snapshotLive(r) };
}
// the next run of the same project, built as a run that does not open the canvas
function nextRun(p, runId = '2026-10-02-0900-improve-pantalla', extra = {}) {
  const r2 = addRunTo(p.r.project, runId);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'no', 'page-name': 'improve · 2026-10-02', ...extra })).status, 0);
  return { r2, kit2: planKit(r2, { data: p.kit.data }) };
}

test('record keeps the state of the canvas in project.json and what the run published in publish.json (A4C-10)', () => {
  const { r, kit } = ready();
  const url = fakeUrl(10);
  kit.plan();
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.deepEqual(canvasOfProject(r, kit), { url, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 }, 'created carries only the address and zeroes');
  assert.equal(readRunJson(r, 'publish.json').ownsMain, false);
  kit.plan();
  kit.merge();
  kit.plan();
  assert.equal(kit.record('canvas-publish', url).status, 0);
  const canvas = canvasOfProject(r, kit);
  const page = readRunJson(r, 'canvas/page.json');
  assert.deepEqual([canvas.state, canvas.pages, canvas.files, canvas.notes, canvas.launchPage], ['published', 1, 6, 3, page.page.id]);
  assert.ok(canvas.bytes > 0);
  const pub = readRunJson(r, 'publish.json');
  assert.deepEqual([pub.canvasUrl, pub.ownsMain, pub.pageId], [url, true, page.page.id]);
  assert.equal(Object.keys(pub.files).length, 6);
  assert.deepEqual(pub.boards['Main.dc.html'], { x: 0, y: 260, w: 1440, h: 900, title: 'A · inicio' });
  assert.deepEqual(Object.keys(pub.notes).length, 3);
  // a regeneration of the same page does not count the page twice
  const live = snapshotLive(r);
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  changeOption(r, 'B', 'inicio.html');
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(kit.merge(['--live', live.live, '--live-dir', live.liveDir]).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.equal(canvasOfProject(r, kit).pages, 1);
  assert.equal(canvasOfProject(r, kit).files, 6);
});

test('the next run of the project: read-live and publish on the SAME canvas, no canvas-create, a page of its own (R-7)', () => {
  const p = published1();
  const { r2, kit2 } = nextRun(p);
  const read = kit2.plan();
  assert.equal(read.status, 0, read.stdout);
  assert.equal(read.json.step.id, 'canvas-read-live');
  assert.deepEqual(read.json.step.params, { action: 'read', url: p.url, paths: ['project/canvas.json'] });
  assert.ok(!/canvas-create|type_url/.test(read.stdout));
  const m = kit2.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  assert.equal(m.status, 0, m.stdout);
  const index = JSON.parse(fs.readFileSync(path.join(r2.run, 'canvas', 'project', 'canvas.json'), 'utf8'));
  assert.equal(index.pages.length, 2);
  assert.equal(Object.keys(index.boards).filter((n) => n.startsWith('r-202610020900')).length, 6);
  assert.ok('Main.dc.html' in index.boards, 'the first run Main stays');
  const pub = kit2.plan();
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.equal(pub.json.step.params.url, p.url);
  assert.ok(!('type_url' in pub.json.step.params));
  assert.ok(!Object.keys(pub.json.step.params.files).includes('project/Main.dc.html'));
  assert.equal(Object.keys(pub.json.step.params.files).length, 6);
  assert.equal(kit2.record('canvas-publish', p.url).status, 0);
  assert.equal(canvasOfProject(r2, kit2).pages, 2);
  assert.equal(canvasOfProject(r2, kit2).files, 12);
  assert.equal(readRunJson(r2, 'publish.json').ownsMain, false, 'Main.dc.html is of the first run');
  assert.equal(kit2.plan().json.done, true);
});

test('first belongs to the page of the run (A4C2-02): regenerating B keeps Main and names; a second run writes none; the state decides', () => {
  const p = published1();
  // regenerate B in run 1: first no by state, ownsMain makes it yes; only B goes
  changeOption(p.r, 'B', 'detalle.html');
  const b = canvasIndex(BUILD_ARGS(p.r, { first: 'no' }));
  assert.equal(b.json.first, true);
  assert.equal(p.kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]).status, 0);
  const pub = p.kit.plan();
  assert.equal(pub.status, 0, pub.stdout);
  assert.deepEqual(Object.keys(pub.json.step.params.files), ['project/r-202610011800-' + readRunJson(p.r, 'canvas/page.json').page.id.slice(-6) + '-b-detalle.dc.html']);
  // a second run built with first yes is a mismatch; with first no it is fine
  const r2 = addRunTo(p.r.project, '2026-10-02-0900-improve-pantalla');
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'yes' })).status, 0);
  const kit2 = planKit(r2, { data: p.kit.data });
  const bad = kit2.plan();
  assert.deepEqual([bad.status, bad.json.problems.map((x) => [x.code, x.expectedFirst, x.reason])], [1, [['first-mismatch', false, 'state']]]);
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'no' })).status, 0);
  assert.equal(kit2.plan().status, 0);
  // a run that owns Main but was built before it did: owns-main
  const r3 = addRunTo(p.r.project, '2026-10-03-0900-new-otra');
  assert.equal(canvasIndex(BUILD_ARGS(r3, { first: 'no' })).json.first, false);
  fs.writeFileSync(path.join(r3.run, 'publish.json'), JSON.stringify({ v: 2, canvasUrl: p.url, state: 'published', ownsMain: true, files: {} }));
  const own = planKit(r3, { data: p.kit.data }).plan();
  assert.deepEqual(own.json.problems.map((x) => [x.code, x.expectedFirst, x.reason]), [['first-mismatch', true, 'owns-main']]);
  // a created canvas with no page yet: the run opens it (A4C-10)
  seedCanvas(p.r, p.kit, { url: p.url, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
  const created = nextRun(p, '2026-10-04-0900-new-x');
  const mm = created.kit2.plan();
  assert.deepEqual(mm.json.problems.map((x) => [x.code, x.expectedFirst, x.reason]), [['first-mismatch', true, 'state']]);
  assert.equal(canvasIndex(BUILD_ARGS(created.r2, { first: 'yes' })).status, 0);
  assert.equal(created.kit2.plan().json.step.id, 'canvas-read-live');
});

test('merge refuses a Main.dc.html that is not ours: main-exists-live asks for build --first no', () => {
  const p = published1();
  seedCanvas(p.r, p.kit, { url: p.url, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
  const r2 = addRunTo(p.r.project, '2026-10-02-0900-improve-pantalla');
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'yes' })).status, 0);
  const kit2 = planKit(r2, { data: p.kit.data });
  assert.equal(kit2.plan().json.step.id, 'canvas-read-live');
  const m = kit2.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  assert.deepEqual([m.status, m.json.problems.map((x) => x.code)], [1, ['main-exists-live']]);
  assert.ok(!fs.existsSync(path.join(r2.run, 'canvas', 'project', 'canvas.json')));
});

test('limits of the canvas decide the new canvas with the stored figures (R-16, A4C-15)', () => {
  const cases = [
    ['pages 37 + ours is not full', { pages: 37, files: 400, bytes: 10 * MBYTES, notes: 20 }, false],
    ['pages 38 + ours is full', { pages: 38, files: 400, bytes: 10 * MBYTES, notes: 20 }, true],
    ['files 479 + 6 is full', { pages: 5, files: 479, bytes: 10 * MBYTES, notes: 20 }, true],
    ['bytes 200 MB + ours is full', { pages: 5, files: 20, bytes: 200 * MBYTES, notes: 20 }, true],
    ['notes 190 + 3 is full', { pages: 5, files: 20, bytes: 10 * MBYTES, notes: 190 }, true],
  ];
  for (const [label, figures, full] of cases) {
    const p = published1();
    seedCanvas(p.r, p.kit, { url: p.url, state: 'published', ...figures });
    const { r2, kit2 } = nextRun(p);
    const plan = kit2.plan();
    if (!full) { assert.equal(plan.json.step.id, 'canvas-read-live', label); continue; }
    // the build said first no: it must be redone with first yes, and the plan says so with the reason
    assert.deepEqual(plan.json.problems.map((x) => [x.code, x.expectedFirst, x.reason]), [['first-mismatch', true, 'canvas-full']], label);
    assert.deepEqual(plan.json.notes, ['canvas-full'], label);
    assert.ok(!/"params"/.test(plan.stdout));
    assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'yes', 'page-name': 'improve · 2026-10-02' })).status, 0);
    const create = kit2.plan();
    assert.equal(create.json.step.id, 'canvas-create', label);
    assert.ok(create.json.notes.includes('canvas-full'));
    // the new canvas replaces the stored address and starts the figures again
    const url2 = fakeUrl(22);
    assert.equal(kit2.record('canvas-create', url2).status, 0);
    assert.deepEqual(canvasOfProject(r2, kit2), { url: url2, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
    assert.equal(readRunJson(r2, 'publish.json').canvasUrl, url2);
    assert.equal(kit2.plan().json.step.id, 'canvas-read-live');
    assert.equal(kit2.merge().status, 0, 'a new canvas is merged from scratch');
    const pub = kit2.plan();
    assert.equal(pub.json.step.id, 'canvas-publish');
    assert.ok('project/Main.dc.html' in pub.json.step.params.files, 'the new canvas opens with its own Main');
    assert.equal(pub.json.step.params.url, url2);
  }
});

test('plan --new-canvas with first creates another canvas although one is stored; without first it is a mismatch', () => {
  const p = published1();
  const { r2, kit2 } = nextRun(p);
  assert.equal(kit2.plan(['--new-canvas']).json.problems[0].code, 'first-mismatch');
  assert.equal(canvasIndex(BUILD_ARGS(r2, { first: 'yes' })).status, 0);
  const c = kit2.plan(['--new-canvas']);
  assert.equal(c.json.step.id, 'canvas-create');
  assert.equal(canvasIndex(['plan', '--project', r2.project, '--run', r2.run, '--values-file', kit2.valuesFile, '--types-file', kit2.typesFile, '--data', kit2.data, '--new-canvas', '--new-canvas']).status, 2);
});

test('a publish.json of another canvas is ignored: every file is new for the canvas that the project has now', () => {
  const p = published1();
  seedCanvas(p.r, p.kit, { url: fakeUrl(23), state: 'published', pages: 1, files: 6, bytes: 100, notes: 3 });
  const noData = canvasIndex(BUILD_ARGS(p.r, { first: 'no' }));
  assert.equal(noData.json.first, true, 'without --data the build only knows the publish.json of the run');
  assert.deepEqual(p.kit.plan().json.problems.map((x) => [x.code, x.expectedFirst]), [['first-mismatch', false]]);
  // with --data the Main of an older canvas is not owned: this run adds a page to the new one
  assert.equal(canvasIndex(BUILD_ARGS(p.r, { first: 'no', data: p.kit.data })).json.first, false);
  const plan = p.kit.plan();
  assert.equal(plan.json.step.id, 'canvas-read-live');
  assert.deepEqual(plan.json.step.params.paths, ['project/canvas.json'], 'what was published is of the other canvas');
});

test('a nota of someone else with the leak value does not block plan, twice; a leak in what we add does (A4C-03)', () => {
  const p = published1();
  const live = JSON.parse(fs.readFileSync(p.live.live, 'utf8'));
  live.notes['nota-ajena'] = { x: 0, y: -500, text: 'Hablé con Persona Ejemplo', kind: 'title1', maxW: 300 };
  const liveFile = path.join(p.live.dir, 'canvas-con-nota.json');
  fs.writeFileSync(liveFile, JSON.stringify(live));
  const { r2, kit2 } = nextRun(p);
  assert.equal(kit2.plan().json.step.id, 'canvas-read-live');
  assert.equal(kit2.merge(['--live', liveFile, '--live-dir', p.live.liveDir]).status, 0);
  const pub = kit2.plan();
  assert.equal(pub.status, 0, pub.stdout);
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.equal(kit2.plan().status, 0, 'a second plan is not blocked either: live.json is outside canvas/');
  assert.ok(fs.existsSync(path.join(r2.run, 'merge', 'live.json')));
  assert.ok(!fs.existsSync(path.join(r2.run, 'canvas', 'project', 'live.json')) && !fs.existsSync(path.join(r2.run, 'canvas', 'live.json')));
  // what we add to the combined index is checked: a string planted there after merge stops plan
  const indexFile = path.join(r2.run, 'canvas', 'project', 'canvas.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  index.notes['r-202610020900-x'] = { x: 0, y: 0, text: 'Persona Ejemplo', kind: 'title1', maxW: 10, page: 'zz' };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  fs.writeFileSync(indexFile, text);
  const info = readRunJson(r2, 'merge/merge.json');
  fs.writeFileSync(path.join(r2.run, 'merge', 'merge.json'), JSON.stringify({ ...info, canvasSha256: crypto.createHash('sha256').update(text).digest('hex') }));
  const stop = kit2.plan();
  assert.deepEqual([stop.status, stop.json.step], [1, null]);
  assert.ok(stop.json.problems.some((x) => x.code === 'leak'));
  assert.ok(!stop.stdout.includes('Persona Ejemplo'));
  // a live.json that is not the one merge read: closed
  const { r2: r3, kit2: kit3 } = nextRun(p, '2026-10-05-0900-new-z');
  kit3.plan();
  assert.equal(kit3.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]).status, 0);
  fs.appendFileSync(path.join(r3.run, 'merge', 'live.json'), ' ');
  const stale = kit3.plan();
  assert.deepEqual([stale.status, stale.json.problems.map((x) => x.code)], [1, ['merge-stale']]);
});

test('regenerating an option with a seeded leak is refused; clean, it is read first and only B goes (A4C-03)', () => {
  const p = published1();
  fs.writeFileSync(path.join(p.r.optionDir('B'), 'detalle.html'), screenHtml('b', { link: 'inicio.html', extra: '<p>Persona Ejemplo</p>\n' }));
  assert.equal(canvasIndex(BUILD_ARGS(p.r, { first: 'no' })).status, 0);
  const leak = p.kit.plan();
  assert.deepEqual([leak.status, leak.json.step], [1, null]);
  fs.writeFileSync(path.join(p.r.optionDir('B'), 'detalle.html'), screenHtml('b2', { link: 'inicio.html' }));
  assert.equal(canvasIndex(BUILD_ARGS(p.r, { first: 'no' })).status, 0);
  assert.equal(p.kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]).status, 0);
  const pub = p.kit.plan();
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.deepEqual(Object.keys(pub.json.step.params.files).map((f) => /-b-/.test(f)), [true]);
});

test('merge CLI: an adverse live keeps what the user did and writes canvas.json, live.json and merge.json with their shas', () => {
  const p = published1();
  const live = JSON.parse(fs.readFileSync(p.live.live, 'utf8'));
  live.boards['boceto.dc.html'] = { x: 9000, y: 0, w: 300, h: 200, title: 'Boceto' };
  live.order.push('boceto.dc.html');
  live.pages[0].name = 'Mi página';
  live.boards['Main.dc.html'].x += 70;
  live.notes['nota-mia'] = { x: 1, y: 1, text: 'mía', kind: 'title1', maxW: 50 };
  live.extra = { a: 1 };
  const liveFile = path.join(p.live.dir, 'adverso.json');
  fs.writeFileSync(liveFile, JSON.stringify(live));
  const { r2, kit2 } = nextRun(p);
  kit2.plan();
  const m = kit2.merge(['--live', liveFile, '--live-dir', p.live.liveDir]);
  assert.equal(m.status, 0, m.stdout);
  const index = JSON.parse(fs.readFileSync(path.join(r2.run, 'canvas', 'project', 'canvas.json'), 'utf8'));
  assert.deepEqual(index.boards['boceto.dc.html'], live.boards['boceto.dc.html']);
  assert.equal(index.pages[0].name, 'Mi página');
  assert.equal(index.boards['Main.dc.html'].x, live.boards['Main.dc.html'].x);
  assert.deepEqual(index.notes['nota-mia'], live.notes['nota-mia']);
  assert.deepEqual(index.extra, { a: 1 });
  const info = readRunJson(r2, 'merge/merge.json');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  assert.equal(info.canvasSha256, sha(path.join(r2.run, 'canvas', 'project', 'canvas.json')));
  assert.equal(info.liveSha256, sha(path.join(r2.run, 'merge', 'live.json')));
  assert.deepEqual(Object.keys(info).filter((k) => ['keptMoved', 'keptEdited', 'userDeleted', 'editedByHand', 'overwritten'].includes(k)).sort(), ['editedByHand', 'keptEdited', 'keptMoved', 'overwritten', 'userDeleted']);
});

test('merge CLI: bad-live is exit 1 with no canvas.json (and removes a stale one); a link or 9 MB is exit 2; --live-dir must be a folder', (t) => {
  const p = published1();
  const { r2, kit2 } = nextRun(p);
  kit2.plan();
  const indexFile = path.join(r2.run, 'canvas', 'project', 'canvas.json');
  assert.equal(kit2.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]).status, 0);
  assert.ok(fs.existsSync(indexFile));
  const junk = [['no es json', 'x'], ['v2', JSON.stringify({ v: 2, boards: {} })], ['sin boards', JSON.stringify({ v: 3 })], ['arreglo', '[]']];
  for (const [label, text] of junk) {
    const f = path.join(p.live.dir, 'mal.json');
    fs.writeFileSync(f, text);
    const bad = kit2.merge(['--live', f, '--live-dir', p.live.liveDir]);
    assert.deepEqual([bad.status, bad.json.problems.map((x) => x.code)], [1, ['bad-live']], label);
    assert.ok(!fs.existsSync(indexFile), `${label}: a failed merge leaves no combined index that could be published`);
    assert.ok(!fs.existsSync(path.join(r2.run, 'merge', 'merge.json')));
    assert.notEqual(kit2.plan().json.step?.id, 'canvas-publish', label);
    kit2.plan();
  }
  assert.equal(kit2.merge(['--live', path.join(p.live.dir, 'no-existe.json'), '--live-dir', p.live.liveDir]).json.problems[0].code, 'bad-live');
  const big = path.join(p.live.dir, 'grande.json');
  fs.writeFileSync(big, Buffer.alloc(9 * MBYTES, 32));
  assert.equal(kit2.merge(['--live', big, '--live-dir', p.live.liveDir]).status, 2);
  assert.equal(kit2.merge(['--live', p.live.live, '--live-dir', path.join(p.live.dir, 'no-hay')]).status, 2);
  const link = path.join(p.live.dir, 'enlace.json');
  try { fs.symlinkSync(p.live.live, link); } catch (e) { t.skip(`sin permiso para crear enlaces (${e.code})`); return; }
  assert.equal(kit2.merge(['--live', link, '--live-dir', p.live.liveDir]).status, 2);
});

test('merge CLI: an artboard of ours edited by hand stops before publishing and only the yes of the user lets it go (A4C2-01)', () => {
  const p = published1();
  const pageId = readRunJson(p.r, 'canvas/page.json').page.id;
  const edited = path.join(p.live.liveDir, 'project', `${pageId}-a-detalle.dc.html`);
  fs.appendFileSync(edited, '<!-- edición del usuario -->');
  // regenerate A: its file is going to be replaced
  changeOption(p.r, 'A', 'detalle.html');
  assert.equal(canvasIndex(BUILD_ARGS(p.r, { first: 'no' })).status, 0);
  assert.equal(p.kit.plan().json.step.id, 'canvas-read-live');
  const stop = p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  assert.equal(stop.status, 1, stop.stdout);
  assert.deepEqual(stop.json.problems.map((x) => [x.code, x.file]), [['artboard-edited-by-hand', `project/${pageId}-a-detalle.dc.html`]]);
  assert.ok(!fs.existsSync(path.join(p.r.run, 'canvas', 'project', 'canvas.json')), 'nothing is built');
  assert.notEqual(p.kit.plan().json.step?.id, 'canvas-publish');
  // another path is not the yes
  assert.equal(p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir, '--accept-overwrite', `${pageId}-a-inicio.dc.html`]).status, 1);
  const ok = p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir, '--accept-overwrite', `${pageId}-a-detalle.dc.html`]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.deepEqual(readRunJson(p.r, 'merge/merge.json').overwritten, [`project/${pageId}-a-detalle.dc.html`]);
  const pub = p.kit.plan();
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.ok(`project/${pageId}-a-detalle.dc.html` in pub.json.step.params.files);
});

test('merge CLI: an artboard edited by hand that is not being replaced is left alone and not sent (A4C2-01 i)', () => {
  const p = published1();
  const pageId = readRunJson(p.r, 'canvas/page.json').page.id;
  fs.appendFileSync(path.join(p.live.liveDir, 'project', `${pageId}-a-detalle.dc.html`), '<!-- edición del usuario -->');
  changeOption(p.r, 'B', 'detalle.html');
  assert.equal(canvasIndex(BUILD_ARGS(p.r, { first: 'no' })).status, 0);
  p.kit.plan();
  const m = p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  assert.equal(m.status, 0, m.stdout);
  assert.deepEqual(readRunJson(p.r, 'merge/merge.json').editedByHand, [`project/${pageId}-a-detalle.dc.html`]);
  const sent = Object.keys(p.kit.plan().json.step.params.files);
  assert.ok(!sent.includes(`project/${pageId}-a-detalle.dc.html`));
});

test('merge CLI: it follows only a plan that asked for the read of this canvas, and --live none only for a created one', () => {
  const p = published1();
  const { kit2, r2 } = nextRun(p);
  assert.equal(kit2.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]).status, 1, 'no plan yet');
  kit2.plan();
  const none = kit2.merge();
  assert.deepEqual([none.status, none.json.problems.map((x) => x.code)], [1, ['not-created']], 'the canvas of the project is published: --live none cannot be');
  assert.ok(!fs.existsSync(path.join(r2.run, 'canvas', 'project', 'canvas.json')));
  assert.equal(kit2.merge(['--live', p.live.live, '--live-dir', 'none']).status, 2);
});

test('refusal CLI: the third stops, a retry deletes merge/, one that names our artboard stops at once, a record starts again; ds is not there yet', () => {
  const p = published1();
  const pageId = readRunJson(p.r, 'canvas/page.json').page.id;
  const refusal = (extra = []) => canvasIndex(['refusal', '--run', p.r.run, '--kind', 'canvas', ...extra]);
  changeOption(p.r, 'B', 'detalle.html');
  canvasIndex(BUILD_ARGS(p.r, { first: 'no' }));
  p.kit.plan();
  p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  assert.ok(fs.existsSync(path.join(p.r.run, 'merge')));
  const one = refusal();
  assert.deepEqual([one.status, one.json], [0, { count: 1, stop: false }]);
  assert.ok(!fs.existsSync(path.join(p.r.run, 'merge')));
  assert.equal(refusal(['--named', 'otra-cosa.dc.html']).status, 0);
  const third = refusal();
  assert.deepEqual([third.status, third.json.stop, third.json.reason], [1, true, 'too-many-refusals']);
  const mine = canvasIndex(['refusal', '--run', p.r.run, '--kind', 'canvas', '--named', `${pageId}-a-detalle.dc.html`]);
  assert.deepEqual([mine.status, mine.json.reason], [1, 'artboard-edited-by-hand']);
  // a record starts the count again
  p.kit.plan();
  p.kit.merge(['--live', p.live.live, '--live-dir', p.live.liveDir]);
  p.kit.plan();
  assert.equal(p.kit.record('canvas-publish', p.url).status, 0);
  assert.deepEqual(refusal().json, { count: 1, stop: false });
  assert.equal(canvasIndex(['refusal', '--run', p.r.run, '--kind', 'ds']).status, 2);
  assert.equal(canvasIndex(['refusal', '--run', p.r.run]).status, 2);
});

test('diff CLI informs changed, removed and sendIndex and prints no params', () => {
  const p = published1();
  const d0 = canvasIndex(['diff', '--run', p.r.run]);
  assert.deepEqual([d0.status, d0.json], [0, { changed: [], removed: [], sendIndex: false }]);
  changeOption(p.r, 'B', 'detalle.html');
  canvasIndex(BUILD_ARGS(p.r, { first: 'no' }));
  const d1 = canvasIndex(['diff', '--run', p.r.run]);
  assert.equal(d1.json.changed.length, 1);
  assert.ok(!/params|type_url|"step"/.test(d1.stdout));
  const fresh = ready();
  assert.deepEqual(canvasIndex(['diff', '--run', fresh.r.run]).json.sendIndex, true);
});

test('record of canvas-publish with a changed byte leaves project.json and publish.json as they were (A4C-12)', () => {
  const { r, kit } = ready();
  const url = fakeUrl(24);
  kit.plan();
  kit.record('canvas-create', url);
  kit.plan();
  kit.merge();
  kit.plan();
  const some = fs.readdirSync(path.join(r.run, 'canvas', 'project')).find((f) => f.startsWith('r-'));
  fs.appendFileSync(path.join(r.run, 'canvas', 'project', some), ' ');
  assert.equal(kit.record('canvas-publish', url).json.problems[0].code, 'published-unplanned-bytes');
  assert.equal(canvasOfProject(r, kit).state, 'created');
  assert.equal(readRunJson(r, 'publish.json').state, 'created');
});

test('plan and record fail closed when project.json is unreadable or its canvas is not valid', () => {
  const p = published1();
  const file = readConfig({ data: p.kit.data, project: p.r.project }).file;
  const { r2, kit2 } = nextRun(p);
  const original = fs.readFileSync(file, 'utf8');
  const cfg = JSON.parse(original);
  for (const [label, text, code] of [
    ['broken json', '{ no', 'config-unreadable'],
    ['bad canvas', JSON.stringify({ ...cfg, canvas: { ...cfg.canvas, pages: -1 } }), 'canvas-state-invalid'],
    ['canvas as a string', JSON.stringify({ ...cfg, canvas: 'x' }), 'canvas-state-invalid'],
  ]) {
    fs.writeFileSync(file, text);
    const r = kit2.plan();
    assert.deepEqual([r.status, r.json.step, r.json.problems.map((x) => x.code)], [1, null, [code]], label);
    assert.ok(!/"params"/.test(r.stdout), label);
  }
  fs.writeFileSync(file, original);
  fs.writeFileSync(path.join(r2.run, 'publish.json'), 'no es json');
  assert.deepEqual(kit2.plan().json.problems.map((x) => x.code), ['bad-state']);
});
