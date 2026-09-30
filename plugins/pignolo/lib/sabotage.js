'use strict';
// Sabotaje (spec §4, §11.6): demuestra el rojo sobre código commiteado. Aplica un parche,
// corre el comando declarado y restaura con `git restore --source=HEAD`. El candado (con
// latido) y una copia del parche viven en el git-dir del worktree: git no los muestra ni
// los commitea, y SessionStart los encuentra sin lanzar git. Un sabotaje interrumpido se
// deshace aplicando la copia al revés, nunca desde HEAD.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { readProjectConfig } = require('./project-config');
const { matchAny } = require('./globs');

const LEVELS = ['on-edit', 'on-done'];
// Por debajo de los 10 min de la herramienta Bash: si la herramienta mata el proceso, el
// candado queda y el árbol con el parche (lo recupera SessionStart o `--recover`).
const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const LOCK_GRACE_MS = 10 * 60 * 1000;
// Latido: mientras el sabotaje vive renueva el mtime del candado; sin latido por más de
// HEARTBEAT_STALE_MS el candado es viejo aunque su pid exista.
const HEARTBEAT_MS = 5000;
const HEARTBEAT_STALE_MS = 30000;
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
const patchCopyPath = (gitdir) => path.join(gitdir, 'pignolo-sabotage.patch');

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

