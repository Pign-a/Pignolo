'use strict';
// Repo sombra (spec §11.6): ~/.pignolo/shadow/<repo-id>.git, fuera del repo, para
// que las instantáneas sobrevivan a un `rm -rf .git`.
// - Almacén de objetos propio (sin alternates). Siempre --git-dir y --work-tree
//   explícitos; nunca se persiste core.worktree ni se toca el .git del usuario
//   (del repo solo se LEE: fetch y info/exclude).
// - Siembra (SessionStart, en segundo plano): fetch de HEAD, ramas y tags del
//   repo a refs/pignolo/refs/<ts>/ (es también el respaldo de refs fuera del
//   repo) + import de refs/pignolo/wip/* + primera instantánea, que deja el
//   índice de la sesión con su caché de stat.
// - Instantánea: add -A sobre el índice de la sesión + write-tree + commit-tree +
//   refs/pignolo/wip/<clave-de-sesión>/<ts>. Los ignorados no se capturan.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitRun, isGitFailure } = require('./git');
const { pignoloHome } = require('./home');

const IDENTITY = {
  GIT_AUTHOR_NAME: 'pignolo', GIT_AUTHOR_EMAIL: 'pignolo@localhost',
  GIT_COMMITTER_NAME: 'pignolo', GIT_COMMITTER_EMAIL: 'pignolo@localhost',
};
const SEED_STALE_MS = 10 * 60 * 1000;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function stamp(now) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function normPath(p) {
  let r = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') r = r.toLowerCase();
  return r;
}

// repo-id de §8.2: hash de la ruta de git-common-dir. Se puede calcular aun con
// .git borrado (para encontrar la sombra al recuperar).
function repoIdForGitDir(commonDir) {
  return sha(normPath(commonDir)).slice(0, 16);
}

function sessionKey(sessionId, top) {
  return sha(`${sessionId || 'sin-sesion'}\n${normPath(top)}`).slice(0, 12);
}

// null si cwd no está dentro de un árbol de trabajo de git.
function repoInfo(run) {
  let out;
  try {
    out = run(['rev-parse', '--path-format=absolute', '--is-inside-work-tree', '--show-toplevel', '--git-common-dir']);
  } catch (e) {
    if (isGitFailure(e)) return null;
    throw e;
  }
  const [inside, top, common] = out.split(/\r?\n/);
  if (inside !== 'true' || !top || !common) return null;
  return { top: path.resolve(top), commonDir: path.resolve(common), id: repoIdForGitDir(common) };
}

function shadowPaths(env, info, key) {
  const dir = path.join(pignoloHome(env), 'shadow', `${info.id}.git`);
  const own = path.join(dir, 'pignolo');
  return {
    dir,
    own,
    index: key ? path.join(own, `index-${key}`) : null,
    status: path.join(own, 'status.json'),
    lock: path.join(pignoloHome(env), 'shadow', `${info.id}.lock`),
  };
}

function readStatus(p) {
  try { return JSON.parse(fs.readFileSync(p.status, 'utf8')); } catch (_) { return null; }
}

function writeStatus(p, st) {
  fs.mkdirSync(p.own, { recursive: true });
  fs.writeFileSync(p.status, `${JSON.stringify(st, null, 2)}\n`);
}

// Registro de fallas (nunca en silencio): una línea JSON por falla.
function recordFailure(env, what, detail) {
  try {
    const dir = path.join(pignoloHome(env), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'backup-failures.log'), `${JSON.stringify({ at: new Date().toISOString(), what, ...detail })}\n`);
  } catch (_) { /* el aviso al usuario sale igual por systemMessage */ }
}

// Corre git sobre la sombra con --git-dir y --work-tree explícitos.
function shadowGit(run, p, info) {
  return (args, opts = {}) => run(['--git-dir', p.dir, '--work-tree', info.top, ...args], { cwd: info.top, ...opts });
}

// `add -A` aborta entero ante un repo anidado sin commits; con --ignore-errors
// agrega el resto y sale con 1. Se acepta ese 1 (instantánea parcial).
function addAll(run, opts) {
  try {
    run(['-c', 'advice.addEmbeddedRepo=false', 'add', '-A', '--ignore-errors'], opts);
    return null;
  } catch (e) {
    if (e.status === 1 && !e.signal) return String(e.stderr || '').trim() || 'error sin detalle';
    throw e;
  }
}

