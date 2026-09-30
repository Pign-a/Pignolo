'use strict';
// Sabotaje (spec §4, §11.6): demuestra el rojo sobre código commiteado. Aplica un parche,
// corre el comando declarado y restaura con `git restore --source=HEAD`. El candado vive
// en el git-dir del worktree: git no lo muestra ni lo commitea, y SessionStart lo
// encuentra sin lanzar git para restaurar un sabotaje interrumpido.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { readProjectConfig } = require('./project-config');
const { matchAny } = require('./globs');
const { projectRoot } = require('./disabled');

const LEVELS = ['on-edit', 'on-done'];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const LOCK_GRACE_MS = 10 * 60 * 1000;
const GIT_MS = 120000;
const TAIL_LINES = 40;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

// Error con el exit del CLI: 2 negativa o uso inválido, 3 no se pudo restaurar.
class SabotageError extends Error {
  constructor(message, exit = 2, extra = {}) {
    super(message);
    this.exit = exit;
    Object.assign(this, extra);
  }
}

const lockPath = (gitdir) => path.join(gitdir, 'pignolo-sabotage.json');
const logPath = (gitdir) => path.join(gitdir, 'pignolo-sabotage.log');

// Pathspecs literales: un archivo con * o [ en el nombre no se expande. Sin trim (gitRun
// recorta, y la primera línea de `status --porcelain` puede empezar con espacio).
const GIT_ENV = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };
const gitRaw = (args, cwd) => execFileSync('git', args, {
  cwd, env: GIT_ENV, timeout: GIT_MS, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
const git = (args, cwd) => gitRaw(args, cwd).trim();

// `git status --porcelain -z`: rutas (en un renombre, las dos).
function statusPaths(root) {
  const out = gitRaw(['status', '--porcelain', '-z', '--untracked-files=all'], root);
  const parts = out.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < parts.length; i += 1) {
    const xy = parts[i].slice(0, 2);
    paths.push(parts[i].slice(3));
    if (/[RC]/.test(xy)) { i += 1; paths.push(parts[i]); }
  }
  return paths;
}

// git-dir del worktree del cwd y el común, sin git (la lógica de gitCommon).
function gitDirs(cwd) {
  try {
    const root = projectRoot(cwd);
    const dotGit = path.join(root, '.git');
    if (fs.statSync(dotGit).isDirectory()) return { gitdir: dotGit, common: dotGit };
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    if (!m) return null;
    const gitdir = path.resolve(root, m[1]);
    let common = gitdir;
    try { common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim()); } catch (_) { /* sin commondir */ }
    return { gitdir, common };
  } catch (_) { return null; }
}

// Vivo: process.kill(pid, 0) no lanza o lanza EPERM (proceso ajeno). Viejo: ESRCH, o
// ya pasó `expires` (el pid pudo reutilizarse).
function lockState(gitdir) {
  const file = lockPath(gitdir);
  if (!fs.existsSync(file)) return { state: 'none' };
  let lock;
  try { lock = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new SabotageError(`candado ilegible en ${file} (${e.message}); revisá el worktree y borralo a mano.`, 3);
  }
  const expires = Date.parse(lock.expires);
  if (Number.isFinite(expires) && Date.now() > expires) return { state: 'stale', lock };
  try {
    process.kill(lock.pid, 0);
    return { state: 'alive', lock };
  } catch (e) {
    return { state: e.code === 'EPERM' ? 'alive' : 'stale', lock };
  }
}

// Vuelve files a `head` y borra added. notRestored: de esos, los que siguen distintos;
// newFiles: los demás cambios del árbol.
function restore({ root, head, files = [], added = [] }) {
  if (files.length) {
    try { git(['restore', `--source=${head}`, '--staged', '--worktree', '--', ...files], root); } catch (_) { /* lo mide notRestored */ }
  }
  for (const f of added) {
    try { fs.rmSync(path.join(root, f), { force: true }); } catch (_) { /* lo mide notRestored */ }
  }
  if (added.length) {
    try { git(['rm', '--cached', '-q', '--ignore-unmatch', '--', ...added], root); } catch (_) { /* lo mide notRestored */ }
  }
  const mine = new Set([...files, ...added]);
  const changed = statusPaths(root);
  const notRestored = changed.filter((p) => mine.has(p));
  const newFiles = changed.filter((p) => !mine.has(p));
  return { notRestored, newFiles, clean: notRestored.length === 0 && newFiles.length === 0 };
}

