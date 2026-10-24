// Automatic quality panel of a run. It costs no tokens: it reads the change summary that `accept` wrote and runs the project's own
// tools (tsc, eslint, and the optional coverage and mutation commands of the task) on the measured tree and on the base commit.
//   tsc     errors as file(code,message) without line numbers (they shift); new = result minus base, as a multiset
//   eslint  errors and warnings of the changed code files, by rule+file, new = result minus base
//   scope   changed files that the real solution (gold-files.txt) did not touch
//   tests   added test files and added it(/test( occurrences (a cheap descriptive proxy, not a measure of test quality)
//   cov/mut numbers printed by the task's coverage-cmd.txt / mutation-cmd.txt in a documented JSON file (see README)
// The base is a throwaway export of the run's own `base` tag inside the run folder, linked to the same node_modules snapshot;
// the source repo is never touched. Everything raw goes to <run>/quality.json; a missing tool is a clear note, never a failure.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, isFixtureTask, isUiTask, assertArmAllowed } from './config.mjs';
import { runProcess } from './proc.mjs';
import { buildChildEnv } from './env.mjs';
import { exportArchive } from './prepare.mjs';
import { linkNodeModules, prepareTree } from './nm.mjs';
import { removeTreeSafe } from './fsutil.mjs';

const slash = (p) => String(p).replace(/\\/g, '/');
const readText = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); } catch { return null; } };

export const QUALITY_COLUMNS = [
  'tsc_base_errors', 'tsc_result_errors', 'tsc_new_errors', 'eslint_new_errors', 'eslint_new_warnings',
  'out_of_scope_files', 'out_of_scope_lines', 'diff_files', 'diff_lines', 'new_test_files', 'tests_added',
  'coverage_lines_covered', 'coverage_lines_total', 'mutation_killed', 'mutation_survived', 'mutation_timeout', 'quality_note',
];

// ---------------------------------------------------------------- patch

// Per-file counts of a unified diff (the blind patch: code only, line endings ignored, no renames).
export function parsePatch(text) {
  const files = [];
  let cur = null;
  let inHunk = false;
  const pathOf = (header) => {
    const s = header.slice('diff --git '.length);
    if (!s.startsWith('"')) {
      const n = (s.length - 5) / 2;
      if (Number.isInteger(n) && n > 0 && s === `a/${s.slice(2, 2 + n)} b/${s.slice(2, 2 + n)}`) return s.slice(2, 2 + n);
    }
    return null;
  };
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) {
      cur = { file: pathOf(line), added: 0, removed: 0, isNew: false, isDeleted: false, addedLines: [] };
      files.push(cur);
      inHunk = false;
    } else if (!cur) {
      continue;
    } else if (!inHunk && line.startsWith('new file mode')) cur.isNew = true;
    else if (!inHunk && line.startsWith('deleted file mode')) cur.isDeleted = true;
    else if (!inHunk && (line.startsWith('+++ ') || line.startsWith('--- '))) {
      // Quoted or odd paths: fall back to the file lines (git adds a TAB after names with spaces).
      if (cur.file === null) {
        const raw = line.slice(4).replace(/\t.*$/, '').replace(/^"|"$/g, '');
        if (raw !== '/dev/null') cur.file = raw.replace(/^[ab]\//, '');
      }
    } else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk && line.startsWith('+')) { cur.added += 1; cur.addedLines.push(line.slice(1)); }
    else if (inHunk && line.startsWith('-')) cur.removed += 1;
  }
  return files.filter((f) => f.file);
}

