// Hito 4f end to end through the CLIs, no model and no network: PRODUCT.md and the brief go into the run,
// the brief is sealed with the approved version, a verdict pass is requested and validated, and the word
// "terminado" does not depend on it. The variant without PRODUCT.md says so and everything else goes on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, writeBrief, FIXTURES, PLUGIN_ROOT } from './helpers.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const PRODUCT = fs.readFileSync(path.join(FIXTURES, 'product', 'pass-complete.md'), 'utf8');
const run = (args) => runScript('run.mjs', args);
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta</title></head><body><main>${body}</main></body></html>`;
const OPTION = {
  'inicio.html': page('<h1>Cuenta</h1><p data-sample>$ 12.480,00</p><p>Datos de muestra</p><a href="detalle.html" data-primary="true">Ver detalle</a>'),
  'detalle.html': page('<h1>Detalle</h1><a href="inicio.html">Volver</a>'),
};

function makeProject(withProduct) {
  const tree = { 'DESIGN.md': DESIGN, 'src/a.css': '.a { color: #111; }\n.b { color: #222; }\n' };
  if (withProduct) tree['PRODUCT.md'] = PRODUCT;
  const project = writeTree(makeTempDir(), tree);
  const git = (...a) => execFileSync('git', a, { cwd: project, stdio: 'pipe', timeout: 20000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return project;
}

function flow(withProduct) {
  const project = makeProject(withProduct);
  const init = run(['init', '--project', project, '--command', 'new', '--slug', 'cuenta', '--now', '2026-10-01T10:00:00Z']);
  assert.equal(init.status, 0, init.stderr);
  const runDir = init.json.run;
  const values = path.join(runDir, 'leak-values.json');
  assert.equal(run(['leak-values', '--project', project, '--out', values]).status, 0);

  // context, then the brief of the screen
  const brief = writeBrief(runDir, 'brief.md');
  const ctx = run(['context', '--project', project, '--run', runDir, '--values-file', values, '--brief', brief]);
  assert.equal(ctx.status, 0, ctx.stdout + ctx.stderr);

  // an option written by hand, approved with the brief sealed in it
  writeTree(path.join(runDir, 'option-A'), OPTION);
  const save = runScript('approve.mjs', ['save', '--project', project, '--flow', 'cuenta', '--from', path.join(runDir, 'option-A'), '--values-file', values, '--brief-file', brief, '--date', '2026-10-01']);
  assert.equal(save.status, 0, save.stdout + save.stderr);
  const quote = path.join(runDir, 'choice.txt');
  fs.writeFileSync(quote, 'Me quedo con la opción A');
  assert.equal(runScript('approve.mjs', ['record', '--project', project, '--path', save.json.path, '--quote-file', quote, '--date', '2026-10-01', '--write']).status, 0);
  assert.equal(runScript('approve.mjs', ['verify', '--project', project, '--path', save.json.path]).status, 0);
  return { project, runDir, ctx, approved: save.json.path };
}

function verdictPass({ project, runDir }) {
  const finding = { id: 'J-05', severity: 'medio', scope: 'new', plain: 'Los datos relacionados están separados', evidence: { kind: 'file', path: 'src/a.css', line: 1 }, why: 'Judgment: la proximidad no agrupa' };
  fs.writeFileSync(path.join(runDir, 'auditor.json'), JSON.stringify({ findings: [finding], notVerified: [], independent: true }));
  assert.equal(run(['auditor-check', '--project', project, '--run', runDir]).status, 0);
  const req = run(['verdict-request', '--run', runDir, '--chosen', 'J-05,COLOR-03']);
  assert.equal(req.status, 0, req.stdout + req.stderr);
  assert.deepEqual(req.json.ids, ['J-05']);
  const after = path.join(runDir, 'after');
  const before = run(['verdict', '--project', project, '--run', runDir]);
  fs.writeFileSync(path.join(after, 'verdicts.json'), JSON.stringify({ verdicts: [{ id: 'J-05', status: 'partial', why: 'Falta agrupar el segundo bloque', evidence: { kind: 'file', path: 'src/a.css', line: 2 } }], independent: true }));
  const check = run(['auditor-check', '--project', project, '--run', after, '--mode', 'verdict']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const withVerdicts = run(['verdict', '--project', project, '--run', runDir]);
  assert.deepEqual([withVerdicts.status, withVerdicts.json], [before.status, before.json], 'the verdict word does not depend on verdicts.json');
}

test('4f: PRODUCT.md and the brief enter the run, the brief is sealed in the approved version and the verdict pass validates', () => {
  const k = flow(true);
  assert.equal(k.ctx.json.line, null);
  assert.equal(k.ctx.json.product.status, 'ok');
  assert.ok(fs.existsSync(path.join(k.runDir, 'product.md')) && fs.existsSync(path.join(k.runDir, 'brief.md')));
  const info = JSON.parse(fs.readFileSync(path.join(k.runDir, 'run.json'), 'utf8'));
  assert.deepEqual([info.product, info.brief], ['product.md', 'brief.md']);
  assert.ok(fs.existsSync(path.join(k.project, k.approved, 'brief.md')));
  assert.equal(run(['register', '--project', k.project, '--brief', path.join(k.runDir, 'brief.md')]).json.source, 'design');
  verdictPass(k);
});

test('4f without PRODUCT.md: the line is printed, nothing is copied and everything else goes on the same', () => {
  const k = flow(false);
  assert.equal(k.ctx.json.line, 'sin PRODUCT.md: se sigue sin contexto de producto');
  assert.equal(k.ctx.json.product.status, 'missing');
  assert.equal(fs.existsSync(path.join(k.runDir, 'product.md')), false);
  assert.ok(fs.existsSync(path.join(k.project, k.approved, 'brief.md')), 'the brief is still sealed');
  verdictPass(k);
});

test('4f: version 0.7.5, a CHANGELOG entry with the breaking contract first, one line of impeccable in CREDITS', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.version, '0.7.5');
  const changelog = fs.readFileSync(path.join(PLUGIN_ROOT, 'CHANGELOG.md'), 'utf8');
  const entry = changelog.slice(changelog.indexOf('## 0.7.5'), changelog.indexOf('## 0.7.4'));
  assert.ok(entry.length > 500);
  assert.ok(entry.indexOf('--brief-file') >= 0 && entry.indexOf('--brief-file') < entry.indexOf('PRODUCT.md'), 'the contract change comes first');
  for (const needle of ['direction', 'run.mjs context', 'run.mjs register', 'veredicto', '0,3', 'v1.x', 'tope de 60 líneas'.replace('tope de ', '')]) assert.ok(entry.includes(needle), needle);
  const credits = fs.readFileSync(path.join(PLUGIN_ROOT, 'CREDITS.md'), 'utf8');
  assert.equal(credits.split('\n').filter((l) => /impeccable/i.test(l)).length, 1, 'one line of impeccable');
  assert.ok(!credits.includes('dickwu'));
  assert.ok(credits.includes('segundo veredicto'));
});
