// run.mjs in subprocesses over temporary repositories.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, PLUGIN_ROOT } from './helpers.mjs';
import { repoIdFor } from '../lib/project-config.mjs';

const RUN_REL = '.pignolo-ui/runs/r1';
const run = (args, opts) => runScript('run.mjs', args, opts);

function makeRepo(tree = {}) {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  writeTree(dir, tree);
  return dir;
}
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body><main>${body}</main></body></html>`;
const runDir = (project) => path.join(project, RUN_REL);
const GOOD_DOM = page('<h1>Hola</h1><p>texto</p>');

test('env prints the plugin version and a boolean claude.ok', () => {
  const r = run(['env']);
  assert.equal(r.status, 0, r.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(r.json.pluginVersion, manifest.version);
  assert.equal(typeof r.json.claude.ok, 'boolean');
});

test('init creates the run under .pignolo-ui/runs, writes run.json and leaves the repo clean', () => {
  const project = makeRepo();
  execFileSync('git', ['add', '-A'], { cwd: project });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-qm', 'x'], { cwd: project });
  const r = run(['init', '--project', project, '--command', 'audit', '--slug', 'inicio', '--url', 'http://localhost:3000', '--files', 'a.html,b.html']);
  assert.equal(r.status, 0, r.stderr);
  const info = JSON.parse(fs.readFileSync(path.join(r.json.run, 'run.json'), 'utf8'));
  assert.equal(info.url, 'http://localhost:3000');
  assert.deepEqual(info.files, ['a.html', 'b.html']);
  assert.equal(path.resolve(info.project), path.resolve(project));
  assert.ok(r.json.run.replace(/\\/g, '/').includes('.pignolo-ui/runs/'));
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }), '');
  const remote = run(['init', '--project', project, '--command', 'audit', '--slug', 'x', '--url', 'https://example.com']);
  assert.equal(remote.status, 2);
});

test('config: rejects a remote devUrl; publish is auto or never; presentation and canvasConsent are not project keys', () => {
  const project = makeRepo();
  const data = makeTempDir();
  const bad = run(['config', 'set', '--data', data, '--project', project, '--key', 'devUrl', '--value', 'https://example.com']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /URL local/);
  assert.doesNotMatch(bad.stderr, /\n\s+at /);
  const set = run(['config', 'set', '--data', data, '--project', project, '--key', 'publish', '--value', 'never']);
  assert.equal(set.status, 0, set.stderr);
  const get = run(['config', 'get', '--data', data, '--project', project]);
  assert.equal(get.json.config.publish, 'never');
  assert.equal(run(['config', 'set', '--data', data, '--project', project, '--key', 'publish', '--value', 'maybe']).status, 2);
  // presentation is the plugin setting, not a project key (the audit measured it: exit 2)
  const pres = run(['config', 'set', '--data', data, '--project', project, '--key', 'presentation', '--value', 'local']);
  assert.equal(pres.status, 2);
  assert.match(pres.stderr, /clave desconocida: presentation/);
  assert.equal(run(['config', 'set', '--data', data, '--project', project, '--key', 'canvasConsent', '--value', 'true']).status, 2);
  assert.equal(run(['config', 'frob', '--data', data, '--project', project]).status, 2);
});

const PRESENT = (project, data, extra = []) => ['present', '--data', data, '--project', project, '--kind', 'option', '--artifact', 'yes', '--design-type', 'yes', ...extra];

test('present: canvas by default with the one-line notice and no question; local without a notice', () => {
  const project = makeRepo();
  const data = makeTempDir();
  assert.equal(run(['present', '--data', data, '--project', project, '--presentation', 'auto', '--artifact', 'yes', '--design-type', 'yes']).status, 2, '--kind is required');
  const r = run(PRESENT(project, data, ['--presentation', 'auto']));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([r.json.mode, r.json.destination, r.json.reasons], ['canvas', 'canvas', []]);
  for (const w of ['privados de tu cuenta de claude.ai', 'nunca capturas ni código', 'Google Fonts', 'config set --key publish --value never']) assert.ok(r.json.notice.includes(w), w);
  assert.equal('consentNeeded' in r.json, false);
  const local = run(PRESENT(project, data, ['--presentation', 'local']));
  assert.deepEqual([local.json.mode, local.json.destination, 'notice' in local.json], ['local', 'local', false]);
  const tile = run(['present', '--data', data, '--project', project, '--kind', 'direction', '--artifact', 'yes', '--design-type', 'yes', '--presentation', 'auto']);
  assert.deepEqual([tile.json.mode, tile.json.reasons], ['local', ['style-tile-local']]);
});

test('present with publish: never in project.json: local, project-opt-out, no notice (A4C-01)', () => {
  const project = makeRepo();
  const data = makeTempDir();
  run(['config', 'set', '--data', data, '--project', project, '--key', 'publish', '--value', 'never']);
  const r = run(PRESENT(project, data, ['--presentation', 'auto']));
  assert.deepEqual([r.json.mode, r.json.reasons, 'notice' in r.json], ['local', ['project-opt-out'], false]);
  const gate = run(['publish-gate', '--data', data, '--project', project, '--presentation', 'auto']);
  assert.equal(gate.status, 1);
  assert.deepEqual(gate.json, { allowed: false, reasons: ['project-opt-out'] });
});

test('present with an unreadable presentation (the literal ${user_config.presentation}): local, presentationUnresolved, no notice (D-4c-15)', () => {
  const project = makeRepo();
  const data = makeTempDir();
  const r = run(PRESENT(project, data, ['--presentation', '${user_config.presentation}']));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([r.json.mode, r.json.presentationUnresolved, r.json.reasons, 'notice' in r.json], ['local', true, ['presentation-local'], false]);
});

test('publish-gate: allowed, presentation-local, run-opt-out, project-opt-out and legacy consent, in order', () => {
  const project = makeRepo({ [`${RUN_REL}/x`]: '' });
  const data = makeTempDir();
  const gate = (extra = []) => run(['publish-gate', '--data', data, '--project', project, ...extra]);
  const ok = gate(['--presentation', 'auto']);
  assert.deepEqual([ok.status, ok.json], [0, { allowed: true, reasons: [] }]);
  assert.deepEqual([gate(['--presentation', 'local']).status, gate(['--presentation', 'local']).json.reasons], [1, ['presentation-local']]);
  const unresolved = gate(['--presentation', '${user_config.presentation}']);
  assert.deepEqual([unresolved.status, unresolved.json.reasons], [1, ['presentation-local']]);
  const nop = run(['no-publish', '--run', runDir(project)]);
  assert.equal(nop.status, 0, nop.stderr);
  assert.ok(fs.existsSync(path.join(runDir(project), 'no-publish')));
  assert.deepEqual(gate(['--presentation', 'auto', '--run', runDir(project)]).json.reasons, ['run-opt-out']);
  run(['config', 'set', '--data', data, '--project', project, '--key', 'publish', '--value', 'never']);
  assert.deepEqual(gate(['--presentation', 'local', '--run', runDir(project)]).json.reasons, ['presentation-local', 'project-opt-out', 'run-opt-out']);
  const outside = run(['no-publish', '--run', path.join(project, 'otra')]);
  assert.equal(outside.status, 2);
  const proj2 = makeRepo();
  const data2 = makeTempDir();
  fs.mkdirSync(path.dirname(configPath(data2, proj2)), { recursive: true });
  fs.writeFileSync(configPath(data2, proj2), JSON.stringify({ canvasConsent: false }));
  const legacy = run(['publish-gate', '--data', data2, '--project', proj2, '--presentation', 'auto']);
  assert.deepEqual([legacy.status, legacy.json.reasons], [1, ['legacy-consent-declined']]);
  fs.writeFileSync(configPath(data2, proj2), JSON.stringify({ canvasConsent: true }));
  assert.equal(run(['publish-gate', '--data', data2, '--project', proj2, '--presentation', 'auto']).status, 0);
});

test('present honours <run>/no-publish: local with run-opt-out and no notice', () => {
  const project = makeRepo({ [`${RUN_REL}/x`]: '' });
  const data = makeTempDir();
  run(['no-publish', '--run', runDir(project)]);
  const r = run(PRESENT(project, data, ['--presentation', 'auto', '--run', runDir(project)]));
  assert.deepEqual([r.json.mode, r.json.reasons, 'notice' in r.json], ['local', ['run-opt-out'], false]);
});

function configPath(data, project) {
  return path.join(data, repoIdFor(project), 'project.json');
}


test('norms writes norms.md with the J criteria; an invalid author file is ignored with a warning', () => {
  const project = makeRepo({ 'mine/norms.md': '---\npignolo: { colour: red }\n---\nx\n', [`${RUN_REL}/x`]: '' });
  const none = run(['norms', '--run', runDir(project)]);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(none.json.user, 'none');
  assert.ok(fs.readFileSync(path.join(runDir(project), 'norms.md'), 'utf8').includes('J-01'));
  const bad = run(['norms', '--run', runDir(project), '--norms', path.join(project, 'mine', 'norms.md')]);
  assert.equal(bad.json.user, 'ignored');
  assert.match(bad.json.warning, /^normas del autor ignoradas/);
});

function checkRun({ dom = GOOD_DOM } = {}) {
  const project = makeRepo({
    [`${RUN_REL}/dom-1440.html`]: dom,
    [`${RUN_REL}/dom-375.html`]: dom,
    [`${RUN_REL}/dom.json`]: JSON.stringify({ doms: [{ path: 'dom-1440.html', width: 1440 }, { path: 'dom-375.html', width: 375 }] }),
    [`${RUN_REL}/browser.json`]: JSON.stringify({ version: 1, entries: [{ id: 'COLOR-03', status: 'pass', severity: 'bloquea', scope: 'new', fingerprint: 'fp-1' }] }),
  });
  return project;
}

test('check passes one --dom per file of dom.json and --measures; exit code of ui-check propagates', () => {
  const project = checkRun();
  const r = run(['check', '--project', project, '--run', runDir(project)]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(fs.readFileSync(path.join(runDir(project), 'ui-check.json'), 'utf8'));
  const files = out.inputs.map((i) => i.file);
  assert.ok(files.some((f) => f.endsWith('dom-1440.html')) && files.some((f) => f.endsWith('dom-375.html')), JSON.stringify(files));
  assert.ok(files.some((f) => f.endsWith('browser.json')));
  const blocking = checkRun({ dom: page('<img src="a.png">') });
  const bad = run(['check', '--project', blocking, '--run', runDir(blocking)]);
  assert.equal(bad.status, 1, bad.stderr);
});

test('check without dom.json, browser.json or --files is exit 2', () => {
  const project = makeRepo({ [`${RUN_REL}/x`]: '' });
  const r = run(['check', '--project', project, '--run', runDir(project)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nada que chequear/);
});

test('leak-values writes a list that leak-check accepts (round trip with the git email)', () => {
  const project = makeRepo();
  execFileSync('git', ['config', 'user.email', 'ana.ejemplo@example.test'], { cwd: project });
  execFileSync('git', ['config', 'user.name', 'Ana Ejemplo'], { cwd: project });
  const values = path.join(makeTempDir(), 'values.json');
  const r = run(['leak-values', '--project', project, '--out', values]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(fs.readFileSync(values, 'utf8')).includes('ana.ejemplo@example.test'));
  const dir = writeTree(makeTempDir(), { 'a.html': '<p>contacto ana.ejemplo@example.test</p>' });
  const leak = runScript('leak-check.mjs', ['--dir', dir, '--values-file', values]);
  assert.equal(leak.status, 1);
});

function optionRun(files) {
  const project = makeRepo();
  const tree = {};
  for (const [name, html] of Object.entries(files)) tree[`${RUN_REL}/option-A/${name}`] = html;
  writeTree(project, tree);
  const gb = path.join(makeTempDir(), 'git-before.txt');
  assert.equal(run(['git-state', '--project', project, '--out', gb]).status, 0);
  return { project, gb };
}
const optArgs = (project, gb, expected) => ['options-check', '--project', project, '--run', runDir(project), '--option', 'A', '--expected', expected, '--git-before', gb];

test('options-check: a script fails with problem script; a good option passes; an img without alt is contradicted', () => {
  const withScript = optionRun({ 'inicio.html': page('<script>1</script>').replace('<head>', '<head><meta charset="utf-8">') });
  const r = run(optArgs(withScript.project, withScript.gb, 'inicio.html'));
  assert.equal(r.status, 1);
  assert.ok(r.json.problems.some((p) => p.problem === 'script'));
  const good = optionRun({ 'inicio.html': page('<h1>Hola</h1><p>texto</p>') });
  const ok = run(optArgs(good.project, good.gb, 'inicio.html'));
  assert.equal(ok.status, 0, ok.stderr + JSON.stringify(ok.json));
  assert.deepEqual(ok.json.contradicted, []);
  const img = optionRun({ 'inicio.html': page('<h1>Hola</h1><img src="a.png">') });
  const c = run(optArgs(img.project, img.gb, 'inicio.html'));
  assert.ok(c.json.contradicted.includes('A11Y-26'), JSON.stringify(c.json));
});

test('discard moves the option into discarded/ with the first free number; refuses a run outside runs/', () => {
  const project = makeRepo({ [`${RUN_REL}/option-B/inicio.html`]: page('<p>1</p>') });
  const r = run(['discard', '--run', runDir(project), '--option', 'B']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(runDir(project), 'option-B')));
  assert.ok(fs.existsSync(path.join(runDir(project), 'discarded', 'option-B-1', 'inicio.html')));
  writeTree(project, { [`${RUN_REL}/option-B/inicio.html`]: page('<p>2</p>') });
  run(['discard', '--run', runDir(project), '--option', 'B']);
  assert.ok(fs.existsSync(path.join(runDir(project), 'discarded', 'option-B-2', 'inicio.html')));
  const outside = makeTempDir();
  fs.mkdirSync(path.join(outside, 'option-B'));
  const bad = run(['discard', '--run', outside, '--option', 'B']);
  assert.equal(bad.status, 2);
  assert.ok(fs.existsSync(path.join(outside, 'option-B')));
});

function auditorRun(finding) {
  const project = makeRepo({
    [`${RUN_REL}/ui-check.json`]: JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'fp-1' }] }),
    'src/a.css': 'a{}\nb{}\n',
  });
  if (finding) writeTree(project, { [`${RUN_REL}/auditor.json`]: JSON.stringify({ findings: [finding], notVerified: [], independent: true }) });
  return project;
}
const finding = (over = {}) => ({ id: 'COLOR-03', severity: 'bloquea', scope: 'new', plain: 'x', evidence: { kind: 'ui-check', fingerprint: 'fp-1' }, why: 'y', ...over });

test('auditor-check: valid -> 0, bloquea with file evidence -> 1, missing file -> 2', () => {
  const ok = auditorRun(finding());
  assert.equal(run(['auditor-check', '--project', ok, '--run', runDir(ok)]).status, 0);
  const bad = auditorRun(finding({ evidence: { kind: 'file', path: 'src/a.css', line: 1 } }));
  const r = run(['auditor-check', '--project', bad, '--run', runDir(bad)]);
  assert.equal(r.status, 1);
  assert.ok(r.json.problems.some((p) => p.problem === 'bloquea-without-script'));
  const none = auditorRun(null);
  assert.equal(run(['auditor-check', '--project', none, '--run', runDir(none)]).status, 2);
});

test('menu preticks symptoms of failed rules, matches words and warns on a bad extra symptom', () => {
  const project = makeRepo({ [`${RUN_REL}/ui-check.json`]: JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'f' }] }) });
  const words = path.join(project, 'words.txt');
  fs.writeFileSync(words, 'se ve plana');
  const extra = path.join(project, 'extra.json');
  fs.writeFileSync(extra, JSON.stringify([{ id: 'nuevo', words: ['x'] }]));
  const r = run(['menu', '--run', runDir(project), '--words-file', words]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.menu.find((m) => m.id === 'hard-to-read').preticked, true);
  assert.equal(r.json.menu.find((m) => m.id === 'flat').preticked, false);
  assert.deepEqual(r.json.matched, ['flat']);
  const w = run(['menu', '--run', runDir(project), '--extra-symptoms-file', extra]);
  assert.match(w.json.warning, /label/);
});

test('report-skeleton and report-line print what lib defines', () => {
  const project = makeRepo({ [`${RUN_REL}/ui-check.json`]: JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'f' }] }) });
  const sk = run(['report-skeleton', '--project', project, '--run', runDir(project)]);
  assert.equal(sk.status, 0, sk.stderr);
  assert.equal(sk.json.candidates.length, 1);
  const facts = path.join(project, 'facts.json');
  fs.writeFileSync(facts, JSON.stringify({ pluginVersion: '0.5.0', degraded: [], subagents: { requested: 3, launched: 3, model: 'sonnet' } }));
  assert.equal(run(['report-line', '--facts', facts]).json.line, 'pignolo-ui 0.5.0 · sin degradaciones · subagentes: 3 de 3 (modelo pedido: sonnet)');
});

function verdictRun({ blocking = false, report = true } = {}) {
  const uiCheck = JSON.stringify({ entries: blocking ? [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'f' }] : [] });
  const project = makeRepo({ [`${RUN_REL}/ui-check.json`]: uiCheck });
  if (report) {
    const sk = run(['report-skeleton', '--project', project, '--run', runDir(project)]);
    writeTree(project, { [`${RUN_REL}/report.json`]: JSON.stringify({ implemented: false, evidence: sk.json.evidence, claims: [] }) });
  }
  return project;
}

test('verdict: terminado, BLOCKED and sin verificar come from the script', () => {
  const ok = verdictRun();
  const r = run(['verdict', '--project', ok, '--run', runDir(ok)]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.status, 'terminado');
  const blocked = verdictRun({ blocking: true });
  const b = run(['verdict', '--project', blocked, '--run', runDir(blocked)]);
  assert.equal(b.status, 1);
  assert.equal(b.json.status, 'BLOCKED');
  const noReport = verdictRun({ report: false });
  const n = run(['verdict', '--project', noReport, '--run', runDir(noReport)]);
  assert.equal(n.status, 1);
  assert.equal(n.json.status, 'sin verificar');
  const broken = run(['verdict', '--project', ok, '--run', runDir(ok), '--build-ok', 'no']);
  assert.equal(broken.json.status, 'BLOCKED');
  assert.ok(broken.json.reasons.some((x) => x.startsWith('build roto')));
});

test('compare-html --no-open writes compare.html in the order of --screens', () => {
  const project = makeRepo({
    [`${RUN_REL}/option-A/zocalo.html`]: page('<p>a</p>'),
    [`${RUN_REL}/option-B/zocalo.html`]: page('<p>b</p>'),
  });
  const r = run(['compare-html', '--run', runDir(project), '--platform', 'desktop', '--screens', 'zocalo.html,detalle.html', '--no-open']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.opened, false);
  const html = fs.readFileSync(path.join(runDir(project), 'compare.html'), 'utf8');
  assert.ok(html.indexOf('zocalo.html') < html.indexOf('detalle.html'));
});

test('an unknown option or subcommand exits 2 with a Spanish message and no stack', () => {
  for (const args of [['env', '--zzz', '1'], ['nada'], ['discard', '--run', 'x', '--option', 'B', '--zzz', '1'], ['verdict', '--zzz', '1']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  }
});
