// Deterministic scoring of a seeded-defect review (study B of the ficha). No model involved.
// Input: the top-level assistant text of the run (assistant-text.txt) and the private ground truth of the item
// (<privateRoot>/review/<item>/defects.json and, optionally, preexisting.json). Output: review_score.json in the run folder and the
// CSV columns defects_total, defects_found, found_by_category, findings_total, findings_unmatched.
//
// A seeded defect is FOUND when the text mentions the basename of its file AND either
//   (a) a line number referenced for that file lies within [startLine - 5, endLine + 5], or
//   (b) at least 2 of its keywords (case-insensitive) occur within 300 characters of a mention of that basename.
// A line number is referenced for a file as `path:12`, `path:12-30`, `path#L12`, `path (line 12)` (backticked or not), or as
// "line(s) N" / "línea(s) N" in the 300 characters after a mention of the basename. A range counts through its two ends.
// findings_total is the number of DISTINCT file:line references (file by basename, ranges by start line); findings_unmatched the ones
// whose line is not within 5 lines of a seeded defect of that file and not inside a pre-existing area. This file is hashed by the freeze.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, isReviewTask, taskConfig, assertArmAllowed } from './config.mjs';
import { assistantTexts, formatAssistantText } from './metrics.mjs';

export const LINE_WINDOW = 5;
export const KEYWORD_WINDOW = 300;
export const MIN_KEYWORDS = 2;

export const SOURCE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'rb', 'php', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp', 'swift', 'scala', 'vue', 'svelte', 'astro', 'sql', 'prisma', 'graphql', 'sh', 'ps1', 'json', 'yml', 'yaml', 'toml', 'md', 'mdx', 'css', 'scss', 'html', 'ejs', 'env'];

// path (ending in a source extension) followed by one of the three reference forms.
const PATH_RE = `[A-Za-z0-9_@~.$\\-/\\\\]*[A-Za-z0-9_$\\-]\\.(?:${SOURCE_EXTENSIONS.join('|')})(?![A-Za-z0-9_])`;
const REF_SOURCE = `(?<![\\w.\\-/\\\\])(${PATH_RE})(?::(\\d+)(?:\\s*[-\\u2013]\\s*(\\d+))?|#L(\\d+)(?:\\s*[-\\u2013]\\s*L?(\\d+))?|[\`*_"']*\\s*\\(\\s*(?:lines?|l[i\\u00ed]neas?|ln|L)\\s*\\.?\\s*(\\d+)(?:\\s*[-\\u2013]\\s*(\\d+))?\\s*\\))`;
// "line 12", "lines 12-30", "líneas 12, 15 y 20": the numbers after the word.
const FREE_LINES_RE = /\b(?:lines?|l[ií]neas?)\s+(\d+(?:\s*(?:[-–,&]|and|y)\s*\d+)*)/gi;

const slash = (p) => String(p).replace(/\\/g, '/');
export const baseName = (p) => slash(p).replace(/\/+$/, '').split('/').pop().toLowerCase();

// Every file:line reference in the text: [{ file, base, line, end, index }] in order of appearance.
export function extractReferences(text) {
  const re = new RegExp(REF_SOURCE, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const line = Number(m[2] ?? m[4] ?? m[6]);
    const endRaw = m[3] ?? m[5] ?? m[7];
    const end = endRaw === undefined ? line : Number(endRaw);
    if (!Number.isFinite(line)) continue;
    out.push({ file: m[1], base: baseName(m[1]), line, end: Number.isFinite(end) ? end : line, index: m.index });
  }
  return out;
}

// Positions where `base` (a lowercase basename) is named, with the boundary of a file name on both sides ("app.ts" is not in "app.tsx").
export function mentionsOf(text, base) {
  const low = text.toLowerCase();
  const out = [];
  const word = /[A-Za-z0-9_]/;
  for (let at = low.indexOf(base); at !== -1; at = low.indexOf(base, at + 1)) {
    const before = at > 0 ? low[at - 1] : '';
    const after = low[at + base.length] || '';
    if ((before && (word.test(before) || before === '-')) || (after && word.test(after))) continue;
    out.push({ start: at, end: at + base.length });
  }
  return out;
}

// Line numbers the text gives for a file: formal references (both ends of a range) and "line N" within 300 characters after a mention.
function linesReferencedFor(text, base, refs, mentions) {
  const lines = new Set();
  for (const r of refs) if (r.base === base) { lines.add(r.line); lines.add(r.end); }
  for (const m of mentions) {
    const after = text.slice(m.end, m.end + KEYWORD_WINDOW);
    FREE_LINES_RE.lastIndex = 0;
    let f;
    while ((f = FREE_LINES_RE.exec(after)) !== null) for (const n of f[1].match(/\d+/g)) lines.add(Number(n));
  }
  return lines;
}

