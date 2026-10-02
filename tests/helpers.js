'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn, spawnSync } = require('node:child_process');

const PLUGIN_ROOT = path.join(__dirname, '..', 'plugins', 'pignolo');
const LAUNCHER = path.join(PLUGIN_ROOT, 'hooks', 'launcher.js');

// Cada temporal se borra al salir el proceso del archivo de tests (node --test corre
// uno por archivo). Si un proceso en segundo plano (la siembra que lanza SessionStart)
// todavía lo usa o lo vuelve a crear, lo borra un limpiador desacoplado: reintenta
// cada 0,5 s hasta que ninguno reaparece en 5 s seguidos (60 s como máximo).
const CREATED = [];
const LATER = "const fs=require('fs');const t0=Date.now();let seen=t0;const dirs=process.argv.slice(1);"
  + "(function go(){for(const d of dirs){try{fs.rmSync(d,{recursive:true,force:true});}catch(e){}if(fs.existsSync(d))seen=Date.now();}"
  + 'if(Date.now()-seen<5000&&Date.now()-t0<60000)setTimeout(go,500);})();';

function makeTempDir(prefix = 'pignolo-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  CREATED.push(dir);
  return dir;
}

function cleanupTempDirs() {
  const left = [];
  for (const dir of CREATED.splice(0).reverse()) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); } catch (_) { /* reintenta el limpiador */ }
    left.push(dir);
  }
  if (left.length) spawn(process.execPath, ['-e', LATER, ...left], { cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
process.on('exit', cleanupTempDirs);

// Aislamiento: ningún test toca el ~/.pignolo real. Las llamadas en proceso con
// `env: {}` resuelven el home con os.homedir(), que en Windows lee USERPROFILE.
// Se toma os.tmpdir() antes de cambiar el home (en Windows no depende de él).
const TEST_HOME = makeTempDir('pignolo-userhome-');
process.env.PIGNOLO_HOME = path.join(TEST_HOME, '.pignolo');
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo() {
  const dir = makeTempDir('pignolo-repo-');
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'pignolo-test'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'inicial'], dir);
  return dir;
}

function runLauncher(handler, payload, env = {}) {
  const home = env.PIGNOLO_HOME || makeTempDir('pignolo-home-');
  const res = spawnSync(process.execPath, [LAUNCHER, handler], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PIGNOLO_DISABLED: '', ...env, PIGNOLO_HOME: home },
    timeout: 20000,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

// El handler de la guardia con la instantánea real, pero sin el plazo de 2 s de
// producción. Ese plazo es de reloj: con la suite en paralelo una máquina cargada
// lo vence (medido: con 24 copias la instantánea tarda 2,5 s de mediana), el hook
// la saltea con systemMessage (spec §11.6, a propósito) y un test que después
// busca la instantánea no tiene qué recuperar. Reintentar no lo arregla: bajo
// carga fallan los tres intentos. Para los tests de lo que la instantánea guarda
// se corre el handler sin launcher y con un plazo holgado; el plazo y el camino
// completo por el launcher los prueban tests/guard-handler.test.js con runLauncher.
const TEST_SNAPSHOT_TIMEOUT_MS = 60000;

function runGuard(payload, env = {}) {
  const guard = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'guard.js'));
  const { snapshotWip } = require(path.join(PLUGIN_ROOT, 'lib', 'git-backup.js'));
  const home = env.PIGNOLO_HOME || makeTempDir('pignolo-home-');
  const ctx = {
    env: { ...process.env, PIGNOLO_DISABLED: '', ...env, PIGNOLO_HOME: home },
    snapshot: (o) => snapshotWip({ ...o, timeoutMs: TEST_SNAPSHOT_TIMEOUT_MS }),
  };
  const r = guard.run(typeof payload === 'string' ? JSON.parse(payload) : payload, ctx);
  return { status: r.exit, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

// Hash recursivo MANUAL de un árbol (lstat, sin seguir enlaces): incluye las carpetas vacías y los enlaces como enlaces
// y no entra en ellos. Por defecto no mira .git (el índice cambia con un git mv; los tests comparan `git status` aparte).
function hashTree(dir, { skip = ['.git'] } = {}) {
  const h = crypto.createHash('sha256');
  (function walk(d, rel) {
    for (const n of fs.readdirSync(d).sort()) {
      if (rel === '' && skip.includes(n)) continue;
      const p = path.join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) h.update(`L ${r} -> ${fs.readlinkSync(p)}\0`);
      else if (st.isDirectory()) { h.update(`D ${r}\0`); walk(p, r); } else h.update(`F ${r} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}\0`);
    }
  }(dir, ''));
  return h.digest('hex');
}

module.exports = { PLUGIN_ROOT, LAUNCHER, makeTempDir, makeRepo, runLauncher, runGuard, git, hashTree };
