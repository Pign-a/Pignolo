'use strict';
// Worktrees por tarea (spec §11.2, hito 7a). `createTaskWorktree` es la ÚNICA interfaz que usan el
// resto del plan y las skills; el mecanismo detrás se elige con MECHANISM (D-7-1, Task 13).
// Nunca borra nada: lo que sale mal después de crear la worktree se informa con su ruta.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { withDeadline } = require('./git');
const { readProjectConfig } = require('./project-config');
const B = require('./branches');
const { realNorm } = require('./real-path');

// PUNTO DE ELECCIÓN (D-7-1): 'B' = `git worktree add` a mano (el respaldo en cualquier caso). Si la Task 13
// mide que A (isolation: worktree + hook WorktreeCreate) gana, el hook llama a createTaskWorktree y este valor cambia.
const MECHANISM = 'B';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const TAIL_LINES = 40;

class WorktreeError extends Error {
  constructor(kind, message, extra) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra || {});
  }
}

const tailOf = (log) => log.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).slice(-TAIL_LINES).join('\n');

// Con shell (los shims .cmd de Windows), con plazo y matando el árbol al vencer; salida a un archivo por fd.
// Devuelve el código de salida (124 si no terminó).
// El plazo y el kill del árbol los hace un corredor aparte (lib/shell-runner.js): desde acá, con spawnSync, el shell ya está
// muerto cuando se intenta `taskkill /T` y sus hijos quedan huérfanos (I11).
const RUNNER = path.join(__dirname, 'shell-runner.js');
const RUNNER_GRACE_MS = 20000;
function shellRun(command, { cwd, timeoutMs, logFile, env }) {
  const r = spawnSync(process.execPath, [RUNNER, logFile, String(timeoutMs), command], {
    cwd, env: env || process.env, windowsHide: true, stdio: 'ignore', timeout: timeoutMs + RUNNER_GRACE_MS,
  });
  if (r.error || r.status === null) {
    // El propio corredor se colgó (no debería): sin árbol que buscar, se informa igual que un plazo vencido.
    try { fs.appendFileSync(logFile, `\n[pignolo] el comando no terminó: ${r.error ? r.error.message : `señal ${r.signal}`}\n`); } catch (_) { /* sin log */ }
    return 124;
  }
  return r.status;
}

// El instalador de dependencias (extraído de lib/holdout.js sin cambiar su comportamiento): corre `command`
// con el cwd de la worktree. `logFile` opcional: el holdout comparte su log con el comando de la compuerta.
function installDeps({ cwd, command, env, timeoutMs = DEFAULT_TIMEOUT_MS, logFile }) {
  let dir = null;
  let file = logFile;
  if (!file) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-deps-'));
    file = path.join(dir, 'deps.log');
  }
  try {
    const code = shellRun(command, { cwd, timeoutMs, logFile: file, env });
    let log = '';
    try { log = fs.readFileSync(file, 'utf8'); } catch (_) { /* sin log */ }
    return { ok: code === 0, code, logTail: tailOf(log) };
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

const gitOf = (main, timeoutMs, opts) => (opts && opts.run) || withDeadline(main, timeoutMs, { perCallMs: 120000 });
const tryGit = (git, args, o) => { try { return git(args, o); } catch (_) { return null; } };
const norm = realNorm; // real y sin mayúsculas en Windows: git informa rutas reales (I7)

function verifyRef(git, ref) {
  const sha = tryGit(git, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!sha) throw new WorktreeError('no-ref', `la ref ${ref} no existe`);
  return sha;
}

// Crea la worktree de una tarea: rama task/<plan>/<NN>-<slug> desde `from` (por defecto el contrato más alto
// de contract/<plan>/v<N>; sin contrato, la punta de int/<plan>). Verifica el ancestro (§11.2) e instala las
// dependencias DENTRO de ella. Si algo falla después de crearla, no borra nada: error con `partial: true` y la ruta.
function createTaskWorktree({ main, plan, nn, slug, from, depsInstall = true, env, timeoutMs = DEFAULT_TIMEOUT_MS, opts } = {}) {
  const git = gitOf(main, timeoutMs, opts);
  const branch = B.taskBranch({ plan, nn, slug });
  const worktree = B.taskWorktreePath(main, plan, nn, slug);
  if (tryGit(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) || fs.existsSync(worktree)) {
    throw new WorktreeError('exists', `la tarea ya existe (${fs.existsSync(worktree) ? worktree : branch}); no se toca. Alternativa: usá otro nn/slug o seguí con la worktree que hay`, { worktree, branch });
  }
  // D-7-7: un nombre que difiere solo en mayúsculas ni se crea (en Windows, con refs empaquetadas, borrar uno borra los commits del otro).
  const twin = (tryGit(git, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) || '').split('\n').find((n) => n && n !== branch && n.toLowerCase() === branch.toLowerCase());
  if (twin) {
    throw new WorktreeError('case-collision', `ya existe ${twin}, que difiere de ${branch} solo en mayúsculas; no se crea. Alternativa: usá otro nn/slug`, { branch, twin });
  }
  let ref = from;
  if (!ref) {
    const tags = (tryGit(git, ['for-each-ref', '--format=%(refname)', `refs/tags/contract/${plan}/`]) || '').split('\n').filter(Boolean);
    const latest = B.latestContract({ refs: tags, plan });
    ref = latest ? latest.tag : B.intBranch(plan);
  }
  if (String(ref).startsWith('-')) throw new WorktreeError('no-ref', `ref inválida: ${ref}`);
  const base = verifyRef(git, ref);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  try {
    git(['worktree', 'add', '-b', branch, worktree, base]);
  } catch (e) {
    throw new WorktreeError('partial', `git worktree add falló: ${String(e.stderr || e.message).trim()}. Alternativa: revisá \`git worktree list\` (${worktree}) antes de reintentar`, { worktree, branch, partial: fs.existsSync(worktree) });
  }
  const fail = (kind, message, extra) => new WorktreeError(kind, `${message} (la worktree quedó en ${worktree}; no se borró nada)`, { worktree, branch, base, partial: true, ...extra });
  try {
    git(['merge-base', '--is-ancestor', base, 'HEAD'], { cwd: worktree });
  } catch (_) {
    throw fail('not-ancestor', `${ref} no es ancestro de HEAD en la worktree`);
  }
  if (depsInstall) {
    let cfg;
    try { cfg = readProjectConfig({ root: worktree }); } catch (e) { throw fail('partial', `no se pudo leer project.md en la worktree: ${e.message}`); }
    if (cfg.depsInstall) {
      const r = installDeps({ cwd: worktree, command: cfg.depsInstall, env, timeoutMs });
      if (!r.ok) throw fail('deps-failed', `deps-install salió ${r.code}: ${r.logTail.split('\n').slice(-5).join(' | ')}`, { logTail: r.logTail });
    }
  }
  return { worktree, branch, base };
}

// Solo lectura: las worktrees de tarea (y diarias) de .pignolo/worktrees/, sin la de la cola (_queue/) ni la principal.
function listTaskWorktrees({ main, opts } = {}) {
  const git = gitOf(main, 60000, opts);
  const out = git(['worktree', 'list', '--porcelain']);
  const root = norm(path.join(main, '.pignolo', 'worktrees'));
  const items = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const rec = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^(\w+)(?: (.*))?$/.exec(line);
      if (m) rec[m[1]] = m[2] === undefined ? true : m[2];
    }
    if (!rec.worktree) continue;
    const rel = path.relative(root, norm(rec.worktree));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (rel.split(path.sep)[0] === '_queue') continue;
    const branch = typeof rec.branch === 'string' ? rec.branch.replace(/^refs\/heads\//, '') : null;
    const parsed = branch ? B.parseBranch(branch) : { kind: 'other' };
    let dirty = null;
    try { dirty = git(['status', '--porcelain'], { cwd: rec.worktree }) !== ''; } catch (_) { dirty = null; }
    items.push({
      path: path.resolve(rec.worktree), branch, head: rec.HEAD || null, dirty, kind: parsed.kind,
      plan: parsed.kind === 'task' ? parsed.plan : null, nn: parsed.nn || null, slug: parsed.slug || null,
      prunable: rec.prunable !== undefined, locked: rec.locked !== undefined,
    });
  }
  return items;
}

