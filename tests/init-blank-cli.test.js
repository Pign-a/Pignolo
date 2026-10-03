'use strict';
// El camino en blanco de init.js (plan 2026-10-02, Tarea 2). Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git } = require('./helpers');

const INIT = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'init.js');
const ENV = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-blhome-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-blcfg-') });
function cli(args, cwd, env) {
  const r = spawnSync(process.execPath, [INIT, ...args, '--cwd', cwd], { encoding: 'utf8', env: env || ENV(), timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const write = (cwd, rel, text = 'x\n') => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const listing = (repo) => fs.readdirSync(repo, { recursive: true }).map(String).filter((f) => !f.split(/[\\/]/).includes('.git')).sort();
function blankRepo() {
  const d = makeTempDir('pignolo-blrepo-');
  git(['init', '-q', '-b', 'main'], d);
  git(['config', 'user.name', 't'], d);
  git(['config', 'user.email', 't@example.invalid'], d);
  git(['config', 'commit.gpgsign', 'false'], d);
  return d;
}
function planFile(obj) {
  const f = path.join(makeTempDir('pignolo-blplan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}
const BLANK = ['ignores', 'gitattributes', 'reflog', 'skeleton'];
const ALL = ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md', 'security-md', 'auto-memory-off'];
const proposalOf = (d) => {
  const p = {};
  for (const k of ['type', 'gates', 'testPaths', 'protectedTestConfig', 'highRiskPaths', 'contracts', 'serialPaths', 'costPaths', 'visiblePaths', 'depsInstall', 'domainRules']) p[k] = d[k];
  return p;
};

test('en un blanco, preview con todos los pasos falla cerrado (blank-project) y no escribe nada', () => {
  const d = blankRepo();
  write(d, 'README.md');
  const before = listing(d);
  const r = cli(['preview', '--plan', planFile({ v: 1, approved: ALL, answers: {}, proposal: {} })], d);
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'blank-project');
  assert.match(r.stderr, /Alternativa:/);
  assert.deepEqual(listing(d), before);
});

test('en un blanco, un solo paso fuera de la lista (project-md, security-md, adapt, auto-memory-off) también falla cerrado', () => {
  for (const id of ['project-md', 'security-md', 'adapt', 'auto-memory-off']) {
    const d = blankRepo();
    const before = listing(d);
    const r = cli(['apply', '--plan', planFile({ v: 1, approved: [...BLANK, id], answers: {}, proposal: {} }), '--expect', 'x'], d);
    assert.equal(r.json.kind, 'blank-project', id);
    assert.equal(r.status, 1, id);
    assert.deepEqual(listing(d), before, id);
  }
});

test('en un blanco, preview con los cuatro pasos propone solo esos cuatro y no escribe', () => {
  const d = blankRepo();
  const before = listing(d);
  const r = cli(['preview', '--plan', planFile({ v: 1, approved: BLANK, answers: { public: true }, proposal: {} })], d);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.steps.filter((s) => s.status !== 'skipped' || s.reason !== 'not-approved').map((s) => s.id), BLANK);
  for (const id of ['adapt', 'project-md', 'security-md', 'auto-memory-off']) assert.deepEqual(r.json.steps.find((s) => s.id === id), { id, status: 'skipped', reason: 'not-approved' });
  assert.deepEqual(listing(d), before);
});

test('apply en un blanco crea el esqueleto y lo oculto de pignolo, sin project.md, sin type y sin compuertas', () => {
  const d = blankRepo();
  write(d, 'README.md');
  const r = cli(['apply', '--plan', planFile({ v: 1, approved: BLANK, answers: { public: true }, proposal: { type: 'code-tested', gates: { 'on-done': 'npm test' } } })], d);
  assert.equal(r.status, 0, r.stderr);
  const files = listing(d);
  for (const f of ['docs/specs/README.md', 'docs/plans/README.md', 'docs/research/README.md', 'design/README.md', 'local/README.md', '.pignolo/.gitignore', '.gitattributes']) assert.ok(files.includes(path.normalize(f)), f);
  assert.ok(!files.includes(path.normalize('.pignolo/project.md')));
  assert.ok(!files.includes('SECURITY.md'));
  assert.ok(!files.includes(path.normalize('.claude/settings.local.json')));
  assert.equal(git(['config', '--local', '--get', 'gc.reflogExpire'], d), 'never');
});

test('apply en un blanco deja la marca solo si .pignolo/.gitignore la ignora, y sigue siendo blanco', () => {
  const d = blankRepo();
  const r = cli(['apply', '--plan', planFile({ v: 1, approved: BLANK, answers: {}, proposal: {} })], d);
  assert.equal(r.status, 0, r.stderr);
  const marker = path.join(d, '.pignolo', 'tmp', 'init-blank.json');
  assert.equal(JSON.parse(fs.readFileSync(marker, 'utf8')).v, 1);
  assert.equal(cli(['detect'], d).json.blank, true);
  // sin el paso ignores no hay ignore de tmp/: no se escribe la marca (ensuciaría git status)
  const e = blankRepo();
  const r2 = cli(['apply', '--plan', planFile({ v: 1, approved: ['skeleton'], answers: {}, proposal: {} })], e);
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(!fs.existsSync(path.join(e, '.pignolo', 'tmp', 'init-blank.json')));
});

test('apply con todos los pasos en un blanco falla cerrado y deja el árbol igual', () => {
  const d = blankRepo();
  const before = listing(d);
  const r = cli(['apply', '--plan', planFile({ v: 1, approved: ALL.filter((x) => x !== 'adapt'), answers: { channel: 'a@example.invalid', piiPatterns: [] }, proposal: { type: 'code-tested' } })], d);
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'blank-project');
  assert.deepEqual(listing(d), before);
});

test('al sumar un manifiesto el repo deja de ser blanco: init propone la configuración completa y conserva lo que creó el blanco', () => {
  const d = blankRepo();
  write(d, 'README.md');
  assert.equal(cli(['apply', '--plan', planFile({ v: 1, approved: BLANK, answers: { public: true }, proposal: {} })], d).status, 0);
  const readme = fs.readFileSync(path.join(d, 'docs', 'specs', 'README.md'), 'utf8');
  write(d, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '1' } }));
  write(d, 'package-lock.json', '{}');
  write(d, 'vitest.config.ts', 'export default {};\n');
  write(d, 'src/a.test.ts', '// t\n');
  const det = cli(['detect'], d);
  assert.equal(det.json.blank, false);
  assert.equal(det.json.detection.type, 'code-tested');
  const plan = planFile({ v: 1, approved: ALL.filter((x) => x !== 'adapt'), answers: { public: true, channel: 'a@example.invalid', piiPatterns: [] }, proposal: proposalOf(det.json.detection) });
  const pv = cli(['preview', '--plan', plan], d);
  assert.equal(pv.status, 0, pv.stderr);
  assert.equal(pv.json.steps.find((s) => s.id === 'project-md').status, 'would-do');
  const ap = cli(['apply', '--plan', plan, '--expect', pv.json.stamp], d);
  assert.equal(ap.status, 0, ap.stderr);
  const md = fs.readFileSync(path.join(d, '.pignolo', 'project.md'), 'utf8');
  assert.match(md, /^type: code-tested$/m);
  assert.match(md, /on-done:/);
  assert.equal(fs.readFileSync(path.join(d, 'docs', 'specs', 'README.md'), 'utf8'), readme);
});

test('un repo con código nunca se trata como blanco: la configuración completa pasa como antes', () => {
  const d = blankRepo();
  write(d, 'main.py', 'print(1)\n');
  const det = cli(['detect'], d);
  assert.equal(det.json.blank, false);
  const r = cli(['preview', '--plan', planFile({ v: 1, approved: ['ignores', 'skeleton', 'project-md'], answers: {}, proposal: { type: 'script' } })], d);
  assert.equal(r.status, 0, r.stderr);
});

test('verify en un blanco informa blank y un mensaje de commit del esqueleto', () => {
  const d = blankRepo();
  cli(['apply', '--plan', planFile({ v: 1, approved: BLANK, answers: {}, proposal: {} })], d);
  const v = cli(['verify'], d);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.json.blank, true);
  assert.match(v.json.nextCommit.message, /esqueleto/);
  assert.ok(!v.json.nextCommit.files.includes('.pignolo/project.md'));
});
