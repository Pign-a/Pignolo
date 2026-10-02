'use strict';
// Cola de integración (spec §11.3, hito 7a). Parte 1: sincronizar, prever, mergear y clasificar conflictos.
// Esta parte no avanza `int/<plan>`: lo único irreversible local lo hace la parte 2 (integrate).
// Todo git entra por un ejecutor inyectable `opts.run(args, { cwd, timeout, input, raw })` que devuelve el texto
// de stdout (recortado, salvo raw) y LANZA si git sale distinto de 0, con `status`, `stdout` y `stderr` en el
// error (como execFileSync): nunca por un envoltorio en el PATH (A7-18).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const B = require('./branches');
const { realNorm } = require('./real-path');
const { expandSeed } = require('./init-seed');
const { matchAny } = require('./globs');
const { readProjectConfig } = require('./project-config');
const { runGate } = require('./gate');
const { backupRefs } = require('./git-backup');
const { readRun, taskList } = require('./project');
const { installDeps, shellRun } = require('./worktrees');

const GIT_MS = 2 * 60 * 1000;
const LONG_MS = 5 * 60 * 1000; // merge, commit, revert, worktree: más que el 5 s de lib/git.js
const NO_RERERE = ['-c', 'rerere.enabled=false', '-c', 'commit.gpgsign=false'];
const TRIVIAL_MAX_LINES = 20;

class QueueError extends Error {
  constructor(kind, message, extra) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra || {});
  }
}

// El ejecutor por defecto: git de verdad, con plazo propio.
function defaultRun(cwd) {
  return (args, o = {}) => {
    const out = execFileSync('git', args, {
      cwd: o.cwd || cwd, env: o.env || process.env, timeout: o.timeout || GIT_MS, input: o.input, maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8', windowsHide: true, stdio: [o.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    return o.raw ? out : out.trim();
  };
}
const runnerOf = (main, opts) => (opts && opts.run) || defaultRun(main);
const tryRun = (git, args, o) => { try { return git(args, o); } catch (_) { return null; } };
const errText = (e) => `${e.stderr || ''}${e.stdout || ''}`.trim() || e.message;

const norm = realNorm; // real y sin mayúsculas en Windows: git informa rutas reales (I7)

// Una rama (task/<plan>/<NN>-<slug>) o el número NN de una de ellas.
function resolveTask({ main, plan, task, opts }) {
  const git = runnerOf(main, opts);
  if (typeof task !== 'string' || !task || task.startsWith('-')) throw new QueueError('no-branch', `tarea inválida: ${task}`);
  if (B.NN_RE.test(task)) {
    const names = (tryRun(git, ['for-each-ref', '--format=%(refname:short)', `refs/heads/task/${plan}/${task}-*`]) || '').split('\n').filter(Boolean);
    const ok = names.filter((n) => B.parseBranch(n).kind === 'task');
    if (ok.length !== 1) throw new QueueError('no-branch', ok.length ? `la tarea ${task} es ambigua: ${ok.join(', ')}` : `no hay una rama task/${plan}/${task}-*`);
    return ok[0];
  }
  const p = B.parseBranch(task);
  if (p.kind !== 'task' || p.plan !== plan) throw new QueueError('no-branch', `${task} no es una rama de tarea del plan ${plan}`);
  return task;
}

const branchSha = (git, name) => tryRun(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}^{commit}`]);

function listWorktrees(git) {
  const out = tryRun(git, ['worktree', 'list', '--porcelain']) || '';
  const items = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const rec = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^(\w+)(?: (.*))?$/.exec(line);
      if (m) rec[m[1]] = m[2] === undefined ? true : m[2];
    }
    if (rec.worktree) items.push(rec);
  }
  return items;
}

const mergeInProgress = (git, cwd) => Boolean(tryRun(git, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], { cwd }));

// Crea (o reutiliza, nunca borra) la worktree de la cola y deja queue/<plan> en la punta ACTUAL de int/<plan> (R-4).
function syncQueue({ main, plan, opts } = {}) {
  const git = runnerOf(main, opts);
  const intSha = branchSha(git, B.intBranch(plan));
  if (!intSha) throw new QueueError('no-int', `no existe ${B.intBranch(plan)}. Alternativa: creá la rama del plan antes de integrar`);
  const wt = B.queueWorktreePath(main, plan);
  const branch = B.queueBranch(plan);
  const registered = listWorktrees(git).some((w) => norm(w.worktree) === norm(wt));
  if (registered) {
    const dirty = git(['status', '--porcelain'], { cwd: wt });
    if (dirty !== '' || mergeInProgress(git, wt)) {
      throw new QueueError('queue-dirty', `la worktree de la cola (${wt}) tiene cambios sin commitear o un merge en curso; no se pisan. Alternativa: revisalos con \`git -C\` a mano o resolvelos y repetí`, { worktree: wt });
    }
  } else {
    if (fs.existsSync(wt)) {
      let entries = [];
      try { entries = fs.readdirSync(wt); } catch (_) { entries = ['?']; }
      if (entries.length) throw new QueueError('queue-path-occupied', `la ruta ${wt} existe, no figura en \`git worktree list\` y no está vacía; no se toca. Alternativa: revisala a mano y repetí`, { worktree: wt });
    }
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    try {
      git(['worktree', 'add', '--detach', wt, intSha], { timeout: LONG_MS });
    } catch (e) {
      throw new QueueError('queue-worktree-failed', `no se pudo crear la worktree de la cola: ${errText(e)}`, { worktree: wt });
    }
  }
  try {
    git(['switch', '--quiet', '-C', branch, intSha], { cwd: wt, timeout: LONG_MS });
  } catch (e) {
    throw new QueueError('queue-switch-failed', `no se pudo dejar ${branch} en ${intSha.slice(0, 8)}: ${errText(e)}`, { worktree: wt });
  }
  return { worktree: wt, branch, intSha };
}

