// Runs `claude -p` for one task/arm/rep and turns the stream into metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, otherArm } from './config.mjs';
import { runProcess, listProcessNames, newProcesses } from './proc.mjs';
import { parseStream, findEscape, invalidReasons } from './metrics.mjs';
import { assertWithinTotalCap } from './ledger.mjs';
import { manifest, manifestBrief, repairSnapshot, snapshotPaths, sourceNm, dropSnapshot } from './nm.mjs';
import { measureTrees } from './trees.mjs';
import { buildChildEnv } from './env.mjs';

export { buildChildEnv };

// The prompt is not an argument: it travels on stdin, so a leading "-" can never be read as an option.
export function buildArgv(cfg, arm) {
  return [
    ...cfg.claudeArgsPrefix,
    '-p',
    '--model', String(cfg.model),
    '--effort', String(cfg.effort),
    '--plugin-dir', cfg.arms[arm].pluginDir,
    '--permission-mode', String(cfg.permissionMode),
    '--output-format', 'stream-json',
    '--verbose',
    '--max-budget-usd', String(cfg.perRunCapUsd),
    '--no-session-persistence',
    ...cfg.extraArgs,
  ];
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const nonEmptyDir = (d) => { try { return fs.readdirSync(d).length > 0; } catch { return false; } };
// Free checks, before any token is spent.
export function checkPlugin(cfg, arm) {
  const dir = cfg.arms[arm].pluginDir;
  const manifest = path.join(dir, '.claude-plugin', 'plugin.json');
  const j = readJson(manifest);
  if (!j) throw new Error(`no se pudo leer ${manifest}: el brazo ${arm} no apunta a un plugin`);
  if (j.name !== cfg.arms[arm].pluginName) {
    throw new Error(`el plugin de ${dir} se llama "${j.name}" pero el brazo ${arm} espera "${cfg.arms[arm].pluginName}"`);
  }
}

export function checkConfigDir(configDir) {
  let st;
  try { st = fs.statSync(configDir); } catch { st = null; }
  if (!st || !st.isDirectory()) throw new Error(`configDir no existe: ${configDir}; entrá una vez con CLAUDE_CONFIG_DIR para hacer /login (ver README)`);
  const problems = [];
  if (fs.existsSync(path.join(configDir, 'CLAUDE.md'))) problems.push('tiene un CLAUDE.md (memoria que llegaría a ambos brazos)');
  // Installed plugins are what matters: installed_plugins.json with entries (absent or empty is fine) or plugins/cache with
  // content. Marketplace registries and plugins/data are not installed plugins; anything new there shows up in config_dir_delta.
  const plugins = path.join(configDir, 'plugins');
  if (fs.existsSync(path.join(plugins, 'installed_plugins.json'))) {
    const ip = readJson(path.join(plugins, 'installed_plugins.json'));
    if (!ip || typeof ip !== 'object') problems.push('plugins/installed_plugins.json ilegible');
    else if (ip.plugins && Object.keys(ip.plugins).length) problems.push(`tiene plugins instalados (installed_plugins.json: ${Object.keys(ip.plugins).join(', ')})`);
  }
  if (nonEmptyDir(path.join(plugins, 'cache'))) problems.push('tiene plugins instalados (plugins/cache no vacía)');
  for (const d of ['skills', 'agents', 'commands', 'hooks']) {
    if (nonEmptyDir(path.join(configDir, d))) problems.push(`tiene ${d}/ no vacía`);
  }
  for (const f of ['settings.json', 'settings.local.json']) {
    const p = path.join(configDir, f);
    if (!fs.existsSync(p)) continue;
    const j = readJson(p);
    if (!j) { problems.push(`${f} ilegible`); continue; }
    if (j.hooks && Object.keys(j.hooks).length) problems.push(`${f} define hooks`);
    if (j.enabledPlugins && Object.keys(j.enabledPlugins).length) problems.push(`${f} habilita plugins (enabledPlugins)`);
  }
  if (problems.length) throw new Error(`configDir contaminado (${configDir}): ${problems.join('; ')}`);
}

// Names only (never contents): top-level entries and one level below.
function listNames(dir) {
  const out = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      out.push(e.name);
      if (e.isDirectory()) {
        try { for (const c of fs.readdirSync(path.join(dir, e.name)).slice(0, 200)) out.push(`${e.name}/${c}`); } catch { /* unreadable */ }
      }
    }
  } catch { /* missing */ }
  return out.sort();
}
const delta = (before, after) => ({
  added: after.filter((n) => !before.includes(n)),
  removed: before.filter((n) => !after.includes(n)),
});

