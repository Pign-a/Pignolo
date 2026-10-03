import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeTempDir, runScript } from './helpers.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl, TYPE_URL, LEAK_VALUES, walkJson } from './support/canvas-plan.mjs';
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
  assert.deepEqual([kit.canvas().state, kit.canvas().pages, kit.canvas().files, kit.canvas().notes], ['published', 1, 6, 3]);
  assert.equal(kit.published().ownsMain, true);
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

test('regenerating an option after publishing: with a seeded leak plan refuses; without it, read-live and then publish with only the files of B on the SAME canvas (A4C-03)', () => {
  const { r, kit } = ready();
  const url = fakeUrl(2);
  kit.plan();
  kit.record('canvas-create', url);
  kit.merge();
  kit.plan();
  kit.record('canvas-publish', url);
  assert.equal(kit.plan().json.done, true);
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, fs.readFileSync(path.join(r.run, 'canvas', 'project', 'canvas.json')));
  const liveDir = path.join(kit.dir, 'live-files');
  fs.cpSync(path.join(r.run, 'canvas', 'project'), path.join(liveDir, 'project'), { recursive: true });
  // regenerate B with a leak
  assert.equal(runScript('run.mjs', ['discard', '--run', r.run, '--option', 'B']).status, 0);
  fs.mkdirSync(r.optionDir('B'), { recursive: true });
  for (const f of ['inicio.html', 'detalle.html']) fs.writeFileSync(path.join(r.optionDir('B'), f), screenHtml('b', { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html', extra: '<p>Persona Ejemplo</p>' + String.fromCharCode(10) }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const leaked = kit.plan();
  assert.deepEqual([leaked.status, leaked.json.step], [1, null]);
  // regenerate again, clean: never a canvas-publish before reading the live canvas
  for (const f of ['inicio.html', 'detalle.html']) fs.writeFileSync(path.join(r.optionDir('B'), f), screenHtml('b2', { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html' }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const again = kit.plan();
  assert.equal(stepOf(again).id, 'canvas-read-live');
  assert.equal(stepOf(again).params.url, url);
  assert.ok(stepOf(again).params.paths.includes('project/canvas.json'));
  const merged = kit.merge(['--live', live, '--live-dir', liveDir]);
  assert.equal(merged.status, 0, merged.stdout);
  const pub = kit.plan();
  assert.equal(stepOf(pub).id, 'canvas-publish');
  assert.equal(stepOf(pub).params.url, url);
  assert.ok(!('type_url' in stepOf(pub).params), 'the same canvas: no type_url');
  const sent = Object.keys(stepOf(pub).params.files).sort();
  assert.equal(sent.length, 2);
  assert.ok(sent.every((f) => f.startsWith('project/r-') && f.includes('-b-')), sent.join());
  assert.equal(kit.record('canvas-publish', url).status, 0);
  assert.equal(kit.canvas().url, url);
  assert.equal(kit.canvas().pages, 1, 'regenerating does not add a page');
});

test('resumption: a created canvas in a new session goes on at read-live with first true; build --first no is first-mismatch (state); unchanged published is done', () => {
  const { r, kit } = ready();
  kit.plan();
  kit.record('canvas-create', fakeUrl(4));
  assert.deepEqual([kit.canvas().state, kit.canvas().url, kit.published().canvasUrl], ['created', fakeUrl(4), fakeUrl(4)]);
  assert.equal(kit.canvas().pages, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  kit.merge();
  const pub = kit.plan();
  assert.equal(pub.json.step.id, 'canvas-publish');
  assert.ok('project/Main.dc.html' in pub.json.step.params.files, 'first: true keeps Main.dc.html');
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 0);
  const mismatch = kit.plan();
  assert.equal(mismatch.status, 1);
  assert.deepEqual(mismatch.json.problems.map((p) => [p.code, p.expectedFirst, p.reason]), [['first-mismatch', true, 'state']]);
});

test('the bytes are tied to the plan: a byte changed after plan is published-unplanned-bytes and the state stays (A4C-12)', () => {
  const { r, kit } = ready();
  kit.plan();
  kit.record('canvas-create', fakeUrl(5));
  kit.merge();
  kit.plan();
  const some = fs.readdirSync(path.join(r.run, 'canvas', 'project')).find((f) => f.startsWith('r-'));
  fs.appendFileSync(path.join(r.run, 'canvas', 'project', some), ' ');
  const bad = kit.record('canvas-publish', fakeUrl(5));
  assert.equal(bad.status, 1);
  assert.equal(bad.json.problems[0].code, 'published-unplanned-bytes');
  assert.equal(kit.canvas().state, 'created');
  assert.equal(kit.canvas().pages, 0, 'nothing is counted for a publication that was not planned');
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

test('CLI merge: --live none writes canvas.json and merge.json and needs a created canvas; --live-dir is required; unknown options are exit 2', () => {
  const { r, kit } = ready();
  assert.equal(kit.merge().status, 1, 'no canvas registered yet');
  kit.plan();
  kit.record('canvas-create', fakeUrl(8));
  const m = kit.merge();
  assert.equal(m.status, 0, m.stdout);
  const index = readCanvasJson(r, 'project/canvas.json');
  assert.deepEqual([index.v, index.launch.view, index.pages.length], [3, 'canvas', 1]);
  const info = JSON.parse(fs.readFileSync(path.join(r.run, 'merge', 'merge.json'), 'utf8'));
  assert.equal(typeof info.canvasSha256, 'string');
  assert.equal(info.liveSha256, null);
  assert.equal(kit.merge(['--live', 'none']).status, 2, '--live-dir is required');
  assert.equal(kit.merge(['--live', 'none', '--live-dir', 'none', '--nope', 'x']).status, 2);
  assert.equal(kit.merge(['--live', path.join(kit.dir, 'no-existe.json'), '--live-dir', 'none']).status, 2, 'a live file that does not exist');
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
