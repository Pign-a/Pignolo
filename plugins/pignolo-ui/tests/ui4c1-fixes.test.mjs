// Pasada de arreglos de la revisión final de la etapa 1 (hito 4c, pignolo-ui 0.7.1): cada caso falla sin su arreglo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { makeTempDir, runScript, BROWSER_SKIP, browserPath, leftoverProcesses, PLUGIN_ROOT } from './helpers.mjs';
import { makeRun, screenHtml, BUILD_ARGS, canvasIndex, RUN_ID } from './support/canvas-run.mjs';
import { planKit, fakeUrl, LEAK_VALUES } from './support/canvas-plan.mjs';
import { readSkill } from './support/skill-checks.mjs';
import { screenProblems } from '../lib/approved.mjs';
import { toArtboard, CanvasError } from '../lib/canvas.mjs';
import { scanMarkup } from '../lib/canvas-html.mjs';
import { scanBytes } from '../lib/leak-scan.mjs';
import { verifyCanvas, layoutSha256, buildCanvas } from '../lib/canvas-layout.mjs';
import { linkProblem } from '../lib/link-guard.mjs';
import { parseFontLinks } from '../lib/remote-fonts.mjs';
import { assertParams, PublishError } from '../lib/canvas-publish.mjs';
import { repoIdFor } from '../lib/project-config.mjs';

const run = (args, opts) => runScript('run.mjs', args, opts);
const canvasOf = (r) => path.join(r.run, 'canvas');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const page = (body, head = '') => `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<title>t</title>\n${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;

// ---- C-1: the skills never turn an unreadable presentation into `auto` (D-4c-15) ----------------------

test('C-1: skills new and improve do not map an unsubstituted <presentation> to auto; they pass it as received', () => {
  for (const n of ['new', 'improve']) {
    const { text } = readSkill(n);
    assert.ok(!/`<presentation>`\s+is\s+`?auto/i.test(text), `${n}: the default for presentation`);
    assert.ok(!/presentation[^\n]{0,80}\bis auto\b/i.test(text), `${n}: presentation is auto`);
    assert.ok(/exactly as (?:it )?(?:arrived|received)/i.test(text), `${n}: says to pass it as received`);
    assert.ok(/never (?:replace|swap|default)/i.test(text), `${n}: never a default`);
  }
});

test('C-1: the script side refuses the literal that Claude Code did not substitute (gate and present)', () => {
  const project = makeRun().project;
  const data = makeTempDir();
  for (const v of ['${user_config.presentation}', 'Auto', '']) {
    const gate = run(['publish-gate', '--data', data, '--project', project, '--presentation', v]);
    assert.equal(gate.status, 1, `gate ${JSON.stringify(v)}`);
    assert.deepEqual(gate.json.reasons, ['presentation-local']);
    const p = run(['present', '--data', data, '--project', project, '--presentation', v, '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes']);
    assert.equal(p.json.mode, 'local', `present ${JSON.stringify(v)}`);
  }
});

// ---- I-1, I-2: remote resources and inline handlers --------------------------------------------------

const REMOTE_FORMS = {
  'td background': '<table><tr><td background="https://f1.x.test/td.png">x</td></tr></table>',
  'image-set': '<div style="background-image:image-set(\'https://f2.x.test/is.png\' 1x)">x</div>',
  backslashes: '<img src="https:\\\\f3.x.test\\bs.png" alt="">',
  'tab in scheme': '<img src="ht\ttps://f4.x.test/tab.png" alt="">',
  'entity slashes': '<img src="https:&#47;&#47;f5.x.test/ent.png" alt="">',
  'one slash': '<img src="https:/f6.x.test/one.png" alt="">',
  'css escape': '<div style="background:url(\\68ttps://f7.x.test/esc.png)">x</div>',
  'named entities': '<img src="https&colon;&sol;&sol;f8.x.test/n.png" alt="">',
  'style block import': '<style>@import "https://f9.x.test/a.css";</style><p>x</p>',
  'style block image-set': '<style>.a{background:-webkit-image-set(url(https://f10.x.test/a.png) 1x)}</style><p>x</p>',
  'link href': '<p>x</p>',
  ping: '<a href="detalle.html" ping="https://f11.x.test/p">x</a>',
};
const FORM_HEAD = { 'link href': '<link rel="icon" href="https://f12.x.test/i.png">\n' };
const SCRIPT_FORMS = {
  'onclick after a > in an attribute': '<div title="a>b" onclick="alert(1)">x</div>',
  onerror: '<img src="a.png" alt="" onerror="alert(1)">',
  'entity javascript': '<a href="java&#115;cript:alert(1)">x</a>',
  'tab javascript': '<a href="java\tscript:alert(1)">x</a>',
};