// Raíz del repo sin git: el primer directorio hacia arriba con .git (archivo o carpeta).
// No usa projectRoot: un .pignolo/project.md anidado sin .git lo detendría antes.
function gitTop(cwd) {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

// git-dir del worktree del cwd y el común, sin git (la lógica de gitCommon).
function gitDirs(cwd) {
  try {
    const root = gitTop(cwd);
    if (!root) return null;
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

// Candado del worktree del cwd (la guardia niega commit y add mientras exista), o null.
// Sin git: un existsSync.
function lockedAt(cwd) {
  const d = gitDirs(cwd);
  return d && fs.existsSync(lockPath(d.gitdir)) ? lockPath(d.gitdir) : null;
}

// Vivo: latido reciente (mtime del candado) y process.kill(pid, 0) no lanza o lanza EPERM
// (proceso ajeno). Viejo: ESRCH, latido de más de HEARTBEAT_STALE_MS (Windows reutiliza
// pids: un pid vivo no prueba nada) o ya pasó `expires`.
function lockState(gitdir) {
  const file = lockPath(gitdir);
  let st;
  try { st = fs.statSync(file); } catch (_) { return { state: 'none' }; }
  let lock;
  try { lock = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new SabotageError(`candado ilegible en ${file} (${e.message}); revisá el worktree y borralo a mano.`, 3);
  }
  const expires = Date.parse(lock.expires);
  if (Number.isFinite(expires) && Date.now() > expires) return { state: 'stale', lock };
  if (Date.now() - st.mtimeMs > HEARTBEAT_STALE_MS) return { state: 'stale', lock };
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

const dropLock = (gitdir) => {
  fs.rmSync(lockPath(gitdir), { force: true });
  fs.rmSync(patchCopyPath(gitdir), { force: true });
};

// Restaura un candado viejo aplicando al revés la copia del parche (nunca desde HEAD ni
// sobre el índice): si el usuario editó esos archivos después del corte, `git apply -R
// --check` falla y no se toca nada (exit 3, el candado queda). Antes de restaurar, una
// instantánea WIP (best-effort). null si no había nada que restaurar (se borra igual).
function recoverLock(gitdir, lock, env) {
  const root = lock.worktree;
  if (!root || !fs.existsSync(root)) throw new SabotageError(`el candado ${lockPath(gitdir)} nombra un worktree que no existe (${root}); borralo a mano.`, 3);
  const files = Array.isArray(lock.files) ? lock.files : [];
  const added = Array.isArray(lock.added) ? lock.added : [];
  const mine = new Set([...files, ...added]);
  const broken = statusPaths(root).filter((p) => mine.has(p));
  if (!broken.length) { dropLock(gitdir); return null; } // el parche no llegó a aplicarse
  const copy = patchCopyPath(gitdir);
  const applies = (args) => { try { gitRaw(['apply', ...args, copy], root); return true; } catch (_) { return false; } };
  // El sabotaje ya no está ni en el árbol ni en el índice (el humano lo desagregó): solo cierra el candado.
  if (fs.existsSync(copy) && applies(['--check']) && applies(['--check', '--cached'])) { dropLock(gitdir); return { worktree: root, files: broken }; }
  const untouched = `no se tocó nada. Revisalos: si el cambio es solo el sabotaje, corré en ${root}: git apply -R "${copy}"; si son tuyos, dejalos. Después borrá a mano ${lockPath(gitdir)} y ${copy}.`;
  const extra = { notRestored: broken, worktree: root };
  if (!fs.existsSync(copy)) {
    throw new SabotageError(`sabotaje interrumpido en ${root} sin copia del parche: ${broken.join(', ')} difieren de HEAD y ${untouched}`, 3, extra);
  }
  try { gitRaw(['apply', '-R', '--check', copy], root); } catch (_) {
    throw new SabotageError(`sabotaje interrumpido en ${root}: ${broken.join(', ')} cambiaron después del corte (el parche ya no se deshace limpio); ${untouched}`, 3, extra);
  }
  try {
    require('./git-backup').snapshotWip({ cwd: root, reason: 'antes-de-recuperar-sabotaje', timeoutMs: 10000, env });
  } catch (_) { /* best-effort: la restauración deshace solo el parche */ }
  try { gitRaw(['apply', '-R', copy], root); } catch (e) {
    throw new SabotageError(`no se pudo deshacer el sabotaje interrumpido en ${root} (${(e.stderr || e.message).toString().trim()}); ${untouched}`, 3, extra);
  }
  // El árbol quedó limpio del sabotaje, pero el humano lo había agregado al índice: no se toca
  // el índice (es suyo); el candado queda (la guardia sigue negando commit y add).
  if (applies(['-R', '--check', '--cached'])) {
    throw new SabotageError(`sabotaje interrumpido en ${root}: el árbol quedó restaurado pero el índice conserva el sabotaje en ${broken.join(', ')}. El humano debe correr en ${root}: git restore --staged ${broken.map((p) => `"${p}"`).join(' ')}; después corré --recover otra vez (el candado queda, y la guardia niega commit y add hasta entonces).`, 3, extra);
  }
  dropLock(gitdir);
  return { worktree: root, files: broken };
}

// Con restore: false (pignolo apagado con /pignolo:off) no toca nada: devuelve el
// candado viejo en `pending` para avisar.
function recoverGitdir(gitdir, { restore: doRestore = true, env } = {}) {
  const st = lockState(gitdir);
  if (st.state === 'none') return {};
  if (st.state === 'alive') return { busy: { gitdir, pid: st.lock.pid, worktree: st.lock.worktree } };
  if (!doRestore) {
    const files = [...(Array.isArray(st.lock.files) ? st.lock.files : []), ...(Array.isArray(st.lock.added) ? st.lock.added : [])];
    return { pending: { gitdir, worktree: st.lock.worktree, files } };
  }
  return { recovered: recoverLock(gitdir, st.lock, env) };
}

// Solo el worktree del cwd.
function recover({ cwd = process.cwd(), env = process.env } = {}) {
  const d = gitDirs(cwd);
  const out = { recovered: [], busy: [] };
  if (!d) return out;
  const r = recoverGitdir(d.gitdir, { env });
  if (r.recovered) out.recovered.push(r.recovered);
  if (r.busy) out.busy.push(r.busy);
  return out;
}

// El git-dir del cwd, el común y <common>/worktrees/*/. Sin candado no lanza git.
// Un error en un worktree no frena a los demás: va a `errors`.
function recoverAll({ cwd = process.cwd(), env = process.env, restore: doRestore = true } = {}) {
  const out = { recovered: [], busy: [], pending: [], errors: [] };
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
      const r = recoverGitdir(gd, { restore: doRestore, env });
      if (r.recovered) out.recovered.push(r.recovered);
      if (r.busy) out.busy.push(r.busy);
      if (r.pending) out.pending.push(r.pending);
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

async function sabotage({ cwd = process.cwd(), patchFile, level, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, heartbeatMs = HEARTBEAT_MS } = {}) {
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
  const prev = recoverGitdir(gitdir, { env });
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
  let beat = null;
  const finish = () => {
    const r = restore({ root, head, files, added });
    if (r.notRestored.length === 0) dropLock(gitdir);
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
    // La copia del parche va antes que el candado: la recuperación la aplica al revés.
    fs.copyFileSync(patch, patchCopyPath(gitdir));
    fs.writeFileSync(lockPath(gitdir), JSON.stringify(lock, null, 2));
    beat = setInterval(() => {
      const t = new Date();
      try { fs.utimesSync(lockPath(gitdir), t, t); } catch (_) { /* el candado ya no está */ }
    }, heartbeatMs);
    beat.unref();
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
    clearInterval(beat);
    for (const s of SIGNALS) process.removeListener(s, onSignal);
  }
}

module.exports = { sabotage, recover, recoverAll, lockedAt, lockPath, logPath, patchCopyPath, SabotageError, DEFAULT_TIMEOUT_MS };
