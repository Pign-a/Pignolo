import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { makeTempDir, writeTree } from './helpers.mjs';
import { makeRun, BUILD_ARGS, canvasIndex, screenHtml } from './support/canvas-run.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

test('build: manifest with the real sha256, page.json with the page and the title, verify ok', () => {
  const r = makeRun();
  const b = canvasIndex(BUILD_ARGS(r));
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.equal(b.json.count, 6);
  assert.match(b.json.pageId, /^r-202610011800-[0-9a-f]{6}$/);
  const dir = path.join(r.run, 'canvas');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.first, true);
  for (const f of manifest.files) assert.equal(f.sha256, sha(fs.readFileSync(path.join(dir, f.path))), f.path);
  assert.ok(manifest.files.some((f) => f.path === 'project/Main.dc.html'));
  const page = JSON.parse(fs.readFileSync(path.join(dir, 'page.json'), 'utf8'));
  assert.equal(page.page.id, b.json.pageId);
  assert.equal(page.canvasTitle, 'Proyecto');
  assert.equal(page.page.name, 'new · 2026-10-01');
  assert.ok(!fs.existsSync(path.join(dir, 'project', 'canvas.json')), 'the merged index is merge\'s job');
  const v = canvasIndex(['verify', '--run', r.run]);
  assert.equal(v.status, 0, v.stdout);
  assert.equal(v.json.ok, true);
});

test('build: the title is the name of DESIGN.md or "Proyecto", never the project folder (A4C-03)', () => {
  const user = os.userInfo().username;
  const r = makeRun({ projectName: user.length >= 3 ? user : 'carpeta-con-usuario' });
  const b = canvasIndex(BUILD_ARGS(r));
  assert.equal(b.status, 0, b.stderr);
  const page = JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'page.json'), 'utf8'));
  assert.equal(page.canvasTitle, 'Proyecto');
  assert.ok(!JSON.stringify(page).includes(path.basename(r.project)));
  const design = path.join(r.project, 'DESIGN.md');
  fs.writeFileSync(design, '---\nversion: alpha\nname: Cuenta de ahorro\n---\n\n# Cuenta\n');
  canvasIndex(BUILD_ARGS(r, { design }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'page.json'), 'utf8')).canvasTitle, 'Cuenta de ahorro');
  fs.writeFileSync(design, '---\nversion: alpha\nname: Project name\n---\n');
  canvasIndex(BUILD_ARGS(r, { design }));
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'page.json'), 'utf8')).canvasTitle, 'Proyecto');
});

test('build: a <script> in a screen is exit 1, lists the file and the code, and leaves no canvas/', () => {
  const r = makeRun();
  fs.appendFileSync(path.join(r.optionDir('B'), 'detalle.html'), '<script>alert(1)</script>');
  const b = canvasIndex(BUILD_ARGS(r));
  assert.equal(b.status, 1, b.stdout);
  assert.ok(b.json.problems.some((p) => p.file.includes('option-B') && p.code));
  assert.ok(!fs.existsSync(path.join(r.run, 'canvas')));
});

test('build: a failed rebuild removes the stale canvas, so it cannot be published', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('x', { extra: '<p>{{mal}}</p>' }));
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 1);
  assert.ok(!fs.existsSync(path.join(r.run, 'canvas')));
});

test('build: usage errors are exit 2 (missing option or screen, bad platform, --page-id, unknown option, run outside the runs folder, run without a date stamp)', () => {
  const r = makeRun();
  const run = (extra) => canvasIndex(BUILD_ARGS(r, extra));
  assert.equal(run({ options: 'A,D' }).status, 2);
  assert.equal(run({ screens: 'inicio.html,nada.html' }).status, 2);
  assert.equal(run({ platform: 'tablet' }).status, 2);
  assert.equal(run({ 'page-id': 'x' }).status, 2);
  assert.equal(run({ foo: 'x' }).status, 2);
  assert.equal(run({ screens: `inicio.html,${'x'.repeat(40)}.html` }).status, 2);
  assert.equal(run({ first: 'maybe' }).status, 2);
  const outside = makeTempDir();
  assert.equal(canvasIndex(['build', ...BUILD_ARGS(r).slice(1).map((v) => (v === r.run ? outside : v))]).status, 2);
  const nostamp = makeRun({ runId: 'sin-sello-de-fecha' });
  assert.equal(canvasIndex(BUILD_ARGS(nostamp)).status, 2);
});

test('build: it deletes a previous <run>/merge/ (what was merged is no longer current)', () => {
  const r = makeRun();
  writeTree(r.run, { 'merge/merge.json': '{}' });
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  assert.ok(!fs.existsSync(path.join(r.run, 'merge')));
});

