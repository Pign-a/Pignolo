// Where the leak-check values live (D1 of docs/plans/2026-10-03-fuga-leak-values.md): NEVER under the project.
// leak-values.json and leak-origins.json hold the OS user, the home folder and the git name and email in plain text;
// a `git add -f` of a run folder used to put them in the history. They go to <pignoloHome>/ui-leaks/<repoId>/<run-id>/.
//
// leakDirFor({ project, run, env }) -> absolute dir (throws when it would be inside the project)
// writeLeakFiles({ project, run, values, origins, env, now }) -> { dir, valuesFile, originsFile, pruned }
// findLegacyLeakFiles(project) -> relative paths (never contents) of old copies under .pignolo-ui/runs/**
// repoId(project) -> 12 hex of sha1 of the real path (a junction or another capitalization gives the same id)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const LEAK_NAMES = ['leak-values.json', 'leak-origins.json'];
const RUN_ID = /^[\w.-]+$/;
const PRUNE_DAYS = 14;
const RUN_ROOT = '.pignolo-ui';

// two lines of the core's pignoloHome, not imported: pignolo-ui does not depend on the core
export const pignoloHome = (env = process.env) => (env.PIGNOLO_HOME && env.PIGNOLO_HOME.trim()) || path.join(os.homedir(), '.pignolo');

const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

// real path of the deepest existing ancestor + the rest (the target may not exist yet)
function realish(p) {
  let cur = path.resolve(p);
  const rest = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(cur), ...rest.reverse()); } catch { /* go up */ }
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    rest.push(path.basename(cur));
    cur = up;
  }
}

export function repoId(project) {
  return crypto.createHash('sha1').update(fold(realish(project))).digest('hex').slice(0, 12);
}

// a run id or the path of a run folder (the first folder under .pignolo-ui/runs/)
export function runIdOf(run) {
  const text = String(run ?? '');
  let id = text;
  if (/[\\/]/.test(text)) {
    const parts = text.split(/[\\/]+/);
    const at = parts.findIndex((p, i) => p.toLowerCase() === RUN_ROOT && (parts[i + 1] || '').toLowerCase() === 'runs');
    if (at < 0 || !parts[at + 2]) throw new Error('leak-store: --run debe ser un id o una carpeta dentro de .pignolo-ui/runs/');
    id = parts[at + 2];
  }
  if (!RUN_ID.test(id) || id.includes('..') || id === '.') throw new Error('leak-store: id de corrida inválido');
  return id;
}

export function leakDirFor({ project, run, env = process.env }) {
  const dir = path.join(pignoloHome(env), 'ui-leaks', repoId(project), runIdOf(run));
  const rel = path.relative(fold(realish(project)), fold(realish(dir)));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new Error('leak-store: la carpeta de valores quedaría dentro del proyecto');
  return dir;
}

// old runs (and only direct child folders, never links) of this project older than 14 days
function prune({ project, env, now, keep }) {
  const base = path.dirname(keep);
  const pruned = [];
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return pruned; }
  const limit = new Date(now).getTime() - PRUNE_DAYS * 24 * 3600 * 1000;
  for (const e of entries) {
    if (e.isSymbolicLink() || !e.isDirectory() || !RUN_ID.test(e.name)) continue;
    const full = path.join(base, e.name);
    if (full === keep) continue;
    try {
      if (fs.lstatSync(full).mtimeMs >= limit) continue;
      fs.rmSync(full, { recursive: true, force: true });
      pruned.push(e.name);
    } catch { /* best effort */ }
  }
  return pruned;
}

export function writeLeakFiles({ project, run, values, origins, env = process.env, now = new Date() }) {
  const dir = leakDirFor({ project, run, env });
  fs.mkdirSync(dir, { recursive: true });
  const opts = process.platform === 'win32' ? undefined : { mode: 0o600 };
  const valuesFile = path.join(dir, 'leak-values.json');
  const originsFile = path.join(dir, 'leak-origins.json');
  fs.writeFileSync(valuesFile, `${JSON.stringify(values)}\n`, opts);
  fs.writeFileSync(originsFile, `${JSON.stringify(origins)}\n`, opts);
  return { dir, valuesFile, originsFile, pruned: prune({ project, env, now, keep: dir }) };
}

export function findLegacyLeakFiles(project) {
  const out = [];
  const runs = path.join(project, RUN_ROOT, 'runs');
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (depth < 6) walk(full, depth + 1); continue; }
      if (LEAK_NAMES.includes(e.name.toLowerCase())) out.push(path.relative(project, full).split(path.sep).join('/'));
    }
  };
  walk(runs, 0);
  return out.sort();
}
