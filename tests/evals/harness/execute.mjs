// Runs `claude -p` for one task/arm/rep and turns the stream into metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, otherArm, isFixtureTask, taskConfig, assertArmAllowed } from './config.mjs';
import { runProcess, listProcessNames, newProcesses } from './proc.mjs';
import { parseStream, findEscape, invalidReasons } from './metrics.mjs';
import { assertWithinTotalCap } from './ledger.mjs';
import { manifest, manifestBrief, repairSnapshot, snapshotPaths, sourceNm, dropSnapshot } from './nm.mjs';
import { measureTrees } from './trees.mjs';
import { buildChildEnv } from './env.mjs';
import { DEFAULT_NEUTRAL_CONFIG_PATHS } from './config.mjs';
import { isNeutralPath, scanNeutralConfig, armNamedContent, summarizeNeutralConfig, hasContent } from './neutralconfig.mjs';

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

export function checkConfigDir(configDir, { neutralPaths = DEFAULT_NEUTRAL_CONFIG_PATHS, armNames = ['superpowers', 'pignolo'] } = {}) {
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
  // skills/: only what is declared neutral (the account-synced bucket) may be there; agents, commands and hooks must be empty.
  let skillEntries = [];
  try { skillEntries = fs.readdirSync(path.join(configDir, 'skills')); } catch { /* none */ }
  for (const e of skillEntries) if (!isNeutralPath(`skills/${e}`, neutralPaths)) problems.push(`tiene skills/${e} (no es contenido sincronizado declarado)`);
  for (const d of ['agents', 'commands', 'hooks']) {
    if (nonEmptyDir(path.join(configDir, d))) problems.push(`tiene ${d}/ no vacía`);
  }
  // Declared neutral content must not itself carry one of the arms: a synced skill or plugin named like either plugin.
  const named = armNamedContent(configDir, armNames, neutralPaths);
  if (named.length) problems.push(`contenido sincronizado con el nombre de un brazo (${named.slice(0, 5).join('; ')}): contaminaría la medición`);
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

// Options of the stream parser for one arm: identity from pluginName, neutral plugins, the prompt as it was sent (prefix included).
export function parseOptionsFor(cfg, arm, prompt, neutralPluginNames = []) {
  const other = otherArm(cfg, arm);
  return {
    ownPlugin: cfg.arms[arm].pluginName,
    otherPlugin: other ? cfg.arms[other].pluginName : null,
    otherPluginDir: other ? cfg.arms[other].pluginDir : null,
    weights: cfg.weights,
    modelFactor: cfg.modelFactor,
    neutralPlugins: cfg.neutralPlugins,
    neutralPluginNames,
    ownHooksDeclared: fs.existsSync(path.join(cfg.arms[arm].pluginDir, 'hooks', 'hooks.json')),
    prompt,
  };
}

export async function runTask(cfg, args, deps = {}) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  const isFixture = isFixtureTask(cfg, task);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}; corré prepare primero`);
  const streamPath = path.join(dir, 'stream.jsonl');
  if (fs.existsSync(streamPath)) {
    throw new Error(`esta corrida ya se ejecutó (${streamPath}); para repetirla corré "run.mjs clean", prepará de nuevo y anotá --note rerun`);
  }
  let prompt;
  if (isFixture) {
    prompt = taskConfig(cfg, task).prompt.trimEnd();
  } else try {
    prompt = fs.readFileSync(path.join(taskDir, 'prompt.md'), 'utf8').replace(/^﻿/, '').trimEnd();
  } catch {
    throw new Error(`falta ${path.join(taskDir, 'prompt.md')}`);
  }
  if (!prompt) throw new Error('prompt.md está vacío');
  // A variant invokes the method on purpose: its prefix goes in front of the task prompt (the text lives in the config).
  const promptPrefix = cfg.arms[arm].promptPrefix || '';
  prompt = promptPrefix + prompt;
  if (!fs.existsSync(cfg.arms[arm].pluginDir)) throw new Error(`no existe el plugin del brazo ${arm}: ${cfg.arms[arm].pluginDir}`);
  checkPlugin(cfg, arm);
  checkConfigDir(cfg.configDir, { neutralPaths: cfg.neutralConfigPaths, armNames: Object.values(cfg.arms).map((a) => a.pluginName) });
  assertWithinTotalCap(cfg);

  // node_modules: the run is linked to one snapshot copy; the snapshot and the source must come out of the run as they went in.
  // A copy that was merely altered is dropped and copied again from the (unchanged) source: free, before any spend.
  let nmBefore = null;
  if (!isFixture && fs.existsSync(sourceNm(cfg))) {
    repairSnapshot(cfg, { remove: deps.removeTree });
    nmBefore = { snapshot: manifest(snapshotPaths(cfg).nodeModules, cfg.nmIgnore), source: manifest(sourceNm(cfg), cfg.nmIgnore) };
  }

  const stdinPath = path.join(dir, 'prompt.stdin.txt');
  fs.writeFileSync(stdinPath, prompt);
  const lister = deps.listProcesses || listProcessNames;
  const procBefore = cfg.trackProcesses === false ? null : lister();
  const cfgBefore = listNames(cfg.configDir);
  const neutralConfigBefore = scanNeutralConfig(cfg.configDir, cfg.neutralConfigPaths);
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
      const after = { snapshot: manifest(snapshotPaths(cfg).nodeModules, cfg.nmIgnore), source: manifest(sourceNm(cfg), cfg.nmIgnore) };
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

  const opts = parseOptionsFor(cfg, arm, prompt);
  // What the account sync put in the config dir (it may have been created by this very run); its plugins are neutral.
  const neutralConfigAfter = guard('contenido sincronizado', () => scanNeutralConfig(cfg.configDir, cfg.neutralConfigPaths), neutralConfigBefore);
  opts.neutralPluginNames = neutralConfigAfter.pluginsSynced.plugins;
  const text = guard('stream', () => fs.readFileSync(streamPath, 'utf8'), '');
  const parsed = guard('métricas', () => parseStream(text, opts), null) || parseStream('', opts);
  // The full final text is kept for fixture tasks (the fronts line is read from it); metrics.json only keeps the last KB.
  const { resultText, ...m } = parsed;
  if (isFixture) guard('final.txt', () => fs.writeFileSync(path.join(dir, 'final.txt'), resultText ?? ''));
  const escapedCwd = guard('escapes', () => findEscape(text, { sourceRepo: cfg.sourceRepo, privateRoot: cfg.privateRoot, workRoot: cfg.workRoot, runDir: dir }));
  const metrics = {
    task, arm, rep, experiment: cfg.experiment, promptPrefix, isFixture, model: cfg.model, effort: cfg.effort,
    startedAt, finishedAt: new Date().toISOString(),
    wallS: r.wallS, timedOut: r.timedOut, exitCode: r.code, signal: r.signal,
    droppedEnvNames: dropped,
    leftover_processes: guard('procesos', () => (procBefore && procAfter ? newProcesses(procBefore, procAfter) : null)),
    config_dir_delta: guard('configDir', () => delta(cfgBefore, listNames(cfg.configDir))),
    escapedCwd,
    neutralConfigArmNamed: guard('contenido sincronizado', () => armNamedContent(cfg.configDir, Object.values(cfg.arms).map((a) => a.pluginName), cfg.neutralConfigPaths), []),
    neutralConfigContent: {
      before: neutralConfigBefore, after: neutralConfigAfter,
      createdByRun: hasContent(neutralConfigAfter) && (neutralConfigAfter.skillsSynced.files > neutralConfigBefore.skillsSynced.files
        || neutralConfigAfter.pluginsSynced.files > neutralConfigBefore.pluginsSynced.files
        || neutralConfigAfter.pluginsData.folders.length > neutralConfigBefore.pluginsData.folders.length),
    },
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
