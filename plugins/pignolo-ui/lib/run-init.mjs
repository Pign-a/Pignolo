// Run folder (spec §3.2): <repo>/.pignolo-ui/runs/<run-id>/ with run.json (R-9), and the
// 14-day prune of old runs. The prune only touches direct child directories of runs/, never
// follows a link (symlink or junction) and checks isInsideRunRoot on every candidate.
import fs from 'node:fs';
import path from 'node:path';
import { ensureRunRoot, isInsideRunRoot } from './run-folder.mjs';
import { findDesignFile } from './approved.mjs';

const COMMANDS = ['new', 'improve', 'audit'];
const PRUNE_DAYS = 14;

const pad = (n) => String(n).padStart(2, '0');

export function makeRunId({ now = new Date(), command, slug }) {
  if (!COMMANDS.includes(command)) throw new Error(`comando inválido: ${command}`);
  const clean = String(slug || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (!clean) throw new Error('el slug del run queda vacío');
  const d = new Date(now);
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  return `${stamp}-${command}-${clean}`;
}

function prune(runsDir, project, now, keep) {
  const pruned = [];
  if (!fs.existsSync(runsDir)) return pruned;
  const limit = new Date(now).getTime() - PRUNE_DAYS * 24 * 3600 * 1000;
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    const full = path.join(runsDir, entry.name);
    if (full === keep || !isInsideRunRoot(project, full)) continue;
    if (fs.lstatSync(full).mtimeMs >= limit) continue;
    fs.rmSync(full, { recursive: true, force: true });
    pruned.push(entry.name);
  }
  return pruned;
}

export function initRun({ project, command, slug, now = new Date(), meta = {} }) {
  const root = ensureRunRoot(project);
  const runId = makeRunId({ now, command, slug });
  const runsDir = path.join(root, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  let run = path.join(runsDir, runId);
  for (let n = 2; fs.existsSync(run); n++) run = path.join(runsDir, `${runId}-${n}`);
  fs.mkdirSync(run);
  const designFile = findDesignFile(project);
  const info = {
    version: 1,
    command,
    createdAt: new Date(now).toISOString(),
    project: path.resolve(project),
    design: designFile ? path.relative(project, designFile).replace(/\\/g, '/') : null,
    ...meta,
  };
  fs.writeFileSync(path.join(run, 'run.json'), `${JSON.stringify(info, null, 2)}\n`);
  const pruned = prune(runsDir, project, now, run);
  return { run, runId: path.basename(run), pruned };
}
