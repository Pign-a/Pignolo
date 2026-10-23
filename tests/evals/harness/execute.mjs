// Runs `claude -p` for one task/arm/rep and turns the stream into metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, otherArm } from './config.mjs';
import { runProcess, listProcessNames, newProcesses } from './proc.mjs';
import { parseStream, findEscape, invalidReasons } from './metrics.mjs';
import { assertWithinTotalCap } from './ledger.mjs';

// The child never inherits the parent environment: only what the system needs to run, plus what the harness sets.
const ENV_ALLOW = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
];
const SENSITIVE_NAME = /^(CLAUDE|ANTHROPIC)|TOKEN|KEY|SECRET/i;

// Returns the child's environment and the NAMES (never values) of dropped variables that look like credentials or Claude settings.
export function buildChildEnv(cfg, parentEnv = process.env) {
  const allow = new Set([...ENV_ALLOW, ...(cfg.extraEnvAllow || []).map((n) => String(n).toUpperCase())]);
  const env = {};
  const dropped = [];
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === undefined) continue;
    if (allow.has(k.toUpperCase())) env[k] = v;
    else if (SENSITIVE_NAME.test(k)) dropped.push(k);
  }
  env.CLAUDE_CONFIG_DIR = cfg.configDir;
  env.DISABLE_AUTOUPDATER = '1';
  return { env, dropped: dropped.sort() };
}

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
// Files the CLI keeps in plugins/ that do not install anything by themselves.
const PLUGINS_REGISTRY_FILES = new Set(['known_marketplaces.json', 'marketplaces', 'blocklist.json', 'install-counts-cache.json']);

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
  const plugins = path.join(configDir, 'plugins');
  if (nonEmptyDir(plugins)) {
    const extra = fs.readdirSync(plugins).filter((n) => !PLUGINS_REGISTRY_FILES.has(n));
    if (extra.length) problems.push(`tiene plugins instalados (plugins/: ${extra.join(', ')})`);
  }
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
    throw new Error(`esta corrida ya se ejecutó (${streamPath}); para repetirla preparala de nuevo en otra carpeta y anotá --note rerun`);
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
  const procAfter = cfg.trackProcesses === false ? null : lister();

  const other = otherArm(cfg, arm);
  const text = fs.readFileSync(streamPath, 'utf8');
  const m = parseStream(text, {
    ownPlugin: cfg.arms[arm].pluginName,
    otherPlugin: other ? cfg.arms[other].pluginName : null,
    otherPluginDir: other ? cfg.arms[other].pluginDir : null,
    weights: cfg.weights,
  });
  const escapedCwd = findEscape(text, { sourceRepo: cfg.sourceRepo, privateRoot: cfg.privateRoot, workRoot: cfg.workRoot, runDirName: path.basename(dir) });
  const metrics = {
    task, arm, rep, experiment: cfg.experiment, model: cfg.model, effort: cfg.effort,
    startedAt, finishedAt: new Date().toISOString(),
    wallS: r.wallS, timedOut: r.timedOut, exitCode: r.code, signal: r.signal,
    droppedEnvNames: dropped,
    leftover_processes: procBefore && procAfter ? newProcesses(procBefore, procAfter) : null,
    config_dir_delta: delta(cfgBefore, listNames(cfg.configDir)),
    escapedCwd,
    ...m,
  };
  metrics.invalidReasons = invalidReasons(metrics);
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  return metrics;
}