const TEST_FILE = /(^|\/)(__tests__|tests?|specs?|__mocks__)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(py|go)$|(^|\/)test_[^/]+\.py$/i;
export const isTestFile = (f) => TEST_FILE.test(slash(f));
const TEST_DECL = /^\s*(?:(?:it|test)(?:\.[A-Za-z]+)*\s*[(`]|(?:async\s+)?def\s+test_\w+|func\s+Test\w+\()/;
export const countTestDecls = (lines) => lines.filter((l) => TEST_DECL.test(l)).length;

// ---------------------------------------------------------------- tsc

// "src/a.ts(10,5): error TS2322: Type ..." to "src/a.ts(TS2322,Type ...)". Continuation lines (indented) are skipped.
export function parseTscDetailed(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    let m = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/);
    if (m) { out.push({ file: slash(m[1]), key: `${slash(m[1])}(${m[4]},${m[5].trim()})` }); continue; }
    m = line.match(/^error\s+(TS\d+):\s*(.*)$/);
    if (m) out.push({ file: '', key: `(${m[1]},${m[2].trim()})` });
  }
  return out;
}
export const parseTsc = (text) => parseTscDetailed(text).map((e) => e.key);

// Multiset difference: what `after` has beyond `before`. Returns the surplus keys (one per occurrence).
export function multisetNew(before, after) {
  const left = new Map();
  for (const k of before) left.set(k, (left.get(k) || 0) + 1);
  const out = [];
  for (const k of after) {
    const c = left.get(k) || 0;
    if (c > 0) left.set(k, c - 1); else out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------- eslint

const ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.json'];
export function hasEslintConfig(tree) {
  if (ESLINT_CONFIGS.some((f) => fs.existsSync(path.join(tree, f)))) return true;
  try { return Boolean(JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8')).eslintConfig); } catch { return false; }
}
const CODE_FILE = /\.[cm]?[jt]sx?$/i;

// eslint --format json output to { errors: [rule|file...], warnings: [rule|file...] } with paths relative to `tree`.
export function parseEslint(text, tree) {
  const j = JSON.parse(text);
  if (!Array.isArray(j)) throw new Error('la salida de eslint no es una lista');
  const errors = [];
  const warnings = [];
  for (const f of j) {
    const file = slash(path.relative(tree, f.filePath || ''));
    for (const m of f.messages || []) {
      if (/^File ignored (because|by default)/i.test(String(m.message))) continue;
      const key = `${m.ruleId || 'parse'}|${file}`;
      if (m.severity === 2) errors.push(key); else if (m.severity === 1) warnings.push(key);
    }
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------- running tools

// spec: a string (run through the shell, as typed) or an array [bin, ...args] (no shell). Output goes to files, read and removed.
async function runCapture(cfg, spec, extraArgs, cwd, timeoutMs, tag, scratch) {
  fs.mkdirSync(scratch, { recursive: true });
  const outPath = path.join(scratch, `${tag}.out.txt`);
  const errPath = path.join(scratch, `${tag}.err.txt`);
  const shell = typeof spec === 'string';
  const quote = (a) => `"${String(a).replace(/"/g, '')}"`;
  const r = await runProcess({
    command: shell ? `${spec}${extraArgs.length ? ` ${extraArgs.map(quote).join(' ')}` : ''}` : spec[0],
    args: shell ? [] : [...spec.slice(1), ...extraArgs],
    shell, cwd, env: buildChildEnv(cfg, process.env, { claude: false }).env, timeoutMs, stdoutPath: outPath, stderrPath: errPath,
  });
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const out = { error: r.error, code: r.code, timedOut: r.timedOut, stdout: read(outPath), stderr: read(errPath) };
  fs.rmSync(outPath, { force: true });
  fs.rmSync(errPath, { force: true });
  return out;
}

const toolInstalled = (tree, name) => ['', '.cmd'].some((x) => fs.existsSync(path.join(tree, 'node_modules', '.bin', name + x)));
const chunks = (files) => {
  const out = [];
  let cur = [];
  let len = 0;
  for (const f of files) {
    if (cur.length && (len + f.length > 6000 || cur.length >= 100)) { out.push(cur); cur = []; len = 0; }
    cur.push(f);
    len += f.length + 3;
  }
  if (cur.length) out.push(cur);
  return out;
};

