// Run folder root (spec §3.2): <repo>/.pignolo-ui/, with .pignolo-ui/.gitignore = "*"
// created before the first write, so the folder ignores itself without touching any
// versioned file or .git/info/exclude. Runs live in .pignolo-ui/runs/<run-id>/.
import fs from 'node:fs';
import path from 'node:path';

export const RUN_ROOT = '.pignolo-ui';

export function ensureRunRoot(projectRoot) {
  const dir = path.join(projectRoot, RUN_ROOT);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n', { flag: 'wx' });
  return dir;
}

export function isInsideRunRoot(projectRoot, file) {
  const rel = path.relative(path.resolve(projectRoot, RUN_ROOT), path.resolve(file));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
