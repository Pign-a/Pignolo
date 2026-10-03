'use strict';
// Detección para el asistente de inicio del panel (etapa 3, D-W1 a D-W4). Arma, con las mismas funciones que `init.js detect`,
// el resumen que el asistente muestra, y lo deja en `<main>/.git/pignolo/wizard-detect.json`: antes de activar pignolo no existe
// `.pignolo/` y crearlo (o dejar un archivo suelto en el árbol) ensuciaría `git status` de un proyecto que todavía no pidió nada.
// Lo único que se escribe está bajo `<main>/.git/pignolo/`, por archivo temporal y renombre, y nunca a través de un enlace.
// El panel solo lee este archivo; nada de acá ejecuta ni cambia el proyecto.
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitRun } = require('./git');
const { detectProject } = require('./init-detect');
const { detectPlaces } = require('./places-detect');
const { blankProject } = require('./init-blank');
const { buildSummary } = require('./init-summary');
const { samePath } = require('./places');
const { proposeAdaptation } = require('./init-adapt');
const { realNorm } = require('./real-path');
const { readConfig } = require('./profiles');

const SCHEMA = 'pignolo-wizard-detect/1';
const FILE = 'wizard-detect.json';
const MARKER = 'wizard-declined';
const MAX_BYTES = 64 * 1024;
const TEMPLATE = path.join(__dirname, '..', 'templates', 'permissions.json');

// Una sola línea y sin caracteres de control: lo que viaja al panel se dibuja tal cual.
const oneLine = (v) => String(v == null ? '' : v).replace(/[\r\n\t\p{Zl}\p{Zp}]+/gu, ' ').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/\s{2,}/g, ' ').trim();

// ---- lugar seguro: <main>/.git/pignolo/ -----------------------------------------------------------------------------

// { ok: true, git, dir } o { ok: false, reason }. `.git` debe ser una carpeta real (no un archivo de worktree o de submódulo ni
// un enlace); `.git/pignolo`, si existe, también, y su ruta real tiene que quedar dentro de `.git`. No crea nada.
function safeDir(main, fs = nodeFs) {
  const git = path.join(main, '.git');
  let st;
  try { st = fs.lstatSync(git); } catch (_) { return { ok: false, reason: 'no-git' }; }
  if (st.isSymbolicLink()) return { ok: false, reason: 'git-is-a-link' };
  if (!st.isDirectory()) return { ok: false, reason: 'git-is-a-file' };
  const dir = path.join(git, 'pignolo');
  let ds = null;
  try { ds = fs.lstatSync(dir); } catch (e) { if (e.code !== 'ENOENT') return { ok: false, reason: 'unreadable' }; }
  if (ds) {
    if (ds.isSymbolicLink()) return { ok: false, reason: 'link-in-path' };
    if (!ds.isDirectory()) return { ok: false, reason: 'not-a-directory' };
    const inside = realNorm(dir).startsWith(realNorm(git) + path.sep) || realNorm(dir) === path.join(realNorm(git), 'pignolo');
    if (!inside) return { ok: false, reason: 'link-in-path' };
  }
  return { ok: true, git, dir };
}

// ---- detección -----------------------------------------------------------------------------------------------------

