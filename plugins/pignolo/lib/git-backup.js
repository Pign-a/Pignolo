'use strict';
// Respaldos (spec §11.6). Los dispara un hook: son capa 3, best-effort.
// - snapshotWip: instantánea en el repo sombra (lib/shadow.js) si está sembrado
//   para la sesión; si no, cae al modo dentro del repo: commit huérfano con índice
//   temporal + refs/pignolo/wip/<clave>/<ts>, sin tocar árbol ni índice. Esa copia
//   NO sobrevive a borrar .git (declarado). Los ignorados no se capturan.
// - backupRefs: refs/pignolo/backup/<ts> dentro del repo (sincrónico, barato) y,
//   si hay sombra, el mismo juego de refs fuera del repo.
const fs = require('node:fs');
const path = require('node:path');
const { gitRun, isGitFailure, withDeadline } = require('./git');
const shadow = require('./shadow');

// Fallback dentro del repo. Si el árbol está limpio no hay nada que perder.
function inRepoSnapshot({ run, info, key, reason, now }) {
  const gitDir = path.resolve(info.top, run(['rev-parse', '--git-dir']));
  const tmpIndex = path.join(gitDir, `pignolo-wip-index-${process.pid}`);
  const realIndex = path.join(gitDir, 'index');
  try {
    if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tmpIndex);
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    const partial = shadow.addAll(run, { env });
    const tree = run(['write-tree'], { env });
    let head = null;
    try { head = run(['rev-parse', '--verify', '-q', 'HEAD']); } catch (_) { /* sin commits todavía */ }
    if (head && run(['rev-parse', `${head}^{tree}`]) === tree) return null; // árbol limpio
    const r = shadow.commitIndex({ run, env, prefix: `refs/pignolo/wip/${key}/`, reason, now, parent: head });
    return { ...r, store: 'repo', partial };
  } finally {
    fs.rmSync(tmpIndex, { force: true });
    fs.rmSync(`${tmpIndex}.lock`, { force: true }); // queda si git murió por el plazo
  }
}

// Firma estable: snapshotWip({ cwd, reason, now, timeoutMs }) y opcionales env y
// sessionId. Devuelve null (no es un repo / árbol limpio en el fallback) o
// { ref, sha, reused, store: 'shadow'|'repo', gitDir?, partial, warning? }.
// Si falla, lo registra en ~/.pignolo/logs y relanza (el hook lo muestra).
function snapshotWip({ cwd, reason = 'manual', now = new Date(), timeoutMs = 2000, env = process.env, sessionId } = {}) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const run = withDeadline(cwd, timeoutMs);
  let info = null;
  try {
    info = shadow.repoInfo(run);
    if (!info) return null;
    const key = shadow.sessionKey(sessionId, info.top);
    const s = shadow.shadowSnapshot({ run, env, info, key, reason, now });
    if (s) return s;
    const r = inRepoSnapshot({ run, info, key, reason, now });
    const warning = shadow.seedWarning(env, info, now);
    return r && warning ? { ...r, warning } : r;
  } catch (e) {
    shadow.recordFailure(env, 'instantánea', { repo: info ? info.top : cwd, error: String(e.message || e).split('\n')[0] });
    throw e;
  }
}

// Siembra del repo sombra (la llama scripts/shadow-seed.js en segundo plano).
function seedShadow({ cwd, env = process.env, sessionId, now = new Date(), timeoutMs = 10 * 60 * 1000, sizeLimit } = {}) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const run = withDeadline(cwd, timeoutMs);
  const info = shadow.repoInfo(run);
  if (!info) return null;
  return shadow.seedShadow({ run, env, info, key: shadow.sessionKey(sessionId, info.top), now, sizeLimit });
}

// Cierre de la sesión (R-6, hito 6): poda con la retención y gc con heurística, bajo un solo
// lock. La clave de sesión se resuelve, no se supone (F1): el argumento `sessionId` o, si falta,
// CLAUDE_CODE_SESSION_ID del entorno (observado en Claude Code 2.1.285; no documentado: se
// verifica en tests/manual/hito-6.md). Sin ninguno, refused 'no-session' y no se hace nada:
// con la clave equivocada el propio índice contaría como otra sesión y el gc nunca correría.
// Fuera de un repo: null. Todo con plazo (120 s) salvo el gc, que corre sin plazo (C5).
function closeShadow({ cwd, env = process.env, sessionId, now = new Date(), timeoutMs = 120000, looseLimit } = {}) {
  const id = sessionId || env.CLAUDE_CODE_SESSION_ID;
  if (!id) return { ok: false, refused: 'no-session', reason: 'sin --session ni CLAUDE_CODE_SESSION_ID no se puede saber qué sesión cierra; no se poda nada', pruned: null, gc: null };
  if (!cwd || !fs.existsSync(cwd)) return null;
  const run = withDeadline(cwd, timeoutMs);
  const info = shadow.repoInfo(run);
  if (!info) return null;
  const key = shadow.sessionKey(id, info.top);
  const runGc = (args, opts = {}) => gitRun(args, info.top, { ...opts, timeout: 0 });
  return { ok: true, key, ...shadow.closeSession({ run, runGc, env, info, key, now, looseLimit }) };
}