// contract/<plan>/v<N> en `ref` (por defecto la punta de int/<plan>). N tiene que ser el siguiente y esa punta
// ya tiene que haber entrado por la cola (un cp/<plan>/* sobre ella). Nunca mueve un tag existente.
function tagContract({ main, plan, n, ref, opts } = {}) {
  const git = gitOf(main, 60000, opts);
  const tag = B.contractTag(plan, n);
  const tags = (tryGit(git, ['for-each-ref', '--format=%(refname)', `refs/tags/contract/${plan}/`]) || '').split('\n').filter(Boolean);
  const latest = B.latestContract({ refs: tags, plan });
  const want = latest ? latest.n + 1 : 1;
  if (n !== want) throw new WorktreeError('contract-order', `el próximo contrato de ${plan} es v${want}, no v${n}. Alternativa: pedí contract/${plan}/v${want}`);
  const sha = verifyRef(git, ref || B.intBranch(plan));
  const cps = (tryGit(git, ['tag', '--points-at', sha, '--list', `cp/${plan}/*`]) || '').split('\n').filter(Boolean);
  if (!cps.length) throw new WorktreeError('no-cp', `la punta ${sha.slice(0, 8)} no tiene un cp/${plan}/*: no entró por la cola. Alternativa: integrá la tarea con queue.js y recién después etiquetá el contrato`);
  try {
    git(['tag', tag, sha]);
  } catch (e) {
    throw new WorktreeError('contract-order', `no se pudo crear ${tag}: ${String(e.stderr || e.message).trim()}`);
  }
  return { tag, sha };
}

// La worktree de `tasks` (run.tasks, objetos con `worktree`) que contiene el archivo: la de ruta más larga que sea
// prefijo. path.relative compara sin mayúsculas en win32; `wt-a` y `wt-ab` no se confunden.
function resolveWorktree({ main, filePath, tasks } = {}) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const abs = path.resolve(main || process.cwd(), filePath);
  let best = null;
  for (const task of Array.isArray(tasks) ? tasks : Object.values(tasks || {})) {
    if (!task || typeof task.worktree !== 'string') continue;
    const rel = path.relative(task.worktree, abs);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (!best || task.worktree.length > best.task.worktree.length) best = { worktree: task.worktree, task };
  }
  return best;
}

module.exports = { MECHANISM, WorktreeError, installDeps, shellRun, createTaskWorktree, listTaskWorktrees, tagContract, resolveWorktree };
