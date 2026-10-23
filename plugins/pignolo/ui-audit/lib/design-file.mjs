// The project's design document, wherever its name is capitalised: DESIGN.md, design.md, Design.md.
// findDesignFile(projectRoot) -> absolute path of the file at the root of the project, or null.
import fs from 'node:fs';
import path from 'node:path';

export function findDesignFile(projectRoot) {
  const name = fs.readdirSync(projectRoot).find((n) => n.toLowerCase() === 'design.md');
  return name ? path.join(projectRoot, name) : null;
}
