// Link guard shared by the canvas scripts (same checks as lib/run-init.mjs, which keeps its own copy):
// a path that is a symlink or a junction, or that resolves somewhere else than where it is, is
// never written to or deleted through.
//
// isLink(p) -> boolean                     lstat says symlink (Windows reports junctions the same way)
// linkProblem(p) -> null | 'root-is-link'  p is a link, or its real path is not <real parent>/<name>
// runLinkProblem(run) -> null | path       samePath(a, b) -> boolean
// removeOwnDir(p) -> void                  removes a directory of ours; refuses a link, or a link inside it
import fs from 'node:fs';
import path from 'node:path';
import { RUN_ROOT } from './run-folder.mjs';

// paths compare without regard to case on Windows (the drive letter and the folder names come in any case)
export const samePath = (a, b) => (process.platform === 'win32' ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);

export const isLink = (p) => {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
};

export function linkProblem(p) {
  let st;
  try { st = fs.lstatSync(p); } catch { return null; }
  if (st.isSymbolicLink()) return 'root-is-link';
  try {
    const parent = fs.realpathSync.native(path.dirname(p));
    if (!samePath(fs.realpathSync.native(p), path.join(parent, path.basename(p)))) return 'root-is-link';
  } catch {
    return 'root-is-link';
  }
  return null;
}

// The run folder and the two above it (<project>/.pignolo-ui/runs/<run>): the first one that is a link or a junction, or null.
// Whatever a script writes under a run goes through all three, so none of them may lead somewhere else.
export function runLinkProblem(run) {
  const runs = path.dirname(run);
  const chain = [run];
  if (samePath(path.basename(runs), 'runs')) {
    chain.push(runs);
    const root = path.dirname(runs);
    if (samePath(path.basename(root), RUN_ROOT)) chain.push(root);
  }
  return chain.find((p) => linkProblem(p)) ?? null;
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
