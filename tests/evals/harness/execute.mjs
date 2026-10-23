// Runs `claude -p` for one task/arm/rep and turns the stream into metrics.json.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, otherArm } from './config.mjs';
import { runProcess } from './proc.mjs';
import { parseStream } from './metrics.mjs';

export function buildArgv(cfg, arm, prompt) {
  return [
    ...cfg.claudeArgsPrefix,
    '-p', prompt,
    '--model', String(cfg.model),
    '--plugin-dir', cfg.arms[arm].pluginDir,
    '--permission-mode', String(cfg.permissionMode),
    '--output-format', 'stream-json',
    '--verbose',
    '--max-budget-usd', String(cfg.perRunCapUsd),
    '--no-session-persistence',
    ...cfg.extraArgs,
  ];
}

export async function runTask(cfg, args) {
  const { task, arm, rep, dir, repo, taskDir } = runPaths(cfg, args);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}; corré prepare primero`);
  const streamPath = path.join(dir, 'stream.jsonl');
  if (fs.existsSync(streamPath)) {
    throw new Error(`esta corrida ya se ejecutó (${streamPath}); para repetirla preparala de nuevo en otra carpeta y anotá --note rerun`);
  }
  if (!fs.existsSync(cfg.arms[arm].pluginDir)) throw new Error(`no existe el plugin del brazo ${arm}: ${cfg.arms[arm].pluginDir}`);
  let prompt;
  try {
    prompt = fs.readFileSync(path.join(taskDir, 'prompt.md'), 'utf8').replace(/^﻿/, '').trimEnd();
  } catch {
    throw new Error(`falta ${path.join(taskDir, 'prompt.md')}`);
  }
  if (!prompt) throw new Error('prompt.md está vacío');

  const startedAt = new Date().toISOString();
  // The child inherits the parent environment untouched; only the config dir is set. Nothing is logged.
  const r = await runProcess({
    command: cfg.claudeBin,
    args: buildArgv(cfg, arm, prompt),
    cwd: repo,
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfg.configDir },
    timeoutMs: cfg.timeoutMs,
    stdoutPath: streamPath,
    stderrPath: path.join(dir, 'stderr.txt'),
  });
  if (r.error) throw new Error(`no se pudo lanzar ${cfg.claudeBin}: ${r.error}`);

  const other = otherArm(cfg, arm);
  const m = parseStream(fs.readFileSync(streamPath, 'utf8'), {
    ownPlugin: cfg.arms[arm].pluginName,
    otherPlugin: other ? cfg.arms[other].pluginName : null,
    otherPluginDir: other ? cfg.arms[other].pluginDir : null,
    weights: cfg.weights,
  });
  const metrics = {
    task, arm, rep, model: cfg.model, startedAt, finishedAt: new Date().toISOString(),
    wallS: r.wallS, timedOut: r.timedOut, exitCode: r.code, signal: r.signal,
    ...m,
  };
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  return metrics;
}
