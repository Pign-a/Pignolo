// node_modules handling: runs never touch the source's node_modules. They link to ONE snapshot copy
// (<workRoot>/_nm); a manifest taken before and after each run tells whether the agent changed it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_NM_IGNORE } from './config.mjs';
import { removeTreeSafe } from './fsutil.mjs';

export const snapshotPaths = (cfg) => ({ dir: path.join(cfg.workRoot, '_nm'), file: path.join(cfg.workRoot, '_nm.manifest.json') });
export const sourceNm = (cfg) => path.join(cfg.sourceRepo, 'node_modules');

// Sorted top-level package names (scoped ones as @scope/name), count of top-level entries and a hash of
// the hidden lockfile. Cache folders that tools write while working are ignored.
export function manifest(dir, ignore = DEFAULT_NM_IGNORE) {
  const skip = new Set(ignore);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const names = [];
  let count = 0;
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    count += 1;
    if (e.name.startsWith('@') && e.isDirectory()) {
      let inner = [];
      try { inner = fs.readdirSync(path.join(dir, e.name)); } catch { /* unreadable */ }
      for (const n of inner) names.push(`${e.name}/${n}`);
    } else {
      names.push(e.name);
    }
  }
  names.sort();
  let lockHash = null;
  try { lockHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, '.package-lock.json'))).digest('hex'); } catch { /* no lockfile */ }
  const digest = crypto.createHash('sha256').update(JSON.stringify({ names, count, lockHash })).digest('hex');
  return { count, names, lockHash, digest };
}

const brief = (m) => (m ? { count: m.count, lockHash: m.lockHash, digest: m.digest } : null);
export { brief as manifestBrief };

const lower = (p) => path.resolve(p).toLowerCase();
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);

// Links (symlinks and junctions) among the top-level entries, every @scope/* entry and the children of .pnpm that
// lead outside `root` (or nowhere). Returns a list of readable descriptions; empty when all is contained.
export function linksOutside(root) {
  const bad = [];
  let rootReal;
  try { rootReal = lower(fs.realpathSync(root)); } catch { return [`${root}: no existe`]; }
  const check = (p, shown) => {
    let st;
    try { st = fs.lstatSync(p); } catch { return; }
    if (!st.isSymbolicLink()) return;
    let target;
    try { target = lower(fs.realpathSync(p)); } catch { bad.push(`${shown} (enlace roto)`); return; }
    if (!within(target, rootReal)) bad.push(`${shown} -> ${target}`);
  };
  let top = [];
  try { top = fs.readdirSync(root, { withFileTypes: true }); } catch { return bad; }
  for (const e of top) {
    const p = path.join(root, e.name);
    check(p, e.name);
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) continue;
    if ((e.name.startsWith('@') && isDir) || e.name === '.pnpm') {
      let inner = [];
      try { inner = fs.readdirSync(p); } catch { /* unreadable */ }
      for (const n of inner) check(path.join(p, n), `${e.name}/${n}`);
    }
  }
  return bad;
}

export function assertNoEscapingLinks(root, what) {
  const bad = linksOutside(root);
  if (bad.length) {
    throw new Error(`${what} tiene enlaces que salen de la carpeta (${bad.slice(0, 5).join('; ')}${bad.length > 5 ? '; ...' : ''}); el agente podría escribir fuera de la copia. Resolvelos (por ejemplo instalando sin enlaces) antes de medir`);
  }
}

// Old trash folders from drops that could not finish are removed when they are not locked any more.
function cleanTrash(cfg) {
  let names = [];
  try { names = fs.readdirSync(cfg.workRoot); } catch { return; }
  for (const n of names) {
    if (n.startsWith('_nm.trash-')) { try { removeTreeSafe(path.join(cfg.workRoot, n)); } catch { /* still locked: try next time */ } }
  }
}

