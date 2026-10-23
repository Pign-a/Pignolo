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

// Creates the snapshot if it is missing (a copy of the source's node_modules). Returns null when the source has none.
export function ensureSnapshot(cfg) {
  const src = sourceNm(cfg);
  if (!fs.existsSync(src)) return null;
  const { dir, file } = snapshotPaths(cfg);
  if (fs.existsSync(dir) && fs.existsSync(file)) return { dir, created: false };
  removeTreeSafe(dir);
  fs.mkdirSync(cfg.workRoot, { recursive: true });
  const tmp = `${dir}.tmp`;
  removeTreeSafe(tmp);
  // Links inside node_modules are copied as links, never resolved: nothing in the snapshot may lead back to the source.
  fs.cpSync(src, tmp, { recursive: true, verbatimSymlinks: true });
  fs.renameSync(tmp, dir);
  fs.writeFileSync(file, JSON.stringify(manifest(dir, cfg.nmIgnore), null, 2));
  return { dir, created: true };
}

// The snapshot must still be what was copied; otherwise something changed it since the last run.
export function snapshotIntact(cfg) {
  const { dir, file } = snapshotPaths(cfg);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none */ }
  const now = manifest(dir, cfg.nmIgnore);
  return Boolean(saved && now && saved.digest === now.digest);
}

export function dropSnapshot(cfg) {
  const { dir, file } = snapshotPaths(cfg);
  removeTreeSafe(dir);
  fs.rmSync(file, { force: true });
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
