// Eval cases of the pignolo-ui agents (spec §16.3), without spending anything: the generated
// cases are well formed, the seeded fixtures fire what they claim (run by the REAL scripts, with
// Git Bash by absolute path), and the graders accept the right report and reject the wrong one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTempDir, PLUGIN_ROOT, REPO_ROOT, BROWSER_SKIP } from './helpers.mjs';
import { CASES, build, SEEDED_IDS, TRAP, RUN_DIR } from './evals/ui-cases.mjs';
import { loadCatalog } from '../lib/catalog.mjs';

const require = createRequire(import.meta.url);

// Git Bash by absolute path: `bash` from PowerShell is WSL (no node there). null if not found.
function gitBash() {
  if (process.platform !== 'win32') return { path: 'bash', tried: 'bash' };
  let tried = '(git no responde)';
  try {
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    tried = path.resolve(exec, '..', '..', '..', 'bin', 'bash.exe');
    for (const p of [tried, path.resolve(exec, '..', '..', 'bin', 'bash.exe')]) if (fs.existsSync(p)) return { path: p, tried: p };
  } catch { /* reported by the skip */ }
  return { path: null, tried };
}
const BASH = gitBash();

const out = makeTempDir('pignolo-ui-evals-');
const built = BROWSER_SKIP ? null : build({ out });

test('the cases are generated: 8 auditor, 3 ui-option and 3 ablation, each complete', { skip: BROWSER_SKIP }, () => {
  const names = fs.readdirSync(out);
  assert.equal(names.filter((n) => n.startsWith('ui-auditor-')).length, 8);
  assert.equal(names.filter((n) => n.startsWith('ui-option-')).length, 3);
  assert.equal(names.filter((n) => n.startsWith('ablation-')).length, 3);
  assert.deepEqual(built.sort(), names.sort());
  for (const n of names) {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, n, f)), `${n}/${f}`);
    assert.ok(fs.readdirSync(path.join(out, n, 'graders')).length >= 1, n);
  }
  const seeded = CASES().filter((c) => c.seeded).map((c) => c.seeded).sort();
  assert.deepEqual(seeded, [...SEEDED_IDS].sort());
  const prompt = fs.readFileSync(path.join(out, 'ui-auditor-defect-color-03', 'prompt.md'), 'utf8');
  assert.match(prompt, /subagent_type pignolo-ui:ui-auditor/);
  assert.match(prompt, /model opus/);
});

test('without a browser the generator fails with a clear message (no silent partial output)', () => {
  const r = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'tests', 'evals', 'ui-cases.mjs'), '--out', path.join(makeTempDir(), 'x'), '--agent', 'auditor'], {
    encoding: 'utf8', env: { ...process.env, PIGNOLO_UI_BROWSER: path.join(makeTempDir(), 'none', 'chrome.exe') },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no hay navegador/);
});

// ---- the seeded fixtures fire what they say ---------------------------------------------------

const catalog = loadCatalog();
const floorIds = new Set(catalog.rules.filter((r) => r.floor).map((r) => r.id));
const readEntries = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).entries ?? []; } catch { return []; }
};

const skipFixtures = BROWSER_SKIP || (BASH.path ? false : `sin Git Bash (ruta probada: ${BASH.tried})`);

