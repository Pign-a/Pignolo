// Hito 4c, stage 1, without network and without a model: the real scripts over temporary git repositories,
// the Artifact calls simulated with synthetic addresses (nothing is published here).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FIXTURES, PLUGIN_ROOT, makeTempDir, runScript } from './helpers.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { fakeUrl, TYPE_URL } from './support/canvas-plan.mjs';
import { readReference } from './support/skill-checks.mjs';

const FONT_HEAD = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">\n';
const SCREENS = ['inicio.html', 'detalle.html'];
const run = (args, opts) => runScript('run.mjs', args, opts);
const gitStatus = (project) => spawnSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }).stdout;

// the project of a whole flow: a git repository with a committed README, three options, option A asking for fonts
function flow({ options = ['A', 'B', 'C'] } = {}) {
  const r = makeRun({ git: true, options });
  fs.writeFileSync(path.join(r.project, 'README.md'), 'x\n');
  spawnSync('git', ['add', '-A'], { cwd: r.project });
  spawnSync('git', ['commit', '-qm', 'x'], { cwd: r.project });
  fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), screenHtml('A inicio', { link: 'detalle.html', head: FONT_HEAD }));
  const dir = makeTempDir();
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  const out = [];
  const seen = (res) => { out.push(res.stdout); return res; };
  const k = {
    r, data, out,
    values: path.join(r.run, 'leak-values.json'),
    types: path.join(r.run, 'types.json'),
    gate: (extra = []) => seen(run(['publish-gate', '--data', data, '--project', r.project, '--presentation', 'auto', '--run', r.run, ...extra])),
    present: (extra = []) => seen(run(['present', '--data', data, '--project', r.project, '--presentation', 'auto', '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes', '--run', r.run, ...extra])),
    check: (letter, destination = 'canvas') => {
      const before = path.join(r.run, `git-before-${letter}.txt`);
      assert.equal(run(['git-state', '--project', r.project, '--out', before]).status, 0);
      return seen(run(['options-check', '--project', r.project, '--run', r.run, '--option', letter, '--destination', destination, '--expected', SCREENS.join(','), '--git-before', before]));
    },
    leakValues: () => seen(run(['leak-values', '--project', r.project, '--out', k.values, '--email', 'cuenta@ejemplo.test'])),
    build: (extra = {}) => seen(canvasIndex(BUILD_ARGS(r, { options: options.join(','), platform: 'both', ...extra }))),
    verify: () => seen(canvasIndex(['verify', '--run', r.run])),
    plan: () => seen(canvasIndex(['plan', '--project', r.project, '--run', r.run, '--values-file', k.values, '--types-file', k.types, '--data', data])),
    record: (step, url) => seen(canvasIndex(['record', '--run', r.run, '--step', step, '--url', url, '--data', data, '--project', r.project])),
    merge: () => seen(canvasIndex(['merge', '--run', r.run, '--live', 'none', '--live-dir', 'none'])),
  };
  fs.writeFileSync(k.types, JSON.stringify({ design: TYPE_URL }));
  return k;
}

test('run 1 (new project): gate, present, checks, leak values, build, verify and the plan loop to done; regenerating B opens a NEW canvas', () => {
  const k = flow();
  assert.equal(k.gate().status, 0);
  const present = k.present();
  assert.deepEqual([present.json.mode, present.json.destination], ['canvas', 'canvas']);
  for (const letter of ['A', 'B', 'C']) assert.equal(k.check(letter).status, 0, letter);
  const lv = k.leakValues();
  assert.equal(lv.status, 0);
  assert.equal(lv.json.origins.git, 'ok');
  const b = k.build();
  assert.equal(b.status, 0, b.stdout.slice(0, 400));
  assert.equal(b.json.count, 12, '3 options x 2 screens x 2 widths');
  assert.equal(k.verify().status, 0);
  const url = fakeUrl(11);
  assert.equal(k.plan().json.step.id, 'canvas-create');
  assert.equal(k.record('canvas-create', url).status, 0);
  assert.equal(k.plan().json.step.id, 'canvas-read-live');
  assert.equal(k.merge().status, 0);
  assert.equal(k.plan().json.step.id, 'canvas-publish');
  assert.equal(k.record('canvas-publish', url).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(k.r.run, 'publish.json'), 'utf8')).state, 'published');
  assert.equal(k.plan().json.done, true);
  // regenerate B
  assert.equal(run(['discard', '--run', k.r.run, '--option', 'B']).status, 0);
  fs.mkdirSync(k.r.optionDir('B'));
  SCREENS.forEach((f, i) => fs.writeFileSync(path.join(k.r.optionDir('B'), f), screenHtml('B nuevo', { link: SCREENS[(i + 1) % 2] })));
  assert.equal(k.build().status, 0);
  const again = k.plan();
  assert.equal(again.json.step.id, 'canvas-create', 'a NEW canvas, never a canvas-publish straight on the old one');
  assert.equal(gitStatus(k.r.project), '', 'everything lives under .pignolo-ui/');
});

