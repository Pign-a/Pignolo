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
  const date = now.toISOString(); // la retención se mide con esta fecha
  const commit = run(args, { env: { ...env, ...IDENTITY, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  const ref = `${prefix}${stamp(now)}-${process.pid}`;
  run(['update-ref', ref, commit]);
  return { ref, sha: commit, tree, reused: false };
}

// El mtime del índice de la sesión es "la última vez que la sesión tocó la sombra" (F16: una
// sesión viva conserva su última ref; gc: otra sesión activa en los últimos 10 min). Se fija
// con el `now` de la operación, no con el reloj, para que la retención se mida con la misma fecha.
function touchIndex(file, now) {
  try { fs.utimesSync(file, now, now); } catch (_) { /* sin índice: nada que marcar */ }
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
    try { fs.renameSync(tmp, p.index); touchIndex(p.index, now); } catch (_) { /* otro proceso lo tiene abierto: se pierde solo la caché */ }
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

// ---- Retención (spec §11.6, decisión del autor 2026-09-27) ----
// Una sola regla: se borra lo que tiene más de 14 días, salvo la última unidad de
// cada una de las 3 sesiones previas (y la última de la sesión actual). Nunca se
// borra nada en automático fuera de esta regla.
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 14 * DAY_MS;
const KEEP_SESSIONS = 3;
const SIZE_WARN_BYTES = 1024 * 1024 * 1024;

// units: [{ id, group, time }] → ids a borrar.
function retentionPrune(units, now, currentGroup) {
  const newest = new Map();
  for (const u of units) {
    const n = newest.get(u.group);
    if (!n || u.time > n.time) newest.set(u.group, u);
  }
  const keep = new Set([...newest.entries()]
    .filter(([g]) => g !== currentGroup)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, KEEP_SESSIONS)
    .map(([, u]) => u.id));
  if (newest.has(currentGroup)) keep.add(newest.get(currentGroup).id);
  return units.filter((u) => now - u.time > KEEP_MS && !keep.has(u.id)).map((u) => u.id);
}

// Instantáneas: una unidad por ref, agrupadas por la clave de sesión.
function wipUnits(run, gitDirArgs = []) {
  const out = run([...gitDirArgs, 'for-each-ref', '--format=%(refname) %(objectname) %(committerdate:unix)', 'refs/pignolo/wip/']);
  return out.split('\n').filter(Boolean).map((l) => {
    const [ref, s, t] = l.split(' ');
    const parts = ref.split('/');
    return { id: ref, sha: s, group: parts.length > 4 ? parts[3] : '', time: Number(t) * 1000 };
  });
}

function deleteRefs(run, gitDirArgs, refs) {
  if (!refs.length) return;
  run([...gitDirArgs, 'update-ref', '--stdin'], { input: refs.map((r) => `delete ${r.ref} ${r.sha}\n`).join('') });
}

// Sesiones vivas (F16, R-6): un grupo cuyo index-<clave> se tocó hace menos de 14 días conserva
// su última ref aunque quede fuera de las 3 previas (una sesión abierta con el árbol sin cambios
// reutiliza su ref vieja). Sin index-<clave>, nada cambia.
function aliveNewest(units, p, now) {
  const keep = new Set();
  const newest = new Map();
  for (const u of units) {
    const n = newest.get(u.group);
    if (!n || u.time > n.time) newest.set(u.group, u);
  }
  for (const [group, u] of newest) {
    if (!group) continue;
    let mtime = null;
    try { mtime = fs.statSync(path.join(p.own, `index-${group}`)).mtimeMs; } catch (_) { continue; }
    if (now - mtime < KEEP_MS) keep.add(u.id);
  }
  return keep;
}

// gcAuto: false cuando el llamador corre su propio gc después (closeSession), para que el
// `gc --auto` de acá no se le cruce (F2).
function prune({ run, p, key, now, gcAuto = true }) {
  const G = ['--git-dir', p.dir];
  // 1. Dentro del repo: solo lo que la sombra ya tiene (nunca la única copia).
  const inShadow = new Map(listRefs(run, 'refs/pignolo/wip/', G).map((x) => [x.ref, x.sha]));
  const repoUnits = wipUnits(run);
  const repoGone = new Set(retentionPrune(repoUnits, now, key));
  const repoDel = repoUnits.filter((u) => repoGone.has(u.id) && inShadow.get(u.id) === u.sha).map((u) => ({ ref: u.id, sha: u.sha }));
  deleteRefs(run, [], repoDel);
  // 2. Instantáneas de la sombra (menos la última de cada sesión viva).
  const shUnits = wipUnits(run, G);
  const shGone = new Set(retentionPrune(shUnits, now, key));
  const alive = aliveNewest(shUnits, p, now);
  const shDel = shUnits.filter((u) => shGone.has(u.id) && !alive.has(u.id)).map((u) => ({ ref: u.id, sha: u.sha }));
  deleteRefs(run, G, shDel);
  // 3. Juegos de refs: cada juego es una unidad y su propio grupo; el actual es el último.
  const sets = new Map();
  for (const x of listRefs(run, 'refs/pignolo/refs/', G)) {
    const base = x.ref.split('/').slice(0, 4).join('/');
    if (!sets.has(base)) sets.set(base, []);
    sets.get(base).push(x);
  }
  const setUnits = [...sets.keys()].map((b) => ({ id: b, group: b, time: parseStamp(b.split('/')[3]) }));
  const latestSet = [...sets.keys()].sort().pop();
  const setDel = retentionPrune(setUnits, now, latestSet).flatMap((b) => sets.get(b));
  deleteRefs(run, G, setDel);
  // 3b. Respaldos de refs dentro del repo (refs/pignolo/backup/<ts>/, uno por
  // arranque): misma regla por juego. Se evalúa después de podar la sombra y solo
  // se borra una ref cuyo commit sigue en un juego de la sombra (nunca la única copia).
  const shadowShas = new Set(listRefs(run, 'refs/pignolo/refs/', G).map((x) => x.sha));
  const bsets = new Map();
  for (const x of listRefs(run, 'refs/pignolo/backup/')) {
    const base = x.ref.split('/').slice(0, 4).join('/');
    if (!bsets.has(base)) bsets.set(base, []);
    bsets.get(base).push(x);
  }
  const bUnits = [...bsets.keys()].map((b) => ({ id: b, group: b, time: parseStamp(b.split('/')[3]) })).filter((u) => u.time > 0);
  const latestB = [...bsets.keys()].sort().pop();
  const bDel = retentionPrune(bUnits, now, latestB).flatMap((b) => bsets.get(b)).filter((x) => shadowShas.has(x.sha));
  deleteRefs(run, [], bDel);
  // 4. Índices de sesiones viejas y temporales huérfanos (de un proceso cortado).
  let files = 0;
  for (const f of fs.readdirSync(p.own)) {
    const m = /^index-([0-9a-f]+)(\.(tmp|seed)-\d+)?$/.exec(f);
    if (!m || (m[1] === key && !m[2])) continue;
    const age = now - fs.statSync(path.join(p.own, f)).mtimeMs;
    if (age > (m[2] ? 60 * 60 * 1000 : KEEP_MS)) { fs.rmSync(path.join(p.own, f), { force: true }); files += 1; }
  }
  // gc --auto con el vencimiento por defecto (2 semanas): seguro con otras
  // sesiones escribiendo, así que no hace falta el lock exclusivo. En primer plano
  // (autoDetach=false) para que ningún gc quede corriendo detrás del lock (F2).
  if (gcAuto) run([...G, '-c', 'gc.autoDetach=false', 'gc', '--auto', '--quiet']);
  return { repoWip: repoDel.length, shadowWip: shDel.length, refSets: new Set(setDel.map((x) => x.ref.split('/').slice(0, 4).join('/'))).size, repoBackups: bDel.length, files };
}

// ---- gc de la sombra al cerrar la sesión (R-6; diferido del hito 1) ----
const GC_LOOSE_LIMIT = 2000;
const GC_AGE_MS = DAY_MS;
const GC_ACTIVE_MS = SEED_STALE_MS; // otra sesión que tocó su índice hace menos de 10 min
const GC_LOCK_AHEAD_MS = 2 * 60 * 60 * 1000;

// Más de 2.000 objetos sueltos o más de 24 h desde el último gc (ausente = nunca).
function needsGc({ loose, lastGcAt, now = Date.now(), looseLimit = GC_LOOSE_LIMIT } = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (Number(loose) > looseLimit) return { run: true, reason: 'loose' };
  const last = lastGcAt ? Date.parse(lastGcAt) : NaN;
  if (Number.isNaN(last) || t - last > GC_AGE_MS) return { run: true, reason: 'age' };
  return { run: false, reason: 'none' };
}

function looseCount(run, G) {
  const m = /^count:\s*(\d+)/m.exec(run([...G, 'count-objects', '-v']));
  return m ? Number(m[1]) : 0;
}

// Índice de otra sesión tocado hace menos de GC_ACTIVE_MS: la sombra no es exclusiva.
function otherSessionActive(p, key, t) {
  let names = [];
  try { names = fs.readdirSync(p.own); } catch (_) { return false; }
  for (const f of names) {
    const m = /^index-([0-9a-f]+)$/.exec(f);
    if (!m || m[1] === key) continue;
    try { if (t - fs.statSync(path.join(p.own, f)).mtimeMs < GC_ACTIVE_MS) return true; } catch (_) { /* borrado entre medio */ }
  }
  return false;
}

// Corre DENTRO del lock de closeSession (no toma uno propio). Nunca borra refs: la poda corta
// (--prune=1.day.ago) vence por el mtime del objeto suelto, y la ventana entre commit-tree y
// update-ref dura milisegundos. Sin plazo (C5: un plazo mata solo git.exe y deja repack huérfano
// y gc.pid): runGc corre con timeout 0 y mientras tanto el mtime del lock se adelanta para que
// acquireLock no se lo robe a los 10 min.
function gcShadow({ run, runGc, p, key, now = new Date(), looseLimit = GC_LOOSE_LIMIT }) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const G = ['--git-dir', p.dir];
  const looseBefore = looseCount(run, G);
  const lastFile = path.join(p.own, 'last-gc');
  let lastGcAt = null;
  try { lastGcAt = fs.readFileSync(lastFile, 'utf8').trim(); } catch (_) { /* nunca */ }
  const need = needsGc({ loose: looseBefore, lastGcAt, now: t, looseLimit });
  if (!need.run) return { ran: false, reason: 'none', looseBefore, looseAfter: null };
  if (otherSessionActive(p, key, t)) {
    run([...G, '-c', 'gc.autoDetach=false', 'gc', '--auto', '--quiet']);
    return { ran: false, reason: 'other-session-active', looseBefore, looseAfter: null };
  }
  const ahead = new Date(t + GC_LOCK_AHEAD_MS);
  try { fs.utimesSync(p.lock, ahead, ahead); } catch (_) { /* sin lock (llamada directa): nada que adelantar */ }
  const gc = runGc || ((args, opts) => run(args, opts));
  gc([...G, '-c', 'gc.autoDetach=false', 'gc', '--quiet', '--prune=1.day.ago'], { timeout: 0 });
  fs.mkdirSync(p.own, { recursive: true });
  fs.writeFileSync(lastFile, `${new Date(t).toISOString()}\n`);
  return { ran: true, reason: need.reason, looseBefore, looseAfter: looseCount(run, G) };
}

// Cierre de la sesión: un solo lock alrededor de prune (sin su gc --auto) y gcShadow. Uno que
// falla no corta al otro; el error va a recordFailure y al resultado. Sin sombra sembrada no
// la crea: { pruned: null, gc: null }.
function closeSession({ run, runGc, env, info, key, now = new Date(), looseLimit }) {
  const p = shadowPaths(env, info, key);
  if (!fs.existsSync(path.join(p.dir, 'HEAD'))) return { pruned: null, gc: null };
  if (!acquireLock(p.lock)) return { pruned: null, gc: { ran: false, reason: 'busy' } };
  let pruned = null;
  let gc = null;
  try {
    try {
      pruned = prune({ run, p, key, now, gcAuto: false });
    } catch (e) {
      const error = String(e.message || e).split('\n')[0];
      recordFailure(env, 'poda', { repo: info.top, error });
      pruned = { error };
    }
    try {
      gc = gcShadow({ run, runGc, p, key, now, looseLimit });
    } catch (e) {
      const error = String(e.message || e).split('\n')[0];
      recordFailure(env, 'gc', { repo: info.top, error });
      gc = { ran: false, reason: 'error', error };
    }
  } finally {
    fs.rmSync(p.lock, { recursive: true, force: true });
  }
  return { pruned, gc };
}

function parseStamp(s) {
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/.exec(s || '');
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : 0;
}

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(f);
    else { try { total += fs.statSync(f).size; } catch (_) { /* borrado entre medio */ } }
  }
  return total;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// Aviso si la sombra de este repo pasa el límite, con los archivos no ignorados
