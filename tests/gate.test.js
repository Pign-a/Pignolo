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

function project(cwd, { type = 'code-tested', gate = 'node check.js', extra = '', mutationCmd = null } = {}) {
  const q = JSON.stringify(gate);
  const mut = mutationCmd ? `  mutation: ${JSON.stringify(mutationCmd)}\n` : '';
  const gates = gate === null ? '' : `gates:\n  on-done: ${q}\n  pre-merge: ${q}\n  on-edit: ${q}\n${mut}`;
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

// --- hito 4a, Task 3: debilitados, semilla ofrecida y mutación ---

test('semilla: seed 42 llega al comando por PIGNOLO_TEST_SEED y queda en seal.seedOffered; sin seed es un entero de 32 bits', () => {
  const { cwd } = setup({ check: 'console.log("seed=" + process.env.PIGNOLO_TEST_SEED);\n' });
  const s = real(cwd, { seed: 42 });
  assert.equal(s.seedOffered, 42);
  const log = fs.readFileSync(path.join(sealDir(process.env, repoIdFor({ cwd })), 'logs', `${s.logHash}.log`), 'utf8');
  assert.match(log, /seed=42/);
  const r = real(cwd);
  assert.ok(Number.isInteger(r.seedOffered) && r.seedOffered >= 0 && r.seedOffered < 2 ** 32);
});

test('debilitados: it.skip agregado por un test-writer da INTEGRITY con weakened[0].kind skip; con testAuthorization pasa', () => {
  const { cwd, base } = setup();
  write(cwd, 'tests/a.test.js', "// t\nit.skip('x', () => {});\n");
  const t = { files: ['tests/a.test.js'], agents: ['pignolo:test-writer'] };
  let s = gate(cwd, { task: task(cwd, base, t) });
  assert.equal(s.status, 'INTEGRITY');
  assert.equal(s.checks.weakened[0].kind, 'skip');
  s = gate(cwd, { task: task(cwd, base, { ...t, testAuthorization: true }) });
  assert.equal(s.status, 'PASS');
});

test('debilitados sin tarea: .only sin commitear da INTEGRITY; commiteado solo con --base', () => {
  const { cwd, base } = setup();
  write(cwd, 'tests/a.test.js', "// t\nit.only('x', () => {});\n");
  let s = gate(cwd);
  assert.equal(s.status, 'INTEGRITY');
  assert.equal(s.checks.weakened[0].kind, 'only');
  commit(cwd, 'only');
  s = gate(cwd);
  assert.equal(s.status, 'PASS');
  s = gate(cwd, { base });
  assert.equal(s.status, 'INTEGRITY');
});

test('noProtects: test nuevo sin Protects: se lista; con Protects: en la línea 1 no', () => {
  const { cwd } = setup();
  write(cwd, 'tests/new.test.js', "it('x', () => {});\n");
  write(cwd, 'tests/ok.test.js', "// Protects: R1 · Breaks if: x\nit('y', () => {});\n");
  write(cwd, 'tests/data.json', '{}\n');
  const s = gate(cwd);
  assert.equal(s.status, 'PASS');
  assert.deepEqual(s.checks.noProtects, ['tests/new.test.js']);
});

function riskSetup(mutationCmd, { mutation = true, file = 'src/pay.js' } = {}) {
  const extra = `mutation: ${mutation}\nhigh-risk-paths:\n  - src/pay.js\n`;
  const s = setup({ project: { extra, mutationCmd } });
  write(s.cwd, file, 'module.exports = 7;\n');
  commit(s.cwd, 'cambio');
  return s;
}
const mutExec = (exitCode, calls = []) => (command, { logFile, env }) => {
  calls.push({ command, env });
  fs.appendFileSync(logFile, command === 'node mutate.js' ? 'mutantes\n' : 'ok\n');
  return { exit: command === 'node mutate.js' ? exitCode : 0 };
};

test('mutación en pre-merge: sin gates.mutation da NO_MUTATION_TOOL', () => {
  const { cwd, base } = riskSetup(null);
  const s = gate(cwd, { level: 'pre-merge', base });
  assert.equal(s.status, 'NO_MUTATION_TOOL');
});

test('mutación en pre-merge: exit 1 da MUTATION; exit 0 da PASS con files, la semilla y el log agregado', () => {
  const { cwd, base } = riskSetup('node mutate.js');
  let s = gate(cwd, { level: 'pre-merge', base, exec: mutExec(1) });
  assert.equal(s.status, 'MUTATION');
  const calls = [];
  s = gate(cwd, { level: 'pre-merge', base, seed: 7, exec: mutExec(0, calls) });
  assert.equal(s.status, 'PASS');
  assert.deepEqual(s.checks.mutation, { files: ['src/pay.js'], exit: 0 });
  assert.equal(calls[1].command, 'node mutate.js');
  assert.equal(calls[1].env.PIGNOLO_MUTATE_FILES, 'src/pay.js');
  assert.equal(calls[1].env.PIGNOLO_TEST_SEED, '7');
  const log = fs.readFileSync(path.join(sealDir(process.env, repoIdFor({ cwd })), 'logs', `${s.logHash}.log`), 'utf8');
  assert.match(log, /--- mutation ---\nmutantes/);
});

test('mutación: no corre si el comando de pre-merge falla, si el cambio no toca high-risk-paths ni en on-done', () => {
  const { cwd, base } = riskSetup('node mutate.js');
  const calls = [];
  const failing = (command) => { calls.push(command); return { exit: command === 'node check.js' ? 1 : 0 }; };
  let s = gate(cwd, { level: 'pre-merge', base, exec: failing });
  assert.equal(s.status, 'FAIL');
  assert.deepEqual(calls, ['node check.js']);
  s = gate(cwd, { level: 'on-done', base, exec: mutExec(1) });
  assert.equal(s.status, 'PASS');
  assert.equal(s.checks.mutation, null);
  const other = riskSetup('node mutate.js', { file: 'src/b.js' });
  s = gate(other.cwd, { level: 'pre-merge', base: other.base, exec: mutExec(1) });
  assert.equal(s.status, 'PASS');
  assert.equal(s.checks.mutation, null);
});

// Protects: el mensaje del CLI · Breaks if: NO_MUTATION_TOOL o MUTATION imprimen "Alternativa:" dos veces.
test('CLI: NO_MUTATION_TOOL y MUTATION dicen "Alternativa:" una sola vez', () => {
  for (const cmd of [null, 'node mutate.js']) {
    const { cwd, base } = riskSetup(cmd);
    const r = spawnSync(process.execPath, [CLI, '--level', 'pre-merge', '--cwd', cwd, '--base', base], { encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout).status, cmd ? 'MUTATION' : 'NO_MUTATION_TOOL');
    assert.equal(r.stderr.match(/Alternativa:/g).length, 1, r.stderr);
  }
});

test('CLI: --seed inválido y --base inexistente salen 2', () => {
  const { cwd } = setup();
  let r = spawnSync(process.execPath, [CLI, '--level', 'on-done', '--cwd', cwd, '--seed', 'abc'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  r = spawnSync(process.execPath, [CLI, '--level', 'on-done', '--cwd', cwd, '--base', 'no-existe'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  r = spawnSync(process.execPath, [CLI, '--level', 'on-done', '--cwd', cwd, '--seed', '5'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).seedOffered, 5);
});

test('alcance con mayúsculas (D-7-9, C-08): con core.ignorecase una ruta declarada con otra capitalización cuenta; sin él son archivos distintos', () => {
  for (const [ic, want] of [['true', []], ['false', ['src/a.js']]]) {
    const { cwd, base } = setup();
    git(cwd, 'config', 'core.ignorecase', ic);
    write(cwd, 'src/a.js', 'module.exports = 9;\n');
    commit(cwd, 'cambio');
    const s = gate(cwd, { task: task(cwd, base, { files: ['Src/A.js'] }) });
    assert.deepEqual(s.checks.scope, want, `ignorecase=${ic}`);
    assert.equal(s.status, ic === 'true' ? 'PASS' : 'SCOPE');
  }
  // las rutas declaradas se normalizan: './' y '\'
  const { cwd, base } = setup();
  write(cwd, 'src/a.js', 'module.exports = 9;\n');
  commit(cwd, 'cambio');
  assert.deepEqual(gate(cwd, { task: task(cwd, base, { files: ['.\\src\\a.js'] }) }).checks.scope, []);
});

test('runGate (hito 7a, R-6): afterRun puede pasar el estado a FLAKY y adjuntar repeat; el sello se escribe UNA vez y es no-PASS', () => {
  const { cwd } = setup();
  let seen;
  const s = real(cwd, { level: 'pre-merge', afterRun: (r) => { seen = r; return { status: 'FLAKY', repeat: { runs: 2, same: false, differing: ['tests/a.test.js'] } }; } });
  assert.equal(seen.status, 'PASS', 'el gancho ve el estado de la corrida');
  assert.equal(seen.exit, 0);
  assert.equal(s.status, 'FLAKY');
  assert.deepEqual(s.repeat.differing, ['tests/a.test.js']);
  const repoId = repoIdFor({ cwd });
  const tree = workingTree({ cwd });
  const found = findSeal({ env: process.env, repoId, treeHash: tree, level: 'pre-merge' });
  assert.equal(found.status, 'FLAKY');
  assert.deepEqual(found.repeat.differing, ['tests/a.test.js']);
  const mine = fs.readdirSync(sealDir(process.env, repoId)).filter((f) => f.startsWith(`${tree}-pre-merge-`));
  assert.equal(mine.length, 1, 'exactamente un sello pre-merge para el árbol');
  // un gancho que no devuelve nada deja el estado como está
  const t2 = real(cwd, { level: 'pre-merge', afterRun: () => undefined });
  assert.equal(t2.status, 'PASS');
  assert.equal(t2.repeat, undefined);
});

test('runGate (hito 7a, R-12): una config explícita manda y no se lee project.md; testAuthorization sin tarea abre los tests debilitados', () => {
  const { cwd, base } = setup();
  write(cwd, 'fail.js', 'process.exit(1);\n');
  commit(cwd, 'fail');
  const { readProjectConfig } = require(path.join(PLUGIN, 'lib', 'project-config.js'));
  const cfg = readProjectConfig({ root: cwd });
  const s = real(cwd, { level: 'pre-merge', config: { ...cfg, gates: { ...cfg.gates, 'pre-merge': 'node fail.js' } } });
  assert.equal(s.command, 'node fail.js');
  assert.equal(s.status, 'FAIL');
  // sin tarea: un .skip commiteado contra `base`; con testAuthorization no es INTEGRITY
  write(cwd, 'tests/a.test.js', "// t\nit.skip('x', () => {});\n");
  commit(cwd, 'skip');
  assert.equal(gate(cwd, { base }).status, 'INTEGRITY');
  assert.equal(gate(cwd, { base, testAuthorization: true }).status, 'PASS');
});
