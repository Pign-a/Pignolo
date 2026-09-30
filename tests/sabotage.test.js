'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir } = require('./helpers');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const { sabotage, recover, lockPath, DEFAULT_TIMEOUT_MS } = require(path.join(PLUGIN, 'lib', 'sabotage.js'));
const ss = require(path.join(PLUGIN, 'hooks', 'handlers', 'session-start.js'));
const guard = require(path.join(PLUGIN, 'hooks', 'handlers', 'guard.js'));
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
// La copia del parche aplicado vive al lado del candado (la recuperación la aplica al revés).
const copyPath = (gitdir) => path.join(gitdir, 'pignolo-sabotage.patch');
function writeLock(gitdir, lock) {
  fs.writeFileSync(lockPath(gitdir), JSON.stringify({ v: 1, startedAt: new Date().toISOString(), added: [], ...lock }));
}
// Latido viejo: el candado es de un sabotaje muerto aunque su pid exista (Windows reutiliza pids).
function staleHeartbeat(gitdir) {
  const t = new Date(Date.now() - 120e3);
  fs.utimesSync(lockPath(gitdir), t, t);
}
const HOUR = () => new Date(Date.now() + 3600e3).toISOString();
// Sabotaje interrumpido de verdad: el parche aplicado, su copia y el candado en el git-dir.
// El pid es el de este proceso (vivo): solo el latido decide si el candado es viejo.
function interrupted(cwd, head, { text = 'module.exports = () => 2;\n', stale = true, expires = HOUR() } = {}) {
  const p = patchOf(cwd, 'src/a.js', text);
  const gd = gitdirOf(cwd);
  git(cwd, 'apply', p);
  fs.copyFileSync(p, copyPath(gd));
  writeLock(gd, { pid: process.pid, expires, head, worktree: cwd, files: ['src/a.js'] });
  if (stale) staleHeartbeat(gd);
  return gd;
}
const PAST = () => new Date(Date.now() - 1000).toISOString();
const SABOTAGED = 'module.exports = () => 2;\n';

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

// Protects: latido del candado · Breaks if: un pid vivo (reutilizado por Windows) con el latido
// viejo cuenta como sabotaje en curso y nadie restaura.
test('--recover restaura con un candado de latido viejo aunque el pid exista, y lo borra', () => {
  const { cwd, head } = setup();
  const gd = interrupted(cwd, head);
  assert.equal(read(cwd, 'src/a.js'), SABOTAGED);
  const r = cli(['--recover', '--cwd', cwd]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.recovered.length, 1);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(status(cwd), '');
  assert.equal(fs.existsSync(lockPath(gd)), false);
  assert.equal(fs.existsSync(copyPath(gd)), false);
});

// Protects: trabajo del usuario · Breaks if: la recuperación restaura desde HEAD (o toca el
// índice) un archivo que el usuario editó y agregó después del corte.
test('file edited after the cut is not overwritten: exit 3, nada tocado, el candado queda', () => {
  const { cwd, head } = setup();
  const gd = interrupted(cwd, head, { expires: PAST() });
  write(cwd, 'src/a.js', 'module.exports = () => 42; // mío\n');
  git(cwd, 'add', 'src/a.js');
  const r = cli(['--recover', '--cwd', cwd]);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /src\/a\.js/);
  assert.match(r.stderr, /git apply -R/);
  assert.equal(read(cwd, 'src/a.js'), 'module.exports = () => 42; // mío\n');
  assert.equal(git(cwd, 'show', ':src/a.js'), 'module.exports = () => 42; // mío');
  assert.equal(fs.existsSync(lockPath(gd)), true);
});