test('I-1: every remote form is a remote-resource for screenProblems (and for the converter)', () => {
  for (const [name, body] of Object.entries(REMOTE_FORMS)) {
    const html = page(body, FORM_HEAD[name] ?? '');
    for (const allowFonts of [false, true]) {
      assert.ok(screenProblems(html, { allowFonts }).some((p) => p.problem === 'remote-resource'), `${name} allowFonts=${allowFonts}`);
    }
    assert.throws(() => toArtboard({ html, w: 1440, h: 900, allowFonts: true }), (e) => e instanceof CanvasError && e.code === 'remote-resource', name);
  }
});

test('I-1: local forms stay allowed (guard against an over-strict check)', () => {
  const body = '<img src="img/a.png" alt=""><img src="data:image/png;base64,AAAA" alt=""><a href="https://example.com/x">x</a><div style="background:url(img/b.png)">x</div><a href="detalle.html" ping="">y</a>';
  const problems = screenProblems(page(body), { allowFonts: false, files: ['detalle.html'] });
  assert.deepEqual(problems, []);
});

test('I-2: an inline handler is a script wherever it sits in the tag, and javascript: is one after normalizing', () => {
  for (const [name, body] of Object.entries(SCRIPT_FORMS)) {
    const html = page(body);
    assert.ok(screenProblems(html).some((p) => p.problem === 'script'), name);
    assert.throws(() => toArtboard({ html, w: 1440, h: 900 }), (e) => e instanceof CanvasError && e.code === 'script', name);
  }
});

test('I-1, I-2: options-check refuses each form (local destination) and compare-html writes nothing for it', () => {
  const forms = { ...Object.fromEntries(Object.entries(REMOTE_FORMS).map(([k, b]) => [k, page(b, FORM_HEAD[k] ?? '')])), ...Object.fromEntries(Object.entries(SCRIPT_FORMS).map(([k, b]) => [k, page(b)])) };
  for (const [name, html] of Object.entries(forms)) {
    const r = makeRun({ options: ['A'], screens: ['inicio.html', 'detalle.html'], git: true });
    fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), html);
    const gitBefore = path.join(r.run, 'git-before.json');
    const before = run(['git-state', '--project', r.project, '--out', gitBefore]);
    assert.equal(before.status, 0, before.stderr);
    const res = run(['options-check', '--project', r.project, '--run', r.run, '--option', 'A', '--expected', 'inicio.html,detalle.html', '--git-before', gitBefore, '--destination', 'local']);
    assert.equal(res.status, 1, `${name}: options-check ${res.stdout}`);
    assert.ok(res.json.problems.some((p) => p.problem === 'remote-resource' || p.problem === 'script'), name);
    const c = run(['compare-html', '--run', r.run, '--platform', 'desktop', '--screens', 'inicio.html,detalle.html', '--no-open']);
    assert.equal(c.status, 1, `${name}: compare-html ${c.stdout}`);
    assert.ok(!fs.existsSync(path.join(r.run, 'compare.html')), `${name}: compare.html must not exist`);
  }
});

test('I-1: canvas-index build refuses each form', () => {
  for (const [name, body] of Object.entries(REMOTE_FORMS)) {
    const r = makeRun({ options: ['A'], screens: ['inicio.html'] });
    fs.writeFileSync(path.join(r.optionDir('A'), 'inicio.html'), page(body, FORM_HEAD[name] ?? ''));
    const b = canvasIndex(BUILD_ARGS(r, { options: 'A', screens: 'inicio.html' }));
    assert.equal(b.status, 1, `${name}: ${b.stdout}`);
    assert.ok(!fs.existsSync(canvasOf(r)), name);
  }
});