// Restaura un candado viejo. null si no había nada que restaurar (se borra igual).
function recoverLock(gitdir, lock) {
  const root = lock.worktree;
  if (!root || !fs.existsSync(root)) throw new SabotageError(`el candado ${lockPath(gitdir)} nombra un worktree que no existe (${root}); borralo a mano.`, 3);
  const files = Array.isArray(lock.files) ? lock.files : [];
  const added = Array.isArray(lock.added) ? lock.added : [];
  const mine = new Set([...files, ...added]);
  const broken = statusPaths(root).filter((p) => mine.has(p));
  const r = restore({ root, head: lock.head || 'HEAD', files, added });
  if (r.notRestored.length) {
    throw new SabotageError(`no se pudo restaurar el sabotaje interrumpido en ${root}: ${r.notRestored.join(', ')}. Corré: git restore --source=HEAD -- ${r.notRestored.join(' ')}`, 3, { notRestored: r.notRestored, worktree: root });
  }
  fs.rmSync(lockPath(gitdir), { force: true });
  return broken.length ? { worktree: root, files: broken } : null;
}

function recoverGitdir(gitdir) {
  const st = lockState(gitdir);
  if (st.state === 'none') return { recovered: null, busy: null };
  if (st.state === 'alive') return { recovered: null, busy: { gitdir, pid: st.lock.pid, worktree: st.lock.worktree } };
  return { recovered: recoverLock(gitdir, st.lock), busy: null };
}

// Solo el worktree del cwd.
function recover({ cwd = process.cwd() } = {}) {
  const d = gitDirs(cwd);
  const out = { recovered: [], busy: [] };
  if (!d) return out;
  const r = recoverGitdir(d.gitdir);
  if (r.recovered) out.recovered.push(r.recovered);
  if (r.busy) out.busy.push(r.busy);
  return out;
}

// El git-dir del cwd, el común y <common>/worktrees/*/. Sin candado no lanza git.
// Un error en un worktree no frena a los demás: va a `errors`.
function recoverAll({ cwd = process.cwd() } = {}) {
  const out = { recovered: [], busy: [], errors: [] };
  const d = gitDirs(cwd);
  if (!d) return out;
  const dirs = [d.gitdir, d.common];
  try {
    for (const e of fs.readdirSync(path.join(d.common, 'worktrees'), { withFileTypes: true })) {
      if (e.isDirectory()) dirs.push(path.join(d.common, 'worktrees', e.name));
    }
  } catch (_) { /* sin worktrees enlazados */ }
  const seen = new Set();
  for (const gd of dirs) {
    const key = path.resolve(gd).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(lockPath(gd))) continue;
    try {
      const r = recoverGitdir(gd);
      if (r.recovered) out.recovered.push(r.recovered);
      if (r.busy) out.busy.push(r.busy);
    } catch (e) {
      out.errors.push({ gitdir: gd, message: e.message });
    }
  }
  return out;
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (_e) { /* ya terminó */ } }
  }
}

