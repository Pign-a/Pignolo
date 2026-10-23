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
