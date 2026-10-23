// How much has been spent so far: one ledger for every experiment of the CSV, so calibration runs count too.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './row.mjs';

// A run may spend up to the per-run cap plus a margin (the CLI checks the budget between steps).
export const CAP_MARGIN = 1.25;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const key = (task, arm, rep, ts) => `${task}\u0000${arm}\u0000${rep}\u0000${ts}`;
const isRunDir = (d) => ['metrics.json', 'stream.jsonl', 'prepare.json'].some((f) => fs.existsSync(path.join(d, f)));
const subdirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)); } catch { return []; } };

// Run folders: <workRoot>/<run> and <workRoot>/<experiment>/<run> (calibration). The node_modules copy and its trash are not runs.
function runFolders(workRoot) {
  const out = [];
  for (const d of subdirs(workRoot)) {
    if (path.basename(d).startsWith('_nm')) continue;
    if (isRunDir(d)) out.push(d);
    else for (const s of subdirs(d)) if (isRunDir(s)) out.push(s);
  }
  return out;
}

// Money the author spent on the blind grader and anything else outside `run`: a CSV with a `usd` column (date,usd,note).
function graderSpend(cfg) {
  if (!cfg.graderSpendPath || !fs.existsSync(cfg.graderSpendPath)) return 0;
  let total = 0;
  for (const r of parseCsv(fs.readFileSync(cfg.graderSpendPath, 'utf8'))) {
    const v = Number(r.usd);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

// Rows of the CSV, plus runs that already spent but have no row yet (metrics.json without a matching row), plus runs
// interrupted before metrics.json was written (stream.jsonl only), plus the grader log.
// A run whose cost is unknown (cut by timeout, interrupted, no result) counts as the per-run cap.
export function spentUsd(cfg) {
  let total = 0;
  const seen = new Set();
  if (fs.existsSync(cfg.csvPath)) {
    for (const r of parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))) {
      const c = r.cost_usd === '' || r.cost_usd === undefined ? NaN : Number(r.cost_usd);
      total += Number.isFinite(c) ? c : Number(cfg.perRunCapUsd);
      seen.add(key(r.task, r.arm, Number(r.rep), r.timestamp));
    }
  }
  for (const d of runFolders(cfg.workRoot)) {
    const m = readJson(path.join(d, 'metrics.json'));
    if (m) {
      if (seen.has(key(m.task, m.arm, Number(m.rep), m.finishedAt))) continue;
      total += typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) ? m.costUsd : Number(cfg.perRunCapUsd);
    } else if (fs.existsSync(path.join(d, 'stream.jsonl'))) {
      total += Number(cfg.perRunCapUsd);
    }
  }
  total += graderSpend(cfg);
  return Math.round(total * 10000) / 10000;
}

export function assertWithinTotalCap(cfg) {
  const spent = spentUsd(cfg);
  const next = spent + CAP_MARGIN * Number(cfg.perRunCapUsd);
  if (next > Number(cfg.totalCapUsd)) {
    throw new Error(`tope total de gasto: ya van ${spent} USD y otra corrida puede costar hasta ${CAP_MARGIN * Number(cfg.perRunCapUsd)} (tope por corrida ${cfg.perRunCapUsd} con 25 % de margen); tope total ${cfg.totalCapUsd} USD; no se lanza nada`);
  }
  return { spent, cap: Number(cfg.totalCapUsd) };
}