test('the seeded fixtures fire the seeded rule and the clean pages have no floor failure', { skip: skipFixtures, timeout: 600000 }, async (t) => {
  for (const c of CASES().filter((x) => x.kind === 'auditor')) {
    await t.test(c.name, () => {
      const dir = makeTempDir('pignolo-ui-fixture-');
      const res = spawnSync(BASH.path, [path.join(out, c.name, 'fixture.sh')], { cwd: dir, encoding: 'utf8', timeout: 240000 });
      assert.equal(res.status, 0, `fixture.sh failed: ${res.stderr}\n${res.stdout}`);
      const run = path.join(dir, RUN_DIR);
      for (const f of ['run.json', 'norms.md', 'browser.json', 'ui-check.json', 'dom.json', 'captures.json']) assert.ok(fs.existsSync(path.join(run, f)), f);
      const fails = [...readEntries(path.join(run, 'browser.json')), ...readEntries(path.join(run, 'ui-check.json'))].filter((e) => e.status === 'fail');
      if (c.seeded && c.seeded !== 'J-01') {
        assert.ok(fails.some((e) => e.id === c.seeded), `${c.name}: no fail ${c.seeded} in ${JSON.stringify(fails.map((e) => e.id))}`);
      } else {
        const floor = fails.filter((e) => floorIds.has(e.id));
        assert.deepEqual(floor.map((e) => e.id), [], `${c.name}: a floor rule fails on a page that must have none`);
      }
      if (c.seeded === 'J-01') {
        const html = fs.readFileSync(path.join(dir, 'src', 'index.html'), 'utf8');
        assert.equal((html.match(/data-primary="true"/g) || []).length, 2, 'two equal primary actions: judgment only');
      }
    });
  }
});

// ---- the graders accept the right report and reject the wrong one ------------------------------

const TRACES = path.join(REPO_ROOT, 'tests', 'evals', 'traces.js');
const traces = fs.existsSync(TRACES) ? require(TRACES) : null;
const skipGraders = traces ? false : `falta ${TRACES}`;
const uiTrace = (c, report) => JSON.parse(JSON.stringify(traces.run({ ...c, brief: RUN_DIR, reviewer: true }, { report })).replaceAll('pignolo:ui-auditor', 'pignolo-ui:ui-auditor'));
const graderOf = (c, name) => c.graders.find((g) => g.name === name);

test('recall: the grader accepts a report with the seeded id and rejects one without it', { skip: skipGraders }, () => {
  for (const c of CASES().filter((x) => x.seeded)) {
    const g = graderOf(c, 'recall-seeded-defect');
    assert.ok(g, c.name);
    assert.ok(traces.grade(g, { trace: uiTrace(c, c.samples.pass), files: {} }), `${c.name}: rejects the right report`);
    assert.ok(!traces.grade(g, { trace: uiTrace(c, c.samples.fail), files: {} }), `${c.name}: accepts a report without the seeded id`);
  }
});

test('form graders need the required keys; the false-positive grader rejects an alto on a clean page', { skip: skipGraders }, () => {
  const c = CASES().find((x) => x.seeded === 'COLOR-03');
  const noWhy = c.samples.pass.replace(/"why": "porque sí"/, '"other": "x"');
  assert.ok(traces.grade(graderOf(c, 'form-why'), { trace: uiTrace(c, c.samples.pass), files: {} }));
  assert.ok(!traces.grade(graderOf(c, 'form-why'), { trace: uiTrace(c, noWhy), files: {} }));
  const clean = CASES().find((x) => x.name === 'ui-auditor-clean-1');
  const g = graderOf(clean, 'no-false-positive-bloquea-alto');
  assert.ok(traces.grade(g, { trace: uiTrace(clean, clean.samples.pass), files: {} }));
  assert.ok(!traces.grade(g, { trace: uiTrace(clean, clean.samples.fail), files: {} }));
  const none = traces.run({ ...clean, brief: RUN_DIR, reviewer: true }, { report: null });
  assert.ok(!traces.grade(g, { trace: JSON.parse(JSON.stringify(none).replaceAll('pignolo:ui-auditor', 'pignolo-ui:ui-auditor')), files: {} }), 'absence grader does not pass on an empty run');
});

test('a report written by the main session does not count as the subagent report', { skip: skipGraders }, () => {
  const c = CASES().find((x) => x.seeded === 'COLOR-03');
  const trace = JSON.parse(JSON.stringify(traces.run({ ...c, brief: RUN_DIR, reviewer: true }, { report: c.samples.fail, main: c.samples.pass })).replaceAll('pignolo:ui-auditor', 'pignolo-ui:ui-auditor'));
  assert.ok(!traces.grade(graderOf(c, 'recall-seeded-defect'), { trace, files: {} }));
});

// ---- trap token and gitignore -----------------------------------------------------------------

