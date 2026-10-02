// Hito 4a end to end through the CLIs, no model (spec §7, §8, §9, §12): run folder, options,
// leak check, approved decision, batch, report skeleton, report-check and the honest verdict;
// the "before" is never overwritten (R-13). The browser part is a visible skip without Chrome/Edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { makeTempDir, writeTree, runScript, serveRoutes, BROWSER_SKIP, FIXTURES, PLUGIN_ROOT, makePng, writeBrief } from './helpers.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta</title></head><body><main>${body}</main></body></html>`;
const run = (args) => runScript('run.mjs', args);

function makeProject() {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DESIGN, 'src/a.css': '.a { color: #111; }\n' });
  const git = (...a) => execFileSync('git', a, { cwd: project, stdio: 'pipe', timeout: 20000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return project;
}

function initRun(project, slug = 'cuenta') {
  const r = run(['init', '--project', project, '--command', 'new', '--slug', slug, '--now', '2026-10-01T10:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  return r.json.run;
}

const OPTION = {
  'inicio.html': page('<h1>Cuenta</h1><p data-sample>$ 12.480,00</p><p>Datos de muestra</p><a href="detalle.html" data-primary="true">Ver detalle</a>'),
  'detalle.html': page('<h1>Detalle</h1><a href="inicio.html">Volver</a>'),
};

test('4a: run, option check, leak check, approved decision, batch, report and a verdict "terminado"', () => {
  const project = makeProject();
  const runDir = initRun(project);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }), '');

  // an option written by hand, verified by the main thread
  const rel = path.relative(project, runDir).replace(/\\/g, '/');
  writeTree(path.join(runDir, 'option-A'), OPTION);
  const scratch = makeTempDir();
  const gitBefore = path.join(scratch, 'git-before.txt');
  assert.equal(run(['git-state', '--project', project, '--out', gitBefore]).status, 0);
  const oc = run(['options-check', '--project', project, '--run', runDir, '--option', 'A', '--expected', 'inicio.html,detalle.html', '--git-before', gitBefore]);
  assert.equal(oc.status, 0, oc.stderr + JSON.stringify(oc.json));

  // leak check, then approve
  const values = path.join(scratch, 'values.json');
  assert.equal(run(['leak-values', '--project', project, '--out', values]).status, 0);
  assert.equal(runScript('leak-check.mjs', ['--dir', path.join(runDir, 'option-A'), '--values-file', values]).status, 0);
  const save = runScript('approve.mjs', ['save', '--project', project, '--flow', 'cuenta', '--from', path.join(runDir, 'option-A'), '--values-file', values, '--brief-file', writeBrief(), '--date', '2026-10-01']);
  assert.equal(save.status, 0, save.stderr + save.stdout);
  const approved = save.json.path;
  const quote = path.join(scratch, 'quote.txt');
  fs.writeFileSync(quote, 'Me quedo con la opción A');
  assert.equal(runScript('approve.mjs', ['record', '--project', project, '--path', approved, '--quote-file', quote, '--date', '2026-10-01', '--write']).status, 0);
  assert.equal(runScript('approve.mjs', ['verify', '--project', project, '--path', approved]).status, 0);

  // a batch of edits
  const expected = path.join(runDir, 'expected.json');
  fs.writeFileSync(expected, JSON.stringify([{ path: 'src/a.css', exists: true, change: 'tokens' }]));
  const batch = `${rel}/batch-1`;
  assert.equal(runScript('files.mjs', ['save', '--project', project, '--batch', batch, '--expected', path.join(runDir, 'expected.json')], { cwd: project }).status, 0);
  fs.writeFileSync(path.join(project, 'src', 'a.css'), '.a { color: #222; }\n');
  assert.equal(runScript('files.mjs', ['verify', '--project', project, '--batch', batch], { cwd: project }).status, 0);

  // ui-check on the touched file, the report skeleton citing the approved decision
  const check = run(['check', '--project', project, '--run', runDir, '--files', 'src/a.css']);
  assert.equal(check.status, 0, check.stderr + JSON.stringify(check.json));
  const sk = run(['report-skeleton', '--project', project, '--run', runDir, '--implements', approved]);
  assert.equal(sk.status, 0, sk.stderr);
  assert.equal(sk.json.implemented, true);
  const writeReport = (over = {}) => fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
    version: 1, implemented: true, implements: sk.json.implements, evidence: sk.json.evidence, claims: [], ...over,
  }));
  writeReport();
  assert.equal(runScript('report-check.mjs', ['--project', project, '--run', runDir]).status, 0);
  const v = run(['verdict', '--project', project, '--run', runDir]);
  assert.equal(v.status, 0, JSON.stringify(v.json));
  assert.equal(v.json.status, 'terminado');
  assert.ok(v.json.reasons.includes('no verificado: el proyecto no declara build'));

  // honest "terminado": each condition broken on its own, always through run.mjs verdict
  writeReport({ implements: undefined });
  assert.equal(runScript('report-check.mjs', ['--project', project, '--run', runDir]).status, 1);
  assert.equal(run(['verdict', '--project', project, '--run', runDir]).json.status, 'BLOCKED');

  writeReport({ implements: { ...sk.json.implements, manifestSha256: 'a'.repeat(64) } });
  assert.equal(runScript('report-check.mjs', ['--project', project, '--run', runDir]).status, 1);
  assert.equal(run(['verdict', '--project', project, '--run', runDir]).json.status, 'BLOCKED');

  writeReport({ claims: [{ id: 'c1', text: 'Todo en orden', rule: 'COLOR-03', status: 'pass', ref: { source: 'ui-check', fingerprint: 'no-existe' } }] });
  const rc = runScript('report-check.mjs', ['--project', project, '--run', runDir]);
  assert.equal(rc.status, 1);
  assert.equal(rc.json.retired.length, 1);
  assert.equal(run(['verdict', '--project', project, '--run', runDir]).json.status, 'BLOCKED');

  writeReport();
  const broken = run(['verdict', '--project', project, '--run', runDir, '--build-ok', 'no']);
  assert.equal(broken.json.status, 'BLOCKED');
  assert.ok(broken.json.reasons.some((r) => r.startsWith('build roto')));

  // a new bloquea in scope (img without alt in a checked file)
  writeTree(project, { 'src/bad.html': page('<img src="a.png">') });
  const bad = run(['check', '--project', project, '--run', runDir, '--files', 'src/bad.html']);
  assert.equal(bad.status, 1);
  const sk2 = run(['report-skeleton', '--project', project, '--run', runDir, '--implements', approved]);
  writeReport({ evidence: sk2.json.evidence });
  const blocked = run(['verdict', '--project', project, '--run', runDir]);
  assert.equal(blocked.json.status, 'BLOCKED');
  assert.ok(blocked.json.reasons.includes('bloquea nuevo en alcance (1)'), JSON.stringify(blocked.json));
});

