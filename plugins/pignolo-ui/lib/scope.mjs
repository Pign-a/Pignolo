// Scope of ui-check findings (spec §5.3): what already existed at --base is debt, the rest is new.
//
// materializeBase({ project, ref, relPaths }) -> { dir, missing }
//   Writes the version of each path at <ref> (git show, no shell) into a temporary folder.
//   A path that does not exist at the base goes to `missing`. An invalid ref throws a
//   BaseRefError whose message (Spanish) is what the CLI prints.
// scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate }) -> base findings
//   Materializes `sourceFiles` (the one source list of the scope ruling) at `base`, calls the
//   runner's evaluate(dir, relFiles) (same rules, same catalog, project-relative paths) and
//   removes the folder.
// classifyScope(current, base) -> current with `scope`. For each fingerprint with n fails in
//   the base and m now, the first min(n, m) by line are debt and the rest new (multiset).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GIT_TIMEOUT = 10000;
const MAX_BUFFER = 256 * 1024 * 1024;

export class BaseRefError extends Error {
  constructor(ref) {
    super(`--base no es una ref válida: ${ref}`);
    this.name = 'BaseRefError';
    this.ref = ref;
    // The CLI prints e.stack for errors it does not know: keep it to the message, no frames.
    this.stack = this.message;
  }
}

const git = (project, args) => execFileSync('git', args, { cwd: project, timeout: GIT_TIMEOUT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: MAX_BUFFER });

function assertRef(project, ref) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw new BaseRefError(ref);
  try {
    git(project, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new BaseRefError(ref);
  }
}

// Only plain project-relative paths are read from the base.
const safeRel = (rel) => typeof rel === 'string' && rel !== '' && !path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..');

export function materializeBase({ project, ref, relPaths }) {
  assertRef(project, ref);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-base-'));
  const missing = [];
  try {
    for (const rel of relPaths) {
      if (!safeRel(rel)) { missing.push(rel); continue; }
      const posix = rel.split(path.sep).join('/');
      let content;
      try {
        content = git(project, ['show', `${ref}:./${posix}`]); // raw bytes: line endings untouched
      } catch {
        missing.push(rel);
        continue;
      }
      const target = path.join(dir, ...posix.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return { dir, missing };
}

export async function scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate }) {
  const { dir } = materializeBase({ project, ref: base, relPaths: [...new Set(sourceFiles)] });
  try {
    return await evaluate(dir, relFiles);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
  }
}

const byLine = (a, b) => (a.e.line ?? 0) - (b.e.line ?? 0) || a.i - b.i;

export function classifyScope(current, base) {
  const budget = new Map();
  for (const b of base ?? []) {
    if (b.status === 'fail') budget.set(b.fingerprint, (budget.get(b.fingerprint) ?? 0) + 1);
  }
  const debt = new Set();
  const groups = new Map();
  current.forEach((e, i) => {
    if (e.status !== 'fail') return;
    if (!groups.has(e.fingerprint)) groups.set(e.fingerprint, []);
    groups.get(e.fingerprint).push({ e, i });
  });
  for (const [fp, list] of groups) {
    const n = budget.get(fp) ?? 0;
    list.sort(byLine).slice(0, n).forEach((x) => debt.add(x.i));
  }
  return current.map((e, i) => ({ ...e, scope: debt.has(i) ? 'debt' : 'new' }));
}