// The browser is the oracle: each form has its own host; the control (the original file) must be asked for.
test('with a browser: every remote form really asks for its host (the list is not invented) and the check names each', { skip: BROWSER_SKIP }, async () => {
  const names = Object.keys(REMOTE_FORMS).filter((n) => n !== 'ping');
  const body = names.map((n) => REMOTE_FORMS[n]).join('\n');
  const html = page(body, FORM_HEAD['link href']);
  const dir = makeTempDir();
  const file = path.join(dir, 'control.html');
  fs.writeFileSync(file, html);
  const asked = [];
  const server = http.createServer((req, res) => { asked.push(`GET ${req.headers.host}${req.url}`); res.writeHead(502); res.end(); });
  server.on('connect', (req, socket) => { asked.push(`CONNECT ${req.url}`); socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const profile = makeTempDir('pignolo-ui-remote-');
  const child = spawn(browserPath(), ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', `--user-data-dir=${profile}`,
    `--proxy-server=http://127.0.0.1:${server.address().port}`, '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(file).href], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => { const t = setTimeout(() => { child.kill(); resolve(); }, 30000); child.on('exit', () => { clearTimeout(t); resolve(); }); });
  await new Promise((r) => server.close(r));
  await leftoverProcesses(profile, 10000);
  const hosts = new Set(asked.map((a) => /f\d+\.x\.test/.exec(a)?.[0]).filter(Boolean));
  assert.ok(hosts.size >= 5, `the browser asked for ${[...hosts]}`);
  assert.ok(screenProblems(html).some((p) => p.problem === 'remote-resource'));
  for (const n of names) assert.ok(screenProblems(page(REMOTE_FORMS[n], FORM_HEAD[n] ?? '')).some((p) => p.problem === 'remote-resource'), n);
});

// ---- I-3 and minor 4: the leak scan --------------------------------------------------------------------

const leaks = (text, values = LEAK_VALUES) => scanBytes({ texts: [{ label: 't', text }], values }).problems.filter((p) => p.code === 'leak');

test('I-3: a value split by tags without a space is found', () => {
  for (const text of ['<td>Persona</td><td>Ejemplo</td>', '<span>Persona</span><span>Ejemplo</span>', 'Persona<br>Ejemplo', '<div>Persona</div><div>Ejemplo</div>', 'Per<b>sona</b> Ejemplo']) {
    assert.ok(leaks(text).length > 0, text);
  }
  assert.deepEqual(leaks('<td>Persona</td><td>Otra</td>'), []);
});

test('minor 4: named entities outside Latin-1, entity without ;, invisible characters and CSS escapes are found', () => {
  for (const text of ['persona&commat;ejemplo&period;test', 'persona&#64ejemplo.test', 'Per​sona Ejemplo', 'Per&shy;sona Ejemplo', '<p style="content:\'Persona\\20 Ejemplo\'">x</p>', 'usuario&hyphen;ejemplo', 'persona&#x40;ejemplo.test']) {
    assert.ok(leaks(text).length > 0, text);
  }
});

// ---- I-4: a wrong --data does not hide the opt-out ------------------------------------------------------

function optedOut() {
  const r = makeRun({ git: true });
  const data = makeTempDir();
  assert.equal(run(['config', 'set', '--data', data, '--project', r.project, '--key', 'publish', '--value', 'never']).status, 0);
  return { r, data };
}

test('I-4: publish-gate refuses an unsubstituted or missing --data with its own reason', () => {
  const { r } = optedOut();
  for (const bad of ['${CLAUDE_PLUGIN_DATA}', path.join(makeTempDir(), 'no-existe')]) {
    const g = run(['publish-gate', '--data', bad, '--project', r.project, '--presentation', 'auto']);
    assert.equal(g.status, 1, bad);
    assert.ok(g.json.reasons.includes('data-unresolved'), bad);
  }
});

test('I-4: present gives local with data-unresolved; plan refuses with data-unresolved and no params', () => {
  const { r } = optedOut();
  const p = run(['present', '--data', '${CLAUDE_PLUGIN_DATA}', '--project', r.project, '--presentation', 'auto', '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes']);
  assert.equal(p.json.mode, 'local');
  assert.ok(p.json.reasons.includes('data-unresolved'));
  assert.ok(!('notice' in p.json));
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const res = canvasIndex(['plan', '--project', r.project, '--run', r.run, '--values-file', kit.valuesFile, '--types-file', kit.typesFile, '--data', '${CLAUDE_PLUGIN_DATA}']);
  assert.equal(res.status, 1);
  assert.equal(res.json.problems[0].code, 'data-unresolved');
  assert.equal(res.json.step, null);
  assert.ok(!/"params"/.test(res.stdout));
});

test('I-4: the opt-out saved under the real data folder is seen even when --data points at another existing folder (env)', () => {
  const { r, data } = optedOut();
  const other = makeTempDir();
  const g = runScript('run.mjs', ['publish-gate', '--data', other, '--project', r.project, '--presentation', 'auto'], { env: { ...process.env, CLAUDE_PLUGIN_DATA: data } });
  assert.equal(g.status, 1, g.stdout);
  assert.ok(g.json.reasons.includes('project-opt-out'));
});

// ---- I-5: leak-origins.json -----------------------------------------------------------------------------

test('I-5: a missing, unreadable or git-failed leak-origins.json is no-leak-values', () => {
  for (const make of [(f) => fs.rmSync(f), (f) => fs.writeFileSync(f, 'basura'), (f) => fs.writeFileSync(f, '[]'), (f) => fs.writeFileSync(f, '{"git":"failed"}'), (f) => fs.writeFileSync(f, '{}')]) {
    const r = makeRun();
    assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
    const kit = planKit(r);
    const origins = path.join(path.dirname(kit.valuesFile), 'leak-origins.json');
    assert.ok(fs.existsSync(origins), 'the kit writes the origins like leak-values does');
    make(origins);
    const p = kit.plan();
    assert.equal(p.status, 1, p.stdout);
    assert.equal(p.json.problems[0].code, 'no-leak-values');
    assert.equal(p.json.step, null);
  }
});

// ---- I-6: junctions ------------------------------------------------------------------------------------------

// level: 1 .pignolo-ui, 2 runs, 3 the run itself is the junction. Returns { project, run, target } or null without permission.
function linkedRun(level) {
  const base = makeTempDir();
  const project = path.join(base, 'p');
  const outside = path.join(base, 'afuera');
  fs.mkdirSync(project, { recursive: true });
  const real = makeRun({ options: ['A'], screens: ['inicio.html', 'detalle.html'] });
  const realRun = real.run;
  let target;
  try {
    if (level === 1) {
      fs.mkdirSync(path.join(outside, 'runs'), { recursive: true });
      fs.cpSync(realRun, path.join(outside, 'runs', RUN_ID), { recursive: true });
      fs.symlinkSync(outside, path.join(project, '.pignolo-ui'), 'junction');
      target = path.join(outside, 'runs', RUN_ID);
    } else if (level === 2) {
      fs.mkdirSync(path.join(project, '.pignolo-ui'), { recursive: true });
      fs.mkdirSync(outside, { recursive: true });
      fs.cpSync(realRun, path.join(outside, RUN_ID), { recursive: true });
      fs.symlinkSync(outside, path.join(project, '.pignolo-ui', 'runs'), 'junction');
      target = path.join(outside, RUN_ID);
    } else {
      fs.mkdirSync(path.join(project, '.pignolo-ui', 'runs'), { recursive: true });
      fs.cpSync(realRun, path.join(outside, RUN_ID), { recursive: true });
      fs.symlinkSync(path.join(outside, RUN_ID), path.join(project, '.pignolo-ui', 'runs', RUN_ID), 'junction');
      target = path.join(outside, RUN_ID);
    }
  } catch { return null; }
  return { project, run: path.join(project, '.pignolo-ui', 'runs', RUN_ID), target };
}

test('I-6: no-publish and compare-html write nothing through a junction at any of the three levels', (t) => {
  for (const level of [1, 2, 3]) {
    const l = linkedRun(level);
    if (!l) { t.skip('sin permiso para crear enlaces'); return; }
    const np = run(['no-publish', '--run', l.run]);
    assert.notEqual(np.status, 0, `level ${level}: no-publish ${np.stdout}`);
    assert.ok(!fs.existsSync(path.join(l.target, 'no-publish')), `level ${level}: no-publish landed outside`);
    const c = run(['compare-html', '--run', l.run, '--platform', 'desktop', '--screens', 'inicio.html,detalle.html', '--no-open']);
    assert.notEqual(c.status, 0, `level ${level}: compare-html ${c.stdout}`);
    assert.ok(!fs.existsSync(path.join(l.target, 'local')) && !fs.existsSync(path.join(l.target, 'compare.html')), `level ${level}: compare landed outside`);
  }
});

test('I-6 / T-1 (X6): canvas-index verify refuses a link at any of the three levels', (t) => {
  for (const level of [1, 2, 3]) {
    const l = linkedRun(level);
    if (!l) { t.skip('sin permiso para crear enlaces'); return; }
    const v = canvasIndex(['verify', '--run', l.run]);
    assert.equal(v.status, 2, `level ${level}: ${v.stdout}${v.stderr}`);
    assert.match(v.stderr, /enlace/);
  }
});

// ---- T-1: behaviors that had no test ---------------------------------------------------------------------------

test('T-1 (X2): plan with a project.json that cannot be read is config-unreadable, with no params', () => {
  const r = makeRun({ git: true });
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const file = path.join(kit.data, repoIdFor(r.project), 'project.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ roto');
  const p = kit.plan();
  assert.equal(p.status, 1);
  assert.equal(p.json.problems[0].code, 'config-unreadable');
  assert.equal(p.json.step, null);
});

test('T-1 (X4): assertParams refuses forbidden keys at any depth and markers in any string', () => {
  for (const bad of [{ force: true }, { a: { overwrite_unread: ['x'] } }, { from_url: 'x' }, { share: 1 }, { public: 1 }, { capabilities: {} }, { title: 'a <b>' }, { files: ['x>y'] }]) {
    assert.throws(() => assertParams(bad), PublishError, JSON.stringify(bad));
  }
  assert.doesNotThrow(() => assertParams({ action: 'publish', files: { 'project/a.dc.html': 'project/a.dc.html' } }));
});

test('T-1 (X8): record of canvas-publish with another url is url-mismatch', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  assert.equal(kit.plan().status, 0);
  assert.equal(kit.record('canvas-create', fakeUrl(1)).status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(kit.plan().json.step.id, 'canvas-publish');
  const bad = kit.record('canvas-publish', fakeUrl(2));
  assert.equal(bad.status, 1);
  assert.equal(bad.json.problems[0].code, 'url-mismatch');
});

test('T-1 (X9): verifyCanvas wants 120 px between rows', () => {
  const r = makeRun({ options: ['A', 'B'] });
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'A,B' })).status, 0);
  const pageFile = path.join(canvasOf(r), 'page.json');
  const manifestFile = path.join(canvasOf(r), 'manifest.json');
  const fragment = readJson(pageFile);
  const second = Object.entries(fragment.boards).filter(([, b]) => b.y > 260).map(([k]) => k);
  const firstBottom = Math.max(...Object.values(fragment.boards).filter((b) => b.y === 260).map((b) => b.y + b.h));
  for (const k of second) fragment.boards[k].y = firstBottom + 100;
  fs.writeFileSync(pageFile, JSON.stringify(fragment));
  const manifest = readJson(manifestFile);
  manifest.layoutSha256 = layoutSha256(fragment);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const v = verifyCanvas({ dir: canvasOf(r) });
  assert.ok(v.problems.some((p) => p.code === 'bad-gap' && p.detail === 'vertical gap'), JSON.stringify(v.problems));
});