test('opt-out: publish: never or <run>/no-publish give local at present and plan exit 1, and no printed JSON carries params; presentation is not a project key', () => {
  const k = flow();
  assert.equal(run(['config', 'set', '--data', k.data, '--project', k.r.project, '--key', 'publish', '--value', 'never']).status, 0);
  const present = k.present();
  assert.deepEqual([present.json.mode, present.json.reasons, 'notice' in present.json], ['local', ['project-opt-out'], false]);
  k.build();
  k.leakValues();
  const p = k.plan();
  assert.deepEqual([p.status, p.json.problems.map((x) => x.code), p.json.step], [1, ['project-opt-out'], null]);
  assert.equal(k.gate().status, 1);
  const k2 = flow();
  assert.equal(run(['no-publish', '--run', k2.r.run]).status, 0);
  assert.equal(k2.present().json.mode, 'local');
  k2.build();
  k2.leakValues();
  assert.deepEqual(k2.plan().json.problems.map((x) => x.code), ['run-opt-out']);
  for (const text of [...k.out, ...k2.out]) assert.ok(!/"params"/.test(text), 'no params in any output of an opted-out flow');
  assert.equal(run(['config', 'set', '--data', k.data, '--project', k.r.project, '--key', 'presentation', '--value', 'local']).status, 2);
});

test('a leak seeded on the regeneration path stops plan; a project folder named like the git user still gives the title Proyecto', () => {
  const k = flow();
  k.leakValues();
  k.build();
  const url = fakeUrl(12);
  k.plan(); k.record('canvas-create', url); k.merge(); k.plan(); k.record('canvas-publish', url);
  // seed the git user name (Persona Ejemplo) in option B and regenerate
  run(['discard', '--run', k.r.run, '--option', 'B']);
  fs.mkdirSync(k.r.optionDir('B'));
  SCREENS.forEach((f, i) => fs.writeFileSync(path.join(k.r.optionDir('B'), f), screenHtml('B', { link: SCREENS[(i + 1) % 2], extra: '<p>Persona Ejemplo</p>\n' })));
  assert.equal(k.build().status, 0);
  const p = k.plan();
  assert.deepEqual([p.status, p.json.step], [1, null]);
  assert.ok(p.json.problems.some((x) => x.code === 'leak'));
  // a folder named like the user: the title is Proyecto
  const named = makeRun({ git: true, projectName: 'persona-ejemplo' });
  assert.equal(canvasIndex(BUILD_ARGS(named)).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(named.run, 'canvas', 'page.json'), 'utf8')).canvasTitle, 'Proyecto');
});