// Protects: la instantánea previa · Breaks if: la recuperación restaura sin dejar antes una
// instantánea WIP del árbol (el estado saboteado queda recuperable por refs/pignolo/wip).
test('la recuperación toma una instantánea WIP antes de restaurar', () => {
  const { cwd, head } = setup();
  interrupted(cwd, head, { expires: PAST() });
  assert.equal(recover({ cwd }).recovered.length, 1);
  const refs = git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/pignolo/wip/');
  assert.notEqual(refs, '');
  assert.equal(git(cwd, 'show', `${refs.split('\n')[0]}:src/a.js`), SABOTAGED.trim());
});

test('recover respeta un candado vivo y vigente; con el plazo vencido restaura', () => {
  const { cwd, head } = setup();
  const gd = interrupted(cwd, head, { stale: false });
  assert.deepEqual(recover({ cwd }).recovered, []);
  assert.equal(read(cwd, 'src/a.js'), SABOTAGED);
  assert.equal(fs.existsSync(lockPath(gd)), true);
  writeLock(gd, { pid: process.pid, expires: new Date(Date.now() - 1000).toISOString(), head, worktree: cwd, files: ['src/a.js'] });
  assert.equal(recover({ cwd }).recovered.length, 1);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
  assert.equal(fs.existsSync(lockPath(gd)), false);
});

// Protects: aviso de candado ocupado · Breaks if: --recover con un sabotaje en curso sale 0 callado.
test('--recover con un sabotaje en curso avisa y sale 2 sin tocar nada', () => {
  const { cwd, head } = setup();
  const gd = interrupted(cwd, head, { stale: false });
  const r = cli(['--recover', '--cwd', cwd]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /sabotaje en curso/);
  assert.equal(read(cwd, 'src/a.js'), SABOTAGED);
  assert.equal(fs.existsSync(lockPath(gd)), true);
});

test('un sabotaje en curso (candado vivo) niega otro sin tocar nada', async () => {
  const { cwd, head } = setup();
  const gd = gitdirOf(cwd);
  writeLock(gd, { pid: process.pid, expires: HOUR(), head, worktree: cwd, files: ['src/a.js'] });
  const p = patchOf(cwd, 'src/a.js', 'module.exports = () => 2;\n');
  await assert.rejects(sabotage({ cwd, patchFile: p, env: ENV }), /otro sabotaje en curso/);
  assert.equal(status(cwd), '');
});

// Protects: git-dir con un project.md anidado · Breaks if: gitDirs se detiene en un
// .pignolo/project.md sin .git y recover no encuentra el candado ni avisa.
test('recover desde un subdirectorio con su propio .pignolo/project.md encuentra el candado del repo', () => {
  const { cwd, head } = setup({ extra: { 'sub/.pignolo/project.md': '---\ntype: docs\n---\n' } });
  interrupted(cwd, head, { expires: PAST() });
  assert.equal(recover({ cwd: path.join(cwd, 'sub') }).recovered.length, 1);
  assert.equal(read(cwd, 'src/a.js'), A_OK);
});

// Protects: plazo por defecto · Breaks if: supera los 10 min de la herramienta Bash (que mata el
// proceso y deja el candado con el código saboteado).
test('el plazo por defecto del sabotaje es de 8 minutos como mucho', () => {
  assert.ok(DEFAULT_TIMEOUT_MS <= 8 * 60 * 1000, String(DEFAULT_TIMEOUT_MS));
});

// Protects: latido durante el comando · Breaks if: el candado no se renueva mientras el comando
// corre y un sabotaje largo parece muerto (o, sin latido, un pid reutilizado parece vivo).
test('el latido renueva el mtime del candado mientras corre el comando', async () => {
  const run = "const fs = require('node:fs');\n"
    + "if (require('./src/a.js')() !== 'sleep') process.exit(0);\n"
    + 'const m0 = fs.statSync(process.env.LOCKFILE).mtimeMs;\n'
    + "setTimeout(() => { fs.writeFileSync(process.env.OUT, String(fs.statSync(process.env.LOCKFILE).mtimeMs - m0)); process.exit(1); }, 1500);\n";
  const { cwd } = setup({ gate: 'node run.js', extra: { 'run.js': run } });
  const out = path.join(makeTempDir(), 'out');
  const p = patchOf(cwd, 'src/a.js', "module.exports = () => 'sleep';\n");
  const r = await sabotage({ cwd, patchFile: p, env: { ...ENV, LOCKFILE: lockPath(gitdirOf(cwd)), OUT: out }, heartbeatMs: 200 });
  assert.equal(r.red, true);
  assert.ok(Number(fs.readFileSync(out, 'utf8')) >= 800, fs.readFileSync(out, 'utf8'));
});

