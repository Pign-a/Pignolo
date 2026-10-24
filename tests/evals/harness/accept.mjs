// Acceptance: change summary first, then the private acceptance tests, then the project's full test command.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assistantTexts, formatAssistantText } from './metrics.mjs';
import { runPaths, HARNESS_DIR, isFixtureTask, taskConfig, assertArmAllowed } from './config.mjs';
import { runProcess } from './proc.mjs';
import { buildChildEnv } from './env.mjs';
import { git } from './prepare.mjs';
import { measureTrees, treePatches, excludeSpecs } from './trees.mjs';
import { prepareTree } from './nm.mjs';
import { qualityRun } from './quality.mjs';

const ANSI = /\u001b\[[0-9;]*m/g;

export function parseCounts(text, exitCode) {
  const t = String(text).replace(ANSI, '');
  // vitest: "Tests  3 failed | 9 passed (12)"; jest: "Tests:       1 failed, 2 passed, 3 total".
  const line = t.match(/^[ \t]*Tests:?[ \t]+(.*)$/m);
  if (line) {
    const p = line[1].match(/(\d+)\s+passed/);
    const f = line[1].match(/(\d+)\s+failed/);
    if (p || f) return { pass: p ? Number(p[1]) : 0, fail: f ? Number(f[1]) : 0, source: 'summary' };
  }
  // node:test / TAP: "ℹ pass 5" or "# pass 5".
  const np = t.match(/^[#ℹ \t]*pass[ \t]+(\d+)[ \t]*$/m);
  const nf = t.match(/^[#ℹ \t]*fail[ \t]+(\d+)[ \t]*$/m);
  if (np && nf) return { pass: Number(np[1]), fail: Number(nf[1]), source: 'summary' };
  return exitCode === 0 ? { pass: 1, fail: 0, source: 'exit-code' } : { pass: 0, fail: 1, source: 'exit-code' };
}

// Failed suites (test files that did not run, for example because they fail to import): null when the output has no such line.
// vitest: "Test Files  1 failed | 2 passed (3)"; jest: "Test Suites: 2 failed, 3 passed, 5 total".
export function parseSuites(text) {
  const t = String(text).replace(ANSI, '');
  const line = t.match(/^[ \t]*(?:Test Files|Test Suites):?[ \t]+(.*)$/m);
  if (!line) return null;
  const f = line[1].match(/(\d+)\s+failed/);
  return f ? Number(f[1]) : 0;
}

function readJsonReport(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number.isFinite(j.numPassedTests) && Number.isFinite(j.numFailedTests)) {
      return {
        pass: j.numPassedTests, fail: j.numFailedTests, source: 'json',
        suitesFailed: Number.isFinite(j.numFailedTestSuites) ? j.numFailedTestSuites : null,
      };
    }
  } catch { /* no report */ }
  return null;
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

function readCmd(file) {
  let c;
  try { c = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim(); } catch { throw new Error(`falta ${file}`); }
  if (!c) throw new Error(`${file} está vacío`);
  return c;
}

async function runCmd(cfg, repo, dir, name, command) {
  const jsonPath = path.join(dir, `${name}-report.json`);
  fs.rmSync(jsonPath, { force: true });
  const outPath = path.join(dir, `${name}.out.txt`);
  const errPath = path.join(dir, `${name}.err.txt`);
  const r = await runProcess({
    command: command.replaceAll('{json}', `"${jsonPath}"`),
    shell: true, cwd: repo, env: buildChildEnv(cfg, process.env, { claude: false }).env, timeoutMs: cfg.acceptTimeoutMs, stdoutPath: outPath, stderrPath: errPath,
  });
  if (r.error) throw new Error(`no se pudo ejecutar el comando de ${name}: ${r.error}`);
  const text = `${fs.readFileSync(outPath, 'utf8')}\n${fs.readFileSync(errPath, 'utf8')}`;
  const counts = r.timedOut
    ? { pass: 0, fail: 1, source: 'timeout', suitesFailed: null }
    : readJsonReport(jsonPath) || { ...parseCounts(text, r.code), suitesFailed: null };
  if (counts.suitesFailed === null && !r.timedOut) counts.suitesFailed = parseSuites(text);
  return { exitCode: r.code, timedOut: r.timedOut, wallS: r.wallS, ...counts };
}

// Must run before the acceptance files are copied: they must not count as the agent's change.
// Counts are code-only (process notes and project documents excluded with git pathspecs); the raw patch keeps everything.
function summarizeChanges(cfg, repo, dir) {
  let t = measureTrees(repo, cfg.blindExcludePaths);
  if (t.measured.kind === 'branch') {
    // The code is only on a branch: check it out in a worktree of its own so it can be accepted.
    const wt = path.join(dir, 'measured');
    if (!fs.existsSync(wt)) git(repo, ['worktree', 'add', '-q', wt, t.measured.branch]);
    t = measureTrees(repo, cfg.blindExcludePaths);
  }
  const m = t.measured;
  const tree = m.path;
  const others = t.worktrees.map((w) => w.path).filter((p) => path.resolve(p).toLowerCase() !== path.resolve(tree).toLowerCase());
  const patches = treePatches(tree, others, cfg.blindExcludePaths);
  const files = m.files;
  const changes = {
    shortstat: patches.shortstat,
    filesChanged: m.filesChanged, linesAdded: m.linesAdded, linesRemoved: m.linesRemoved, files,
    rawFilesChanged: m.rawFilesChanged,
    // Counts above ignore line endings; these are the same code-only counts without ignoring them, and the line-ending files.
    rawLinesAdded: m.rawLinesAdded, rawLinesRemoved: m.rawLinesRemoved,
    eolOnlyFiles: m.eolOnlyFiles, eolOnlyCount: m.eolOnlyFiles.length,
    eolConvertedFiles: m.eolConvertedFiles, eolConvertedCount: m.eolConvertedFiles.length,
    measuredTree: tree, measuredKind: m.kind, measuredBranch: m.branch,
    candidates: t.candidates, worktrees: t.worktrees, branchesAhead: t.branchesAhead,
    flags: t.flags, noChanges: t.noChanges, invalidReasons: t.noChanges ? ['no_changes'] : [],
  };
  fs.writeFileSync(path.join(dir, 'changes.patch'), patches.raw);
  fs.writeFileSync(path.join(dir, 'changes.blind.patch'), patches.blind);
  fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changes, null, 2));
  return changes;
}

// The assistant messages of a run as [{ message, text }]: assistant-text.txt, rebuilt from stream.jsonl when it is missing (runs
// made before it existed); null when neither is there.
function assistantMessages(dir) {
  const file = path.join(dir, 'assistant-text.txt');
  let text = null;
  if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8');
  else if (fs.existsSync(path.join(dir, 'stream.jsonl'))) {
    text = formatAssistantText(assistantTexts(fs.readFileSync(path.join(dir, 'stream.jsonl'), 'utf8')));
    fs.writeFileSync(file, text);
  }
  if (text === null) return null;
  const parts = text.split(/^----- mensaje (\d+) -----\r?$/m);
  const out = [];
  for (let k = 1; k + 1 < parts.length; k += 2) out.push({ message: Number(parts[k]), text: parts[k + 1] });
  return out;
}

// A line that mentions the contract but is not the plain line (bold, a bullet, a quote...): worth telling apart from a missing line.
function formattedFrontsLine(texts) {
  let found = null;
  for (const t of texts) {
    for (const line of String(t).replace(/\r/g, '').split('\n')) {
      if (/(^|[^A-Za-z])Frentes[*_`]*:/.test(line) && !/^Frentes:/.test(line)) found = line.trim().slice(0, 200);
    }
  }
  return found;
}

// Front-detection fixtures: no tests to copy. The "Frentes:" line (a plain line at the start of a line; the LAST one of the whole
// conversation, since a skill may print it before its agents and again at the end) is compared with what was written in advance.
const FRONT_IDS = ['security', 'database', 'code', 'tests', 'hygiene', 'docs'];

function acceptFixture(cfg, { task, arm, rep, dir }) {
  const require = createRequire(import.meta.url);
  const { compareFronts, extractFronts, decodeInput } = require('../compare-fronts.js');
  const finalFile = path.join(dir, 'final.txt');
  const messages = assistantMessages(dir);
  const hasFinal = fs.existsSync(finalFile);
  if (messages === null && !hasFinal) throw new Error(`faltan assistant-text.txt / stream.jsonl y ${finalFile}; corré run primero`);
  const name = taskConfig(cfg, task).fixture;
  const expected = JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, '..', 'fronts-expected.json'), 'utf8'));
  // Candidates in conversation order; the final result text is the last one.
  const candidates = (messages || []).map((m) => ({ source: 'assistant-text', message: m.message, text: m.text }));
  if (hasFinal) candidates.push({ source: 'final.txt', message: 'final', text: decodeInput(fs.readFileSync(finalFile)) });
  const hit = [...candidates].reverse().find((c) => extractFronts(c.text) !== null) || null;
  let result;
  let got = [];
  let foundIn = { source: null, message: null };
  if (hit) {
    result = compareFronts(hit.text, name, expected);
    got = extractFronts(hit.text) || [];
    foundIn = { source: hit.source, message: hit.message };
  } else {
    const formatted = formattedFrontsLine(candidates.map((c) => c.text));
    result = { ok: false, reason: formatted ? `línea Frentes con formato (markdown): ${formatted}` : 'sin línea de frentes' };
  }
  let metrics = {};
  try { metrics = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8')); } catch { /* no metrics */ }
  // Secondary figure: the fronts delegated, read from the agents the main thread launched ("<plugin>:review-<id>"), not from any
  // printed line. null when the metrics predate agentTypes (run remetric first). It never replaces the line-based result.
  let frontsByAgents = null;
  let frontsByAgentsOk = null;
  if (Array.isArray(metrics.agentTypes)) {
    const plugin = cfg.arms[arm].pluginName;
    const ids = new Set();
    for (const t of metrics.agentTypes) {
      const m = String(t).match(/^([^:]+):review-([a-z]+)$/);
      if (m && m[1] === plugin && FRONT_IDS.includes(m[2])) ids.add(m[2]);
    }
    frontsByAgents = FRONT_IDS.filter((id) => ids.has(id));
    const want = new Set(expected[name]);
    frontsByAgentsOk = frontsByAgents.length === want.size && frontsByAgents.every((id) => want.has(id));
  }
  const out = {
    task, arm, rep, fixture: name, ok: result.ok, reason: result.reason, got, expected: expected[name], foundIn,
    frontsByAgents, frontsByAgentsOk,
    missing: result.missing, extra: result.extra,
    // Total agents (the ficha counts native-command agents too) and the ones launched by the main thread.
    agents: metrics.agents ?? null, agentsMain: metrics.agentsMain ?? null, acceptedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'fronts.json'), JSON.stringify(out, null, 2));
  return out;
}

export async function acceptRun(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}`);
  if (isFixtureTask(cfg, task)) return acceptFixture(cfg, { task, arm, rep, dir });
  const acceptCmd = readCmd(path.join(taskDir, 'accept-cmd.txt'));
  const fullCmd = readCmd(path.join(taskDir, 'full-cmd.txt'));

  // A second pass keeps the first summary: the acceptance files are already in the tree by then.
  if (!fs.existsSync(path.join(dir, 'changes.json'))) summarizeChanges(cfg, repo, dir);
  const changes = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
  const tree = changes.measuredTree || repo;
  prepareTree(cfg, repo, tree);

  const acceptDir = path.join(taskDir, 'accept');
  if (fs.existsSync(acceptDir)) {
    for (const rel of walk(acceptDir)) {
      const to = path.join(tree, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(acceptDir, rel), to);
    }
  }
  const accept = await runCmd(cfg, tree, dir, 'accept', acceptCmd);
  const full = await runCmd(cfg, tree, dir, 'full', fullCmd);
  // Floor of the full suite at the base commit, written by the author in <privateRoot>/tasks.json; unknown is null, not zero.
  let baselineFull = null;
  try {
    const t = JSON.parse(fs.readFileSync(path.join(cfg.privateRoot, 'tasks.json'), 'utf8').replace(/^﻿/, ''));
    const b = t && t[task] && t[task].baselineFull;
    if (b && Number.isFinite(b.fail)) baselineFull = { fail: b.fail };
  } catch { /* no tasks.json */ }
  const out = { task, arm, rep, acceptedAt: new Date().toISOString(), accept, full, baselineFull, invalidReasons: changes.invalidReasons || [] };
  // Saved first: a long quality run must never put the acceptance result at risk.
  fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(out, null, 2));
  // The automatic quality panel (free: no tokens). A missing tool is a note in quality.json, never a failure of accept.
  try {
    const q = await qualityRun(cfg, { task, arm, rep });
    out.quality = { file: 'quality.json', notes: q.notes };
  } catch (e) {
    out.quality = { error: e.message };
    console.error(`aviso: el panel de calidad de ${task}/${arm}/${rep} no se calculó: ${e.message}`);
  }
  fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(out, null, 2));
  return out;
}
