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
const { gitRun, isRepo, withDeadline } = require('./git');
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

function backupRefs({ cwd, now = new Date(), env = process.env, timeoutMs = 60000, outside = true } = {}) {
  if (!cwd || !isRepo(cwd)) return null;
  const out = gitRun(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags'], cwd);
  const base = `refs/pignolo/backup/${shadow.stamp(now)}`;
  const lines = out.split('\n').filter(Boolean).map((line) => {
    const [sha, ref] = line.split(' ');
    return `create ${base}/${ref.replace(/^refs\//, '')} ${sha}\n`;
  });
  if (lines.length) gitRun(['update-ref', '--stdin'], cwd, { input: lines.join('') });
  const result = { base, count: lines.length };
  if (!outside) return result;
  // Fuera del repo, solo si la sombra ya existe (la crea la siembra).
  const run = withDeadline(cwd, timeoutMs);
  const info = shadow.repoInfo(run);
  const p = info && shadow.shadowPaths(env, info);
  if (p && fs.existsSync(path.join(p.dir, 'HEAD'))) result.shadow = shadow.mirrorRefs({ run, p, info, now });
  return result;
}

function setReflogPolicy({ cwd } = {}) {
  gitRun(['config', '--local', 'gc.reflogExpire', 'never'], cwd);
  gitRun(['config', '--local', 'gc.reflogExpireUnreachable', 'never'], cwd);
}

module.exports = { snapshotWip, seedShadow, shadowState, backupRefs, setReflogPolicy };