export async function runTask(cfg, args, deps = {}) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}; corré prepare primero`);
  const streamPath = path.join(dir, 'stream.jsonl');
  if (fs.existsSync(streamPath)) {
    throw new Error(`esta corrida ya se ejecutó (${streamPath}); para repetirla corré "run.mjs clean", prepará de nuevo y anotá --note rerun`);
  }
  let prompt;
  try {
    prompt = fs.readFileSync(path.join(taskDir, 'prompt.md'), 'utf8').replace(/^﻿/, '').trimEnd();
  } catch {
    throw new Error(`falta ${path.join(taskDir, 'prompt.md')}`);
  }
  if (!prompt) throw new Error('prompt.md está vacío');
  if (!fs.existsSync(cfg.arms[arm].pluginDir)) throw new Error(`no existe el plugin del brazo ${arm}: ${cfg.arms[arm].pluginDir}`);
  checkPlugin(cfg, arm);
  checkConfigDir(cfg.configDir);
  assertWithinTotalCap(cfg);

  // node_modules: the run is linked to one snapshot copy; the snapshot and the source must come out of the run as they went in.
  // A copy that was merely altered is dropped and copied again from the (unchanged) source: free, before any spend.
  let nmBefore = null;
  if (fs.existsSync(sourceNm(cfg))) {
    repairSnapshot(cfg, { remove: deps.removeTree });
    nmBefore = { snapshot: manifest(snapshotPaths(cfg).dir, cfg.nmIgnore), source: manifest(sourceNm(cfg), cfg.nmIgnore) };
  }

  const stdinPath = path.join(dir, 'prompt.stdin.txt');
  fs.writeFileSync(stdinPath, prompt);
  const lister = deps.listProcesses || listProcessNames;
  const procBefore = cfg.trackProcesses === false ? null : lister();
  const cfgBefore = listNames(cfg.configDir);
  const { env, dropped } = buildChildEnv(cfg);

  const startedAt = new Date().toISOString();
  const r = await runProcess({
    command: cfg.claudeBin,
    args: buildArgv(cfg, arm),
    cwd: repo,
    env,
    stdinPath,
    timeoutMs: cfg.timeoutMs,
    stdoutPath: streamPath,
    stderrPath: path.join(dir, 'stderr.txt'),
  });
  if (r.error) throw new Error(`no se pudo lanzar ${cfg.claudeBin}: ${r.error}`);

  // From here on the money is spent: nothing below may throw before metrics.json is on disk. Every step is guarded and
  // a failure is written down (postRunError) and makes the run invalid instead of losing it.
  const post = [];
  const guard = (label, fn, fallback = null) => {
    try { return fn(); } catch (e) { post.push(`${label}: ${e && e.message ? e.message : e}`); return fallback; }
  };
  const procAfter = guard('procesos', () => (cfg.trackProcesses === false ? null : lister()));

  let nm = { checked: false };
  if (nmBefore) {
    nm = guard('node_modules', () => {
      const after = { snapshot: manifest(snapshotPaths(cfg).dir, cfg.nmIgnore), source: manifest(sourceNm(cfg), cfg.nmIgnore) };
      const out = {
        checked: true,
        snapshotChanged: !after.snapshot || after.snapshot.digest !== nmBefore.snapshot.digest,
        sourceChanged: !after.source || after.source.digest !== nmBefore.source.digest,
        snapshotBefore: manifestBrief(nmBefore.snapshot), snapshotAfter: manifestBrief(after.snapshot),
        sourceBefore: manifestBrief(nmBefore.source), sourceAfter: manifestBrief(after.source),
        drop: null, dropFailed: false,
      };
      // A changed copy is moved aside and thrown away (links are removed as links) so the next prepare copies again.
      if (out.snapshotChanged) {
        out.drop = dropSnapshot(cfg, { remove: deps.removeTree });
        out.dropFailed = Boolean(out.drop.leftover || out.drop.error);
      }
      if (out.sourceChanged) process.stderr.write(`ATENCION: el node_modules de la fuente cambió durante la corrida ${task}/${arm}/${rep}; revisalo antes de seguir\n`);
      return out;
    }, { checked: false });
  }

  const trees = guard('árboles', () => measureTrees(repo, cfg.blindExcludePaths));
  const treesError = trees ? null : (post.find((p) => p.startsWith('árboles')) || 'árboles: sin datos');

  const other = otherArm(cfg, arm);
  const opts = {
    ownPlugin: cfg.arms[arm].pluginName,
    otherPlugin: other ? cfg.arms[other].pluginName : null,
    otherPluginDir: other ? cfg.arms[other].pluginDir : null,
    weights: cfg.weights,
    modelFactor: cfg.modelFactor,
  };
  const text = guard('stream', () => fs.readFileSync(streamPath, 'utf8'), '');
  const m = guard('métricas', () => parseStream(text, opts), null) || parseStream('', opts);
  const escapedCwd = guard('escapes', () => findEscape(text, { sourceRepo: cfg.sourceRepo, privateRoot: cfg.privateRoot, workRoot: cfg.workRoot, runDir: dir }));
  const metrics = {
    task, arm, rep, experiment: cfg.experiment, model: cfg.model, effort: cfg.effort,
    startedAt, finishedAt: new Date().toISOString(),
    wallS: r.wallS, timedOut: r.timedOut, exitCode: r.code, signal: r.signal,
    droppedEnvNames: dropped,
    leftover_processes: guard('procesos', () => (procBefore && procAfter ? newProcesses(procBefore, procAfter) : null)),
    config_dir_delta: guard('configDir', () => delta(cfgBefore, listNames(cfg.configDir))),
    escapedCwd,
    nm,
    trees: trees && {
      measured: { kind: trees.measured.kind, path: trees.measured.path, branch: trees.measured.branch },
      candidates: trees.candidates, worktrees: trees.worktrees, branchesAhead: trees.branchesAhead,
      noChanges: trees.noChanges, flags: trees.flags,
    },
    treesError,
    ...m,
  };
  metrics.postRunError = post;
  metrics.invalidReasons = invalidReasons(metrics);
  try {
    fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  } catch (e) {
    // Last resort: a minimal record, so the ledger and the author still see that this run happened.
    metrics.postRunError.push(`escribir metrics.json: ${e.message}`);
    metrics.invalidReasons = invalidReasons(metrics);
    fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({
      task, arm, rep, experiment: cfg.experiment, finishedAt: metrics.finishedAt, costUsd: metrics.costUsd ?? null,
      postRunError: metrics.postRunError, invalidReasons: metrics.invalidReasons,
    }));
  }
  return metrics;
}
