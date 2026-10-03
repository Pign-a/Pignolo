'use strict';
// Blind-grading extraction (cards, section 8, step 1). Takes the `json` block of each reviewer
// run, drops `lens` and `id`, gives every finding a random code and mixes the findings of all
// runs of one batch. The key (code <-> run, lens, repetition) stays in findings-full.json for the
// final script; the grader only receives blind/<batch>.json.
//
//   node tests/bench/revision/extract.js --experiment lentes|momento --manifest <runs.json> --out <dir> [--strip-lines]
//
// runs.json: [{ "run": "D1|reliability|1", "file": "<transcript or output>",
//               "minutes": 3.2, "turns": 14, "finalContext": 52000, "weighted": 41000, "usd": 0.31 }]
// A `run` id is `case|lens|rep` (lentes) or `block|run|rep` (momento), as printed by order.js.
// momento: --strip-lines is implied (line numbers differ between the tree of a task and the tip
// and would reveal the arm); runs that reuse a lentes run are skipped (graded once, in lentes).
const fs = require('node:fs');
const path = require('node:path');
const { loadCases, parseRunId, shuffle, mulberry32, parseArgs } = require('./lib');

const FENCE = /```json\s*\n([\s\S]*?)```/g;

// Text blobs of a run: whole file for plain output; for stream-json, tool_result contents and
// assistant text (the final report of a subagent reaches the main session as a tool_result).
function blobs(raw) {
  const out = [];
  const take = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(take);
    else if (v && typeof v === 'object') {
      if (typeof v.text === 'string') out.push(v.text);
      if (v.content !== undefined) take(v.content);
    }
  };
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (v.type === 'tool_result') take(v.content);
      else if (v.type === 'text' && typeof v.text === 'string') out.push(v.text);
      else for (const x of Object.values(v)) if (x && typeof x === 'object') walk(x);
    }
  };
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (parsed !== null && typeof parsed === 'object') { walk(parsed); return out; }
  let events = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t.startsWith('{')) { try { walk(JSON.parse(t)); events += 1; } catch { /* plain line */ } }
  }
  return events ? out : [raw];
}

function extractBlock(raw) {
  let found = null;
  for (const b of blobs(raw)) {
    const all = [...b.matchAll(FENCE)];
    if (all.length) found = all[all.length - 1][1];
  }
  if (found === null) return { ok: false, error: 'no-json-block', findings: [] };
  let arr;
  try { arr = JSON.parse(found); } catch (e) { return { ok: false, error: 'json-invalid', findings: [] }; }
  if (!Array.isArray(arr)) return { ok: false, error: 'json-not-array', findings: [] };
  return { ok: true, error: null, findings: arr.filter((f) => f && typeof f === 'object') };
}