function lastRef(run, prefix) {
  const out = run(['for-each-ref', '--sort=-refname', '--count=1', '--format=%(refname) %(objectname) %(tree)', prefix]);
  if (!out) return null;
  const [ref, commit, tree] = out.split(' ');
  return { ref, sha: commit, tree };
}

// Commit huérfano del índice dado, bajo prefix/<ts>-<pid>. No crea otra ref si
// el árbol no cambió desde la última de ese prefijo.
function commitIndex({ run, env, prefix, reason, now, parent }) {
  const tree = run(['write-tree'], { env });
  const last = lastRef(run, prefix);
  if (last && last.tree === tree) return { ref: last.ref, sha: last.sha, tree, reused: true };
  const args = ['commit-tree', tree, '-m', `pignolo wip: ${reason}`];
  if (parent) args.splice(2, 0, '-p', parent);
  const commit = run(args, { env: { ...env, ...IDENTITY } });
  const ref = `${prefix}${stamp(now)}-${process.pid}`;
  run(['update-ref', ref, commit]);
  return { ref, sha: commit, tree, reused: false };
}

// Instantánea en la sombra. undefined si la sombra no está sembrada para esta
// sesión (el llamador cae al modo dentro del repo).
function shadowSnapshot({ run, env, info, key, reason, now }) {
  const p = shadowPaths(env, info, key);
  if (!fs.existsSync(p.index)) return undefined;
  const sg = shadowGit(run, p, info);
  // Índice temporal copiado del de la sesión: dos comandos en paralelo no se
  // pelean por index.lock; el último en terminar deja su caché de stat.
  const tmp = `${p.index}.tmp-${process.pid}`;
  try {
    fs.copyFileSync(p.index, tmp);
    const genv = { ...process.env, GIT_INDEX_FILE: tmp };
    const partial = addAll(sg, { env: genv });
    const r = commitIndex({ run: sg, env: genv, prefix: `refs/pignolo/wip/${key}/`, reason, now });
    try { fs.renameSync(tmp, p.index); } catch (_) { /* otro proceso lo tiene abierto: se pierde solo la caché */ }
    return { ...r, store: 'shadow', gitDir: p.dir, partial };
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(`${tmp}.lock`, { force: true });
  }
}

// Aviso para una instantánea que cayó al modo dentro del repo porque la siembra
// falló o quedó colgada; null si no hay nada que avisar (p. ej. sembrando).
function seedWarning(env, info, now = new Date()) {
  const st = readStatus(shadowPaths(env, info));
  if (!st) return null;
  if (st.state === 'error') return `el repo sombra no se pudo sembrar (${st.error}); las instantáneas quedan solo dentro del repo y NO sobreviven a borrar .git. Reabrí la sesión para reintentar.`;
  if (st.state === 'seeding' && now - new Date(st.at) > SEED_STALE_MS) return 'la siembra del repo sombra no terminó; las instantáneas quedan solo dentro del repo y NO sobreviven a borrar .git.';
  return null;
}

function acquireLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.mkdirSync(file);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let age = 0;
    try { age = Date.now() - fs.statSync(file).mtimeMs; } catch (_) { return false; }
    if (age < SEED_STALE_MS) return false;
    fs.rmSync(file, { recursive: true, force: true });
    try { fs.mkdirSync(file); return true; } catch (_) { return false; }
  }
}

function listRefs(run, prefix, gitDirArgs = []) {
  const out = run([...gitDirArgs, 'for-each-ref', '--format=%(objectname) %(refname)', ...[].concat(prefix)]);
  return out.split('\n').filter(Boolean).map((l) => { const [s, r] = l.split(' '); return { sha: s, ref: r }; });
}