async function tscOn(cfg, tree, scratch, tag, ignore) {
  const r = await runCapture(cfg, cfg.tscCmd || 'npx tsc --noEmit --pretty false', [], tree, cfg.qualityTimeoutMs, `tsc-${tag}`, scratch);
  if (r.error) return { failed: 'no_se_pudo_ejecutar', detail: r.error };
  if (r.timedOut) return { failed: 'tiempo_agotado' };
  const all = parseTscDetailed(r.stdout);
  if (r.code !== 0 && !all.length) return { failed: 'fallo', detail: `${r.stdout}\n${r.stderr}`.trim().slice(0, 400) };
  // Errors in the acceptance files (copied into the tree by accept) are the task's tests, not the solution's.
  const keys = all.filter((e) => !ignore.has(e.file.toLowerCase())).map((e) => e.key);
  return { keys, ignored: all.length - keys.length };
}

async function eslintOn(cfg, tree, files, scratch, tag) {
  const errors = [];
  const warnings = [];
  const skipped = [];
  const shell = !Array.isArray(cfg.eslintCmd);
  const spec = cfg.eslintCmd || 'npx eslint --format json';
  const usable = files.filter((f) => (shell ? !/["%]/.test(f) : true) || (skipped.push(f), false));
  let i = 0;
  for (const part of chunks(usable)) {
    i += 1;
    const r = await runCapture(cfg, spec, ['--', ...part], tree, cfg.qualityTimeoutMs, `eslint-${tag}-${i}`, scratch);
    if (r.error) return { failed: 'no_se_pudo_ejecutar', detail: r.error };
    if (r.timedOut) return { failed: 'tiempo_agotado' };
    let parsed;
    try { parsed = parseEslint(r.stdout, tree); } catch (e) { return { failed: 'fallo', detail: `${e.message}: ${(r.stdout + r.stderr).trim().slice(0, 300)}` }; }
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
  }
  return { errors, warnings, skipped };
}

// A coverage or mutation command of the task: runs in the measured tree, {json} is replaced by the path of the file it must write.
async function optionalCommand(cfg, taskDir, name, tree, dir, timeoutMs) {
  const cmd = readText(path.join(taskDir, `${name}-cmd.txt`));
  if (cmd === null || !cmd.trim()) return null;
  const jsonPath = path.join(dir, `${name}-report.json`);
  fs.rmSync(jsonPath, { force: true });
  const scratch = path.join(dir, 'quality-tmp');
  const r = await runCapture(cfg, cmd.trim().replaceAll('{json}', `"${jsonPath}"`), [], tree, timeoutMs, name, scratch);
  if (r.error) return { failed: 'no_se_pudo_ejecutar', detail: r.error };
  if (r.timedOut) return { failed: 'tiempo_agotado' };
  let j = null;
  try { j = JSON.parse(readText(jsonPath)); } catch { /* no report */ }
  return { json: j, exitCode: r.code };
}

const nonNeg = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

// ---------------------------------------------------------------- the panel

async function buildBase(cfg, repo, dir) {
  const dest = path.join(dir, 'quality-base');
  removeTreeSafe(dest);
  fs.mkdirSync(dest, { recursive: true });
  try {
    await exportArchive(repo, 'base', dest);
    linkNodeModules(cfg, dest);
    for (const rel of cfg.copyDirs || []) {
      const from = path.join(repo, rel);
      if (fs.existsSync(from) && !fs.existsSync(path.join(dest, rel))) fs.cpSync(from, path.join(dest, rel), { recursive: true });
    }
    return dest;
  } catch (e) {
    removeTreeSafe(dest);
    throw e;
  }
}

export function qualityColumns(q) {
  if (!q) return {};
  const v = (x) => (x === undefined ? null : x);
  return {
    tsc_base_errors: v(q.tsc && q.tsc.baseErrors), tsc_result_errors: v(q.tsc && q.tsc.resultErrors), tsc_new_errors: v(q.tsc && q.tsc.newErrors),
    eslint_new_errors: v(q.eslint && q.eslint.newErrors), eslint_new_warnings: v(q.eslint && q.eslint.newWarnings),
    out_of_scope_files: v(q.scope && q.scope.outOfScopeFiles), out_of_scope_lines: v(q.scope && q.scope.outOfScopeLines),
    diff_files: v(q.diff && q.diff.files), diff_lines: v(q.diff && q.diff.lines),
    new_test_files: v(q.tests && q.tests.newTestFiles), tests_added: v(q.tests && q.tests.testsAdded),
    coverage_lines_covered: v(q.coverage && q.coverage.linesCovered), coverage_lines_total: v(q.coverage && q.coverage.linesTotal),
    mutation_killed: v(q.mutation && q.mutation.killed), mutation_survived: v(q.mutation && q.mutation.survived), mutation_timeout: v(q.mutation && q.mutation.timeout),
    quality_note: (q.notes || []).join(';'),
  };
}

export async function qualityRun(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  if (isFixtureTask(cfg, task)) throw new Error(`la tarea ${task} es un fixture: el panel de calidad no aplica`);
  if (isUiTask(cfg, task)) throw new Error(`la tarea ${task} es de interfaz (ui): el panel de calidad no aplica; las medidas son las de uiscore`);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}`);
  const changesFile = path.join(dir, 'changes.json');
  if (!fs.existsSync(changesFile)) throw new Error(`falta ${changesFile}; corré accept primero`);
  const changes = JSON.parse(fs.readFileSync(changesFile, 'utf8'));
  const tree = changes.measuredTree || repo;
  if (!fs.existsSync(tree)) throw new Error(`el árbol medido ya no existe: ${tree}`);
  prepareTree(cfg, repo, tree);

  const notes = [];
  const q = { task, arm, rep, computedAt: new Date().toISOString(), notes, skipped: {} };
  const skip = (tool, code) => { q.skipped[tool] = code; notes.push(`${tool}:${code}`); };

  // Diff, scope and tests: from the change summary accept wrote before the acceptance files were copied in.
  const blindPatch = readText(path.join(dir, 'changes.blind.patch')) || '';
  const perFile = parsePatch(blindPatch);
  const changed = (changes.files || []).map(slash);
  q.diff = { files: changes.filesChanged ?? changed.length, lines: (changes.linesAdded || 0) + (changes.linesRemoved || 0) };
  const goldText = readText(path.join(taskDir, 'gold-files.txt'));
  if (goldText === null) {
    q.scope = { outOfScopeFiles: null, outOfScopeLines: null, files: [] };
    skip('scope', 'sin_gold_files');
  } else {
    const gold = new Set(goldText.split(/\r?\n/).map((l) => slash(l.trim()).toLowerCase()).filter((l) => l && !l.startsWith('#')));
    const out = changed.filter((f) => !gold.has(f.toLowerCase()));
    const lines = perFile.filter((p) => !gold.has(slash(p.file).toLowerCase())).reduce((n, p) => n + p.added + p.removed, 0);
    q.scope = { outOfScopeFiles: out.length, outOfScopeLines: lines, files: out };
  }
  const newTests = perFile.filter((p) => p.isNew && isTestFile(p.file));
  q.tests = { newTestFiles: newTests.length, testsAdded: countTestDecls(perFile.flatMap((p) => p.addedLines)), newTestFileNames: newTests.map((p) => p.file) };

  // The acceptance files that accept copied into the tree: their own type errors do not belong to the solution.
  const ignore = new Set();
  const acceptDir = path.join(taskDir, 'accept');
  const walk = (d, base) => {
    let es = [];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (e.isDirectory()) walk(path.join(d, e.name), base);
      else ignore.add(slash(path.relative(base, path.join(d, e.name))).toLowerCase());
    }
  };
  walk(acceptDir, acceptDir);

  const scratch = path.join(dir, 'quality-tmp');
  const tscCustom = Boolean(cfg.tscCmd);
  const eslintCustom = Boolean(cfg.eslintCmd);
  let wantTsc = tscCustom ? true : fs.existsSync(path.join(tree, 'tsconfig.json')) ? (toolInstalled(tree, 'tsc') || (skip('tsc', 'tsc_no_instalado'), false)) : (skip('tsc', 'sin_tsconfig'), false);
  const eslintFiles = changed.filter((f) => CODE_FILE.test(f) && fs.existsSync(path.join(tree, f)));
  let wantEslint = false;
  if (!hasEslintConfig(tree)) skip('eslint', 'sin_config_eslint');
  else if (!eslintCustom && !toolInstalled(tree, 'eslint')) skip('eslint', 'eslint_no_instalado');
  else wantEslint = true;
  q.tsc = { baseErrors: null, resultErrors: null, newErrors: null, newList: [] };
  q.eslint = { newErrors: null, newWarnings: null, newList: [], files: eslintFiles.length };

  let base = null;
  try {
    if (wantTsc || (wantEslint && eslintFiles.length)) {
      try { base = await buildBase(cfg, repo, dir); } catch (e) {
        if (wantTsc) skip('tsc', 'sin_base');
        if (wantEslint) skip('eslint', 'sin_base');
        q.baseError = e.message;
        wantTsc = false; wantEslint = false;
      }
    }
    if (wantTsc) {
      const b = await tscOn(cfg, base, scratch, 'base', new Set());
      const r = await tscOn(cfg, tree, scratch, 'result', ignore);
      if (r.keys) q.tsc.resultErrors = r.keys.length; else skip('tsc', `resultado_${r.failed}`);
      if (b.keys) q.tsc.baseErrors = b.keys.length; else skip('tsc', `base_${b.failed}`);
      if (r.keys && b.keys) {
        q.tsc.newList = multisetNew(b.keys, r.keys);
        q.tsc.newErrors = q.tsc.newList.length;
      }
      if (r.ignored) q.tsc.ignoredAcceptFileErrors = r.ignored;
      q.tsc.detail = { base: b.detail || null, result: r.detail || null };
    }
    if (wantEslint) {
      if (!eslintFiles.length) {
        q.eslint.newErrors = 0;
        q.eslint.newWarnings = 0;
        notes.push('eslint:sin_archivos_de_codigo');
      } else {
        const inBase = eslintFiles.filter((f) => fs.existsSync(path.join(base, f)));
        const b = inBase.length ? await eslintOn(cfg, base, inBase, scratch, 'base') : { errors: [], warnings: [] };
        const r = await eslintOn(cfg, tree, eslintFiles, scratch, 'result');
        if (b.failed || r.failed) skip('eslint', `fallo_${b.failed || r.failed}`);
        else {
          const ne = multisetNew(b.errors, r.errors);
          const nw = multisetNew(b.warnings, r.warnings);
          q.eslint.newErrors = ne.length;
          q.eslint.newWarnings = nw.length;
          q.eslint.newList = [...ne.map((k) => `error ${k}`), ...nw.map((k) => `warning ${k}`)];
          if (r.skipped.length) q.eslint.skippedFiles = r.skipped;
        }
        q.eslint.detail = { base: b.detail || null, result: r.detail || null };
      }
    }
  } finally {
    if (base) removeTreeSafe(base);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  // Optional coverage and mutation commands of the task, on the measured tree. Contracts (README):
  //   coverage { "linesCovered": n, "linesTotal": n }      mutation { "killed": n, "survived": n, "timeout": n }
  q.coverage = null;
  q.mutation = null;
  for (const [name, fields, timeout] of [['coverage', ['linesCovered', 'linesTotal'], cfg.qualityTimeoutMs], ['mutation', ['killed', 'survived', 'timeout'], cfg.mutationTimeoutMs]]) {
    const r = await optionalCommand(cfg, taskDir, name, tree, dir, timeout);
    if (r === null) continue;
    if (r.failed) { skip(name, r.failed); continue; }
    if (!r.json || fields.some((f) => !nonNeg(r.json[f]))) { skip(name, 'sin_json_valido'); continue; }
    q[name] = Object.fromEntries(fields.map((f) => [f, r.json[f]]));
    q[name].exitCode = r.exitCode;
  }
  fs.rmSync(scratch, { recursive: true, force: true });

  q.columns = qualityColumns(q);
  fs.writeFileSync(path.join(dir, 'quality.json'), JSON.stringify(q, null, 2));
  return q;
}
