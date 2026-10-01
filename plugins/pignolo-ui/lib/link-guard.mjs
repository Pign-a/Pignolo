// Link guard shared by the canvas scripts (same checks as lib/run-init.mjs, which keeps its own copy):
// a path that is a symlink or a junction, or that resolves somewhere else than where it is, is
// never written to or deleted through.
//
// isLink(p) -> boolean                     lstat says symlink (Windows reports junctions the same way)
// linkProblem(p) -> null | 'root-is-link'  p is a link, or its real path is not <real parent>/<name>
// removeOwnDir(p) -> void                  removes a directory of ours; refuses a link, or a link inside it
import fs from 'node:fs';
import path from 'node:path';

export const isLink = (p) => {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
};

export function linkProblem(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return null; }
  if (st.isSymbolicLink()) return 'root-is-link';
  try {
    const parent = fs.realpathSync.native(path.dirname(p));
    if (fs.realpathSync.native(p) !== path.join(parent, path.basename(p))) return 'root-is-link';
  } catch {
    return 'root-is-link';
  }
  return null;
}

// A link anywhere inside the folder also stops the removal (nothing is deleted through a link).
export function containsLink(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (isLink(full)) return true;
    if (ent.isDirectory() && containsLink(full)) return true;
  }
  return false;
}

export function removeOwnDir(p) {
  if (!fs.existsSync(p)) return;
  if (linkProblem(p) || containsLink(p)) throw new Error(`${path.basename(p)} es o contiene un enlace: no se borra ni se escribe a través de él`);
  fs.rmSync(p, { recursive: true, force: true });
}