test('T-1 (R2): a leak value inside the params (the type_url) is refused with no step', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r, { types: { design: 'https://example.test/types/persona@ejemplo.test' } });
  const p = kit.plan();
  assert.equal(p.status, 1);
  assert.ok(p.json.problems.some((x) => x.code === 'leak'), p.stdout);
  assert.equal(p.json.step, null);
});

// ---- minors ------------------------------------------------------------------------------------------------------------

test('minor 1: iframe, object, embed and x-import are reserved tags of the canvas', () => {
  for (const tag of ['<iframe src="a.html"></iframe>', '<object data="a.svg"></object>', '<embed src="a.svg">', '<x-import></x-import>']) {
    assert.ok(scanMarkup(page(tag)).problems.some((p) => p.code === 'reserved-tag'), tag);
  }
});

test('minor 2: the converter refuses what it would change in silence', () => {
  const refuse = (body, head, code) => assert.throws(() => toArtboard({ html: page(body, head), w: 1440, h: 900 }), (e) => e instanceof CanvasError && e.code === code, `${code}: ${body}${head}`);
  refuse('<p>x</p>', '<style media="print">p{display:none}</style>\n', 'style-attribute');
  refuse('<p>x</p>', '<link rel="stylesheet" href="estilos.css">\n', 'unsupported-link');
  refuse('<p>x</p></body><body><p>y</p>', '', 'extra-body');
  assert.throws(() => toArtboard({ html: `${page('<p>x</p>')}<p>despues</p>`, w: 1440, h: 900 }), (e) => e instanceof CanvasError && e.code === 'extra-body');
  // a commented <style> does not come back to life
  const out = toArtboard({ html: page('<p>x</p>', '<!-- <style>p{color:red}</style> -->\n<style>p{margin:0}</style>\n'), w: 1440, h: 900 });
  assert.ok(!out.includes('color:red') && out.includes('p{margin:0}'));
  // a form action that points to a screen is rewritten like a link
  const form = toArtboard({ html: page('<form action="detalle.html"><button>Ir</button></form>'), w: 390, h: 844, links: { 'detalle.html': 'r1-a-detalle.dc.html' } });
  assert.ok(form.includes('action="r1-a-detalle.dc.html"') && !form.includes('action="detalle.html"'));
  assert.throws(() => toArtboard({ html: page('<form action="otra.html"><button>Ir</button></form>'), w: 390, h: 844, links: {} }), (e) => e instanceof CanvasError && e.code === 'broken-link');
});

