'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir } = require('./helpers');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const { sabotage, recover, lockPath } = require(path.join(PLUGIN, 'lib', 'sabotage.js'));
const ss = require(path.join(PLUGIN, 'hooks', 'handlers', 'session-start.js'));
const { seedShadow } = require(path.join(PLUGIN, 'lib', 'git-backup.js'));
const CLI = path.join(PLUGIN, 'scripts', 'sabotage.js');

// Sin NODE_TEST_CONTEXT: si no, el `node --test` del comando le reporta a este proceso.
const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (cwd, rel, text) => {
  const f = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const read = (cwd, rel) => fs.readFileSync(path.join(cwd, rel), 'utf8');
const commit = (cwd, msg) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', msg); return git(cwd, 'rev-parse', 'HEAD'); };
const status = (cwd) => git(cwd, 'status', '--porcelain', '--untracked-files=all');

const A_OK = 'module.exports = () => 1;\n';
const A_TEST = "const t = require('node:test');\nconst assert = require('node:assert');\n"
  + "t('a', () => assert.strictEqual(require('../src/a.js')(), 1));\n";

function setup({ gate = 'node --test tests/a.test.js', a = A_OK, extra = {} } = {}) {
  const cwd = makeRepo();
  write(cwd, 'src/a.js', a);
  write(cwd, 'tests/a.test.js', A_TEST);
  write(cwd, '.pignolo/project.md', `---\ntype: code-tested\ngates:\n  on-edit: ${gate}\n---\n# proyecto\n`);
  for (const [rel, text] of Object.entries(extra)) write(cwd, rel, text);
  const head = commit(cwd, 'base');
  return { cwd, head };
}

// Parche de un cambio: se escribe, se toma el diff y se vuelve al contenido de HEAD.
function patchOf(cwd, rel, text) {
  const before = read(cwd, rel);
  write(cwd, rel, text);
  const diff = execFileSync('git', ['diff', '--', rel], { cwd, encoding: 'utf8' });
  write(cwd, rel, before);
  return savePatch(diff);
}
function savePatch(text) {
  const f = path.join(makeTempDir('pignolo-patch-'), 'p.diff');
  fs.writeFileSync(f, text);
  return f;
}
const NEW_FILE_PATCH = 'diff --git a/src/new.js b/src/new.js\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.js\n@@ -0,0 +1 @@\n+module.exports = 2;\n';

function cli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: ENV, timeout: 120000 });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch (_) { /* sin JSON */ }
  return { status: r.status, out, stdout: r.stdout, stderr: r.stderr };
}
const gitdirOf = (cwd) => git(cwd, 'rev-parse', '--absolute-git-dir');
const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
function writeLock(gitdir, lock) {
  fs.writeFileSync(lockPath(gitdir), JSON.stringify({ v: 1, startedAt: new Date().toISOString(), added: [], ...lock }));
}

test('un parche que rompe src/a.js demuestra el rojo: exit 0, árbol limpio, sin candado', () => {
  const { cwd } = setup();
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 2;\n');
  const r = cli(['--patch', p, '--cwd', cwd]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.red, true);
  assert.equal(r.out.greenBefore, true);
  assert.equal(r.out.clean, true);
  assert.deepEqual(r.out.notRestored, []);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(status(cwd), '');
  assert.equal(fs.existsSync(lockPath(gitdirOf(cwd))), false);
});

test('un parche inocuo no da rojo: exit 1 y árbol limpio', () => {
  const { cwd } = setup();
  const p = patchOf(cwd, 'src/a.js', `// comentario\n${A_OK}`);
  const r = cli(['--patch', p, '--cwd', cwd]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.out.red, false);
  assert.equal(r.out.clean, true);
  assert.equal(status(cwd), '');
});

test('un test que ya falla en HEAD: exit 2 "ya falla sin el parche" y nada aplicado', () => {
  const { cwd } = setup({ a: 'module.exports = () => 3;\n' });
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 4;\n');
  const r = cli(['--patch', p, '--cwd', cwd]);
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /ya falla sin el parche/);
  assert.equal(read(cwd, 'src/a.js'), 'module.exports = () => 3;\n');
  assert.equal(status(cwd), '');
  assert.equal(fs.existsSync(lockPath(gitdirOf(cwd))), false);
});

test('árbol sucio (archivo nuevo sin commitear): exit 2 y no se toca nada', () => {
  const { cwd } = setup();
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 2;\n');
  write(cwd, 'notas.txt', 'wip\n');
  const r = cli(['--patch', p, '--cwd', cwd]);
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /commiteá o guardá tus cambios/);
  assert.equal(read(cwd, 'notas.txt'), 'wip\n');
  assert.equal(read(cwd, 'src/a.js'), A_OK);
});

test('un parche que toca tests o que no aplica: exit 2 y nada aplicado', () => {
  const { cwd } = setup();
  const pt = patchOf(cwd, 'tests/a.test.js', A_TEST.replace('(), 1)', '(), 2)'));
  const r1 = cli(['--patch', pt, '--cwd', cwd]);
  assert.equal(r1.status, 2);
  assert.match(r1.stdout + r1.stderr, /tests/);
  const stale = savePatch('diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-module.exports = () => 9;\n+module.exports = () => 8;\n');
  const r2 = cli(['--patch', stale, '--cwd', cwd]);
  assert.equal(r2.status, 2);
  assert.match(r2.stdout + r2.stderr, /no aplica/);
  assert.equal(status(cwd), '');
  assert.equal(read(cwd, 'tests/a.test.js'), A_TEST);
});

