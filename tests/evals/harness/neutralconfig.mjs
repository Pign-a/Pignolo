// Account-synced content in the dedicated config dir. When Claude Code runs logged in it downloads account-level skills
// and plugins into <configDir>/skills/synced, <configDir>/plugins/synced and per-plugin data into <configDir>/plugins/data.
// That content is created by Claude Code itself and loads identically in both arms, so it is declared (neutral), not blocked,
// unless something in it is named like one of the arms' plugins. Only names and counts are ever read, never contents
// (apart from the "name" field of plugin.json files).
import fs from 'node:fs';
import path from 'node:path';

const MAX_ENTRIES = 50000;
const rel = (p) => String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

// Is `relative` (a path under configDir, forward slashes) one of the neutral paths or inside one?
export function isNeutralPath(relative, neutralPaths) {
  const r = rel(relative);
  return (neutralPaths || []).some((p) => r === rel(p) || r.startsWith(`${rel(p)}/`));
}

const subdirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };

// Files under `dir` (links are counted, never followed).
function countFiles(dir, budget = { n: MAX_ENTRIES }) {
  let total = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (budget.n-- <= 0) return total;
    if (e.isDirectory()) total += countFiles(path.join(dir, e.name), budget);
    else total += 1;
  }
  return total;
}

// "name" of every plugin.json under `dir` (any depth up to 6), names only.
function pluginJsonNames(dir, depth = 0, out = []) {
  if (depth > 6) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pluginJsonNames(p, depth + 1, out);
    else if (e.name === 'plugin.json') {
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j && typeof j.name === 'string') out.push(j.name);
      } catch { /* unreadable plugin.json */ }
    }
  }
  return out;
}

const uniq = (xs) => [...new Set(xs)].sort();

// Names and counts of what is there. Paths that are not declared neutral are not scanned.
export function scanNeutralConfig(configDir, neutralPaths) {
  const on = (p) => isNeutralPath(p, neutralPaths);
  const out = {
    skillsSynced: { files: 0, folders: [] },
    pluginsSynced: { files: 0, plugins: [] },
    pluginsData: { folders: [] },
  };
  if (on('skills/synced')) {
    const root = path.join(configDir, 'skills', 'synced');
    out.skillsSynced.files = countFiles(root);
    // <bucket>/<skill>/...: the skill folders; when a bucket has none, the bucket folders themselves.
    const names = [];
    for (const b of subdirs(root)) {
      const inner = subdirs(path.join(root, b));
      if (inner.length) names.push(...inner); else names.push(b);
    }
    out.skillsSynced.folders = uniq(names);
  }
  if (on('plugins/synced')) {
    const root = path.join(configDir, 'plugins', 'synced');
    out.pluginsSynced.files = countFiles(root);
    out.pluginsSynced.plugins = uniq(pluginJsonNames(root));
  }
  if (on('plugins/data')) out.pluginsData.folders = uniq(subdirs(path.join(configDir, 'plugins', 'data')));
  return out;
}

// Everything in the synced content that is named like one of the arms' plugins: the name itself or "<name>-...".
export function armNamedContent(configDir, armNames, neutralPaths) {
  const names = (armNames || []).map((n) => String(n).toLowerCase()).filter(Boolean);
  const hits = [];
  const check = (name, label = name) => {
    const n = String(name).split('/').pop().toLowerCase().split('@')[0];
    if (names.some((a) => n === a || n.startsWith(`${a}-`))) hits.push(label);
  };
  if (isNeutralPath('skills/synced', neutralPaths)) {
    const root = path.join(configDir, 'skills', 'synced');
    for (const b of subdirs(root)) {
      check(b, `skills/synced/${b}`);
      for (const sk of subdirs(path.join(root, b))) check(sk, `skills/synced/${b}/${sk}`);
    }
  }
  if (isNeutralPath('plugins/synced', neutralPaths)) {
    const root = path.join(configDir, 'plugins', 'synced');
    const walk = (d, shown, depth) => {
      if (depth > 3) return;
      for (const n of subdirs(d)) { check(n, `${shown}/${n}`); walk(path.join(d, n), `${shown}/${n}`, depth + 1); }
    };
    walk(root, 'plugins/synced', 0);
    for (const n of pluginJsonNames(root)) check(n, `plugins/synced (plugin.json con name "${n}")`);
  }
  return hits;
}

// The short summary for the CSV, from the content after the run.
export function summarizeNeutralConfig(content) {
  if (!content || !content.after) return '';
  const a = content.after;
  const parts = [];
  if (a.skillsSynced.files) parts.push(`skills_synced=${a.skillsSynced.files}`);
  if (a.pluginsSynced.files) parts.push(`plugins_synced=${a.pluginsSynced.files}`);
  if (a.pluginsData.folders.length) parts.push(`plugins_data=${a.pluginsData.folders.length}`);
  if (parts.length && content.createdByRun) parts.push('creado_en_la_corrida');
  return parts.join(';');
}

export const hasContent = (c) => c.skillsSynced.files > 0 || c.pluginsSynced.files > 0 || c.pluginsData.folders.length > 0;