// Estado de la sombra para SessionStart: null fuera de un repo; si no,
// { state: 'absent'|'seeding'|'ok'|'error', error?, warnings?, gitDir }.
function shadowState({ cwd, env = process.env, timeoutMs = 3000 } = {}) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const info = shadow.repoInfo(withDeadline(cwd, timeoutMs));
  if (!info) return null;
  const p = shadow.shadowPaths(env, info);
  if (!fs.existsSync(path.join(p.dir, 'HEAD'))) return { state: 'absent', gitDir: p.dir };
  const st = shadow.readStatus(p) || { state: 'seeding' };
  return { ...st, gitDir: p.dir };
}

// Contenido de un juego de respaldo como "sha heads/main" ordenado, para compararlo.
// Con tags: false solo mira las ramas del juego.
const BIG = 64 * 1024 * 1024; // miles de tags no entran en el buffer por defecto de 1 MB
function backupSet(run, base, tags) {
  const out = run(['for-each-ref', '--format=%(objectname) %(refname)', tags ? `${base}/` : `${base}/heads/`], { maxBuffer: BIG });
  return out.split('\n').filter(Boolean).map((l) => l.replace(`${base}/`, '')).sort().join('\n');
}

// Firma: backupRefs({ cwd, now, env, timeoutMs, outside, tags }). timeoutMs es el plazo
// total, también para las llamadas dentro del repo (cada una, como mucho 5 s). Con
// tags: false respalda solo refs/heads (el hook de Agent: miles de tags no entran en
// su plazo; los copian SessionStart y scripts/backup-ref.js).
function backupRefs({ cwd, now = new Date(), env = process.env, timeoutMs = 60000, outside = true, tags = true } = {}) {
  if (!cwd || !fs.existsSync(cwd)) return null;
  const deadline = Date.now() + timeoutMs;
  const run = withDeadline(cwd, timeoutMs, { perCallMs: 5000 });
  try {
    if (run(['rev-parse', '--is-inside-work-tree']) !== 'true') return null;
  } catch (e) {
    if (isGitFailure(e) || e.code === 'ENOENT') return null; // no es un repo, o no hay git
    throw e;
  }
  const out = run(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', ...(tags ? ['refs/tags'] : [])], { maxBuffer: BIG });
  const refs = out.split('\n').filter(Boolean).map((line) => line.split(' '));
  const rel = (ref) => ref.replace(/^refs\//, '');
  const want = refs.map(([sha, ref]) => `${sha} ${rel(ref)}`).sort().join('\n');
  const base = `refs/pignolo/backup/${shadow.stamp(now)}`;
  // Si el último juego es idéntico no se crea otro: hay cientos de despachos por sesión.
  // El último es la ref de mayor nombre (los sellos ordenan como texto): una sola línea,
  // aunque haya cientos de juegos.
  const last = run(['for-each-ref', '--sort=-refname', '--count=1', '--format=%(refname)', 'refs/pignolo/backup/']);
  const latest = last ? last.split('/').slice(0, 4).join('/') : null;
  let result;
  if (latest && refs.length && backupSet(run, latest, tags) === want) {
    result = { base: null, count: 0, reused: latest };
  } else {
    if (refs.length) {
      const input = refs.map(([sha, ref]) => `create ${base}/${rel(ref)} ${sha}\n`).join('');
      try {
        run(['update-ref', '--stdin'], { input });
      } catch (e) {
        // Dos despachos en el mismo milisegundo: si el juego ya quedó igual, es éxito.
        if (backupSet(run, base, tags) !== want) throw e;
      }
    }
    result = { base, count: refs.length };
  }
  if (!outside) return result;
  // Fuera del repo, solo si la sombra ya existe (la crea la siembra). Comparte el plazo.
  const mirror = withDeadline(cwd, Math.max(0, deadline - Date.now()));
  const info = shadow.repoInfo(mirror);
  const p = info && shadow.shadowPaths(env, info);
  if (p && fs.existsSync(path.join(p.dir, 'HEAD'))) result.shadow = shadow.mirrorRefs({ run: mirror, p, info, now });
  return result;
}

function setReflogPolicy({ cwd } = {}) {
  gitRun(['config', '--local', 'gc.reflogExpire', 'never'], cwd);
  gitRun(['config', '--local', 'gc.reflogExpireUnreachable', 'never'], cwd);
}

module.exports = { snapshotWip, seedShadow, shadowState, backupRefs, setReflogPolicy, closeShadow };
