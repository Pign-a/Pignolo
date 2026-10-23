// How much has been spent so far: one ledger for every experiment of the CSV, so calibration runs count too.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './row.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const key = (task, arm, rep, ts) => `${task}\u0000${arm}\u0000${rep}\u0000${ts}`;

// Rows of the CSV, plus runs that already spent but have no row yet (metrics.json without a matching row).
// A run whose cost is unknown (cut by timeout, no result) counts as the per-run cap, the most it could have cost.
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
  let entries = [];
  try { entries = fs.readdirSync(cfg.workRoot, { withFileTypes: true }); } catch { /* no runs yet */ }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = readJson(path.join(cfg.workRoot, e.name, 'metrics.json'));
    if (!m || seen.has(key(m.task, m.arm, Number(m.rep), m.finishedAt))) continue;
    total += typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) ? m.costUsd : Number(cfg.perRunCapUsd);
  }
  return Math.round(total * 10000) / 10000;
}

export function assertWithinTotalCap(cfg) {
  const spent = spentUsd(cfg);
  const next = spent + Number(cfg.perRunCapUsd);
  if (next > Number(cfg.totalCapUsd)) {
    throw new Error(`tope total de gasto: ya van ${spent} USD y otra corrida puede costar hasta ${cfg.perRunCapUsd} (tope total ${cfg.totalCapUsd} USD); no se lanza nada`);
  }
  return { spent, cap: Number(cfg.totalCapUsd) };
}
