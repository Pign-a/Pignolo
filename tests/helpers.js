'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

// La guardia toma la instantánea con un plazo real de 2 s (dentro de los 3 s del
// launcher). Con la suite corriendo en paralelo, una máquina cargada lo vence de a
// ratos; el hook lo avisa por systemMessage, nunca en silencio. Para los tests que
// no prueban ese plazo se reintenta el hook hasta 3 veces solo en ese caso;
// cualquier otro resultado vuelve en el primer intento.
const SNAPSHOT_DEADLINE_RE = /la instantánea WIP falló \((?:se agotó el plazo|spawnSync git ETIMEDOUT)/;

function runGuard(payload, env = {}, tries = 3) {
  let r;
  for (let i = 0; i < tries; i += 1) {
    r = runLauncher('guard', payload, env);
    if (!SNAPSHOT_DEADLINE_RE.test(r.stdout)) return r;
  }
  return r;
}

module.exports = { PLUGIN_ROOT, LAUNCHER, makeTempDir, makeRepo, runLauncher, runGuard, git };
