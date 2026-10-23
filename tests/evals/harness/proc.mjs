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

// Names of the running processes (one entry per process, so duplicates count). Never kills anything.
export function listProcessNames() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) return null;
      return r.stdout.split(/\r?\n/).map((l) => l.match(/^"([^"]+)"/)).filter(Boolean).map((m) => m[1]);
    }
    const r = spawnSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return null;
    return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch { return null; }
}

// Names present in `after` beyond what `before` already had (multiset difference).
export function newProcesses(before, after) {
  const left = new Map();
  for (const n of before || []) left.set(n, (left.get(n) || 0) + 1);
  const out = [];
  for (const n of after || []) {
    const c = left.get(n) || 0;
    if (c > 0) left.set(n, c - 1); else out.push(n);
  }
  return out;
}

// Resolves with { code, signal, timedOut, wallS, error }. Never rejects.
// stdinPath: file whose content becomes the child's stdin (null: no stdin).
export function runProcess({ command, args = [], shell = false, cwd, env, timeoutMs, stdoutPath, stderrPath, stdinPath = null }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const outFd = fs.openSync(stdoutPath, 'w');
    const errFd = fs.openSync(stderrPath, 'w');
    const inFd = stdinPath ? fs.openSync(stdinPath, 'r') : null;
    let done = false;
    let timedOut = false;
    let timer = null;
    const finish = (extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const fd of [outFd, errFd, inFd]) {
        if (fd === null) continue;
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
      resolve({ code: null, signal: null, timedOut, wallS: Math.round(((performance.now() - t0) / 1000) * 100) / 100, error: null, ...extra });
    };
    let child;
    try {
      child = spawn(command, args, {
        cwd, env, shell, stdio: [inFd === null ? 'ignore' : inFd, outFd, errFd], windowsHide: true, detached: process.platform !== 'win32',
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