test('minor 3: braces written as entities are braces', () => {
  assert.ok(scanMarkup(page('<p>&#123;&#123;x&#125;&#125;</p>')).problems.some((p) => p.code === 'braces'));
  assert.ok(scanMarkup(page('<p>&lbrace;&lbrace;x</p>')).problems.some((p) => p.code === 'braces'));
});

function stateRun(patch) {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  assert.equal(kit.plan().status, 0);
  assert.equal(kit.record('canvas-create', fakeUrl(1)).status, 0);
  const file = path.join(r.run, 'publish.json');
  fs.writeFileSync(file, JSON.stringify({ ...readJson(file), ...patch }));
  return kit.plan();
}

test('minor 5: an unknown state in publish.json is a problem, not done', () => {
  const p = stateRun({ state: 'borrado' });
  assert.equal(p.status, 1, p.stdout);
  assert.equal(p.json.done, false);
  assert.equal(p.json.problems[0].code, 'bad-state');
});

test('minor 6: a canvasUrl that is not an artifact address never reaches a step', () => {
  const p = stateRun({ canvasUrl: 'https://evil.example/x' });
  assert.equal(p.status, 1, p.stdout);
  assert.equal(p.json.step, null);
  assert.equal(p.json.problems[0].code, 'bad-url');
});

