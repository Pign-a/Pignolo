// Removes one run folder. Links (the node_modules junctions of the run, of its measured tree and of any worktree)
// are removed as links and never followed, so nothing outside the run folder is touched.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';
import { removeTreeSafe } from './fsutil.mjs';
import { parseCsv } from './row.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function cleanRun(cfg, args, { force = false } = {}) {
  const { dir, task, arm, rep } = runPaths(cfg, args);
  const root = path.resolve(cfg.workRoot).toLowerCase();
  const at = path.resolve(dir).toLowerCase();
  if (!at.startsWith(root + path.sep) || at === root) throw new Error(`${dir} no está dentro de workRoot; no se borra`);
  try { fs.lstatSync(dir); } catch { return { removed: false, dir }; }

  const metrics = readJson(path.join(dir, 'metrics.json'));
  const ran = Boolean(metrics) || fs.existsSync(path.join(dir, 'stream.jsonl'));
  if (ran && !force) {
    let recorded = false;
    if (metrics && fs.existsSync(cfg.csvPath)) {
      recorded = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).some((r) => r.experiment === cfg.experiment && r.task === task
        && r.arm === arm && Number(r.rep) === rep && r.timestamp === metrics.finishedAt);
    }
    if (!recorded) {
      throw new Error(`la corrida ${task}/${arm}/${rep} tiene datos sin registrar en el CSV (corré row primero, o usá --force si no los necesitás)`);
    }
  }
  removeTreeSafe(dir);
  return { removed: true, dir };
}
