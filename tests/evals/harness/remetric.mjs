// Recomputes from an existing stream.jsonl the fields of metrics.json that come from parsing the stream (costs, tokens by
// model, agents, activation, contamination, escapes, init...), with the current config. It does not run claude and does not
// touch anything else: the changes, the trees, the node_modules checks, the environment, the timings and the config-dir
// records of the run stay as they were. A copy `metrics.json.bak` is kept once (the first time).
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';
import { parseStream, findEscape, invalidReasons } from './metrics.mjs';
import { parseOptionsFor } from './execute.mjs';

export function remetricRun(cfg, args) {
  const { task, arm, rep, dir } = runPaths(cfg, args);
  const streamPath = path.join(dir, 'stream.jsonl');
  const metricsPath = path.join(dir, 'metrics.json');
  if (!fs.existsSync(streamPath) || !fs.existsSync(metricsPath)) {
    throw new Error(`no hay stream.jsonl y metrics.json en ${dir}: la corrida ${task}/${arm}/${rep} no se ejecutó o se limpió`);
  }
  const old = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  if (!fs.existsSync(`${metricsPath}.bak`)) fs.copyFileSync(metricsPath, `${metricsPath}.bak`);
  // The prompt exactly as it was sent (prefix included); the plugins of the synced content are the ones seen at run time.
  const promptFile = path.join(dir, 'prompt.stdin.txt');
  const prompt = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8') : '';
  const synced = (old.neutralConfigContent && old.neutralConfigContent.after && old.neutralConfigContent.after.pluginsSynced && old.neutralConfigContent.after.pluginsSynced.plugins) || [];
  const text = fs.readFileSync(streamPath, 'utf8');
  const { resultText, ...parsed } = parseStream(text, parseOptionsFor(cfg, arm, prompt, synced));
  const escapedCwd = findEscape(text, { sourceRepo: cfg.sourceRepo, privateRoot: cfg.privateRoot, workRoot: cfg.workRoot, runDir: dir });
  const merged = { ...old, ...parsed, escapedCwd };
  merged.invalidReasons = invalidReasons(merged);
  const changed = [...new Set([...Object.keys(old), ...Object.keys(merged)])]
    .filter((k) => JSON.stringify(old[k]) !== JSON.stringify(merged[k]));
  fs.writeFileSync(metricsPath, JSON.stringify(merged, null, 2));
  return { task, arm, rep, changed, backup: `${metricsPath}.bak`, invalidReasons: merged.invalidReasons };
}