test('minor 7: canvasConsent written as text or as anything but true counts as declined', () => {
  const r = makeRun({ git: true });
  const data = makeTempDir();
  const file = path.join(data, repoIdFor(r.project), 'project.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const v of ['false', 'no', 0, null, 'nunca']) {
    fs.writeFileSync(file, JSON.stringify({ canvasConsent: v }));
    const g = run(['publish-gate', '--data', data, '--project', r.project, '--presentation', 'auto']);
    assert.equal(g.status, 1, JSON.stringify(v));
  }
  fs.writeFileSync(file, JSON.stringify({ canvasConsent: true }));
  assert.equal(run(['publish-gate', '--data', data, '--project', r.project, '--presentation', 'auto']).status, 0);
});

test('minor 8: on Windows the case of a path does not matter', { skip: process.platform !== 'win32' }, () => {
  const r = makeRun({ options: ['A'] });
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'A' })).status, 0);
  const swap = (s) => s.replace(/^([a-z]):/i, (m, d) => `${d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase()}:`);
  const kit = planKit(r);
  const v = canvasIndex(['plan', '--project', r.project.toUpperCase(), '--run', swap(r.run), '--values-file', kit.valuesFile, '--types-file', kit.typesFile, '--data', kit.data]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.equal(v.json.step.id, 'canvas-create');
  assert.equal(linkProblem(path.join(path.dirname(canvasOf(r)), 'CANVAS')), null);
});

test('minor 9: verify refuses canvas/project when it is a junction', (t) => {
  const r = makeRun({ options: ['A'] });
  assert.equal(canvasIndex(BUILD_ARGS(r, { options: 'A' })).status, 0);
  const real = path.join(canvasOf(r), 'project');
  const moved = path.join(makeTempDir(), 'project');
  fs.cpSync(real, moved, { recursive: true });
  fs.rmSync(real, { recursive: true });
  try { fs.symlinkSync(moved, real, 'junction'); } catch { t.skip('sin permiso para crear enlaces'); return; }
  const v = canvasIndex(['verify', '--run', r.run]);
  assert.equal(v.status, 1, v.stdout);
  assert.ok(v.json.problems.some((p) => p.code === 'link-in-output' || p.code === 'root-is-link'));
});