const FAIL_ENTRY = { id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'COLOR-03|/|1440|light|#hint', measure: { ratio: 2.3 } };

test('R-13: measuring again in the same run makes the report stale; in <run>/after the "before" stays intact', () => {
  const project = makeProject();
  const runDir = initRun(project, 'antes-despues');
  writeTree(runDir, { 'dom-1440.html': page('<h1>Hola</h1>'), 'dom.json': JSON.stringify({ doms: [{ path: 'dom-1440.html', width: 1440 }] }) });
  fs.writeFileSync(path.join(runDir, 'browser.json'), `${JSON.stringify({ version: 1, entries: [FAIL_ENTRY] })}\n`);
  fs.mkdirSync(path.join(runDir, 'captures'));
  fs.writeFileSync(path.join(runDir, 'captures', '1440-light-1.png'), makePng(4, 4));
  assert.equal(run(['check', '--project', project, '--run', runDir]).status, 1);

  const claim = { id: 'c1', text: 'El texto de ayuda no llega al contraste', rule: 'COLOR-03', status: 'fail', ref: { source: 'ui-check', fingerprint: FAIL_ENTRY.fingerprint } };
  const reportFor = (dir) => {
    const sk = run(['report-skeleton', '--project', project, '--run', dir]);
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ version: 1, implemented: false, evidence: sk.json.evidence, claims: [claim] }));
  };
  const reportCheck = (dir) => runScript('report-check.mjs', ['--project', project, '--run', dir]);

  const beforeShas = {
    browser: sha(path.join(runDir, 'browser.json')),
    uiCheck: sha(path.join(runDir, 'ui-check.json')),
    png: sha(path.join(runDir, 'captures', '1440-light-1.png')),
  };

  // (b) the "after" in <run>/after: everything is cited from there
  const after = path.join(runDir, 'after');
  writeTree(after, { 'dom-1440.html': page('<h1>Hola</h1>'), 'dom.json': JSON.stringify({ doms: [{ path: 'dom-1440.html', width: 1440 }] }) });
  fs.writeFileSync(path.join(after, 'browser.json'), `${JSON.stringify({ version: 1, entries: [FAIL_ENTRY, { ...FAIL_ENTRY, id: 'STATE-04', fingerprint: 'STATE-04|/|1440|light|#x', measure: { n: 1 } }] })}\n`);
  assert.equal(run(['check', '--project', project, '--run', after]).status, 1);
  reportFor(after);
  assert.equal(reportCheck(after).status, 0, reportCheck(after).stdout);
  assert.equal(sha(path.join(runDir, 'browser.json')), beforeShas.browser);
  assert.equal(sha(path.join(runDir, 'ui-check.json')), beforeShas.uiCheck);
  assert.equal(sha(path.join(runDir, 'captures', '1440-light-1.png')), beforeShas.png);

  // (a) the old order: a second browser.json in the same run after ui-check ran -> stale
  reportFor(runDir);
  assert.equal(reportCheck(runDir).status, 0);
  fs.writeFileSync(path.join(runDir, 'browser.json'), `${JSON.stringify({ version: 1, entries: [FAIL_ENTRY], again: true })}\n`);
  const stale = reportCheck(runDir);
  assert.equal(stale.status, 1);
  assert.ok(stale.json.retired.some((r) => /stale/.test(r.reason)), JSON.stringify(stale.json.retired));
});