test('the trap token is in the ui-option fixtures and in no shipped file; generated/ is ignored', () => {
  for (const c of CASES().filter((x) => x.kind === 'option')) {
    const sh = fixtureShOf(c);
    assert.ok(sh.includes(TRAP), c.name);
  }
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const sub of ['agents', 'skills', 'reference', 'catalog']) {
    for (const f of walk(path.join(PLUGIN_ROOT, sub))) assert.ok(!fs.readFileSync(f, 'utf8').includes(TRAP), f);
  }
  assert.ok(fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8').split('\n').includes('plugins/pignolo-ui/tests/evals/generated/'));
});

function fixtureShOf(c) {
  const dir = makeTempDir('pignolo-ui-opt-');
  build({ out: dir, agent: 'option', needBrowser: false });
  return fs.readFileSync(path.join(dir, c.name, 'fixture.sh'), 'utf8');
}

test('the three ui-option cases and the ablation briefs exist with their checks', () => {
  const dir = makeTempDir('pignolo-ui-opt-');
  assert.deepEqual(build({ out: dir, agent: 'option', needBrowser: false }).sort(), ['ui-option-improve', 'ui-option-mockup', 'ui-option-style-tile']);
  const graders = fs.readdirSync(path.join(dir, 'ui-option-mockup', 'graders'));
  for (const g of ['charset-inicio.html.md', 'no-script-inicio.html.md', 'sample-marker-inicio.html.md', 'no-trap-inicio.html.md', 'links-resolve.md', 'trap-not-in-trace.md', 'dispatched.md']) assert.ok(graders.includes(g), g);
  assert.deepEqual(build({ out: dir, agent: 'ablation', needBrowser: false }).length, 3);
});

// ---- I-4: ui-option cases can pass, and their file graders judge the real output ---------------

const GOOD_HTML = `<!DOCTYPE html>
<html lang="es"><head><META CHARSET="UTF-8"><title>Mi cuenta</title>
<style>:root{--color-primary:#0f766e;--font-body:system-ui;--radius-sm:2px;--radius-md:4px;--radius-lg:8px}body{background:url(data:image/png;base64,AAAA)}</style></head>
<body><p class="strip">Datos de ejemplo</p><main><h1>Mi cuenta</h1><p data-sample>‹saldo›</p><a href="detalle.html">Ver detalle</a><button data-primary="true">Guardar</button></main></body></html>
`;
const BAD = {
  'no doctype': (h) => h.replace(/<!DOCTYPE html>/i, ''),
  'no charset': (h) => h.replace(/<META CHARSET="UTF-8">/i, ''),
  'script': (h) => h.replace('<main>', '<main><script>1</script>'),
  'inline handler': (h) => h.replace('<button', '<button onclick="x()"'),
  'remote css url': (h) => h.replace('</style>', 'a{background:url(https://cdn.example.test/x.png)}</style>'),
  'remote css import': (h) => h.replace('<style>', '<style>@import url(https://fonts.example.test/x.css);'),
  'remote img': (h) => h.replace('<main>', '<main><img src="https://cdn.example.test/x.png" alt="">'),
  'remote protocol-relative stylesheet': (h) => h.replace('<title>', '<link rel="stylesheet" href="//cdn.example.test/x.css"><title>'),
  'trap token': (h) => h.replace('<main>', `<main><p>${TRAP}</p>`),
};

test('I-4: the ui-option cases carry Write in allowed_tools and the ui-auditor ones do not', () => {
  const dir = makeTempDir('pignolo-ui-opt-');
  build({ out: dir, agent: 'option', needBrowser: false });
  for (const n of ['ui-option-mockup', 'ui-option-style-tile', 'ui-option-improve']) {
    const prompt = fs.readFileSync(path.join(dir, n, 'prompt.md'), 'utf8');
    assert.match(prompt, /allowed_tools: \[[^\]]*\bWrite\b/, n);
  }
  for (const c of CASES().filter((x) => x.kind === 'auditor')) assert.ok(!c.graders.some((g) => g.target?.source === 'file'));
});