test('fallback to local: without the tool, with presentation local or after a stopped plan, compare.html asks for no font host and git stays clean', () => {
  const k = flow();
  const noTool = run(['present', '--data', k.data, '--project', k.r.project, '--presentation', 'auto', '--kind', 'option', '--artifact', 'no', '--design-type', 'no', '--run', k.r.run]);
  assert.deepEqual([noTool.json.mode, 'notice' in noTool.json], ['local', false]);
  const localSetting = run(['present', '--data', k.data, '--project', k.r.project, '--presentation', 'local', '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes', '--run', k.r.run]);
  assert.equal(localSetting.json.mode, 'local');
  const read = () => {
    const html = fs.readFileSync(path.join(k.r.run, 'compare.html'), 'utf8');
    const srcs = [...html.matchAll(/<iframe src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(srcs.length >= 6);
    for (const src of srcs) {
      assert.ok(src.startsWith('local/'), src);
      const text = fs.readFileSync(path.join(k.r.run, ...src.split('/')), 'utf8');
      assert.ok(!text.includes('fonts.googleapis.com') && !text.includes('fonts.gstatic.com'), src);
    }
  };
  const c = run(['compare-html', '--run', k.r.run, '--platform', 'both', '--screens', SCREENS.join(','), '--no-open']);
  assert.equal(c.status, 0, c.stderr);
  read();
  // the canvas path with fonts that falls to local because a leak was seeded: compare-html still works and still opens only copies
  fs.writeFileSync(path.join(k.r.optionDir('C'), 'detalle.html'), screenHtml('C', { link: 'inicio.html', extra: '<p>Persona Ejemplo</p>\n' }));
  k.leakValues();
  assert.equal(k.build().status, 0);
  assert.equal(k.plan().status, 1);
  assert.equal(run(['compare-html', '--run', k.r.run, '--platform', 'both', '--screens', SCREENS.join(','), '--no-open']).status, 0);
  read();
  assert.ok(fs.readFileSync(path.join(k.r.optionDir('A'), 'inicio.html'), 'utf8').includes('fonts.googleapis.com'), 'the original keeps its fonts for the canvas');
  assert.equal(gitStatus(k.r.project), '');
});

test('approving an option that asked for fonts: saved without the links, verify passes and the skill says the family was used only in the canvas (A4C2-04, D-4c-17)', () => {
  const k = flow({ options: ['A'] });
  fs.writeFileSync(path.join(k.r.project, 'DESIGN.md'), fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8'));
  k.leakValues();
  const save = runScript('approve.mjs', ['save', '--project', k.r.project, '--flow', 'cuenta', '--from', k.r.optionDir('A'), '--values-file', k.values, '--date', '2026-10-01']);
  assert.equal(save.status, 0, save.stdout + save.stderr);
  assert.equal(save.json.fontsRemoved, 3);
  const dir = path.join(k.r.project, save.json.path);
  for (const f of fs.readdirSync(dir)) assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes('fonts.g'), f);
  const quote = path.join(k.r.run, 'choice.txt');
  fs.writeFileSync(quote, 'Elijo la A');
  assert.equal(runScript('approve.mjs', ['record', '--project', k.r.project, '--path', save.json.path, '--quote-file', quote, '--write', '--date', '2026-10-01']).status, 0);
  assert.equal(runScript('approve.mjs', ['verify', '--project', k.r.project, '--path', save.json.path]).status, 0);
  assert.ok(readReference('present-and-choose.md').includes('solo en el lienzo'));
});

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files(full, out); else out.push(full);
  }
  return out;
}

test('no versioned file of the plugin carries a real artifact link or an absolute path of a user', () => {
  for (const f of files(PLUGIN_ROOT)) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]{8,}/.test(text), `${path.relative(PLUGIN_ROOT, f)} carries an artifact link`);
    if (!f.includes(`${path.sep}tests${path.sep}`)) assert.ok(!/(?<![A-Za-z])[A-Za-z]:[\\/]Users[\\/]|\/Users\/[A-Za-z]|\/home\/[A-Za-z]/.test(text), `${path.relative(PLUGIN_ROOT, f)} carries a user path`);
  }
});

test('version 0.7.1: plugin.json and a CHANGELOG entry that says what comes and what is left for the next stages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.version, '0.7.1');
  const changelog = fs.readFileSync(path.join(PLUGIN_ROOT, 'CHANGELOG.md'), 'utf8');
  const entry = changelog.slice(changelog.indexOf('## 0.7.0'), changelog.indexOf('## 0.6.2'));
  assert.ok(entry.length > 500);
  for (const needle of ['lienzo', 'dos publicaciones y una lectura', 'canvas-index', 'config set --key publish --value never', 'presentation = local', 'ilegible', 'Google Fonts', 'compare.html', 'falla cerrado', 'Design System', 'comentarios', 'explorar']) {
    assert.ok(entry.toLowerCase().includes(needle.toLowerCase()), needle);
  }
  assert.ok(!entry.includes('--allow-few-values') || /sin `--allow-few-values`/.test(entry), 'the option is gone');
  assert.ok(!/description.*nunca se publica/.test(manifest.userConfig.presentation.description));
});
