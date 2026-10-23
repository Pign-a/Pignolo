// audit.mjs in subprocesses over temporary repositories.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, PLUGIN_ROOT } from './helpers.mjs';
import { SUBCOMMANDS, main } from '../scripts/audit.mjs';

const RUN_REL = '.pignolo-ui/runs/r1';
const run = (args, opts) => runScript('audit.mjs', args, opts);

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

test('env prints the plugin version of Pignolo and a boolean claude.ok', () => {
  const r = run(['env']);
  assert.equal(r.status, 0, r.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '..', '.claude-plugin', 'plugin.json'), 'utf8'));
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
  assert.equal(info.project, '.');
  assert.ok(r.json.run.replace(/\\/g, '/').includes('.pignolo-ui/runs/'));
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8' }), '');
  const remote = run(['init', '--project', project, '--command', 'audit', '--slug', 'x', '--url', 'https://example.com']);
  assert.equal(remote.status, 2);
});

test('config: rejects a remote devUrl, keeps a local one and refuses the keys of publishing (publish, presentation, canvas)', () => {
  const project = makeRepo();
  const data = makeTempDir();
  const bad = run(['config', 'set', '--data', data, '--project', project, '--key', 'devUrl', '--value', 'https://example.com']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /URL local/);
  assert.doesNotMatch(bad.stderr, /\n\s+at /);
  const set = run(['config', 'set', '--data', data, '--project', project, '--key', 'devUrl', '--value', 'http://localhost:3000']);
  assert.equal(set.status, 0, set.stderr);
  const routes = run(['config', 'set', '--data', data, '--project', project, '--key', 'routes', '--value', 'index.html,pricing/index.html']);
  assert.equal(routes.status, 0, routes.stderr);
  const get = run(['config', 'get', '--data', data, '--project', project]);
  assert.equal(get.json.config.devUrl, 'http://localhost:3000');
  assert.deepEqual(get.json.config.routes, ['index.html', 'pricing/index.html']);
  assert.equal('optOut' in get.json, false);
  for (const key of ['publish', 'presentation', 'canvasConsent', 'canvas']) {
    const r = run(['config', 'set', '--data', data, '--project', project, '--key', key, '--value', 'never']);
    assert.equal(r.status, 2, key);
    assert.match(r.stderr, new RegExp(`clave desconocida: ${key}`));
  }
  assert.equal(run(['config', 'frob', '--data', data, '--project', project]).status, 2);
});

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

test('check: ui-check exits 0 but prints no JSON -> exit 2 with an explanatory error, never a pass', async () => {
  const project = checkRun();
  let out = '';
  const code = await main(['check', '--project', project, '--run', runDir(project)], {
    cwd: project,
    stdout: { write: (s) => { out += s; } },
    spawn: () => ({ status: 0, stdout: '', stderr: '' }),
  });
  assert.equal(code, 2);
  const json = JSON.parse(out);
  assert.match(json.error, /no imprimió JSON|no devolvió JSON/);
  assert.match(json.error, /no se midió|no verificado/);
});

test('check: ui-check exit code 1 with JSON keeps being a finding (exit 1)', async () => {
  const project = checkRun();
  let out = '';
  const code = await main(['check', '--project', project, '--run', runDir(project)], {
    cwd: project,
    stdout: { write: (s) => { out += s; } },
    spawn: () => ({ status: 1, stdout: JSON.stringify({ status: 1, entries: [] }), stderr: '' }),
  });
  assert.equal(code, 1);
  assert.equal(JSON.parse(out).status, 1);
});

test('check without dom.json, browser.json or --files is exit 2', () => {
  const project = makeRepo({ [`${RUN_REL}/x`]: '' });
  const r = run(['check', '--project', project, '--run', runDir(project)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nada que chequear/);
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

test('report-skeleton and report-line print what lib defines', () => {
  const project = makeRepo({ [`${RUN_REL}/ui-check.json`]: JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'f' }] }) });
  const sk = run(['report-skeleton', '--project', project, '--run', runDir(project)]);
  assert.equal(sk.status, 0, sk.stderr);
  assert.equal(sk.json.candidates.length, 1);
  assert.equal('implemented' in sk.json, false);
  assert.equal(run(['report-skeleton', '--project', project, '--run', runDir(project), '--implements', 'design/approved/x']).status, 2);
  const facts = path.join(project, 'facts.json');
  fs.writeFileSync(facts, JSON.stringify({ pluginVersion: '1.0.0', degraded: [], subagents: { requested: 1, launched: 1, model: 'opus' } }));
  assert.equal(run(['report-line', '--facts', facts]).json.line, 'pignolo ui-audit 1.0.0 · sin degradaciones · subagentes: 1 de 1 (modelo pedido: opus)');
});

test('the dispatcher has only the subcommands of the audit; the ones of publishing and of the old flows exit 2', () => {
  assert.deepEqual([...SUBCOMMANDS].sort(), ['auditor-check', 'check', 'config', 'env', 'init', 'norms', 'report-line', 'report-skeleton']);
  const project = makeRepo({ [`${RUN_REL}/x`]: '' });
  for (const name of ['context', 'present', 'publish-gate', 'no-publish', 'leak-values', 'leak-migrate', 'git-state', 'options-check', 'discard', 'verdict-request', 'register', 'menu', 'option-model', 'verdict', 'compare-html']) {
    const r = run([name, '--project', project]);
    assert.equal(r.status, 2, name);
    assert.match(r.stderr, /falta el subcomando/, name);
  }
});

test('an unknown option or subcommand exits 2 with a Spanish message and no stack', () => {
  for (const args of [['env', '--zzz', '1'], ['nada'], ['norms', '--run', 'x', '--zzz', '1'], ['auditor-check', '--mode', 'verdict']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  }
});

test('auditor-check prints the keep line: its text when valid, null when absent, null and exit 1 when invalid', () => {
  const withKeep = (keep) => {
    const project = auditorRun(null);
    const out = { findings: [finding()], notVerified: [], independent: true };
    if (keep !== undefined) out.keep = keep;
    writeTree(project, { [`${RUN_REL}/auditor.json`]: JSON.stringify(out) });
    return project;
  };
  const ok = withKeep('la tabla se lee bien');
  const r1 = run(['auditor-check', '--project', ok, '--run', runDir(ok)]);
  assert.equal(r1.status, 0);
  assert.equal(r1.json.keep, 'la tabla se lee bien');
  const none = withKeep(undefined);
  const r2 = run(['auditor-check', '--project', none, '--run', runDir(none)]);
  assert.equal(r2.status, 0);
  assert.equal(r2.json.keep, null);
  const bad = withKeep('x'.repeat(161));
  const r3 = run(['auditor-check', '--project', bad, '--run', runDir(bad)]);
  assert.equal(r3.status, 1);
  assert.ok(r3.json.problems.some((p) => p.problem === 'bad-keep'));
  assert.equal(r3.json.keep, null);
});