// Respaldo de refs fuera del repo: HEAD, ramas y tags del repo a
// refs/pignolo/refs/<ts>/ en la sombra. No crea otro juego si nada cambió.
function mirrorRefs({ run, p, info, now }) {
  const src = listRefs(run, ['refs/heads', 'refs/tags']);
  let head = null;
  try { head = run(['rev-parse', '--verify', '-q', 'HEAD']); } catch (e) { if (!isGitFailure(e)) throw e; }
  if (!src.length && !head) return { count: 0, base: null, reused: false };
  const want = src.map((x) => `${x.sha} ${x.ref.replace(/^refs\//, '')}`);
  if (head) want.push(`${head} HEAD`);
  want.sort();

  const G = ['--git-dir', p.dir];
  const have = listRefs(run, 'refs/pignolo/refs/', G);
  const bases = [...new Set(have.map((x) => x.ref.split('/').slice(0, 4).join('/')))].sort();
  const latest = bases[bases.length - 1];
  if (latest) {
    const got = have.filter((x) => x.ref.startsWith(`${latest}/`)).map((x) => `${x.sha} ${x.ref.slice(latest.length + 1)}`).sort();
    if (got.join('\n') === want.join('\n')) return { count: want.length, base: latest, reused: true };
  }
  const base = `refs/pignolo/refs/${stamp(now)}`;
  const specs = [`+refs/heads/*:${base}/heads/*`, `+refs/tags/*:${base}/tags/*`];
  if (head) specs.push(`+HEAD:${base}/HEAD`);
  run([...G, 'fetch', '-q', '--no-tags', '--no-write-fetch-head', info.commonDir, ...specs]);
  return { count: want.length, base, reused: false };
}

// Copia a la sombra las instantáneas hechas dentro del repo (mismos nombres).
function importWip({ run, p, info }) {
  const local = listRefs(run, 'refs/pignolo/wip/');
  if (!local.length) return [];
  run(['--git-dir', p.dir, 'fetch', '-q', '--no-tags', '--no-write-fetch-head', info.commonDir, '+refs/pignolo/wip/*:refs/pignolo/wip/*']);
  return local;
}

// Siembra la sombra para la sesión. Pensada para correr en segundo plano; con
// lock para que dos sesiones no siembren a la vez.
function seedShadow({ run, env, info, key, now = new Date(), onSeeded }) {
  const p = shadowPaths(env, info, key);
  if (!acquireLock(p.lock)) return { busy: true };
  try {
    fs.mkdirSync(path.dirname(p.dir), { recursive: true });
    if (!fs.existsSync(path.join(p.dir, 'HEAD'))) run(['init', '-q', '--bare', '--template=', p.dir]);
    writeStatus(p, { state: 'seeding', at: now.toISOString(), pid: process.pid });
    const G = ['--git-dir', p.dir];
    run([...G, 'config', 'core.autocrlf', 'false']);
    run([...G, 'config', 'core.safecrlf', 'false']);
    fs.writeFileSync(path.join(p.own, 'origin'), `${info.top}\n`);
    const exclude = path.join(info.commonDir, 'info', 'exclude');
    fs.mkdirSync(path.join(p.dir, 'info'), { recursive: true });
    if (fs.existsSync(exclude)) fs.copyFileSync(exclude, path.join(p.dir, 'info', 'exclude'));

    const refs = mirrorRefs({ run, p, info, now });
    const imported = importWip({ run, p, info });

    let snap = null;
    if (!fs.existsSync(p.index)) {
      const tmp = `${p.index}.seed-${process.pid}`;
      try {
        const sg = shadowGit(run, p, info);
        const genv = { ...process.env, GIT_INDEX_FILE: tmp };
        const partial = addAll(sg, { env: genv });
        snap = { ...commitIndex({ run: sg, env: genv, prefix: `refs/pignolo/wip/${key}/`, reason: 'siembra', now }), partial };
        fs.renameSync(tmp, p.index);
      } finally {
        fs.rmSync(tmp, { force: true });
        fs.rmSync(`${tmp}.lock`, { force: true });
      }
    }
    const extra = onSeeded ? onSeeded({ p }) : {};
    writeStatus(p, { state: 'ok', at: new Date().toISOString(), ...extra });
    return { gitDir: p.dir, refs, imported: imported.length, snapshot: snap, ...extra };
  } catch (e) {
    const error = String(e.message || e).split('\n')[0];
    try { writeStatus(p, { state: 'error', at: new Date().toISOString(), error }); } catch (_) { /* nada */ }
    recordFailure(env, 'siembra', { repo: info.top, error });
    throw e;
  } finally {
    fs.rmSync(p.lock, { recursive: true, force: true });
  }
}

module.exports = {
  IDENTITY, stamp, repoIdForGitDir, sessionKey, repoInfo, shadowPaths, readStatus, recordFailure,
  addAll, commitIndex, shadowSnapshot, seedWarning, seedShadow, mirrorRefs,
};