test('un parche que agrega src/new.js: después no existe', () => {
  const { cwd } = setup();
  const r = cli(['--patch', savePatch(NEW_FILE_PATCH), '--cwd', cwd]);
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(r.out.files, ['src/new.js']);
  assert.equal(fs.existsSync(path.join(cwd, 'src', 'new.js')), false);
  assert.equal(status(cwd), '');
});

test('--recover restaura con un candado de pid muerto y lo borra', () => {
  const { cwd, head } = setup();
  const gd = gitdirOf(cwd);
  write(cwd, 'src/a.js', 'roto\n');
  writeLock(gd, { pid: deadPid(), expires: new Date(Date.now() + 3600e3).toISOString(), head, worktree: cwd, files: ['src/a.js'] });
  const r = cli(['--recover', '--cwd', cwd]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.recovered.length, 1);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(fs.existsSync(lockPath(gd)), false);
});

test('recover respeta un candado vivo y vigente; con el plazo vencido restaura', () => {
  const { cwd, head } = setup();
  const gd = gitdirOf(cwd);
  write(cwd, 'src/a.js', 'roto\n');
  writeLock(gd, { pid: process.pid, expires: new Date(Date.now() + 3600e3).toISOString(), head, worktree: cwd, files: ['src/a.js'] });
  assert.deepEqual(recover({ cwd }).recovered, []);
  assert.equal(read(cwd, 'src/a.js'), 'roto\n');
  assert.equal(fs.existsSync(lockPath(gd)), true);
  writeLock(gd, { pid: process.pid, expires: new Date(Date.now() - 1000).toISOString(), head, worktree: cwd, files: ['src/a.js'] });
  assert.equal(recover({ cwd }).recovered.length, 1);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(fs.existsSync(lockPath(gd)), false);
});

test('un sabotaje en curso (candado vivo) niega otro sin tocar nada', async () => {
  const { cwd, head } = setup();
  const gd = gitdirOf(cwd);
  writeLock(gd, { pid: process.pid, expires: new Date(Date.now() + 3600e3).toISOString(), head, worktree: cwd, files: ['src/a.js'] });
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 2;\n');
  await assert.rejects(sabotage({ cwd, patchFile: p, env: ENV }), /otro sabotaje en curso/);
  assert.equal(status(cwd), '');
});

test('session-start recupera el candado de un worktree de tarea desde el checkout principal', () => {
  const { cwd, head } = setup();
  const home = { PIGNOLO_HOME: makeTempDir() };
  seedShadow({ cwd, env: { ...process.env, ...home }, sessionId: 's' });
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(cwd, 'worktree', 'add', '-q', '-b', 'tarea', wt);
  const quiet = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.equal(quiet.stdout, '');

  write(wt, 'src/a.js', 'roto\n');
  writeLock(gitdirOf(wt), { pid: deadPid(), expires: new Date(Date.now() + 3600e3).toISOString(), head, worktree: wt, files: ['src/a.js'] });
  const r = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.match(JSON.parse(r.stdout).systemMessage, /pignolo restauró 1 archivos que un sabotaje interrumpido dejó rotos en /);
  assert.equal(read(wt, 'src/a.js'), A_OK);
  assert.equal(status(wt), '');
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), false);
});

test('en Windows, un gates.on-edit que llama a un shim .cmd propio funciona', { skip: process.platform !== 'win32' }, async () => {
  const { cwd } = setup({ gate: "'tools\\t.cmd'", extra: { 'tools/t.cmd': '@node --test tests/a.test.js\r\n' } });
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 2;\n');
  const r = await sabotage({ cwd, patchFile: p, env: ENV });
  assert.equal(r.greenBefore, true);
  assert.equal(r.red, true);
  assert.equal(r.clean, true);
});

// Protects: plazo → matar el árbol del hijo · Breaks if: el plazo mata solo la shell y el
// nieto sigue vivo, o un comando cortado por el plazo cuenta como rojo.
test('el plazo mata el árbol del comando y no cuenta como rojo', async () => {
  const run = "const { spawn } = require('node:child_process');\n"
    + "if (require('./src/a.js')() !== 'sleep') process.exit(0);\n"
    + "const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' });\n"
    + "require('node:fs').writeFileSync(process.env.PIDFILE, `${process.pid} ${c.pid}`);\n";
  const { cwd } = setup({ gate: 'node run.js', extra: { 'run.js': run } });
  const pidFile = path.join(makeTempDir(), 'pids');
  const p = patchOf(cwd, 'src/a.js', "module.exports = () => 'sleep';\n");
  let pids = [];
  try {
    const r = await sabotage({ cwd, patchFile: p, env: { ...ENV, PIDFILE: pidFile }, timeoutMs: 4000 });
    pids = read(path.dirname(pidFile), 'pids').split(' ').map(Number);
    assert.equal(r.timedOut, true);
    assert.equal(r.red, false);
    assert.equal(r.clean, true);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    const t0 = Date.now();
    while (pids.some(alive) && Date.now() - t0 < 5000) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)']);
    assert.deepEqual(pids.filter(alive), []);
  } finally {
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (_) { /* ya muerto */ } }
  }
});