test('minor 10: build does not read a screen that is a symlink', (t) => {
  const r = makeRun({ options: ['A'], screens: ['inicio.html'] });
  const outside = path.join(makeTempDir(), 'afuera.html');
  fs.writeFileSync(outside, screenHtml('afuera'));
  const file = path.join(r.optionDir('A'), 'inicio.html');
  fs.rmSync(file);
  try { fs.symlinkSync(outside, file, 'file'); } catch { t.skip('sin permiso para crear enlaces'); return; }
  const b = canvasIndex(BUILD_ARGS(r, { options: 'A', screens: 'inicio.html' }));
  assert.equal(b.status, 2, b.stdout);
  assert.ok(!fs.existsSync(canvasOf(r)));
});

test('minor 11: a row with a single artboard gets no title1 note; rows with several do', () => {
  const html = screenHtml('x');
  const one = buildCanvas({ options: [{ id: 'A', kind: 'option', screens: [{ file: 'inicio.html', html }] }], platform: 'desktop', pageId: 'r1', pageName: 'p', canvasTitle: 'P', first: true });
  assert.deepEqual(Object.values(one.fragment.notes).filter((n) => n.kind === 'title1'), []);
  const two = buildCanvas({ options: [{ id: 'A', kind: 'option', screens: [{ file: 'inicio.html', html }, { file: 'detalle.html', html }] }], platform: 'desktop', pageId: 'r1', pageName: 'p', canvasTitle: 'P', first: true });
  assert.equal(Object.values(two.fragment.notes).filter((n) => n.kind === 'title1').length, 1);
});

test('minor 12: the skills say that any exit but 0 of publish-gate means no Artifact at all', () => {
  for (const n of ['new', 'improve']) assert.ok(/any exit (?:code )?(?:other than|but|different from) 0/i.test(readSkill(n).text), n);
});

test('minor 13: the README says that uninstalling does not delete what was published', () => {
  const readme = fs.readFileSync(path.join(PLUGIN_ROOT, 'README.md'), 'utf8');
  assert.ok(/desinstal[^\n]*no (?:borra|elimina)[^\n]*claude\.ai/i.test(readme));
});

test('minor 14: a font link with &amp; in its href is the allowed form', () => {
  const head = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;display=swap">\n';
  const r = parseFontLinks(page('<p>x</p>', head), { requireHead: true });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.links, ['<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">']);
});

test('minor 15: compare-html does not skip an option that is a junction; a DESIGN.md name with < falls back to the constant', () => {
  const r = makeRun({ options: ['A', 'B'], screens: ['inicio.html', 'detalle.html'] });
  const moved = path.join(makeTempDir(), 'option-B');
  fs.cpSync(r.optionDir('B'), moved, { recursive: true });
  fs.rmSync(r.optionDir('B'), { recursive: true });
  let linked = true;
  try { fs.symlinkSync(moved, r.optionDir('B'), 'junction'); } catch { linked = false; }
  if (linked) {
    const c = run(['compare-html', '--run', r.run, '--platform', 'desktop', '--screens', 'inicio.html,detalle.html', '--no-open']);
    assert.equal(c.status, 1, c.stdout);
  }
  const r2 = makeRun({ options: ['A'], screens: ['inicio.html'] });
  const design = path.join(r2.project, 'DESIGN.md');
  fs.writeFileSync(design, '---\nversion: alpha\nname: "Mi <app>"\n---\n\n## Overview\nx\n');
  const b = canvasIndex(BUILD_ARGS(r2, { options: 'A', screens: 'inicio.html', design }));
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.equal(readJson(path.join(canvasOf(r2), 'page.json')).canvasTitle, 'Proyecto');
});

test('T-1 (X4): plan refuses a marker left in a param (bad-params) and prints no step', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r, { types: { design: 'https://example.test/types/<design-type>' } });
  const p = kit.plan();
  assert.equal(p.status, 1, p.stdout);
  assert.equal(p.json.problems[0].code, 'bad-params');
  assert.equal(p.json.step, null);
});