test('I-4: file graders accept correct output and reject remote or forbidden output', { skip: skipGraders }, () => {
  for (const c of CASES().filter((x) => x.kind === 'option' && x.graders.some((g) => g.target?.source === 'file'))) {
    const fileGraders = c.graders.filter((g) => g.target?.source === 'file');
    const html = GOOD_HTML;
    const filesFor = (text) => Object.fromEntries([...new Set(fileGraders.map((g) => g.target.path))].map((p) => [p, text]));
    const okFiles = filesFor(html);
    const second = c.screens?.[1];
    for (const g of fileGraders) {
      if (g.name.startsWith('links-resolve')) { assert.ok(traces.grade(g, { trace: [], files: okFiles }), `${c.name}/${g.name} rejects good output`); continue; }
      assert.ok(traces.grade(g, { trace: [], files: okFiles }), `${c.name}/${g.name} rejects correct output`);
    }
    for (const [label, mutate] of Object.entries(BAD)) {
      const bad = filesFor(mutate(html));
      const failing = fileGraders.filter((g) => !traces.grade(g, { trace: [], files: bad }));
      assert.ok(failing.length >= 1, `${c.name}: no grader rejects "${label}"`);
    }
    assert.ok(second === undefined || fileGraders.some((g) => g.name === 'links-resolve'));
  }
});

test('I-4: the process graders (single-dispatch, subagent-returned) tell right from wrong', { skip: skipGraders }, () => {
  const c = CASES().find((x) => x.seeded === 'COLOR-03');
  const single = c.processGraders.find((g) => g.name === 'single-dispatch');
  const returned = c.processGraders.find((g) => g.name === 'subagent-returned');
  const one = uiTrace(c, c.samples.pass);
  assert.ok(traces.grade(single, { trace: one, files: {} }));
  assert.ok(traces.grade(returned, { trace: one, files: {} }));
  const twice = [...one];
  twice.splice(1, 0, JSON.parse(JSON.stringify(one[0])));
  assert.ok(!traces.grade(single, { trace: twice, files: {} }), 'two Agent dispatches are rejected');
  assert.ok(!traces.grade(returned, { trace: uiTrace(c, 'Audit done, no json block.'), files: {} }), 'a report without the json block is rejected');
});

test('I-4: a clean page accepts a medium judgment finding but not a rule finding the page does not have', { skip: skipGraders }, () => {
  const clean = CASES().find((x) => x.name === 'ui-auditor-clean-1');
  const g = graderOf(clean, 'no-false-positive-judgment');
  const hi = graderOf(clean, 'no-false-positive-bloquea-alto');
  assert.ok(g);
  assert.ok(traces.grade(g, { trace: uiTrace(clean, clean.samples.pass), files: {} }));
  const medJ = reportOfIds(['J-01'], 'medio');
  assert.ok(traces.grade(g, { trace: uiTrace(clean, medJ), files: {} }), 'one medium J-01 passes');
  assert.ok(traces.grade(hi, { trace: uiTrace(clean, medJ), files: {} }));
  assert.ok(traces.grade(g, { trace: uiTrace(clean, reportOfIds(['COLOR-02', 'LAYOUT-04', 'J-04'], 'medio')), files: {} }), 'the ui-check fails the page has pass');
  assert.ok(!traces.grade(hi, { trace: uiTrace(clean, reportOfIds(['J-01'], 'alto')), files: {} }), 'a high J-01 fails');
  assert.ok(!traces.grade(hi, { trace: uiTrace(clean, reportOfIds(['J-01'], 'bloquea')), files: {} }), 'a blocking J-01 fails');
  assert.ok(!traces.grade(g, { trace: uiTrace(clean, reportOfIds(['COLOR-03'], 'medio')), files: {} }), 'a rule finding the page does not have fails');
});
const reportOfIds = (ids, severity = 'detalle') => `Audit.\n\`\`\`json\n${JSON.stringify({ findings: ids.map((id) => ({ id, severity, scope: 'new', plain: 'x', evidence: { kind: 'file', path: 'src/index.html', line: 1 }, why: 'y' })), notVerified: [], independent: true })}\n\`\`\``;
