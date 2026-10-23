// Fresh run folder: export of the base commit, cleaned of the author's own context, with a neutral CLAUDE.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { runPaths, validateCopyDirs } from './config.mjs';
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

function exportArchive(sourceRepo, base, dest) {
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

export async function prepare(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
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
    if (snap) fs.symlinkSync(snapshotPaths(cfg).dir, path.join(repo, 'node_modules'), 'junction');
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
    fs.writeFileSync(path.join(dir, 'prepare.json'), JSON.stringify({ task, arm, rep, baseCommit, createdAt: new Date().toISOString(), warnings }, null, 2));
  } catch (e) {
    // The folder was created by this call, so cleaning it is safe; links are removed as links, never followed.
    removeTreeSafe(dir);
    throw e;
  }
  return { task, arm, rep, runDir: dir, repo, warnings };
}