// Rutas que una tarea no puede tocar: el estado entra por el hilo principal y la configuración la decide el autor (R-9).
const STATE_PREFIX = '.pignolo/state/';
const CONFIG_FILE = '.pignolo/project.md';

function precheck({ main, plan, task, opts } = {}) {
  const git = runnerOf(main, opts);
  const int = B.intBranch(plan);
  if (!branchSha(git, task)) return { ok: false, kind: 'no-branch', files: [] };
  const tags = (tryRun(git, ['for-each-ref', '--format=%(refname)', `refs/tags/contract/${plan}/`]) || '').split('\n').filter(Boolean);
  const contract = B.latestContract({ refs: tags, plan });
  if (contract) {
    const mb = tryRun(git, ['merge-base', int, task]);
    const ok = mb && tryRun(git, ['merge-base', '--is-ancestor', `refs/tags/${contract.tag}`, mb]) !== null;
    if (!ok) return { ok: false, kind: 'not-ancestor', files: [], contract: contract.tag };
  }
  // Tres puntos (desde el merge-base) y sin renombres: así un commit de estado hecho en int/ después de ramificar
  // no aparece como cambio de la tarea, y un renombrado lista sus dos rutas (A7-10).
  const changed = (git(['diff', '--name-only', '--no-renames', `${int}...${task}`]) || '').split('\n').filter(Boolean);
  const state = changed.filter((f) => f.startsWith(STATE_PREFIX));
  if (state.length) return { ok: false, kind: 'state-change', files: state, changed };
  if (changed.includes(CONFIG_FILE)) return { ok: false, kind: 'config-change', files: [CONFIG_FILE], changed };
  return { ok: true, files: changed };
}

// git merge-tree --write-tree --name-only --no-messages: limpio = exit 0 y solo el OID; conflicto = exit 1, el OID y las
// rutas; una ref inexistente TAMBIÉN da exit 1 (stdout vacío): el código solo no distingue (R-5, A7-09).
const OID_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
function parseMergeTree({ code, stdout }) {
  const lines = String(stdout || '').split(/\r?\n/);
  const first = lines[0] || '';
  if (code === 0 && OID_RE.test(first)) return { status: 'clean', conflicts: [] };
  if (code === 1 && OID_RE.test(first)) return { status: 'conflicts', conflicts: lines.slice(1).filter(Boolean) };
  throw new QueueError('preview-failed', `git merge-tree no dio un resultado reconocible (exit ${code}, primera línea ${JSON.stringify(first.slice(0, 60))})`);
}

function gitVersionOf(git) {
  const m = /(\d+)\.(\d+)/.exec(tryRun(git, ['--version']) || '');
  return m ? `${m[1]}.${m[2]}` : '0.0';
}
const atLeast = (version, major, minor) => {
  const [a, b] = String(version).split('.').map(Number);
  return a > major || (a === major && b >= minor);
};

