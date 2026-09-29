'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir } = require('./helpers');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const { runGate } = require(path.join(PLUGIN, 'lib', 'gate.js'));
const { findSeal, sealDir, repoIdFor } = require(path.join(PLUGIN, 'lib', 'seals.js'));
const { workingTree } = require(path.join(PLUGIN, 'lib', 'changes.js'));
const CLI = path.join(PLUGIN, 'scripts', 'gate.js');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, rel, text) => {
  const f = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const commit = (cwd, msg) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', msg); return git(cwd, 'rev-parse', 'HEAD'); };

function project(cwd, { type = 'code-tested', gate = 'node check.js', extra = '' } = {}) {
  const q = JSON.stringify(gate);
  const gates = gate === null ? '' : `gates:\n  on-done: ${q}\n  pre-merge: ${q}\n  on-edit: ${q}\n`;
  write(cwd, '.pignolo/project.md', `---\ntype: ${type}\n${gates}${extra}---\n# proyecto\n`);
}
function setup(opts = {}) {
  const cwd = makeRepo();
  write(cwd, '.gitignore', 'node_modules/\n');
  write(cwd, 'check.js', opts.check || 'process.exit(0);\n');
  write(cwd, 'src/a.js', 'module.exports = 1;\n');
  write(cwd, 'src/b.js', 'module.exports = 2;\n');
  write(cwd, 'tests/a.test.js', '// t\n');
  project(cwd, opts.project);
  const base = commit(cwd, 'base');
  return { cwd, base };
}
const task = (cwd, base, extra = {}) => ({ id: 't1', worktree: cwd, base, files: [], agents: ['pignolo:implementer'], ...extra });
const okExec = (command, { logFile }) => {
  fs.appendFileSync(logFile, 'ok\n');
  return { exit: 0 };
};
const gate = (cwd, o = {}) => runGate({ cwd, level: 'on-done', env: process.env, exec: okExec, ...o });
// con el exec real (spawn de la shell)
const real = (cwd, o = {}) => runGate({ cwd, level: 'on-done', env: process.env, ...o });

test('compuerta vacía en code-untested no da verde: NO_GATE (CLI sale 1)', () => {
  const { cwd } = setup({ project: { type: 'code-untested', gate: null } });
  const s = gate(cwd);
  assert.equal(s.status, 'NO_GATE');
  assert.equal(s.exit, null);
  const r = spawnSync(process.execPath, [CLI, '--level', 'on-done', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, 'NO_GATE');
});

test('on-done con salida 0 sella PASS y findSeal lo encuentra; logHash = sha256 del log', () => {
  const { cwd } = setup();
  const s = real(cwd);
  assert.equal(s.status, 'PASS');
  assert.equal(s.exit, 0);
  const repoId = repoIdFor({ cwd });
  const found = findSeal({ env: process.env, repoId, treeHash: workingTree({ cwd }), level: 'on-done' });
  assert.ok(found);
  assert.equal(found.status, 'PASS');
  const logFile = path.join(sealDir(process.env, repoId), 'logs', `${found.logHash}.log`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(logFile)).digest('hex'), found.logHash);
});

test('salida 1 da FAIL', () => {
  const { cwd } = setup({ check: 'process.exit(1);\n' });
  const s = real(cwd);
  assert.equal(s.status, 'FAIL');
  assert.equal(s.exit, 1);
});

test('un comando que crea un archivo no ignorado da TREE_CHANGED con la ruta en checks.scope', () => {
  const { cwd } = setup({ check: "require('fs').mkdirSync('coverage',{recursive:true});require('fs').writeFileSync('coverage/out.txt','x');\n" });
  const s = real(cwd);
  assert.equal(s.status, 'TREE_CHANGED');
  assert.ok(s.checks.scope.includes('coverage/out.txt'));
  assert.notEqual(s.treeHash, s.treeAfter);
});

test('project.md se lee del commit base, no de la copia de trabajo; y cuenta como integridad', () => {
  const { cwd, base } = setup({ check: 'process.exit(1);\n' });
  project(cwd, { gate: 'true' });
  const s = real(cwd, { task: task(cwd, base) });
  assert.equal(s.command, 'node check.js');
  assert.equal(s.status, 'FAIL');
  assert.ok(s.checks.integrity.includes('.pignolo/project.md'));
});

test('alcance: archivo fuera de task.files da SCOPE; archivo vaciado también, con emptied', () => {
  const { cwd, base } = setup();
  write(cwd, 'src/b.js', 'module.exports = 3;\n');
  write(cwd, 'src/a.js', 'module.exports = 4;\n');
  let s = gate(cwd, { task: task(cwd, base, { files: ['src/a.js'] }) });
  assert.equal(s.status, 'SCOPE');
  assert.deepEqual(s.checks.scope, ['src/b.js']);
  write(cwd, 'src/b.js', 'module.exports = 2;\n');
  write(cwd, 'src/a.js', '');
  s = gate(cwd, { task: task(cwd, base, { files: ['src/a.js'] }) });
  assert.equal(s.status, 'SCOPE');
  assert.deepEqual(s.checks.emptied, ['src/a.js']);
});

test('testRef distinto de base: los tests commiteados entre ambos no cuentan', () => {
  const { cwd, base } = setup();
  write(cwd, 'tests/a.test.js', '// t2\n');
  const testRef = commit(cwd, 'tests');
  write(cwd, 'src/a.js', 'module.exports = 5;\n');
  const s = gate(cwd, { task: task(cwd, base, { testRef, files: ['src/a.js'] }) });
  assert.equal(s.status, 'PASS');
  assert.deepEqual(s.checks.scope, []);
  assert.deepEqual(s.checks.integrity, []);
});

test('3 MB por stdout con salida 0 da PASS (sin ENOBUFS)', () => {
  const { cwd } = setup({ check: "process.stdout.write('x'.repeat(3*1024*1024));\n" });
  const s = real(cwd);
  assert.equal(s.status, 'PASS');
});

test('integridad: test cambiado contra testRef da INTEGRITY; test-writer o autorización con el archivo en files no cuenta', () => {
  const { cwd, base } = setup();
  write(cwd, 'tests/a.test.js', '// cambiado\n');
  let s = gate(cwd, { task: task(cwd, base, { files: ['tests/a.test.js'] }) });
  assert.equal(s.status, 'INTEGRITY');
  assert.deepEqual(s.checks.integrity, ['tests/a.test.js']);
  s = gate(cwd, { task: task(cwd, base, { files: ['tests/a.test.js'], agents: ['pignolo:test-writer'] }) });
  assert.equal(s.status, 'PASS');
  assert.deepEqual(s.checks.integrity, []);
  s = gate(cwd, { task: task(cwd, base, { files: ['tests/a.test.js'], testAuthorization: true }) });
  assert.equal(s.status, 'PASS');
});

test('sin base ni testRef con task da INTEGRITY_NO_REF', () => {
  const { cwd } = setup();
  const s = gate(cwd, { task: { id: 't1', worktree: cwd, files: [], agents: [] } });
  assert.equal(s.status, 'INTEGRITY_NO_REF');
});

test('process.env.VITEST agregado en src marca envDetect sin cambiar el estado', () => {
  const { cwd, base } = setup();
  write(cwd, 'src/a.js', 'module.exports = process.env.VITEST ? 1 : 2;\n');
  const s = gate(cwd, { task: task(cwd, base, { files: ['src/a.js'] }) });
  assert.equal(s.status, 'PASS');
  assert.equal(s.checks.envDetect.length, 1);
  assert.equal(s.checks.envDetect[0].path, 'src/a.js');
  assert.equal(s.checks.envDetect[0].line, 1);
});

test('code-untested verde sin tests cambiados da NO_TESTS (CLI 1); con --no-tests-reason sale 0 y la guarda', () => {
  const { cwd } = setup({ project: { type: 'code-untested' } });
  write(cwd, 'src/a.js', 'module.exports = 6;\n');
  const args = [CLI, '--level', 'on-done', '--cwd', cwd];
  let r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).status, 'NO_TESTS');
  const reasonFile = path.join(makeTempDir('pignolo-reason-'), 'why.txt');
  fs.writeFileSync(reasonFile, 'script sin tests\n');
  r = spawnSync(process.execPath, [...args, '--no-tests-reason', reasonFile], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'NO_TESTS');
  assert.match(out.noTestsReason, /script sin tests/);
});

test('on-edit no escribe sello', () => {
  const { cwd } = setup();
  const repoId = repoIdFor({ cwd });
  const s = gate(cwd, { level: 'on-edit' });
  assert.equal(s.status, 'PASS');
  assert.equal(fs.existsSync(sealDir(process.env, repoId)), false);
});

test('CLI --task sin run.json sale 2 con el mensaje', () => {
  const { cwd } = setup();
  const r = spawnSync(process.execPath, [CLI, '--level', 'on-done', '--task', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no hay una tarea registrada en \.pignolo\/run\.json/);
});