// Corre el comando con shell (los shims .cmd de Windows), salida al log. El plazo mata el árbol.
function runCommand(command, { cwd, env, timeoutMs, logFile, onChild }) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logFile, 'w');
    let timedOut = false;
    let child;
    const done = (res) => { try { fs.closeSync(fd); } catch (_) { /* ya cerrado */ } resolve(res); };
    try {
      child = spawn(command, { cwd, env, shell: true, windowsHide: true, stdio: ['ignore', fd, fd], detached: process.platform !== 'win32' });
    } catch (e) {
      fs.writeSync(fd, `\n[pignolo sabotage] no se pudo lanzar el comando: ${e.message}\n`);
      done({ exit: 127, timedOut });
      return;
    }
    onChild(child);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      try { fs.writeSync(fd, `\n[pignolo sabotage] el comando falló: ${e.message}\n`); } catch (_) { /* log cerrado */ }
      done({ exit: 127, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      onChild(null);
      if (timedOut || code === null) {
        try { fs.writeSync(fd, `\n[pignolo sabotage] el comando no terminó: ${timedOut ? `plazo de ${timeoutMs} ms` : `señal ${signal}`}\n`); } catch (_) { /* log cerrado */ }
      }
      done({ exit: code === null ? 124 : code, timedOut });
    });
  });
}

function tailOf(file) {
  let log = '';
  try { log = fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
  return log.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).slice(-TAIL_LINES).join('\n');
}

// Rutas del parche (`git apply --numstat -z`; en un renombre, las dos).
function patchPaths(root, patch) {
  const out = gitRaw(['apply', '--numstat', '-z', patch], root);
  const parts = out.split('\0');
  const paths = [];
  for (let i = 0; i < parts.length; i += 1) {
    const m = /^[-\d]+\t[-\d]+\t(.*)$/s.exec(parts[i]);
    if (!m) continue;
    if (m[1] !== '') paths.push(m[1]);
    else { paths.push(parts[i + 1], parts[i + 2]); i += 2; }
  }
  return [...new Set(paths.filter(Boolean))];
}

