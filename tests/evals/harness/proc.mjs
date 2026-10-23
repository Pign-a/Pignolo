// Process runner: output goes straight to files, wall clock is measured, the whole tree dies on timeout.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  }
}

// Resolves with { code, signal, timedOut, wallS, error }. Never rejects.
export function runProcess({ command, args = [], shell = false, cwd, env, timeoutMs, stdoutPath, stderrPath }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const outFd = fs.openSync(stdoutPath, 'w');
    const errFd = fs.openSync(stderrPath, 'w');
    let done = false;
    let timedOut = false;
    let timer = null;
    const finish = (extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { fs.closeSync(outFd); } catch { /* ignore */ }
      try { fs.closeSync(errFd); } catch { /* ignore */ }
      resolve({ code: null, signal: null, timedOut, wallS: Math.round(((performance.now() - t0) / 1000) * 100) / 100, error: null, ...extra });
    };
    let child;
    try {
      child = spawn(command, args, {
        cwd, env, shell, stdio: ['ignore', outFd, errFd], windowsHide: true, detached: process.platform !== 'win32',
      });
    } catch (e) {
      finish({ error: e.message });
      return;
    }
    child.on('error', (e) => finish({ error: e.message }));
    child.on('exit', (code, signal) => finish({ code, signal }));
    timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
  });
}