// más pesados de la última instantánea como candidatos a .gitignore.
function sizeWarnings({ run, p, snapRef, limit = SIZE_WARN_BYTES }) {
  const size = dirSize(p.dir);
  if (size <= limit) return [];
  let heavy = '';
  if (snapRef) {
    const files = run(['--git-dir', p.dir, 'ls-tree', '-r', '-l', snapRef]).split('\n').filter(Boolean)
      .map((l) => { const m = /^\S+ blob \S+\s+(\d+)\t(.*)$/.exec(l); return m && { size: Number(m[1]), name: m[2] }; })
      .filter(Boolean).sort((a, b) => b.size - a.size).slice(0, 5);
    if (files.length) heavy = ` Archivos no ignorados más pesados (candidatos a .gitignore): ${files.map((f) => `${f.name} (${mb(f.size)})`).join(', ')}.`;
  }
  return [`el repo sombra de este repo ocupa ${mb(size)} en ${p.dir} (aviso a partir de ${mb(limit)}). No se borra nada fuera de la regla de 14 días.${heavy}`];
}

// Siembra la sombra para la sesión. Pensada para correr en segundo plano; con
// lock para que dos sesiones no siembren a la vez.
function seedShadow({ run, env, info, key, now = new Date(), sizeLimit }) {
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
        touchIndex(p.index, now);
      } finally {
        fs.rmSync(tmp, { force: true });
        fs.rmSync(`${tmp}.lock`, { force: true });
      }
    }
    const pruned = prune({ run, p, key, now });
    const last = lastRef(shadowGit(run, p, info), `refs/pignolo/wip/${key}/`);
    const warnings = sizeWarnings({ run, p, snapRef: last && last.ref, limit: sizeLimit });
    writeStatus(p, { state: 'ok', at: new Date().toISOString(), warnings, pruned });
    return { gitDir: p.dir, refs, imported: imported.length, snapshot: snap, pruned, warnings };
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
  addAll, commitIndex, shadowSnapshot, seedWarning, seedShadow, mirrorRefs, retentionPrune, prune,
  needsGc, gcShadow, closeSession, acquireLock, SEED_STALE_MS, KEEP_MS,
};
