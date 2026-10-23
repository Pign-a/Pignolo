// Acceptance: change summary first, then the private acceptance tests, then the project's full test command.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';
import { runProcess } from './proc.mjs';
import { git } from './prepare.mjs';

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

function readJsonReport(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number.isFinite(j.numPassedTests) && Number.isFinite(j.numFailedTests)) {
      return { pass: j.numPassedTests, fail: j.numFailedTests, source: 'json' };
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
    shell: true, cwd: repo, env: process.env, timeoutMs: cfg.acceptTimeoutMs, stdoutPath: outPath, stderrPath: errPath,
  });
  if (r.error) throw new Error(`no se pudo ejecutar el comando de ${name}: ${r.error}`);
  const text = `${fs.readFileSync(outPath, 'utf8')}\n${fs.readFileSync(errPath, 'utf8')}`;
  const counts = r.timedOut
    ? { pass: 0, fail: 1, source: 'timeout' }
    : readJsonReport(jsonPath) || parseCounts(text, r.code);
  return { exitCode: r.code, timedOut: r.timedOut, wallS: r.wallS, ...counts };
}

// Must run before the acceptance files are copied: they must not count as the agent's change.
function summarizeChanges(repo, dir) {
  git(repo, ['add', '-A']);
  const g = (...a) => git(repo, ['-c', 'core.quotepath=false', ...a]);
  const numstat = g('diff', '--cached', '--numstat', '--no-renames', 'base');
  let added = 0;
  let removed = 0;
  for (const l of numstat.split('\n').filter(Boolean)) {
    const [a, d] = l.split('\t');
    if (a !== '-') added += Number(a);
    if (d !== '-') removed += Number(d);
  }
  const files = g('diff', '--cached', '--name-only', '--no-renames', 'base').split('\n').filter(Boolean);
  const changes = {
    shortstat: g('diff', '--cached', '--shortstat', '--no-renames', 'base'),
    filesChanged: files.length, linesAdded: added, linesRemoved: removed, files,
  };
  fs.writeFileSync(path.join(dir, 'changes.patch'), g('diff', '--cached', '--binary', '--no-renames', 'base'));
  fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changes, null, 2));
  return changes;
}

export async function acceptRun(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}`);
  const acceptCmd = readCmd(path.join(taskDir, 'accept-cmd.txt'));
  const fullCmd = readCmd(path.join(taskDir, 'full-cmd.txt'));

  // A second pass keeps the first summary: the acceptance files are already in the tree by then.
  if (!fs.existsSync(path.join(dir, 'changes.json'))) summarizeChanges(repo, dir);

  const acceptDir = path.join(taskDir, 'accept');
  if (fs.existsSync(acceptDir)) {
    for (const rel of walk(acceptDir)) {
      const to = path.join(repo, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(acceptDir, rel), to);
    }
  }
  const accept = await runCmd(cfg, repo, dir, 'accept', acceptCmd);
  const full = await runCmd(cfg, repo, dir, 'full', fullCmd);
  const out = { task, arm, rep, acceptedAt: new Date().toISOString(), accept, full };
  fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(out, null, 2));
  return out;
}
