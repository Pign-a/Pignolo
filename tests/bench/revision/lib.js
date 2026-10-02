'use strict';
// Shared helpers of the revision benchmarks (experiments `lentes-reales` and
// `momento-de-revision`). No npm dependencies; Node >= 22.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const HERE = __dirname;
const DEFAULT_REPO = path.resolve(HERE, '..', '..', '..');

function loadCases(file = path.join(HERE, 'cases.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Run git in `repo`; `buffer: true` returns a Buffer (for git archive and binary-safe reads).
function git(repo, args, opts = {}) {
  const out = execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'], ...(opts.buffer ? {} : { encoding: 'utf8' }) });
  return out;
}

// Neutral folder name of a snapshot: no hint of the case, the arm or the commit.
function snapshotCode(id) {
  return `c${crypto.createHash('sha256').update(`pignolo-bench-revision:${id}`).digest('hex').slice(0, 7)}`;
}

// mulberry32: the seeded generator named by the cards.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates from the end, one draw per position. The cards fix the seed, not the shuffle
// routine, so this routine is part of the protocol and must not change after the first run.
function shuffle(list, seed) {
  const rng = mulberry32(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A path is a test file when a directory is named test/tests/__tests__ or the file name says so.
function isTestPath(p) {
  const q = p.replace(/\\/g, '/');
  return /(^|\/)(tests?|__tests__)\//.test(q) || /(^|\/)[^/]*[.-](test|spec)\.[a-z]+$/i.test(q) || /(^|\/)[^/]*\.test$/.test(q);
}
const SOURCE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|sh|ps1|py)$/i;
function isSourcePath(p) {
  return SOURCE_EXT.test(p) && !isTestPath(p);
}

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const range = (xs) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);

// Run ids: `case|lens|rep` (lentes) and `block|run|rep` (momento).
function parseRunId(id) {
  const [a, b, c] = String(id).split('|');
  const rep = Number(c);
  if (!a || !b || !Number.isInteger(rep) || rep < 1) throw new Error(`run id invalido: ${id}`);
  return { a, b, rep };
}

function snapshotById(cases, id) {
  const s = cases.snapshots.find((x) => x.id === id);
  if (!s) throw new Error(`snapshot desconocido: ${id}`);
  return s;
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (header, rows) => `${[header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n')}\n`;

function parseArgs(argv, multi = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const val = next === undefined || next.startsWith('--') ? true : (i += 1, next);
      if (multi.includes(key)) (out[key] ||= []).push(val);
      else out[key] = val;
    } else out._.push(a);
  }
  return out;
}

module.exports = {
  HERE, DEFAULT_REPO, loadCases, git, snapshotCode, mulberry32, shuffle, isTestPath, isSourcePath,
  median, range, parseRunId, snapshotById, toCsv, csvCell, parseArgs,
};
