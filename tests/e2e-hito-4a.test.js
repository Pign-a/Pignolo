'use strict';
// Punta a punta del hito 4a (spec §15): sabotaje interrumpido → árbol restaurado; holdout
// invisible para el implementer por el launcher real; compuerta con semilla.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, runLauncher } = require('./helpers');

const { lockPath } = require(path.join(PLUGIN_ROOT, 'lib', 'sabotage.js'));
const { holdoutDir } = require(path.join(PLUGIN_ROOT, 'lib', 'holdout.js'));
const { sealDir, repoIdFor } = require(path.join(PLUGIN_ROOT, 'lib', 'seals.js'));
const { seedShadow } = require(path.join(PLUGIN_ROOT, 'lib', 'git-backup.js'));
const ss = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'session-start.js'));
const SABOTAGE = path.join(PLUGIN_ROOT, 'scripts', 'sabotage.js');
const HOLDOUT = path.join(PLUGIN_ROOT, 'scripts', 'holdout.js');
const GATE = path.join(PLUGIN_ROOT, 'scripts', 'gate.js');

// Sin NODE_TEST_CONTEXT: si no, un `node --test` hijo le reporta a este proceso.
const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, rel, text) => {
  const f = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const read = (cwd, rel) => fs.readFileSync(path.join(cwd, rel), 'utf8');
const status = (cwd) => git(cwd, 'status', '--porcelain', '--untracked-files=all');
const gitdirOf = (cwd) => git(cwd, 'rev-parse', '--absolute-git-dir');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

// ─── §15 sabotage ────────────────────────────────────────────────────────────

const A_OK = 'module.exports = () => 1;\n';
// on-edit: sin el parche sale 0; con la marca que agrega el parche escribe la señal
// (con su pid) y duerme 30 s, para que el test lo mate a mitad.
const RUN = "const fs = require('node:fs');\n"
  + "if (!fs.readFileSync('src/a.js', 'utf8').includes('SABOTAJE')) process.exit(0);\n"
  + 'fs.writeFileSync(process.env.PIGNOLO_E2E_SIGNAL, String(process.pid));\n'
  + 'setTimeout(() => {}, 30000);\n';

function sabotageRepo() {
  const cwd = makeRepo();
  write(cwd, 'src/a.js', A_OK);
  write(cwd, 'run.js', RUN);
  write(cwd, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-edit: node run.js\n---\n# proyecto\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  const before = read(cwd, 'src/a.js');
  write(cwd, 'src/a.js', `// SABOTAJE\n${A_OK}`);
  const diff = execFileSync('git', ['diff', '--', 'src/a.js'], { cwd, encoding: 'utf8' });
  write(cwd, 'src/a.js', before);
  const patch = path.join(makeTempDir('pignolo-e2e-patch-'), 'p.diff');
  fs.writeFileSync(patch, diff);
  return { cwd, patch };
}

// Mata el árbol del proceso: ningún `finally` ni manejador de señales llega a correr.
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch (_) { /* ya terminó */ } }
}

// Lanza scripts/sabotage.js, espera la señal (el parche aplicado y el comando corriendo)
// y mata el árbol. Devuelve el pid del comando (el nieto) para comprobar que no quedó vivo.
async function interrupt(t, cwd, patch) {
  const signal = path.join(makeTempDir('pignolo-e2e-signal-'), 'signal');
  const child = spawn(process.execPath, [SABOTAGE, '--patch', patch, '--cwd', cwd], {
    env: { ...ENV, PIGNOLO_E2E_SIGNAL: signal }, stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32',
  });
  const exited = new Promise((r) => { child.on('exit', r); });
  let grandchild = null;
  t.after(() => {
    killTree(child.pid);
    if (grandchild && alive(grandchild)) { try { process.kill(grandchild, 'SIGKILL'); } catch (_) { /* ya muerto */ } }
  });
  const t0 = Date.now();
  while (!fs.existsSync(signal) || !read(path.dirname(signal), 'signal')) {
    assert.equal(child.exitCode, null, 'sabotage.js terminó antes de la señal');
    assert.ok(Date.now() - t0 < 60000, 'no apareció la señal en 60 s');
    await pause(100);
  }
  grandchild = Number(read(path.dirname(signal), 'signal'));
  killTree(child.pid);
  await exited;
  const t1 = Date.now();
  while (alive(grandchild) && Date.now() - t1 < 5000) await pause(100);
  assert.equal(alive(grandchild), false, 'el comando (nieto) sigue vivo');
}

