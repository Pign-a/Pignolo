// File helpers that never follow a link out of the folder being handled.
import fs from 'node:fs';
import path from 'node:path';

// Removes a folder tree without ever recursing through a junction or symlink: a link is removed as a link
// (its target keeps every file). Plain files and real folders are removed normally.
export function removeTreeSafe(dir) {
  let st;
  try { st = fs.lstatSync(dir); } catch { return; }
  if (st.isSymbolicLink()) {
    try { fs.rmdirSync(dir); } catch { fs.unlinkSync(dir); }
    return;
  }
  if (!st.isDirectory()) { fs.rmSync(dir, { force: true }); return; }
  for (const name of fs.readdirSync(dir)) removeTreeSafe(path.join(dir, name));
  fs.rmdirSync(dir);
}

// Every link (symlink or junction) under `root`, at any depth, whose real target is not inside `root`.
// Links are reported, never followed. Returns readable descriptions; empty when the tree is self-contained.
export function linksOutsideTree(root) {
  const bad = [];
  let st;
  try { st = fs.lstatSync(root); } catch { return bad; }
  const norm = (p) => path.resolve(p).toLowerCase();
  const rootReal = norm(st.isSymbolicLink() ? path.dirname(root) : fs.realpathSync(root));
  const within = (c) => c === rootReal || c.startsWith(rootReal + path.sep);
  const visit = (p) => {
    let s;
    try { s = fs.lstatSync(p); } catch { return; }
    if (s.isSymbolicLink()) {
      let target = null;
      try { target = norm(fs.realpathSync(p)); } catch { /* broken */ }
      if (target === null || !within(target)) bad.push(`${path.relative(root, p) || path.basename(p)}${target === null ? ' (enlace roto)' : ` -> ${target}`}`);
      return;
    }
    if (s.isDirectory()) for (const n of fs.readdirSync(p)) visit(path.join(p, n));
  };
  visit(root);
  return bad;
}
