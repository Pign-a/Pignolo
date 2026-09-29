'use strict';
const { execFileSync } = require('node:child_process');

function gitRun(args, cwd, { env = process.env, timeout = 5000, input } = {}) {
  return execFileSync('git', args, {
    cwd, env, timeout, input, encoding: 'utf8', windowsHide: true,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  }).trim();
}

// git corrió y terminó con error (p. ej. 128 fuera de un repo), a diferencia de
// un plazo vencido o de git ausente.
function isGitFailure(e) {
  return typeof e.status === 'number' && !e.signal;
}

function isRepo(cwd, { timeout = 5000 } = {}) {
  try { return gitRun(['rev-parse', '--is-inside-work-tree'], cwd, { timeout }) === 'true'; } catch (_) { return false; }
}

function currentBranch(cwd, { timeout = 5000 } = {}) {
  try {
    const b = gitRun(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, { timeout });
    return b === 'HEAD' ? null : b;
  } catch (_) { return null; }
}

// Todo el trabajo de git de una operación comparte un plazo total: cada llamada
// recibe lo que queda.
function withDeadline(cwd, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return (args, opts = {}) => {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`se agotó el plazo de ${timeoutMs} ms`);
    return gitRun(args, opts.cwd || cwd, { ...opts, timeout: left });
  };
}

module.exports = { gitRun, isGitFailure, isRepo, currentBranch, withDeadline };