test('§15 sabotage: interrumpido a mitad, --recover restaura el árbol', async (t) => {
  const { cwd, patch } = sabotageRepo();
  await interrupt(t, cwd, patch);
  assert.match(read(cwd, 'src/a.js'), /SABOTAJE/, 'el parche sigue aplicado');
  assert.equal(fs.existsSync(lockPath(gitdirOf(cwd))), true, 'el candado quedó en el git-dir');

  const r = spawnSync(process.execPath, [SABOTAGE, '--recover', '--cwd', cwd], { env: ENV, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(cwd), '');
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(fs.existsSync(lockPath(gitdirOf(cwd))), false);
});

test('§15 sabotage: interrumpido en un worktree de tarea, session-start lo restaura desde el checkout principal', async (t) => {
  const { cwd, patch } = sabotageRepo();
  const home = { PIGNOLO_HOME: path.join(makeTempDir('pignolo-e2e-home-'), '.pignolo') };
  seedShadow({ cwd, env: { ...process.env, ...home }, sessionId: 's' });
  const wt = path.join(makeTempDir('pignolo-e2e-wt-'), 'wt');
  git(cwd, 'worktree', 'add', '-q', '-b', 'tarea', wt);

  await interrupt(t, wt, patch);
  assert.match(read(wt, 'src/a.js'), /SABOTAJE/);
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), true);

  const r = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.match(JSON.parse(r.stdout).systemMessage, /pignolo restauró 1 archivos que un sabotaje interrumpido dejó rotos en /);
  assert.equal(status(wt), '');
  assert.equal(read(wt, 'src/a.js'), A_OK);
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), false);
});

// ─── §15 holdout ─────────────────────────────────────────────────────────────

test('§15 holdout: el implementer no lo encuentra ni lo lee con Glob, Grep, Read ni Bash', () => {
  const home = makeTempDir('pignolo-e2e-userhome-');
  const env = { HOME: home, USERPROFILE: home, PIGNOLO_HOME: path.join(home, '.pignolo') };
  const repo = path.join(home, 'proj');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'pignolo-test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'config', 'core.autocrlf', 'false');
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-done: "node acc/check.js"\n---\n# proyecto\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'proyecto');
  write(repo, '.pignolo/tmp/holdout/p1/tests/acc.test.js', '// Protects: la suma\n');
  const saved = spawnSync(process.execPath, [HOLDOUT, 'save', '--plan', 'p1', '--from', path.join('.pignolo', 'tmp', 'holdout', 'p1')], {
    cwd: repo, env: { ...ENV, ...env }, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(saved.status, 0, saved.stderr);
  const file = path.join(holdoutDir({ env, cwd: repo, plan: 'p1' }), 'tests', 'acc.test.js');
  assert.ok(fs.existsSync(file), 'el holdout quedó guardado en el almacén');

  const who = { agent_id: 'a1', agent_type: 'pignolo:implementer' };
  const call = (handler, tool, input) => runLauncher(handler, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: repo, ...who }, env);
  for (const [tool, input] of [
    ['Read', { file_path: file }],
    ['Glob', { pattern: '**/*.test.js', path: home }],
    ['Grep', { pattern: 'Protects', path: home }],
    ['Bash', { command: 'ls ~/.pignolo/holdout' }],
  ]) {
    const r = call('private-reads', tool, input);
    assert.equal(r.status, 2, `${tool}: ${r.stderr}`);
    assert.match(r.stderr, /Alternativa:/);
  }
  const holdoutJs = HOLDOUT.split(path.sep).join('/');
  const r = call('guard', 'Bash', { command: `node ${holdoutJs} run --plan p1` });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /el holdout lo corre el validator/);
});

// ─── compuerta con semilla ───────────────────────────────────────────────────

test('compuerta con semilla: --seed 7 dos veces sobre el mismo árbol, los dos sellos con seedOffered 7', () => {
  const cwd = makeRepo();
  write(cwd, 'check.js', 'process.exit(0);\n');
  write(cwd, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-done: "node check.js"\n---\n# proyecto\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  const env = { ...ENV, PIGNOLO_HOME: path.join(makeTempDir('pignolo-e2e-home-'), '.pignolo') };
  for (let i = 0; i < 2; i += 1) {
    const r = spawnSync(process.execPath, [GATE, '--level', 'on-done', '--cwd', cwd, '--seed', '7'], { env, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
  }
  const dir = sealDir(env, repoIdFor({ cwd }));
  const seals = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
  assert.equal(seals.length, 2);
  assert.equal(seals[0].treeHash, seals[1].treeHash);
  assert.deepEqual(seals.map((s) => s.seedOffered), [7, 7]);
});
