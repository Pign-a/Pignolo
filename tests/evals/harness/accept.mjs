// Acceptance: change summary first, then the private acceptance tests, then the project's full test command.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';
import { runProcess } from './proc.mjs';
import { buildChildEnv } from './env.mjs';
import { git } from './prepare.mjs';
import { measureTrees, treePatches, excludeSpecs } from './trees.mjs';
import { linkNodeModules, ensureSnapshot } from './nm.mjs';

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
    measuredTree: tree, measuredKind: m.kind, measuredBranch: m.branch,
    candidates: t.candidates, worktrees: t.worktrees, branchesAhead: t.branchesAhead,
    flags: t.flags, noChanges: t.noChanges, invalidReasons: t.noChanges ? ['no_changes'] : [],
  };
  fs.writeFileSync(path.join(dir, 'changes.patch'), patches.raw);
  fs.writeFileSync(path.join(dir, 'changes.blind.patch'), patches.blind);
  fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changes, null, 2));
  return changes;
}

// The acceptance tests run in the measured tree: it needs the dependencies and the ignored folders the project needs.
function prepareTree(cfg, mainRepo, tree) {
  if (path.resolve(tree).toLowerCase() === path.resolve(mainRepo).toLowerCase()) return;
  ensureSnapshot(cfg);
  linkNodeModules(cfg, tree);
  for (const rel of cfg.copyDirs || []) {
    const from = path.join(mainRepo, rel);
    const to = path.join(tree, rel);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });
  }
}

export async function acceptRun(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}`);
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
  fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(out, null, 2));
  return out;
}