test('build: two runs with the same --now leave manifest.json and page.json byte for byte equal', () => {
  const r = makeRun();
  canvasIndex(BUILD_ARGS(r));
  const read = () => ['manifest.json', 'page.json'].map((f) => fs.readFileSync(path.join(r.run, 'canvas', f), 'utf8'));
  const first = read();
  canvasIndex(BUILD_ARGS(r));
  assert.deepEqual(read(), first);
});

test('build: --heights makes the frame as tall as measured, within the clamp', () => {
  const r = makeRun();
  const heights = path.join(makeTempDir(), 'h.json');
  fs.writeFileSync(heights, JSON.stringify({ 'A/inicio.html@1440': 2310 }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { heights })).status, 0);
  const page = JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'page.json'), 'utf8'));
  assert.equal(page.boards['Main.dc.html'].h, 2310);
});

test('build: font links of an option are moved into the artboard <helmet>; the option folder keeps them', () => {
  const r = makeRun({ options: ['A'] });
  const head = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap">\n';
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('A inicio', { link: 'detalle.html', head }));
  const b = canvasIndex(BUILD_ARGS(r, { options: 'A' }));
  assert.equal(b.status, 0, b.stdout);
  assert.ok(fs.readFileSync(path.join(r.run, 'canvas', 'project', 'Main.dc.html'), 'utf8').includes('<helmet><link rel="preconnect"'));
  assert.ok(fs.readFileSync(path.join(r.optionDir('A'), 'inicio.html'), 'utf8').includes('fonts.googleapis.com'));
});

test('verify: ok on what was just built, exit 1 after a byte is altered, exit 1 without a canvas', () => {
  const r = makeRun();
  assert.equal(canvasIndex(['verify', '--run', r.run]).status, 1);
  canvasIndex(BUILD_ARGS(r));
  assert.equal(canvasIndex(['verify', '--run', r.run]).status, 0);
  fs.appendFileSync(path.join(r.run, 'canvas', 'project', 'Main.dc.html'), ' ');
  const v = canvasIndex(['verify', '--run', r.run]);
  assert.equal(v.status, 1);
  assert.ok(v.json.problems.some((p) => p.code === 'manifest-mismatch'));
});

test('build refuses a run folder that is a link (no writes through it)', (t) => {
  const r = makeRun();
  const target = makeTempDir();
  const link = path.join(r.project, '.pignolo-ui', 'runs', '2026-10-01-1900-new-enlace');
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`sin permiso para crear enlaces (${e.code})`); return; }
  const b = canvasIndex(['build', ...BUILD_ARGS(r).slice(1).map((v) => (v === r.run ? link : v))]);
  assert.equal(b.status, 2);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('build: first is the effective one, --first yes or ownsMain of publish.json; the manifest keeps it and build prints it (T2b, A4C2-02)', () => {
  const r = makeRun();
  const paths = () => JSON.parse(fs.readFileSync(path.join(r.run, 'canvas', 'manifest.json'), 'utf8'));
  const b1 = canvasIndex(BUILD_ARGS(r, { first: 'yes' }));
  assert.equal(b1.status, 0, b1.stdout);
  assert.equal(b1.json.first, true);
  const firstPaths = paths().files.map((f) => f.path);
  assert.ok(firstPaths.includes('project/Main.dc.html'));
  // the run published its Main.dc.html (record writes ownsMain) and the state now says "published": --first no
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ v: 2, state: 'published', ownsMain: true }));
  const b2 = canvasIndex(BUILD_ARGS(r, { first: 'no' }));
  assert.equal(b2.status, 0, b2.stdout);
  assert.equal(b2.json.first, true);
  assert.equal(paths().first, true);
  assert.deepEqual(paths().files.map((f) => f.path), firstPaths, 'no name changes when regenerating');
  // another run (no ownsMain) and --first no: no Main.dc.html at all
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ v: 2, state: 'published', ownsMain: false }));
  const b3 = canvasIndex(BUILD_ARGS(r, { first: 'no' }));
  assert.equal(b3.json.first, false);
  assert.ok(!paths().files.some((f) => f.path === 'project/Main.dc.html'));
  // with --canvas-url (the canvas that project.json registers) a publish.json of another canvas does not count
  const url = ['https://claude.ai', 'artifact', 'aaaa1111-bbbb-4ccc-8ddd-000000000009'].join('/');
  fs.writeFileSync(path.join(r.run, 'publish.json'), JSON.stringify({ v: 2, canvasUrl: url, ownsMain: true }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no', 'canvas-url': url })).json.first, true);
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no', 'canvas-url': `${url}9` })).json.first, false);
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no', 'canvas-url': 'https://example.com/artifact/aaaa' })).status, 2);
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no', 'canvas-url': `${url}?x=1` })).status, 2);
  // a publish.json that cannot be read does not silently mean "not mine": exit 2
  fs.writeFileSync(path.join(r.run, 'publish.json'), '{ no es json');
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'no' })).status, 2);
});
