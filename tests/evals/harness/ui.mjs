// UI tasks (kind "ui"): the author's request lives in the private folder, the sandbox is blank, the agent builds screens as static
// HTML under design/. This file reads the scenario and finds the screens of a finished run; scoring is in uiscore.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { taskConfig, uiScenarioFile } from './config.mjs';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const slash = (p) => String(p).replace(/\\/g, '/');

// The scenario file: the author's natural request in one paragraph. It may start with a line "title: ..." (a label for the author;
// it is NOT part of the prompt). Returns { scenario, file, title, text, sha } with `sha` over the text that is sent.
export function parseScenario(raw) {
  const lines = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let title = null;
  const m = /^title:[ \t]*(.*)$/i.exec(lines[0] || '');
  if (m) { title = m[1].trim(); lines.shift(); }
  const text = lines.join('\n').trim();
  return { title, text };
}

export function readScenario(cfg, task) {
  const t = taskConfig(cfg, task);
  const file = uiScenarioFile(cfg, task);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`falta ${file} (el pedido del autor para el escenario ${t && t.scenario} de la tarea ${task})`); }
  const { title, text } = parseScenario(raw);
  if (!text) throw new Error(`${file} no tiene texto (solo la línea title:, o está vacío)`);
  return { scenario: t.scenario, file, title, text, sha: sha(text) };
}

// The exact prompt of an arm: its uiPrefix (for example "/pignolo:ui " for a forced invocation; none for the arm without plugin) and the scenario text.
export function uiPromptOf(cfg, task, arm) {
  const s = readScenario(cfg, task);
  const prefix = (cfg.arms[arm] && cfg.arms[arm].uiPrefix) || '';
  return { prompt: prefix + s.text, prefix, scenario: s };
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.pignolo-ui']);

function walkHtml(dir, base, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkHtml(p, base, out); } else if (e.isFile() && /\.html?$/i.test(e.name)) out.push(slash(path.relative(base, p)));
  }
  return out;
}

const slugOf = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'screen';
export const MAX_SCREENS = 24;

// The screens of a run, looked up in `tree` (the measured tree). Rule 1 ("screens-dir"): design/screens/<slug>/index.html, any slug.
// Rule 2 ("html-fallback"), only when rule 1 finds none: any *.html under design/ except design/components/ and design/index.html.
// Returns { rule: "screens-dir" | "html-fallback" | "none", screens: [{ slug, rel }], truncated } with `rel` relative to `tree`, forward slashes.
export function findScreens(tree) {
  const design = path.join(tree, 'design');
  const fromDirs = [];
  const screensDir = path.join(design, 'screens');
  let slugs = [];
  try { slugs = fs.readdirSync(screensDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name).sort(); } catch { /* none */ }
  for (const s of slugs) {
    const index = path.join(screensDir, s, 'index.html');
    if (fs.existsSync(index) && fs.statSync(index).isFile()) fromDirs.push({ slug: slugOf(s), rel: `design/screens/${s}/index.html` });
  }
  let rule = 'none';
  let found = [];
  if (fromDirs.length) { rule = 'screens-dir'; found = fromDirs; } else {
    const all = walkHtml(design, tree).filter((rel) => rel !== 'design/index.html' && !rel.startsWith('design/components/'));
    if (all.length) { rule = 'html-fallback'; found = all.map((rel) => ({ slug: slugOf(rel.replace(/^design\//, '').replace(/\.html?$/i, '').replace(/[\\/]/g, '-')), rel })); }
  }
  // Two slugs can collapse to the same name after cleaning: keep them apart.
  const seen = new Map();
  found = found.map((s) => {
    const n = (seen.get(s.slug) || 0) + 1;
    seen.set(s.slug, n);
    return n === 1 ? s : { ...s, slug: `${s.slug}-${n}` };
  });
  const truncated = found.length > MAX_SCREENS ? found.length - MAX_SCREENS : 0;
  return { rule, screens: found.slice(0, MAX_SCREENS), truncated };
}