// `path:line` -> { file, line }. Absolute paths are cut at the snapshot's tree/ folder.
function splitLocation(loc) {
  let s = String(loc || '').trim().replace(/\\/g, '/');
  const m = /^(.*?):(\d+)(?:\s*[-–]\s*\d+)?$/.exec(s);
  let line = null;
  if (m) { s = m[1]; line = Number(m[2]); }
  s = s.replace(/^.*?\/tree\//, '').replace(/^\.\//, '');
  return { file: s, line };
}

const SNAP_PATH = /[A-Za-z]:[\\/][^\s"'`]*?[\\/]c[0-9a-f]{7}[\\/](?:tree|brief)[\\/]|\/[^\s"'`]*?\/c[0-9a-f]{7}\/(?:tree|brief)\//g;
function cleanText(s, stripLines) {
  let t = String(s || '').replace(SNAP_PATH, '').replace(/\r/g, '');
  if (stripLines) t = t.replace(/(\.[A-Za-z]{1,4}):\d+(?:\s*[-–]\s*\d+)?/g, '$1').replace(/\b(?:lines?|L)\s*\d+(?:\s*[-–]\s*\d+)?/g, 'line N');
  return t.trim();
}

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function describeRun(cases, experiment, id) {
  const { a, b, rep } = parseRunId(id);
  if (experiment === 'lentes') {
    const c = cases.lentes.cases.find((x) => x.id === a);
    if (!c) throw new Error(`caso desconocido: ${a}`);
    return { batch: a, case: a, lens: b, rep, arm: null };
  }
  const block = cases.momento.blocks.find((x) => x.id === a);
  if (!block) throw new Error(`bloque desconocido: ${a}`);
  const run = block.runs.find((x) => x.id === b);
  if (!run) throw new Error(`corrida desconocida: ${a}|${b}`);
  return { batch: block.batch, block: a, arm: block.arm, plan: block.batch, run: b, lens: cases.momento.lens, rep, reused: Boolean(run.reusedFrom) };
}

function extractAll({ cases, experiment, runs, readFile = (f) => fs.readFileSync(f, 'utf8'), stripLines }) {
  const strip = stripLines || experiment === 'momento';
  const seed = experiment === 'lentes' ? cases.lentes.seed : cases.momento.seed;
  const used = new Set();
  const rngCode = mulberry32(strHash(`codes:${seed}`));
  const newCode = () => {
    for (;;) {
      const c = `f${Math.floor(rngCode() * 36 ** 5).toString(36).padStart(5, '0')}`;
      if (!used.has(c)) { used.add(c); return c; }
    }
  };
  const full = [];
  const runTable = [];
  const sorted = runs.slice().sort((x, y) => (x.run < y.run ? -1 : x.run > y.run ? 1 : 0));
  for (const r of sorted) {
    const d = describeRun(cases, experiment, r.run);
    const base = { run: r.run, experiment, batch: d.batch, lens: d.lens, rep: d.rep, arm: d.arm, block: d.block, caseId: d.case, subrun: d.run, minutes: r.minutes, turns: r.turns, finalContext: r.finalContext, weighted: r.weighted, usd: r.usd };
    if (d.reused) { runTable.push({ ...base, valid: null, note: 'reused from lentes: graded there' }); continue; }
    const ex = extractBlock(readFile(r.file));
    runTable.push({ ...base, valid: ex.ok, note: ex.error || '', findings: ex.findings.length });
    ex.findings.forEach((f, i) => {
      const { file, line } = splitLocation(f.location);
      const text = cleanText(`${f.evidence || ''}${f.repro ? `\nRepro: ${f.repro}` : ''}`, strip);
      full.push({
        code: newCode(), ...base, index: i, severity: String(f.severity || '').toUpperCase(), file,
        line: strip ? null : line, text,
      });
    });
  }
  const batches = {};
  for (const f of full) (batches[f.batch] ||= []).push(f);
  const blind = {};
  for (const [batch, list] of Object.entries(batches)) {
    blind[batch] = shuffle(list, strHash(`${batch}:${seed}`)).map((f) => ({ code: f.code, severity: f.severity, file: f.file, line: f.line, text: f.text }));
  }
  return { full, blind, runTable };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.experiment || !a.manifest || !a.out || !['lentes', 'momento'].includes(a.experiment)) {
    process.stderr.write('uso: node extract.js --experiment lentes|momento --manifest <runs.json> --out <dir> [--strip-lines]\n');
    process.exit(2);
  }
  try {
    const runs = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
    const res = extractAll({ cases: loadCases(), experiment: a.experiment, runs, stripLines: Boolean(a['strip-lines']) });
    fs.mkdirSync(path.join(a.out, 'blind'), { recursive: true });
    fs.writeFileSync(path.join(a.out, 'findings-full.json'), `${JSON.stringify(res.full, null, 2)}\n`);
    fs.writeFileSync(path.join(a.out, 'runs-table.json'), `${JSON.stringify(res.runTable, null, 2)}\n`);
    for (const [batch, list] of Object.entries(res.blind)) fs.writeFileSync(path.join(a.out, 'blind', `${batch}.json`), `${JSON.stringify(list, null, 2)}\n`);
    const bad = res.runTable.filter((r) => r.valid === false);
    process.stdout.write(`${JSON.stringify({ runs: res.runTable.length, invalid: bad.map((r) => `${r.run}:${r.note}`), findings: res.full.length, batches: Object.keys(res.blind) })}\n`);
  } catch (e) {
    process.stderr.write(`extract: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { extractBlock, splitLocation, cleanText, extractAll, describeRun, blobs };