// Creates the snapshot if it is missing (a copy of the source's node_modules). Returns null when the source has none.
// Refuses, before anything is copied or spent, when the source has links that lead outside it.
export function ensureSnapshot(cfg) {
  const src = sourceNm(cfg);
  if (!fs.existsSync(src)) return null;
  const { dir, file } = snapshotPaths(cfg);
  if (fs.existsSync(dir) && fs.existsSync(file)) return { dir, created: false };
  fs.mkdirSync(cfg.workRoot, { recursive: true });
  cleanTrash(cfg);
  assertNoEscapingLinks(src, 'el node_modules de la fuente');
  removeTreeSafe(dir);
  const tmp = `${dir}.tmp`;
  removeTreeSafe(tmp);
  // Links inside node_modules are kept as links where the platform allows it; a second check follows the copy.
  fs.cpSync(src, tmp, { recursive: true, verbatimSymlinks: true });
  try {
    assertNoEscapingLinks(tmp, 'la copia de node_modules');
  } catch (e) {
    removeTreeSafe(tmp);
    throw e;
  }
  fs.renameSync(tmp, dir);
  const m = manifest(dir, cfg.nmIgnore);
  const s = manifest(src, cfg.nmIgnore);
  fs.writeFileSync(file, JSON.stringify({ ...m, sourceDigest: s ? s.digest : null }, null, 2));
  return { dir, created: true };
}

// 'missing' (no copy), 'intact', or 'tampered' (the copy no longer matches the manifest taken when it was made).
export function snapshotState(cfg) {
  const { dir, file } = snapshotPaths(cfg);
  if (!fs.existsSync(dir) || !fs.existsSync(file)) return 'missing';
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none */ }
  const now = manifest(dir, cfg.nmIgnore);
  return saved && now && saved.digest === now.digest ? 'intact' : 'tampered';
}
export const snapshotIntact = (cfg) => snapshotState(cfg) === 'intact';

// Moves the copy out of the way FIRST (so the name is free at once) and then deletes it with the safe delete.
// Never throws: a locked file leaves the renamed folder behind (cleaned by a later prepare) and is reported.
export function dropSnapshot(cfg, { remove = removeTreeSafe, now = Date.now() } = {}) {
  const { dir, file } = snapshotPaths(cfg);
  const result = { renamed: false, trash: null, leftover: false, error: null };
  try { fs.rmSync(file, { force: true }); } catch (e) { result.error = `manifiesto: ${e.code || e.message}`; }
  if (!fs.existsSync(dir)) return result;
  const trash = `${dir}.trash-${now}`;
  try {
    fs.renameSync(dir, trash);
    result.renamed = true;
    result.trash = trash;
  } catch (e) {
    result.error = `renombrar: ${e.code || e.message}`;
    try { remove(dir); } catch (e2) { result.error += `; borrar: ${e2.code || e2.message}`; result.leftover = true; }
    return result;
  }
  try { remove(trash); } catch (e) { result.leftover = true; result.error = `borrar: ${e.code || e.message}`; }
  return result;
}

// Free, before any spend: a copy that was merely altered is dropped and copied again from the source, as long as
// the source is still the one the copy was made from. Returns 'ok' | 'repaired'. Throws when the source changed.
export function repairSnapshot(cfg, opts = {}) {
  const state = snapshotState(cfg);
  if (state === 'intact') return 'ok';
  if (state === 'tampered') {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(snapshotPaths(cfg).file, 'utf8')); } catch { /* none */ }
    const s = manifest(sourceNm(cfg), cfg.nmIgnore);
    if (!saved || !s || !saved.sourceDigest || saved.sourceDigest !== s.digest) {
      throw new Error('la copia de node_modules fue alterada y el node_modules de la fuente ya no es el que se copió; no se vuelve a copiar solo. Revisá la fuente y limpiá las corridas con "clean" antes de seguir');
    }
    const d = dropSnapshot(cfg, opts);
    if (d.leftover && fs.existsSync(snapshotPaths(cfg).dir)) throw new Error(`no se pudo quitar la copia alterada (${d.error}); cerrá lo que la use y reintentá`);
  }
  ensureSnapshot(cfg);
  return 'repaired';
}

// Links <tree>/node_modules to the snapshot when the tree has none.
export function linkNodeModules(cfg, tree) {
  const snap = snapshotPaths(cfg).dir;
  const target = path.join(tree, 'node_modules');
  if (!fs.existsSync(snap)) return false;
  try { fs.lstatSync(target); return false; } catch { /* absent: link it */ }
  fs.symlinkSync(snap, target, 'junction');
  return true;
}