async function sabotage({ cwd = process.cwd(), patchFile, level, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  if (!patchFile) throw new SabotageError('falta --patch <archivo> con un diff unificado.');
  if (level !== undefined && !LEVELS.includes(level)) throw new SabotageError(`--gate debe ser ${LEVELS.join(' | ')}`);
  let root;
  let gitdir;
  try {
    root = path.resolve(git(['rev-parse', '--show-toplevel'], cwd));
    gitdir = path.resolve(git(['rev-parse', '--absolute-git-dir'], cwd));
  } catch (e) {
    throw new SabotageError(`no es un repo git: ${cwd} (${e.message})`);
  }
  const patch = path.resolve(cwd, patchFile);
  if (!fs.existsSync(patch)) throw new SabotageError(`no existe el parche ${patch}`);

  // 1. Un candado viejo se restaura antes de seguir; uno vivo es otro sabotaje en curso.
  const prev = recoverGitdir(gitdir);
  if (prev.busy) throw new SabotageError(`otro sabotaje en curso (pid ${prev.busy.pid}, candado ${lockPath(gitdir)}); esperá a que termine.`);

  // 2. Árbol limpio.
  if (statusPaths(root).length) throw new SabotageError('commiteá o guardá tus cambios (commit WIP) antes de sabotear: el sabotaje restaura desde HEAD.');

  // 3. Comando declarado en HEAD.
  const head = git(['rev-parse', '--verify', 'HEAD'], root);
  const config = readProjectConfig({ root, ref: head, timeoutMs: GIT_MS });
  const lvl = level || (config.gates['on-edit'] ? 'on-edit' : 'on-done');
  const command = config.gates[lvl] || '';
  if (!command) throw new SabotageError(`no hay gates.${lvl} en .pignolo/project.md de HEAD; declaralo para poder sabotear.`);

  // 4. El parche aplica, toca algo, dentro de la raíz y fuera de los tests.
  try { git(['apply', '--check', patch], root); } catch (e) {
    throw new SabotageError(`el parche no aplica sobre HEAD: ${(e.stderr || e.message).toString().trim()}`);
  }
  const all = patchPaths(root, patch);
  if (!all.length) throw new SabotageError('el parche no cambia ningún archivo.');
  const outside = all.filter((p) => path.isAbsolute(p) || path.posix.normalize(p).startsWith('..') || /^\.git(\/|$)/.test(p));
  if (outside.length) throw new SabotageError(`el parche toca rutas fuera de la raíz: ${outside.join(', ')}`);
  const tests = all.filter((p) => matchAny(config.testPaths, p) || matchAny(config.protectedTestConfig, p));
  if (tests.length) throw new SabotageError(`el parche toca tests o su configuración (${tests.join(', ')}): el sabotaje rompe el código, no los tests.`);
  const inHead = new Set(gitRaw(['ls-tree', '-r', '-z', '--name-only', head, '--', ...all], root).split('\0').filter(Boolean));
  const files = all.filter((p) => inHead.has(p));
  const added = all.filter((p) => !inHead.has(p));

  const logFile = logPath(gitdir);
  let child = null;
  let applied = false;
  const finish = () => {
    const r = restore({ root, head, files, added });
    if (r.notRestored.length === 0) fs.rmSync(lockPath(gitdir), { force: true });
    return r;
  };
  // Señal durante el comando: matar el árbol, restaurar si hay parche y salir con 130.
  const onSignal = (sig) => {
    killTree(child);
    let msg = `pignolo sabotage: interrumpido (${sig}).`;
    if (applied) {
      const r = finish();
      if (r.notRestored.length) msg += ` NO se pudo restaurar: ${r.notRestored.join(', ')}. Corré: git restore --source=HEAD -- ${r.notRestored.join(' ')}`;
      else msg += ' Árbol restaurado.';
    }
    process.stderr.write(`${msg}\n`);
    process.exit(130);
  };
  for (const s of SIGNALS) process.on(s, onSignal);
  const onChild = (c) => { child = c; };
  try {
    // 5. Verde previo.
    const before = await runCommand(command, { cwd: root, env, timeoutMs, logFile, onChild });
    if (before.exit !== 0 || before.timedOut) {
      const why = before.timedOut ? 'no terminó en el plazo sin el parche' : `ya falla sin el parche (exit ${before.exit})`;
      throw new SabotageError(`el comando ${why}: el rojo no demostraría nada.`, 2, { greenBefore: false, commandExit: before.exit, logTail: tailOf(logFile) });
    }
    const dirty = statusPaths(root);
    if (dirty.length) throw new SabotageError(`el comando modifica el árbol sin el parche (${dirty.join(', ')}); agregá lo que genera a .gitignore.`, 2, { greenBefore: true });

    // 6. Candado y después el parche.
    const startedAt = Date.now();
    const lock = {
      v: 1, pid: process.pid, startedAt: new Date(startedAt).toISOString(),
      expires: new Date(startedAt + timeoutMs + LOCK_GRACE_MS).toISOString(),
      head, worktree: root, files, added,
    };
    fs.writeFileSync(lockPath(gitdir), JSON.stringify(lock, null, 2));
    applied = true;
    try { git(['apply', patch], root); } catch (e) {
      const r = finish();
      applied = false;
      throw new SabotageError(`git apply falló: ${(e.stderr || e.message).toString().trim()}`, r.notRestored.length ? 3 : 2, r);
    }

    // 7. Con el parche.
    const after = await runCommand(command, { cwd: root, env, timeoutMs, logFile, onChild });
    // 8. Restaurar.
    const r = finish();
    applied = false;
    return {
      red: !after.timedOut && after.exit !== 0, greenBefore: true, exit: after.exit, timedOut: after.timedOut,
      level: lvl, command, files: all, added,
      notRestored: r.notRestored, newFiles: r.newFiles, clean: r.clean, logTail: tailOf(logFile),
    };
  } catch (e) {
    if (applied) {
      const r = finish();
      applied = false;
      if (r.notRestored.length) throw new SabotageError(`${e.message}; además NO se pudo restaurar: ${r.notRestored.join(', ')}. Corré: git restore --source=HEAD -- ${r.notRestored.join(' ')}`, 3, r);
    }
    throw e;
  } finally {
    for (const s of SIGNALS) process.removeListener(s, onSignal);
  }
}

module.exports = { sabotage, recover, recoverAll, lockPath, logPath, SabotageError, DEFAULT_TIMEOUT_MS };