const tile = (hue) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>:root{--color-primary:oklch(0.6 0.15 ${hue});--font-body:"Inter",sans-serif;--radius-sm:4px;--radius-md:8px;--radius-lg:12px}</style></head><body><p>x</p></body></html>`;

test('compare on style tiles names the one to regenerate; discard moves it and options runs again', () => {
  const project = makeProject();
  const runDir = initRun(project, 'direcciones');
  writeTree(runDir, { 'direction-A/inicio.html': tile(250), 'direction-B/inicio.html': tile(262), 'direction-C/inicio.html': tile(20) });
  const first = runScript('compare.mjs', ['options', '--run', runDir, '--kind', 'tile', '--main', 'inicio.html']);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.json.regenerate, 'B');
  const d = run(['discard', '--run', runDir, '--option', first.json.regenerate, '--kind', 'direction']);
  assert.equal(d.status, 0, d.stderr);
  assert.ok(fs.existsSync(path.join(runDir, 'discarded', 'direction-B-1', 'inicio.html')));
  writeTree(runDir, { 'direction-B/inicio.html': tile(140) });
  const second = runScript('compare.mjs', ['options', '--run', runDir, '--kind', 'tile', '--main', 'inicio.html']);
  assert.equal(second.json.regenerate, null);
});

// ---- with the browser ------------------------------------------------------------------

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta</title>
<style>body{margin:0;padding:0 24px;background:#fff;color:#111;font:16px sans-serif} .muted{color:#9a9a9a} #save{outline:none}</style></head>
<body><main><h1>Cuenta</h1><p class="muted" id="hint">Última actualización hace 2 días</p><button id="save" data-primary="true">Guardar</button></main></body></html>`;

function cli(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => {
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ status, stdout, stderr, json });
    });
  });
}

test('4a with the browser: measure, capture, dom and check in order; menu takes the fail; "after" leaves the "before"', { skip: BROWSER_SKIP }, async () => {
  const project = makeProject();
  const runDir = initRun(project, 'navegador');
  const site = await serveRoutes({ '/cuenta': { headers: HTML, body: PAGE } });
  try {
    const url = `${site.base}/cuenta`;
    const common = ['--project', project, '--run', runDir, '--url', url];
    assert.equal((await cli('browser.mjs', ['measure', ...common])).status, 1);
    assert.equal((await cli('browser.mjs', ['capture', ...common])).status, 0);
    assert.equal((await cli('browser.mjs', ['dom', ...common])).status, 0);
    const check = await cli('run.mjs', ['check', '--project', project, '--run', runDir]);
    assert.equal(check.status, 1, check.stderr);
    const menu = await cli('run.mjs', ['menu', '--run', runDir]);
    assert.equal(menu.json.menu.find((m) => m.id === 'hard-to-read').preticked, true);
    const fp = await cli('compare.mjs', ['fingerprint', '--kind', 'mockup', '--url', url, '--out', path.join(runDir, 'fp.json'), '--project', project]);
    assert.equal(fp.status, 0, fp.stderr);
    assert.ok(Array.isArray(fp.json.fingerprint.blocks));
    assert.equal(fp.json.fingerprint.primary.row, 'top');

    // the "after": same order, in <run>/after, with --before
    const beforeBrowser = sha(path.join(runDir, 'browser.json'));
    const beforeUi = sha(path.join(runDir, 'ui-check.json'));
    const pngs = fs.readdirSync(path.join(runDir, 'captures')).map((n) => [n, sha(path.join(runDir, 'captures', n))]);
    const after = path.join(runDir, 'after');
    const aCommon = ['--project', project, '--run', after, '--url', url];
    assert.equal((await cli('browser.mjs', ['measure', ...aCommon, '--before', path.join(runDir, 'browser.json')])).status, 0, 'the fails of the before are debt');
    assert.equal((await cli('browser.mjs', ['capture', ...aCommon])).status, 0);
    assert.equal((await cli('browser.mjs', ['dom', ...aCommon])).status, 0);
    const aCheck = await cli('run.mjs', ['check', '--project', project, '--run', after]);
    assert.notEqual(aCheck.status, 2, aCheck.stderr);
    const afterUi = readJson(path.join(after, 'ui-check.json'));
    const hint = afterUi.entries.find((e) => e.id === 'COLOR-03' && e.status === 'fail');
    assert.equal(hint.scope, 'debt', 'what failed before and still fails is debt in the after');
    assert.equal(sha(path.join(runDir, 'browser.json')), beforeBrowser);
    assert.equal(sha(path.join(runDir, 'ui-check.json')), beforeUi);
    assert.deepEqual(fs.readdirSync(path.join(runDir, 'captures')).map((n) => [n, sha(path.join(runDir, 'captures', n))]), pngs);
  } finally {
    await site.close();
  }
});