function keywordsNear(text, mentions, keywords) {
  const kws = [...new Set((keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  if (kws.length < MIN_KEYWORDS) return false;
  const low = text.toLowerCase();
  return mentions.some((m) => {
    const win = low.slice(Math.max(0, m.start - KEYWORD_WINDOW), Math.min(low.length, m.end + KEYWORD_WINDOW));
    return kws.filter((k) => win.includes(k)).length >= MIN_KEYWORDS;
  });
}

const near = (line, d) => line >= d.startLine - LINE_WINDOW && line <= d.endLine + LINE_WINDOW;

const tally = (list, keyOf, isFound) => {
  const out = {};
  for (const d of list) {
    const k = String(keyOf(d));
    out[k] = out[k] || { found: 0, total: 0 };
    out[k].total += 1;
    if (isFound(d)) out[k].found += 1;
  }
  return out;
};

// "category=found/total|category2=found/total", categories sorted.
export const formatByCategory = (byCategory) => Object.keys(byCategory || {}).sort().map((k) => `${k}=${byCategory[k].found}/${byCategory[k].total}`).join('|');

// Pure scoring of one text against the ground truth of an item.
export function scoreText(text, defects = [], preexisting = []) {
  const src = String(text || '');
  const refs = extractReferences(src);
  const foundIds = [];
  for (const d of defects) {
    const base = baseName(d.file);
    const mentions = mentionsOf(src, base);
    if (!mentions.length) continue;
    const lines = linesReferencedFor(src, base, refs, mentions);
    const byLine = [...lines].some((n) => near(n, d));
    if (byLine || keywordsNear(src, mentions, d.keywords)) foundIds.push(d.id);
  }
  const found = new Set(foundIds);
  // Distinct file:line references (a range counts by its start line).
  const distinct = new Map();
  for (const r of refs) {
    const key = `${r.base}:${r.line}`;
    if (!distinct.has(key)) distinct.set(key, { base: r.base, name: path.posix.basename(slash(r.file)), line: r.line });
  }
  const unmatched = [];
  for (const r of distinct.values()) {
    if (defects.some((d) => baseName(d.file) === r.base && near(r.line, d))) continue;
    if (preexisting.some((p) => baseName(p.file) === r.base && r.line >= p.startLine && r.line <= p.endLine)) continue;
    unmatched.push(`${r.name}:${r.line}`);
  }
  const isFound = (d) => found.has(d.id);
  const byCategory = tally(defects, (d) => d.category || 'sin_categoria', isFound);
  return {
    defects_total: defects.length,
    defects_found: foundIds.length,
    found_ids: foundIds,
    missed_ids: defects.filter((d) => !found.has(d.id)).map((d) => d.id),
    found_by_category: byCategory,
    found_by_subtype: tally(defects, (d) => d.subtype || 'sin_subtipo', isFound),
    found_by_severity: tally(defects, (d) => d.severity || 'sin_severidad', isFound),
    found_by_tests: tally(defects, (d) => (d.catchableByTests ? 'catchable_by_tests' : 'not_catchable_by_tests'), isFound),
    findings_total: distinct.size,
    findings_unmatched: unmatched.length,
    unmatched_refs: unmatched,
  };
}

function readJsonFile(file, what) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { throw new Error(`falta ${file} (${what})`); }
  try { return JSON.parse(raw); } catch (e) { throw new Error(`${file} no es JSON válido: ${e.message}`); }
}

export function loadGroundTruth(taskDir) {
  const defects = readJsonFile(path.join(taskDir, 'defects.json'), 'verdad de base del ítem; un control limpio lleva []');
  if (!Array.isArray(defects)) throw new Error(`${path.join(taskDir, 'defects.json')} tiene que ser una lista`);
  for (const d of defects) {
    if (!d || typeof d.id !== 'string' || typeof d.file !== 'string' || !Number.isFinite(d.startLine) || !Number.isFinite(d.endLine) || d.endLine < d.startLine) {
      throw new Error(`defects.json: cada defecto necesita id, file, startLine y endLine (con endLine >= startLine): ${JSON.stringify(d)}`);
    }
  }
  const pre = path.join(taskDir, 'preexisting.json');
  let preexisting = [];
  if (fs.existsSync(pre)) {
    preexisting = readJsonFile(pre, 'rangos preexistentes');
    if (!Array.isArray(preexisting) || preexisting.some((p) => !p || typeof p.file !== 'string' || !Number.isFinite(p.startLine) || !Number.isFinite(p.endLine))) {
      throw new Error(`${pre} tiene que ser una lista de { file, startLine, endLine }`);
    }
  }
  return { defects, preexisting };
}

// The assistant text of a run: assistant-text.txt, rebuilt from stream.jsonl when it is missing. The "----- mensaje N -----" separators go.
export function assistantTextOf(dir) {
  const file = path.join(dir, 'assistant-text.txt');
  let text = null;
  if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8');
  else if (fs.existsSync(path.join(dir, 'stream.jsonl'))) {
    text = formatAssistantText(assistantTexts(fs.readFileSync(path.join(dir, 'stream.jsonl'), 'utf8')));
    fs.writeFileSync(file, text);
  }
  if (text === null) throw new Error(`faltan assistant-text.txt y stream.jsonl en ${dir}; corré run primero`);
  return text.replace(/^----- mensaje \d+ -----\r?$/gm, '');
}

export function scoreRun(cfg, args) {
  const { task, arm, rep, dir, taskDir } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  if (!isReviewTask(cfg, task)) throw new Error(`la tarea ${task} no es de revisión (kind "review"): score no aplica`);
  const text = assistantTextOf(dir);
  const { defects, preexisting } = loadGroundTruth(taskDir);
  const out = { task, arm, rep, item: taskConfig(cfg, task).item, scoredAt: new Date().toISOString(), ...scoreText(text, defects, preexisting) };
  fs.writeFileSync(path.join(dir, 'review_score.json'), JSON.stringify(out, null, 2));
  return out;
}

// The CSV columns of a score (empty when the run has none).
export function reviewScoreColumns(s) {
  if (!s) return {};
  return {
    defects_total: s.defects_total, defects_found: s.defects_found, found_by_category: formatByCategory(s.found_by_category),
    findings_total: s.findings_total, findings_unmatched: s.findings_unmatched,
  };
}