// Previsión sin tocar nada. Con git < 2.38 se omite (`unavailable`) y no se sube el mínimo del spec.
function previewMerge({ main, plan, task, gitVersion, opts } = {}) {
  const git = runnerOf(main, opts);
  const int = B.intBranch(plan);
  for (const ref of [int, task]) {
    if (!tryRun(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}^{commit}`])) {
      throw new QueueError('preview-failed', `no existe la rama ${ref}`);
    }
  }
  if (!atLeast(gitVersion || gitVersionOf(git), 2, 38)) return { mergeTree: 'unavailable', conflicts: [] };
  let code = 0;
  let stdout = '';
  try {
    stdout = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', int, task], { timeout: LONG_MS });
  } catch (e) {
    if (typeof e.status !== 'number') throw new QueueError('preview-failed', `git merge-tree no corrió: ${errText(e)}`);
    code = e.status;
    stdout = String(e.stdout || '');
  }
  const r = parseMergeTree({ code, stdout });
  return { mergeTree: r.status, conflicts: r.conflicts };
}

// ---------------------------------------------------------------- clasificación de conflictos

// Cada línea insertada tiene que cumplir una de estas expresiones COMPLETAS (A7-08). Los identificadores y las
// palabras sueltas (`return`, `break`, `true`) no son triviales.
const IMPORT_LINE = /^\s*(?:import\s.+|from\s+\S+\s+import\s.+|(?:const|let|var)\s+[\w{}, ]+=\s*require\(.+\);?|export\s+(?:\*|\{[^}]*\})\s+from\s.+)\s*$/;
const LIST_ENTRY = /^\s*["'][^"']+["'],\s*$/;
const BULLET = /^\s*[-*]\s.+$/;
const BLANK = /^\s*$/;

function trivialLine(line, path_) {
  if (BLANK.test(line) || IMPORT_LINE.test(line) || LIST_ENTRY.test(line)) return true;
  return /\.md$/i.test(path_) && BULLET.test(line);
}

// Bloques de la salida de `git merge-file -p --diff3`: { ours, base, theirs } y el texto fuera de bloques.
function parseConflictBlocks(text) {
  const lines = text.split('\n');
  const parts = []; // { text } | { ours, base, theirs }
  let cur = null;
  let side = null;
  for (const line of lines) {
    if (/^<{7}( |$)/.test(line) && !cur) { cur = { ours: [], base: [], theirs: [] }; side = 'ours'; continue; }
    if (cur && /^\|{7}( |$)/.test(line)) { side = 'base'; continue; }
    if (cur && /^={7}$/.test(line)) { side = 'theirs'; continue; }
    if (cur && /^>{7}( |$)/.test(line)) { parts.push(cur); cur = null; side = null; continue; }
    if (cur) cur[side].push(line);
    else parts.push({ text: line });
  }
  return parts;
}

// Conflicto trivial = solo inserciones de ambos lados (la sección base de todos los bloques está vacía), de tamaño
// acotado, de líneas que cumplen las expresiones de arriba, fuera de contracts / serial-paths / archivos de test
// protegidos (`protectedPaths` = test-paths ∪ protected-test-config) y con etapa base (add/add es de lógica).
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
function classifyConflict({ base, ours, theirs, path: file, contracts = [], serialPaths = [], protectedPaths = [], mergeFile } = {}) {
  if (matchAny(contracts, file)) return { trivial: false, why: 'contrato (contracts)' };
  if (matchAny(serialPaths, file)) return { trivial: false, why: 'serial-paths' };
  if (matchAny(protectedPaths, file)) return { trivial: false, why: 'archivo de tests o su configuración' };
  if (base === null || base === undefined) return { trivial: false, why: 'add/add (sin versión base)' };
  if (ours === null || ours === undefined || theirs === null || theirs === undefined) return { trivial: false, why: 'borrado o renombrado en un lado' };
  if ([base, ours, theirs].some((t) => t.includes('\0'))) return { trivial: false, why: 'archivo binario' };
  // Las etapas se leen como texto UTF-8: un byte inválido (Latin-1, UTF-16) ya llegó como U+FFFD y reescribirlo lo corrompería (I5).
  if ([base, ours, theirs].some((t) => t.includes(REPLACEMENT_CHAR))) return { trivial: false, why: 'archivo que no es UTF-8 válido' };
  const merged = (mergeFile || mergeFileDiff3)({ base, ours, theirs });
  if (merged === null) return { trivial: false, why: 'no se pudo calcular el diff3' };
  const blocks = parseConflictBlocks(merged).filter((p) => p.ours);
  if (!blocks.length) return { trivial: false, why: 'sin bloques de conflicto reconocibles' };
  for (const b of blocks) {
    if (b.base.length) return { trivial: false, why: 'un lado modifica líneas que ya existían' };
    for (const side of ['ours', 'theirs']) {
      if (b[side].length > TRIVIAL_MAX_LINES) return { trivial: false, why: `más de ${TRIVIAL_MAX_LINES} líneas de un lado` };
      const bad = b[side].find((l) => !trivialLine(l, file));
      if (bad !== undefined) return { trivial: false, why: `la línea insertada no es una importación, una entrada de lista ni una viñeta: ${JSON.stringify(bad.slice(0, 60))}` };
    }
  }
  return { trivial: true, why: 'solo inserciones de ambos lados' };
}

// git merge-file --diff3 sobre tres archivos temporales (en el temp del sistema, nunca en el repo).
function mergeFileDiff3({ base, ours, theirs }, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-mf-'));
  try {
    const f = { ours: path.join(dir, 'ours'), base: path.join(dir, 'base'), theirs: path.join(dir, 'theirs') };
    fs.writeFileSync(f.ours, ours);
    fs.writeFileSync(f.base, base);
    fs.writeFileSync(f.theirs, theirs);
    const git = run || defaultRun(dir);
    try {
      return git(['merge-file', '-p', '--diff3', '-L', 'ours', '-L', 'base', '-L', 'theirs', f.ours, f.base, f.theirs], { raw: true });
    } catch (e) {
      // sale con la cantidad de conflictos (> 0) y el resultado por stdout; un número negativo o sin stdout es un error
      if (typeof e.status === 'number' && e.status > 0 && typeof e.stdout === 'string') return e.stdout;
      return null;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

// Resolución conservando ambos lados: lo de int/ (ours) primero.
function resolveBoth(merged) {
  return parseConflictBlocks(merged).flatMap((p) => (p.ours ? [...p.ours, ...p.theirs] : [p.text])).join('\n');
}

function stageBlob(git, cwd, stage, file) {
  const r = tryRun(git, ['show', `:${stage}:${file}`], { cwd, raw: true });
  return r === null ? null : r;
}

/// La configuración que decide la cola sale de la punta de int/<plan>, nunca del árbol mergeado (R-12, A7-01).
function readQueueConfig({ main, plan, opts }) {
  const git = runnerOf(main, opts);
  const cfg = readProjectConfig({ root: main, ref: `refs/heads/${B.intBranch(plan)}`, run: git });
  return { ...cfg, protectedPaths: [...new Set([...cfg.testPaths, ...cfg.protectedTestConfig])] };
}

// Mergea la tarea en la worktree de la cola (sincronizada antes con syncQueue), sin tocar int/.
// Conflictos: cada archivo se clasifica; con `resolveTrivial` y TODOS triviales se resuelven (ambos lados) y se
// commitea; si no, se aborta el merge y la cola queda limpia (la tarea vuelve a su rama: falla del plan, §11.3).
function mergeIntoQueue({ main, plan, task, resolveTrivial = false, config, opts } = {}) {
  const git = runnerOf(main, opts);
  const cfg = config || readQueueConfig({ main, plan, opts });
  const wt = B.queueWorktreePath(main, plan);
  const cwd = { cwd: wt };
  const branch = B.queueBranch(plan);
  if (tryRun(git, ['symbolic-ref', '--short', 'HEAD'], cwd) !== branch) {
    throw new QueueError('queue-not-synced', `la worktree de la cola (${wt}) no está en ${branch}. Alternativa: corré queue.js sync antes`);
  }
  const head0 = git(['rev-parse', 'HEAD'], cwd);
  const parsed = B.parseBranch(task);
  const nn = parsed.kind === 'task' ? parsed.nn : task;
  const abort = () => { try { git(['merge', '--abort'], { ...cwd, timeout: LONG_MS }); } catch (_) { /* sin merge en curso */ } };

  let mergeOut = '';
  let mergeCode = 0;
  try {
    mergeOut = git([...NO_RERERE, 'merge', '--no-ff', '--no-commit', task], { ...cwd, timeout: LONG_MS });
  } catch (e) {
    mergeCode = typeof e.status === 'number' ? e.status : -1;
    mergeOut = errText(e);
  }
  const inProgress = mergeInProgress(git, wt);
  if (mergeCode === 0 && !inProgress && git(['rev-parse', 'HEAD'], cwd) === head0) {
    return { status: 'already-merged', trivial: [], logic: [] };
  }
  const unmerged = [...new Set((tryRun(git, ['diff', '--name-only', '--diff-filter=U'], cwd) || '').split('\n').filter(Boolean))];

  if (mergeCode !== 0 && !unmerged.length) {
    abort();
    throw new QueueError('merge-failed', `git merge salió ${mergeCode} sin conflictos reconocibles: ${mergeOut.slice(0, 400)}. La cola quedó limpia`);
  }

  const commit = (message) => {
    try {
      git([...NO_RERERE, 'commit', '--no-edit', '-m', message], { ...cwd, timeout: LONG_MS });
    } catch (e) {
      abort();
      const lock = tryRun(git, ['rev-parse', '--git-path', 'index.lock'], cwd);
      throw new QueueError('commit-failed', `el commit del merge falló (un hook del proyecto, la firma o un lock): ${errText(e).slice(0, 400)}. El merge se abortó y la cola quedó limpia`, { indexLock: lock ? fs.existsSync(path.resolve(wt, lock)) : false });
    }
  };

  if (!unmerged.length) {
    commit(`merge(${plan}): task ${nn}`);
    return { status: 'merged', sha: git(['rev-parse', 'HEAD'], cwd), trivial: [], logic: [] };
  }

  const trivial = [];
  const logic = [];
  const resolved = new Map();
  for (const file of unmerged) {
    const base = stageBlob(git, wt, 1, file);
    const ours = stageBlob(git, wt, 2, file);
    const theirs = stageBlob(git, wt, 3, file);
    const c = classifyConflict({ base, ours, theirs, path: file, contracts: cfg.contracts || [], serialPaths: cfg.serialPaths || [], protectedPaths: cfg.protectedPaths || [] });
    if (c.trivial) {
      trivial.push({ path: file });
      resolved.set(file, mergeFileDiff3({ base, ours, theirs }, undefined));
    } else logic.push({ path: file, why: c.why });
  }
  if (!logic.length && resolveTrivial) {
    for (const [file, merged] of resolved) {
      fs.writeFileSync(path.join(wt, file), resolveBoth(merged));
      git(['add', '--', file], cwd);
    }
    commit(`merge(${plan}): task ${nn} (conflictos triviales: ${trivial.length})`);
    return { status: 'merged', sha: git(['rev-parse', 'HEAD'], cwd), trivial, logic: [] };
  }
  abort();
  return { status: 'conflict', trivial, logic };
}

// ---------------------------------------------------------------- parte 2: pre-merge sellado, avance y tag cp/ (Task 6)

const DEFAULT_GATE_MS = 30 * 60 * 1000;
const MAX_RUNS = 5; // corrida completa + repetición de lo fallado + 3 de los archivos tocados
const BUDGET_LINES = 400; // presupuesto de revisión de §11.1 (señal, no bloquea)

const queueTmp = (main) => path.join(main, '.pignolo', 'tmp', 'queue');
const lockPath = (main, plan) => path.join(queueTmp(main), `${plan}.lock`);
const lastPath = (main, plan) => path.join(queueTmp(main), `${plan}.last.json`);

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } };

// Lock por plan (R-8): creación exclusiva de un archivo con { pid, startedAt, deadline }. UNA sola regla de
// vencimiento, sin latido: vencido solo si el pid está muerto o si now > deadline (deadline = startedAt +
// timeoutMs × corridas máximas + 5 min). Un lock vivo da `busy` (exit 2); uno vencido se toma.
function acquireQueueLock({ main, plan, now = Date.now(), timeoutMs = DEFAULT_GATE_MS, maxRuns = MAX_RUNS } = {}) {
  const file = lockPath(main, plan);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const rec = { pid: process.pid, startedAt: now, deadline: now + timeoutMs * maxRuns + 5 * 60 * 1000 };
  const text = `${JSON.stringify(rec)}\n`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tmp = `${file}.${process.pid}-${Math.random().toString(16).slice(2)}.tmp`;
    fs.writeFileSync(tmp, text);
    try {
      fs.linkSync(tmp, file); // atómico: o queda el contenido completo o falla con EEXIST
      fs.rmSync(tmp, { force: true });
      return {
        file,
        record: rec,
        release() {
          const cur = readJson(file);
          if (cur && cur.pid === rec.pid && cur.startedAt === rec.startedAt) fs.rmSync(file, { force: true });
        },
      };
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      if (e.code !== 'EEXIST') throw e;
    }
    const cur = readJson(file);
    const legible = cur && Number.isInteger(cur.pid) && Number.isFinite(cur.deadline);
    let expired;
    if (legible) expired = !pidAlive(cur.pid) || now > cur.deadline;
    else { try { expired = Date.now() - fs.statSync(file).mtimeMs > 60 * 1000; } catch (_) { expired = true; } }
    if (!expired) {
      throw new QueueError('busy', `la cola de ${plan} está ocupada (lock de pid ${cur ? cur.pid : '?'}). Alternativa: esperá a que termine o corré queue.js status`, { exit: 2, lock: cur });
    }
    try { fs.rmSync(file, { force: true }); } catch (_) { /* otro lo tomó */ }
  }
  throw new QueueError('busy', `no se pudo tomar el lock de la cola de ${plan}. Alternativa: reintentá`, { exit: 2 });
}

// Archivos de test cuyo path relativo aparece en la salida de la corrida roja (a verificar con el fixture; si no sale
// ninguno, vale el respaldo: la suite completa una vez).
function failedFiles(output, testFiles) {
  const text = String(output || '').replace(/\\/g, '/');
  return testFiles.filter((f) => text.includes(f));
}

const quoteArg = (f) => (/^[A-Za-z0-9_./@:+-]+$/.test(f) ? f : `"${f.replace(/"/g, '')}"`);
const expandFiles = (cmd, files) => cmd.split('{files}').join(files.map(quoteArg).join(' '));

// Una corrida extra de la cola: con el ejecutor DIRECTO, jamás por runGate (una corrida extra por runGate escribiría un
// sello pre-merge para el mismo árbol y findSeal devuelve el más nuevo: un FAIL seguido de un PASS dejaría PASS).
function directRun(command, { cwd, timeoutMs, env }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-queue-'));
  const logFile = path.join(dir, 'run.log');
  try {
    const exit = shellRun(command, { cwd, timeoutMs, logFile, env });
    let log = '';
    try { log = fs.readFileSync(logFile, 'utf8'); } catch (_) { log = ''; }
    return { exit, log };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

// El gancho afterRun de runGate (R-6, D-7-3). Política: una corrida completa; si da rojo, repetir solo lo fallado;
// si da verde y el diff int..queue toca archivos de test, 3 corridas de esos archivos. Lo que cambia entre corridas es
// FLAKY (no-PASS, en el mismo sello de la corrida completa); rojo y rojo es FAIL.
function makeAfterRun({ git, wt, cfg, intSha, env, timeoutMs }) {
  const filesCmd = cfg.gates['pre-merge-files'] || null;
  const testFiles = () => (tryRun(git, ['ls-files'], { cwd: wt }) || '').split('\n').filter((f) => f && matchAny(cfg.testPaths, f));
  const touchedTests = () => (tryRun(git, ['diff', '--name-only', '--no-renames', intSha, 'HEAD'], { cwd: wt }) || '').split('\n')
    .filter((f) => f && matchAny(cfg.testPaths, f) && fs.existsSync(path.join(wt, f)));
  return ({ status, log, seal }) => {
    // La repetición corre lo mismo que la corrida completa: la misma semilla en {seed} y en PIGNOLO_TEST_SEED (I9, D-7-3).
    const extraRun = (command, o) => directRun(expandSeed(command, seal.seedOffered), { ...o, env: { ...(o.env || process.env), PIGNOLO_TEST_SEED: String(seal.seedOffered) } });
    const repeat = { runs: 1, same: true, differing: [], available: Boolean(filesCmd) };
    if (status === 'FAIL') {
      const failed = filesCmd ? failedFiles(log, testFiles()) : [];
      const byFiles = Boolean(filesCmd) && failed.length > 0;
      const r = extraRun(byFiles ? expandFiles(filesCmd, failed) : cfg.gates['pre-merge'], { cwd: wt, timeoutMs, env });
      repeat.runs = 2;
      repeat.mode = byFiles ? 'failed-files' : 'full-suite';
      if (r.exit === 0) {
        repeat.same = false;
        repeat.differing = byFiles ? failed : ['<suite>'];
        return { status: 'FLAKY', repeat };
      }
      return { repeat };
    }
    if (status !== 'PASS') return {};
    const touched = touchedTests();
    if (!touched.length) return { repeat };
    if (!filesCmd) return { repeat: { ...repeat, available: false, reason: 'no-files-command' } };
    const differing = new Set();
    for (let i = 0; i < 3; i += 1) {
      const r = extraRun(expandFiles(filesCmd, touched), { cwd: wt, timeoutMs, env });
      repeat.runs += 1;
      if (r.exit !== 0) {
        const f = failedFiles(r.log, touched);
        for (const x of (f.length ? f : touched)) differing.add(x);
      }
    }
    if (differing.size) return { status: 'FLAKY', repeat: { ...repeat, same: false, differing: [...differing] } };
    return { repeat };
  };
}

function gateError(seal, repeat) {
  const base = { status: seal.status, sealFile: seal.file, repeat: seal.repeat || repeat };
  if (seal.status === 'FLAKY') return new QueueError('flaky', `pre-merge dio rojo y verde con el mismo árbol (${(seal.repeat && seal.repeat.differing || []).join(', ')}): no se integra. Alternativa: la tarea vuelve; corregí el test inestable`, base);
  if (seal.status === 'FAIL') return new QueueError('gate-failed', 'pre-merge dio rojo (también al repetir lo fallado): no se integra. Alternativa: la tarea vuelve a su rama; es una falla del plan', { ...base, logTail: seal.logTail });
  return new QueueError(`gate-${seal.status.toLowerCase().replace(/_/g, '-')}`, `pre-merge terminó en ${seal.status}: no se integra. Alternativa: revisá la compuerta de int/ y la tarea`, { ...base, logTail: seal.logTail });
}

// Avance de int/<plan> por compare-and-swap sobre el sha viejo. Se relee la lista de worktrees justo antes (el
// chequeo-y-acto no se evita del todo; lo que no se evita se informa). Con int/ en uso en alguna worktree NO se usa
// update-ref (medido: deja esa worktree con `M archivo` en el índice): se hace `merge --ff-only` allí.
function advanceInt({ git, plan, intSha, tip }) {
  const ref = `refs/heads/${B.intBranch(plan)}`;
  const using = listWorktrees(git).find((w) => w.branch === ref);
  if (using) {
    const w = using.worktree;
    if (tryRun(git, ['symbolic-ref', 'HEAD'], { cwd: w }) !== ref || tryRun(git, ['rev-parse', 'HEAD'], { cwd: w }) !== intSha) {
      throw new QueueError('int-moved', `${B.intBranch(plan)} se movió mientras corría la compuerta (HEAD de ${w} ya no es ${intSha.slice(0, 8)}). Alternativa: repetí la entrada una vez`);
    }
    if (git(['status', '--porcelain', '-uno'], { cwd: w }) !== '') {
      throw new QueueError('int-dirty', `${w} tiene int/ en uso con archivos versionados modificados: no se avanza. Alternativa: commiteá o guardá esos cambios a mano y repetí`, { worktree: w });
    }
    try {
      git([...NO_RERERE, 'merge', '--ff-only', tip], { cwd: w, timeout: LONG_MS });
    } catch (e) {
      throw new QueueError('int-moved', `${B.intBranch(plan)} no avanza en fast-forward (se movió): ${errText(e).slice(0, 300)}. Alternativa: repetí la entrada una vez`);
    }
    return 'ff-merge';
  }
  try {
    git(['update-ref', ref, tip, intSha]);
  } catch (e) {
    throw new QueueError('int-moved', `${B.intBranch(plan)} cambió desde ${intSha.slice(0, 8)}: no se avanza. Alternativa: repetí la entrada una vez`);
  }
  return 'update-ref';
}

// Commits de la tarea sin los trailers Agent: y Gates:, y líneas del diff (señales de §11.1; no bloquean).
function signalsOf(git, main, plan, task) {
  const out = { missingTrailers: [], diffLines: 0, overBudget: false };
  if (!task) return out;
  const int = B.intBranch(plan);
  const log = tryRun(git, ['log', '--no-merges', '--format=%H%x1f%B%x1e', `${int}..${task}`], { raw: true }) || '';
  for (const rec of log.split('\x1e')) {
    const [sha, body] = rec.split('\x1f');
    if (!sha || !sha.trim() || body === undefined) continue;
    if (!/^Agent:/m.test(body) || !/^Gates:/m.test(body)) out.missingTrailers.push(sha.trim());
  }
  const stat = tryRun(git, ['diff', '--numstat', '--no-renames', `${int}...${task}`]) || '';
  for (const line of stat.split('\n')) {
    const m = /^(\d+)\t(\d+)\t/.exec(line);
    if (m) out.diffLines += Number(m[1]) + Number(m[2]);
  }
  out.overBudget = out.diffLines > BUDGET_LINES;
  return out;
}

function writeLast(main, plan, rec) {
  try { writeAtomic(lastPath(main, plan), `${JSON.stringify({ ...rec, at: new Date().toISOString() })}\n`); } catch (_) { /* es una señal para next, no un requisito */ }
}

// Desde el paso 2 de §11.3: dependencias, compuerta sellada (configuración de la punta de int/), verificación del sello,
// respaldo, avance y tag. Lo comparten integrate y revertOnInt.
function pipeline({ main, plan, task, sync, env, timeoutMs, opts, kind, trivial = [] }) {
  const git = runnerOf(main, opts);
  const wt = sync.worktree;
  const sig = signalsOf(git, main, plan, task); // antes de avanzar: después, int..tarea queda vacío
  const cfg = readProjectConfig({ root: main, ref: sync.intSha, run: git }); // R-12: nunca el project.md del árbol mergeado
  if (cfg.depsInstall) {
    const r = installDeps({ cwd: wt, command: cfg.depsInstall, env, timeoutMs });
    if (!r.ok) throw new QueueError('deps-failed', `deps-install salió ${r.code} en la worktree de la cola: ${r.logTail.split('\n').slice(-5).join(' | ')}. Alternativa: revisá el comando deps-install de project.md`);
  }
  let testAuthorization = false;
  if (task) {
    const st = readRun(main);
    const t = st.run ? taskList(st.run).find((x) => x.branch === task || x.id === task) : null;
    testAuthorization = Boolean(t && t.testAuthorization === true);
  }
  const afterRun = makeAfterRun({ git, wt, cfg, intSha: sync.intSha, env, timeoutMs });
  const seal = runGate({ level: 'pre-merge', cwd: wt, env, config: cfg, base: sync.intSha, testAuthorization, timeoutMs, exec: opts && opts.exec, afterRun });
  if (seal.status !== 'PASS') {
    writeLast(main, plan, { status: seal.status === 'FLAKY' ? 'flaky' : 'gate-failed', task, conflicts: [] });
    throw gateError(seal);
  }
  if (opts && typeof opts.beforeAdvance === 'function') opts.beforeAdvance({ main, plan, task, worktree: wt, seal, intSha: sync.intSha });

  // Paso 3: el sello que devolvió ESTA llamada tiene que ser del commit que se mueve (sha y árbol del commit).
  const tip = git(['rev-parse', `refs/heads/${B.queueBranch(plan)}`]);
  const tipTree = git(['rev-parse', `${tip}^{tree}`]);
  if (seal.status !== 'PASS' || seal.sha !== tip || seal.treeHash !== tipTree) {
    throw new QueueError('seal-mismatch', `el sello de pre-merge (sha ${String(seal.sha).slice(0, 8)}) no es del commit que se movería a ${B.intBranch(plan)} (${tip.slice(0, 8)}): no se avanza. Alternativa: repetí la entrada`, { sealSha: seal.sha, tip });
  }

  // Paso 4: respaldo ANTES de avanzar.
  let backup;
  try { backup = (opts && opts.backupRefs ? opts.backupRefs : backupRefs)({ cwd: main, env }); } catch (e) {
    throw new QueueError('backup-failed', `no se pudo respaldar las refs antes de avanzar (${e.message}); int/ queda quieto. Alternativa: revisá el repo y repetí`);
  }
  if (backup === null || backup === undefined) throw new QueueError('backup-failed', 'el respaldo de refs no se hizo (fuera de un repo o git no disponible); int/ queda quieto. Alternativa: revisá el repo y repetí');

  // Paso 5: avance por compare-and-swap.
  const mode = advanceInt({ git, plan, intSha: sync.intSha, tip });
  const warnings = [];
  // Si se avanzó con update-ref y ahora int/ está en uso en alguna worktree, alguien la sacó entre el chequeo y el acto
  // (límite declarado): esa worktree puede verse con `M archivo` en el índice.
  if (mode === 'update-ref' && listWorktrees(git).some((w) => w.branch === `refs/heads/${B.intBranch(plan)}`)) warnings.push('int-checked-out-after-advance');

  // Paso 6: tag cp/<plan>/<n> en la nueva punta.
  const tags = (tryRun(git, ['for-each-ref', '--format=%(refname)', `refs/tags/cp/${plan}/`]) || '').split('\n').filter(Boolean);
  const cp = B.cpTag(plan, B.nextCp({ refs: tags, plan }));
  try {
    if (opts && typeof opts.tag === 'function') opts.tag(cp, tip);
    else git(['-c', 'tag.gpgsign=false', 'tag', cp, tip]);
  } catch (e) {
    throw new QueueError('cp-missing', `${B.intBranch(plan)} avanzó a ${tip.slice(0, 8)} pero el tag ${cp} no se creó (${String(e.message).slice(0, 200)}): estado inconsistente. Alternativa: no reintentes; creá el tag a mano con \`git tag ${cp} ${tip}\` y avisá`, { exit: 3, sha: tip });
  }
  writeLast(main, plan, { status: 'integrated', task, conflicts: [] });
  return { ok: true, status: 'integrated', kind, plan, task, merged: tip, cp, trivial, repeat: seal.repeat || null, ...sig, warnings };
}

// Entrada de una tarea a la cola (§11.3): lock → sincronizar → precheck → previsión → merge → pipeline.
function integrate({ main, plan, task: taskArg, resolveTrivial = false, env = process.env, timeoutMs = DEFAULT_GATE_MS, opts = {} } = {}) {
  const task = resolveTask({ main, plan, task: taskArg, opts });
  const lock = acquireQueueLock({ main, plan, timeoutMs, now: opts.now });
  try {
    const sync = syncQueue({ main, plan, opts });
    const pre = (opts.precheck || precheck)({ main, plan, task, opts });
    if (!pre.ok) throw new QueueError(pre.kind, `la tarea no pasa el precheck (${pre.kind}): ${(pre.files || []).join(', ')}`, { files: pre.files });
    previewMerge({ main, plan, task, opts });
    const merge = mergeIntoQueue({ main, plan, task, resolveTrivial, opts });
    writeLast(main, plan, { status: merge.status === 'merged' ? 'merged' : merge.status, task, conflicts: [...merge.logic, ...merge.trivial].map((x) => x.path) });
    if (merge.status === 'conflict') throw new QueueError('conflict', `conflicto en ${[...merge.logic, ...merge.trivial].map((x) => x.path).join(', ')}: la tarea vuelve a su rama (rebase en su worktree) y se registra como falla del plan`, { trivial: merge.trivial, logic: merge.logic });
    if (merge.status === 'already-merged') throw new QueueError('already-merged', `${task} ya está unida a ${B.queueBranch(plan)}. Alternativa: si se revirtió en int/, reintegrala revirtiendo el revert`);
    return pipeline({ main, plan, task, sync, env, timeoutMs, opts, kind: 'merge', trivial: merge.trivial });
  } finally {
    lock.release();
  }
}

// "Regresión tardía en int/: revert primero" (§11.3): git revert del commit en la worktree de la cola y el MISMO pipeline.
function revertOnInt({ main, plan, commit, env = process.env, timeoutMs = DEFAULT_GATE_MS, opts = {} } = {}) {
  const git = runnerOf(main, opts);
  if (typeof commit !== 'string' || !commit || commit.startsWith('-')) throw new QueueError('not-on-int', `commit inválido: ${commit}`);
  const lock = acquireQueueLock({ main, plan, timeoutMs, now: opts.now });
  try {
    const sha = tryRun(git, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
    const int = `refs/heads/${B.intBranch(plan)}`;
    if (!sha || tryRun(git, ['merge-base', '--is-ancestor', sha, int]) === null) {
      throw new QueueError('not-on-int', `${commit} no está en ${B.intBranch(plan)}: no se revierte. Alternativa: revisá \`git log ${B.intBranch(plan)}\``);
    }
    const sync = syncQueue({ main, plan, opts });
    const parents = (git(['rev-list', '--parents', '-n', '1', sha]).split(/\s+/).length - 1);
    try {
      git([...NO_RERERE, 'revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), sha], { cwd: sync.worktree, timeout: LONG_MS });
    } catch (e) {
      tryRun(git, ['revert', '--abort'], { cwd: sync.worktree });
      throw new QueueError('revert-failed', `git revert de ${sha.slice(0, 8)} falló: ${errText(e).slice(0, 300)}. La cola quedó limpia. Alternativa: resolvelo a mano`);
    }
    return pipeline({ main, plan, task: null, sync, env, timeoutMs, opts, kind: 'revert' });
  } finally {
    lock.release();
  }
}

// Solo lectura: lock, queue/<plan> contra int/<plan> y los últimos tags cp/.
function queueStatus({ main, plan, opts } = {}) {
  const git = runnerOf(main, opts);
  const lock = readJson(lockPath(main, plan));
  const intSha = branchSha(git, B.intBranch(plan));
  const queueSha = branchSha(git, B.queueBranch(plan));
  const tags = (tryRun(git, ['for-each-ref', '--sort=-version:refname', '--format=%(refname:short) %(objectname)', `refs/tags/cp/${plan}/`]) || '').split('\n').filter(Boolean).slice(0, 5);
  const wt = B.queueWorktreePath(main, plan);
  return {
    plan, int: intSha, queue: queueSha, inSync: Boolean(intSha) && intSha === queueSha,
    lock: lock ? { ...lock, alive: Number.isInteger(lock.pid) ? pidAlive(lock.pid) : false } : null,
    mergeInProgress: fs.existsSync(wt) ? mergeInProgress(git, wt) : false,
    last: readJson(lastPath(main, plan)),
    cp: tags.map((l) => ({ tag: l.split(' ')[0], sha: l.split(' ')[1] })),
  };
}

module.exports = {
  QueueError, GIT_MS, LONG_MS, NO_RERERE, defaultRun, runnerOf, tryRun, errText, norm, branchSha, listWorktrees,
  resolveTask, readQueueConfig, syncQueue, precheck, previewMerge, parseMergeTree, classifyConflict, mergeIntoQueue, mergeFileDiff3,
  acquireQueueLock, failedFiles, integrate, revertOnInt, queueStatus, DEFAULT_GATE_MS,
};
