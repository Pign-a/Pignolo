// Fresh run folder: export of the base commit, cleaned of the author's own context, with a neutral CLAUDE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { runPaths, validateCopyDirs, isFixtureTask, isReviewTask, isUiTask, taskConfig, assertArmAllowed, FIXTURES_DIR, UI_FIXTURE_DIR } from './config.mjs';
import { readScenario } from './ui.mjs';
import { ensureSnapshot, snapshotPaths } from './nm.mjs';
import { removeTreeSafe, linksOutsideTree } from './fsutil.mjs';

const NEUTRAL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'neutral-claude.md');
const CONTEXT_FILES = new Set(['claude.md', 'claude.local.md', 'agents.md', '.mcp.json']);

export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`no se pudo ejecutar git: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} falló: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

// Like git() but keeps the output exactly as git printed it (patches need their final newline).
export function gitRaw(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`no se pudo ejecutar git: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} falló: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

export function exportArchive(sourceRepo, base, dest) {
  return new Promise((resolve, reject) => {
    const g = spawn('git', ['-C', sourceRepo, 'archive', '--format=tar', base], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const t = spawn('tar', ['-x', '-f', '-'], { cwd: dest, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let gErr = '';
    let tErr = '';
    let gCode;
    let tCode;
    let failed = false;
    const fail = (msg) => { if (!failed) { failed = true; reject(new Error(msg)); } };
    const check = () => {
      if (gCode === undefined || tCode === undefined || failed) return;
      if (gCode !== 0) fail(`git archive falló (${gCode}): ${gErr.trim()}`);
      else if (tCode !== 0) fail(`tar falló (${tCode}): ${tErr.trim()}`);
      else resolve();
    };
    g.stderr.on('data', (d) => { gErr += d; });
    t.stderr.on('data', (d) => { tErr += d; });
    g.on('error', (e) => fail(`no se pudo ejecutar git: ${e.message}`));
    t.on('error', (e) => fail(`no se pudo ejecutar tar: ${e.message}`));
    t.stdin.on('error', () => { /* tar closed early; its exit code reports it */ });
    g.stdout.pipe(t.stdin);
    g.on('close', (c) => { gCode = c; check(); });
    t.on('close', (c) => { tCode = c; check(); });
  });
}

function stripContext(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const lower = e.name.toLowerCase();
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (lower === '.claude') fs.rmSync(p, { recursive: true, force: true });
      else if (lower !== 'node_modules') stripContext(p);
    } else if (CONTEXT_FILES.has(lower)) {
      fs.rmSync(p, { force: true });
    }
  }
}

// A fixture task (front detection): the toy repo of tests/evals/fixtures/<name> as plain files, following the recipe of that README.
// A baseline commit of unrelated files on main (with the neutral CLAUDE.md), then a branch "trabajo" off it holding the fixture as
// a second commit, left checked out. validate takes the merge-base with main, which is always the baseline commit.
async function prepareFixture(cfg, { task, arm, rep, dir, repo }) {
  if (fs.existsSync(dir)) throw new Error(`la carpeta de la corrida ya existe: ${dir} (no se pisa; borrala con "run.mjs clean")`);
  const from = path.join(FIXTURES_DIR, taskConfig(cfg, task).fixture);
  fs.mkdirSync(repo, { recursive: true });
  try {
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.name', 'eval']);
    git(repo, ['config', 'user.email', 'eval@example.invalid']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    git(repo, ['config', 'core.safecrlf', 'false']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(repo, 'NOTES.txt'), 'Unrelated baseline file.\n');
    fs.copyFileSync(NEUTRAL, path.join(repo, 'CLAUDE.md'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'base']);
    git(repo, ['tag', 'base']);
    git(repo, ['checkout', '-q', '-b', 'trabajo']);
    fs.cpSync(from, repo, { recursive: true });
    // -f: a global .gitignore may drop files the fixture needs (*.log is the junk it is made of).
    git(repo, ['add', '-A', '-f']);
    git(repo, ['commit', '-q', '-m', 'fixture']);
    fs.writeFileSync(path.join(dir, 'prepare.json'), JSON.stringify({ task, arm, rep, fixture: taskConfig(cfg, task).fixture, baseCommit: git(repo, 'rev-parse HEAD'.split(' ')), createdAt: new Date().toISOString(), warnings: [] }, null, 2));
  } catch (e) {
    removeTreeSafe(dir);
    throw e;
  }
  return { task, arm, rep, runDir: dir, repo, warnings: [] };
}

// A ui task: a blank sandbox. Only the identity (design.md, copied from the fixture) and an empty design/ folder, committed as base.
// Git does not track an empty folder, so design/ holds an empty .gitkeep. No source repo export, no node_modules, no CLAUDE.md.
// The scenario is read here too, so a missing request fails before anything is created.
async function prepareUi(cfg, { task, arm, rep, dir, repo }) {
  if (fs.existsSync(dir)) throw new Error(`la carpeta de la corrida ya existe: ${dir} (no se pisa; borrala con "run.mjs clean")`);
  const scenario = readScenario(cfg, task);
  const identity = path.join(UI_FIXTURE_DIR, 'design.md');
  if (!fs.existsSync(identity)) throw new Error(`falta ${identity} (la identidad de las tareas ui)`);
  fs.mkdirSync(repo, { recursive: true });
  try {
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.name', 'eval']);
    git(repo, ['config', 'user.email', 'eval@example.invalid']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    git(repo, ['config', 'core.safecrlf', 'false']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    fs.copyFileSync(identity, path.join(repo, 'design.md'));
    fs.mkdirSync(path.join(repo, 'design'));
    fs.writeFileSync(path.join(repo, 'design', '.gitkeep'), '');
    git(repo, ['add', '-A', '-f']);
    git(repo, ['commit', '-q', '-m', 'base']);
    git(repo, ['tag', 'base']);
    fs.writeFileSync(path.join(dir, 'prepare.json'), JSON.stringify({ task, arm, rep, scenario: scenario.scenario, scenarioSha: scenario.sha, baseCommit: git(repo, ['rev-parse', 'HEAD']), createdAt: new Date().toISOString(), warnings: [] }, null, 2));
  } catch (e) {
    removeTreeSafe(dir);
    throw e;
  }
  return { task, arm, rep, runDir: dir, repo, warnings: [] };
}

// Does the exported tree use CRLF? Looked at on the first file the patch touches (a plain git archive on Windows can export CRLF files).
function treeUsesCrlf(repo, patchText) {
  const m = String(patchText).match(/^diff --git a\/(\S+) b\//m);
  if (!m) return false;
  try { return fs.readFileSync(path.join(repo, ...m[1].split('/')), 'utf8').includes('\r\n'); } catch { return false; }
}

// Applies the item's patch to the exported base tree (staged). Order: the patch that matches the line endings of the tree
// (change.crlf.patch for a CRLF tree, change.patch for an LF one), then the other one, then --ignore-whitespace as a last resort.
// Returns how it applied: "crlf.patch", "patch" or "<name>+ignore-whitespace" (recorded in prepare.json and metrics.json as patchMode).
export function applyReviewPatch(repo, taskDir, item, base) {
  const lf = path.join(taskDir, 'change.patch');
  const crlf = path.join(taskDir, 'change.crlf.patch');
  if (!fs.existsSync(lf)) throw new Error(`falta ${lf} (el diff del padre al árbol con los defectos)`);
  const text = fs.readFileSync(lf, 'utf8');
  const candidates = [['patch', lf], ...(fs.existsSync(crlf) ? [['crlf.patch', crlf]] : [])];
  if (treeUsesCrlf(repo, text)) candidates.reverse();
  const tried = [];
  for (const [name, file] of candidates) {
    try { git(repo, ['apply', '--index', '--whitespace=nowarn', file]); return name; } catch (e) { tried.push(`${name}: ${e.message.split('\n')[0]}`); }
  }
  const [name, file] = candidates[0];
  try { git(repo, ['apply', '--index', '--whitespace=nowarn', '--ignore-whitespace', file]); return `${name}+ignore-whitespace`; } catch (e) { tried.push(`${name}+ignore-whitespace: ${e.message.split('\n')[0]}`); }
  throw new Error(`ningún parche de ${item} se aplica sobre el commit base ${base} (change.patch ni change.crlf.patch, ni con --ignore-whitespace): ${tried.join(' | ')}`);
}

export async function prepare(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  if (isFixtureTask(cfg, task)) return prepareFixture(cfg, { task, arm, rep, dir, repo });
  if (isUiTask(cfg, task)) return prepareUi(cfg, { task, arm, rep, dir, repo });
  const copyDirs = validateCopyDirs(cfg.copyDirs).map((rel) => path.normalize(rel));
  if (fs.existsSync(dir)) throw new Error(`la carpeta de la corrida ya existe: ${dir} (no se pisa; borrala con "run.mjs clean")`);
  let base;
  try {
    base = fs.readFileSync(path.join(taskDir, 'base.txt'), 'utf8').trim();
  } catch {
    throw new Error(`falta ${path.join(taskDir, 'base.txt')} (commit de partida de la tarea)`);
  }
  if (!base) throw new Error('base.txt está vacío');

  fs.mkdirSync(repo, { recursive: true });
  const warnings = [];
  try {
    await exportArchive(cfg.sourceRepo, base, repo);
    stripContext(repo);
    fs.copyFileSync(NEUTRAL, path.join(repo, 'CLAUDE.md'));

    // The run links to ONE snapshot copy of the source's node_modules, never to the source itself.
    const snap = ensureSnapshot(cfg);
    if (snap) fs.symlinkSync(snapshotPaths(cfg).nodeModules, path.join(repo, 'node_modules'), 'junction');
    else warnings.push('la fuente no tiene node_modules');
    for (const rel of copyDirs) {
      const from = path.join(cfg.sourceRepo, rel);
      if (!fs.existsSync(from)) { warnings.push(`copyDirs: no existe en la fuente: ${rel}`); continue; }
      const bad = linksOutsideTree(from);
      if (bad.length) throw new Error(`copyDirs: ${rel} tiene enlaces que salen de la carpeta (${bad.slice(0, 3).join('; ')}); se copiaría contenido de afuera`);
      fs.cpSync(from, path.join(repo, rel), { recursive: true });
    }

    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.name', 'eval']);
    git(repo, ['config', 'user.email', 'eval@example.invalid']);
    git(repo, ['config', 'core.autocrlf', 'false']);
    git(repo, ['config', 'core.safecrlf', 'false']);
    git(repo, ['config', 'commit.gpgsign', 'false']);
    const exclude = ['/node_modules', ...copyDirs.map((d) => `/${d.split(path.sep).join('/')}`)];
    fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), `${exclude.join('\n')}\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'base']);
    git(repo, ['tag', 'base']);
    const baseCommit = git(repo, ['rev-parse', 'HEAD']);
    // Seeded-defect review: the commit to review is the base plus change.patch, so HEAD is the mutated tree and HEAD~1 the base.
    let reviewCommit = null;
    let patchMode = null;
    if (isReviewTask(cfg, task)) {
      patchMode = applyReviewPatch(repo, taskDir, taskConfig(cfg, task).item, base);
      git(repo, ['commit', '-q', '-m', 'cambios']);
      reviewCommit = git(repo, ['rev-parse', 'HEAD']);
    }
    fs.writeFileSync(path.join(dir, 'prepare.json'), JSON.stringify({ task, arm, rep, baseCommit, reviewCommit, patchMode, createdAt: new Date().toISOString(), warnings }, null, 2));
  } catch (e) {
    // The folder was created by this call, so cleaning it is safe; links are removed as links, never followed.
    removeTreeSafe(dir);
    throw e;
  }
  return { task, arm, rep, runDir: dir, repo, warnings };
}
