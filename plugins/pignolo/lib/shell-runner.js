'use strict';
// Corredor de comandos con plazo que mata el ÁRBOL de procesos al vencer (I11). Lo lanza `shellRun` (lib/worktrees.js) como un
// proceso aparte: uso `node shell-runner.js <logFile> <timeoutMs> <command>`; cwd y env son los del proceso. Sale con el código
// del comando, 124 si venció el plazo (o no pudo lanzarse). Matar desde el padre con spawnSync no alcanza: cuando el shell ya murió
// no se puede encontrar a sus hijos, así que el kill del árbol tiene que ocurrir con el shell todavía vivo.
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const [logFile, timeoutArg, command] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg);
const fd = fs.openSync(logFile, 'a');
const note = (text) => { try { fs.writeSync(fd, `\n[pignolo] ${text}\n`); } catch (_) { /* sin log */ } };

const posix = process.platform !== 'win32';
let child;
try {
  // POSIX: grupo propio para poder matar a todos con kill(-pid). Windows: taskkill /T recorre el árbol por pid.
  child = spawn(command, { shell: true, windowsHide: true, detached: posix, stdio: ['ignore', fd, fd] });
} catch (e) {
  note(`el comando no terminó: ${e.message}`);
  process.exit(124);
}

const killTree = () => {
  if (posix) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (__) { /* ya terminó */ } }
  } else {
    try { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch (_) { /* ya terminó */ }
  }
};

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  killTree();
  note('el comando no terminó: plazo vencido (se mató el árbol de procesos)');
  process.exit(124);
}, timeoutMs);

child.on('error', (e) => {
  clearTimeout(timer);
  note(`el comando no terminó: ${e.message}`);
  process.exit(124);
});
child.on('exit', (code, signal) => {
  if (timedOut) return;
  clearTimeout(timer);
  if (code === null) { note(`el comando no terminó: señal ${signal}`); process.exit(124); }
  process.exit(code);
});