// `run` con plazo total: acepta las dos formas en que lo llaman las detecciones, run(args, { cwd }) y run(args, cwd[, { input }]).
function deadlineRun(main, budgetMs) {
  const t0 = Date.now();
  const state = { expired: false };
  const run = (args, a, b) => {
    const left = budgetMs - (Date.now() - t0);
    if (left <= 0) { state.expired = true; throw new Error(`se agotó el plazo de ${budgetMs} ms`); }
    const cwd = typeof a === 'string' ? a : (a && a.cwd) || main;
    const input = (b && b.input) !== undefined ? b.input : (a && typeof a === 'object' ? a.input : undefined);
    try {
      return gitRun(args, cwd, { timeout: left, input, maxBuffer: 1 << 26, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    } catch (e) { if (Date.now() - t0 >= budgetMs) state.expired = true; throw e; }
  };
  return { run, state, left: () => budgetMs - (Date.now() - t0) };
}

function permissionGroups(readTemplate = () => JSON.parse(nodeFs.readFileSync(TEMPLATE, 'utf8'))) {
  const perms = readTemplate().permissions || {};
  const deny = Array.isArray(perms.deny) ? perms.deny : [];
  const ask = Array.isArray(perms.ask) ? perms.ask : [];
  const groups = [];
  if (deny.length) {
    const ex = [];
    if (deny.includes('Bash(git reset --hard *)')) ex.push('reset --hard');
    if (deny.includes('Bash(git push -f *)')) ex.push('push -f');
    groups.push({ id: 'blocks', line: `los comandos de git que pierden trabajo${ex.length ? ` (${ex.join(', ')}…)` : ''}` });
  }
  if (ask.length) {
    const what = [];
    if (ask.includes('Bash(git branch -d *)')) what.push('borrar ramas');
    if (ask.includes('Bash(git tag -d *)')) what.push('etiquetas');
    if (ask.some((r) => r.startsWith('mcp__'))) what.push('herramientas que envían');
    groups.push({ id: 'asks', line: `antes de ${what.length ? what.join(' y ') : 'acciones delicadas'}` });
  }
  groups.push({ id: 'free', line: 'push y merge normales' });
  return groups.map((g) => ({ id: g.id, line: oneLine(g.line) }));
}

const PROFILES = [
  { id: 'balanced', label: 'balanceado', line: 'sonnet para construir, opus revisa' },
  { id: 'economy', label: 'económico', line: 'sonnet en lo seguro, el más barato' },
  { id: 'max', label: 'máximo', line: 'opus casi en todo, el más caro' },
];

// RW-01: el perfil es global (PIGNOLO_HOME/config.json), no del proyecto. Se recomienda el que ya está configurado, como hace `setup`;
// sin config, o con una config que no se puede leer, `balanced`.
function currentProfile(env) {
  try { const p = readConfig({ env }).profile; if (PROFILES.some((x) => x.id === p)) return p; } catch (_) { /* sin config legible: balanced */ }
  return 'balanced';
}

const MOVABLE = ['spec', 'plan', 'research'];

function placeCandidates(placesDetection, summary) {
  const out = [];
  const items = proposeAdaptation({ detection: placesDetection, answers: { public: true } }).items;
  for (const it of items) {
    const rec = summary.recommendedPlaces[it.kind];
    const decision = rec && rec.decision ? rec.decision : 'leave';
    const canMove = it.options.includes('move') && MOVABLE.includes(it.kind) && !samePath(it.candidate.path, it.recommended);
    out.push({
      kind: it.kind,
      from: oneLine(it.candidate.path),
      to: oneLine(it.recommended),
      decision,
      // lo que el humano puede elegir en el asistente: con dos carpetas del mismo tipo no se adivina, solo `leave`
      options: it.ambiguous ? ['leave'] : it.options.filter((o) => o !== 'move' || canMove),
      moves: canMove ? [{ from: oneLine(it.candidate.path), to: oneLine(it.recommended) }] : [],
      note: it.ambiguous ? 'hay más de una carpeta de este tipo' : (it.moveBlockedBy ? 'solo se puede adoptar' : null),
    });
  }
  return out;
}

function idOf(data) {
  const { id, offer, ...rest } = data; // eslint-disable-line no-unused-vars
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 12);
}

function branchOf(run, main) {
  try { return oneLine(run(['symbolic-ref', '--short', 'HEAD'], main)) || null; } catch (_) { return null; }
}

// buildWizardDetect({ main, run, fs }) -> el resumen del asistente (sin `offer`: lo agrega quien lo escribe). Lanza si no puede leer.
function buildWizardDetect({ main, run, fs = nodeFs, permissions, env = process.env } = {}) {
  const git = run || ((args, o) => gitRun(args, (typeof o === 'string' ? o : o && o.cwd) || main, { timeout: 5000 }));
  const blank = blankProject({ root: main, fs });
  let data;
  if (blank.blank) {
    data = { schema: SCHEMA, blank: true, project: null, profiles: [], permissions: { groups: [] }, places: { candidates: [] } };
  } else {
    const detection = detectProject({ root: main, run: git, fs });
    const places = detectPlaces({ root: main, run: git, fs });
    const summary = buildSummary({ blank: false, detection, existing: { projectMd: false, securityMd: true }, memory: { found: false, files: 0 }, places });
    const onDone = detection.gates && detection.gates['on-done'] ? String(detection.gates['on-done']).split(' && ')[0] : null;
    const placeholder = detection.warnings.some((w) => /placeholder del instalador/.test(w));
    data = {
      schema: SCHEMA,
      blank: false,
      project: {
        type: detection.type,
        stacks: detection.stacks.map(oneLine),
        tests: { cmd: onDone ? oneLine(onDone) : null, state: onDone ? 'declared' : (placeholder ? 'placeholder' : 'none') },
        main: branchOf(git, main),
      },
      profiles: PROFILES.map((p) => ({ ...p, recommended: p.id === currentProfile(env) })),
      permissions: { groups: permissions || permissionGroups() },
      places: { candidates: placeCandidates(places, summary) },
    };
  }
  data.id = idOf(data);
  return data;
}

// ---- escritura -----------------------------------------------------------------------------------------------------

// writeWizardDetect(main, data) -> { path } | { skipped: motivo }. Nunca escribe fuera de <main>/.git/pignolo/.
function writeWizardDetect(main, data, fs = nodeFs) {
  const text = `${JSON.stringify(data)}\n`;
  if (Buffer.byteLength(text) > MAX_BYTES) return { skipped: 'too-big' };
  const safe = safeDir(main, fs);
  if (!safe.ok) return { skipped: safe.reason };
  try { fs.mkdirSync(safe.dir, { recursive: true }); } catch (_) { return { skipped: 'unwritable' }; }
  // Se vuelve a mirar después de crear: la carpeta recién hecha tampoco puede ser un enlace.
  const again = safeDir(main, fs);
  if (!again.ok) return { skipped: again.reason };
  const file = path.join(safe.dir, FILE);
  const tmp = path.join(safe.dir, `.${FILE}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, text, { flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* nada que limpiar */ }
    return { skipped: 'unwritable' };
  }
  return { path: file };
}

// RW-02 (decisión del autor, 2026-10-03): el asistente se ofrece en cada sesión hasta que se active pignolo o se elija "no usar pignolo acá".
// La marca de rechazo es el único archivo que se escribe por esa elección, y solo bajo <main>/.git/pignolo/ (nunca .pignolo/).
function declined(main, fs = nodeFs) {
  const safe = safeDir(main, fs);
  if (!safe.ok) return false;
  try { return fs.lstatSync(path.join(safe.dir, MARKER)).isFile(); } catch (_) { return false; }
}

function writeDecline(main, fs = nodeFs) {
  const safe = safeDir(main, fs);
  if (!safe.ok) return { ok: false, reason: safe.reason };
  try { fs.mkdirSync(safe.dir, { recursive: true }); } catch (_) { return { ok: false, reason: 'unwritable' }; }
  if (!safeDir(main, fs).ok) return { ok: false, reason: 'link-in-path' };
  const file = path.join(safe.dir, MARKER);
  try {
    fs.rmSync(file, { force: true }); // si era un enlace, se quita el enlace, no su destino
    fs.writeFileSync(file, `${new Date().toISOString()}\n`, { flag: 'wx' });
    return { ok: true, path: file };
  } catch (_) { return { ok: false, reason: 'unwritable' }; }
}

// Se ofrece mientras no haya .pignolo/project.md ni marca de rechazo.
function shouldOffer(main, fs = nodeFs) {
  try { if (fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return false; } catch (_) { return false; }
  return !declined(main, fs);
}

// Borra un archivo viejo para que no engañe (solo ese archivo, y solo por una ruta segura).
function removeStale(main, fs = nodeFs) {
  const safe = safeDir(main, fs);
  if (!safe.ok) return false;
  try { fs.rmSync(path.join(safe.dir, FILE), { force: true }); return true; } catch (_) { return false; }
}

// Todo el trabajo del hook: detectar con plazo propio, decidir `offer` y escribir. Lanza si no pudo (el hook lo calla y llama a
// removeStale). Devuelve { path, offer } o { skipped }.
// RW-04: si la escritura se salta, un archivo viejo no puede seguir ofreciendo: se borra por una ruta segura (`stale: 'removed'`); si no
// hay ruta segura (enlaces) no se toca nada y se informa `offer: false` y `stale: 'kept'`.
function writeFor(main, { budgetMs = 3000, build = buildWizardDetect, fs = nodeFs, env = process.env } = {}) {
  const skip = (reason) => ({ skipped: reason, offer: false, stale: removeStale(main, fs) ? 'removed' : 'kept' });
  if (!safeDir(main, fs).ok) return skip('unsafe');
  const d = deadlineRun(main, budgetMs);
  const data = build({ main, run: d.run, fs, env });
  if (d.state.expired || d.left() <= 0) throw new Error('se agotó el plazo de la detección');
  data.offer = shouldOffer(main, fs);
  const w = writeWizardDetect(main, data, fs);
  if (w.skipped) return skip(w.skipped);
  return { path: w.path, offer: data.offer };
}

module.exports = { SCHEMA, FILE, MARKER, MAX_BYTES, buildWizardDetect, writeWizardDetect, declined, writeDecline, shouldOffer, removeStale, writeFor, safeDir, idOf, permissionGroups };