// Protects: guardia con candado · Breaks if: con un sabotaje en curso o interrumpido en el
// worktree, `git commit`/`git add` pasan y commitean el código saboteado.
test('la guardia niega git commit y git add mientras hay un candado en el worktree', () => {
  const { cwd, head } = setup();
  const gd = interrupted(cwd, head, { stale: false });
  const run = (command) => guard.run({ tool_name: 'Bash', cwd, tool_input: { command } }, { env: ENV, snapshot: () => null });
  for (const c of ['git commit -m x', 'git add -A', 'git -c user.name=x commit -am x']) {
    const r = run(c);
    assert.equal(r.exit, 2, c);
    assert.match(r.stderr, /sabotaje/);
    assert.match(r.stderr, /scripts\/sabotage\.js" --recover/);
  }
  assert.equal(run('git status').exit, 0);
  fs.rmSync(lockPath(gd));
  assert.equal(run('git commit -m x').exit, 0);
  assert.equal(run('git add -A').exit, 0);
});

// Worktree de tarea con un sabotaje interrumpido (latido viejo), sembrado para session-start.
function taskWorktree() {
  const { cwd, head } = setup();
  const home = { PIGNOLO_HOME: makeTempDir() };
  seedShadow({ cwd, env: { ...process.env, ...home }, sessionId: 's' });
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(cwd, 'worktree', 'add', '-q', '-b', 'tarea', wt);
  return { cwd, head, home, wt };
}

test('session-start recupera el candado de un worktree de tarea desde el checkout principal', () => {
  const { cwd, head, home, wt } = taskWorktree();
  const quiet = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.equal(quiet.stdout, '');

  interrupted(wt, head);
  const r = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.match(JSON.parse(r.stdout).systemMessage, /pignolo restauró 1 archivos que un sabotaje interrumpido dejó rotos en /);
  assert.equal(read(wt, 'src/a.js'), A_OK);
  assert.equal(status(wt), '');
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), false);
});

// Protects: aviso de candado ocupado · Breaks if: session-start ignora callado un sabotaje en curso.
test('session-start avisa de un sabotaje en curso sin tocarlo', () => {
  const { cwd, head, home, wt } = taskWorktree();
  interrupted(wt, head, { stale: false });
  const r = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  assert.match(JSON.parse(r.stdout).systemMessage, /sabotaje en curso/);
  assert.equal(read(wt, 'src/a.js'), SABOTAGED);
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), true);
});

// Protects: decisión del autor (#6) · Breaks if: con /pignolo:off session-start restaura (o calla)
// un sabotaje interrumpido; tiene que avisar con el worktree, los archivos y el comando.
test('con /pignolo:off session-start no restaura: avisa con los archivos y --recover', () => {
  const { cwd, head, home, wt } = taskWorktree();
  interrupted(wt, head);
  fs.mkdirSync(path.join(cwd, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.pignolo', '.disabled'), '');
  const r = ss.run({ source: 'resume', cwd, session_id: 's' }, { env: home });
  const msg = JSON.parse(r.stdout).systemMessage;
  assert.match(msg, /sabotaje interrumpido/);
  assert.match(msg, /src\/a\.js/);
  assert.match(msg, /scripts[\\/]sabotage\.js" --recover/);
  assert.equal(read(wt, 'src/a.js'), SABOTAGED);
  assert.equal(fs.existsSync(lockPath(gitdirOf(wt))), true);
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
