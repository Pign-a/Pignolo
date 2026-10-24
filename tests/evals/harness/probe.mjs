// Probe: ONE trivial `claude -p` session per arm, run with the same flags, environment and config dir as a real run, to read what the
// session really offers (plugins, skills, slash commands, agents, model, version) before the freeze. It spends cents (the cap is 0.30 USD)
// and the cost is added to the spend log that the ledger reads (grader-spend.csv), so it counts against the total cap.
import fs from 'node:fs';
import path from 'node:path';
import { check, hasPlugin } from './config.mjs';
import { buildArgv, checkPlugin, checkConfigDir } from './execute.mjs';
import { buildChildEnv } from './env.mjs';
import { runProcess } from './proc.mjs';
import { belongsTo } from './metrics.mjs';
import { assertWithinTotalCap } from './ledger.mjs';
import { removeTreeSafe } from './fsutil.mjs';

export const PROBE_PROMPT = 'responde solo: ok';
export const PROBE_CAP_USD = 0.30;

const names = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean) : []);
const bare = (n) => String(n).replace(/^\//, '').toLowerCase();

// The command a prompt starts with: "/code-review ..." is native, "/plugin:skill ..." belongs to a plugin; null when it is not a command.
export function leadingCommand(prompt) {
  const m = String(prompt || '').match(/^\s*\/([A-Za-z][\w-]*)(?::([\w-]+))?(?=\s|$)/);
  if (!m) return null;
  return m[2] ? { kind: 'plugin', plugin: m[1], name: `${m[1]}:${m[2]}` } : { kind: 'native', name: m[1] };
}

// Reads the init and result messages out of a stream.
export function readProbeStream(text) {
  let init = null;
  let result = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || typeof o !== 'object') continue;
    if (o.type === 'system' && o.subtype === 'init' && !init) init = o;
    else if (o.type === 'result') result = o;
  }
  return { init, result };
}

export async function probeArm(cfg, args, deps = {}) {
  const { arm } = check(cfg, { task: 'probe', arm: args.arm, rep: 1 });
  checkPlugin(cfg, arm);
  checkConfigDir(cfg.configDir, { neutralPaths: cfg.neutralConfigPaths, armNames: Object.values(cfg.arms).map((a) => a.pluginName).filter(Boolean) });
  assertWithinTotalCap(cfg);
  const scratch = path.join(cfg.workRoot, `probe-${arm}-scratch`);
  if (fs.existsSync(scratch)) removeTreeSafe(scratch);
  fs.mkdirSync(scratch, { recursive: true });
  const stdinPath = path.join(scratch, 'prompt.stdin.txt');
  fs.writeFileSync(stdinPath, PROBE_PROMPT);
  const streamPath = path.join(scratch, 'stream.jsonl');
  const { env } = buildChildEnv(cfg);
  const startedAt = new Date().toISOString();
  let text = '';
  let r;
  try {
    r = await (deps.runProcess || runProcess)({
      command: cfg.claudeBin, args: buildArgv({ ...cfg, perRunCapUsd: PROBE_CAP_USD }, arm), cwd: scratch, env, stdinPath,
      timeoutMs: Math.min(Number(cfg.timeoutMs) || 300000, 300000), activityPollMs: cfg.activityPollMs, stdoutPath: streamPath, stderrPath: path.join(scratch, 'stderr.txt'),
    });
    if (r.error) throw new Error(`no se pudo lanzar ${cfg.claudeBin}: ${r.error}`);
    try { text = fs.readFileSync(streamPath, 'utf8'); } catch { text = ''; }
  } finally {
    removeTreeSafe(scratch);
  }
  const { init, result } = readProbeStream(text);
  if (!init) throw new Error(`la sonda de ${arm} no recibió el mensaje init (salida ${r.code}${r.timedOut ? ', cortada por tiempo' : ''}); no se puede leer qué ofrece la sesión`);
  const plugins = names(init.plugins);
  const slash = names(init.slash_commands);
  const skills = names(init.skills);
  const codeReview = slash.filter((n) => /code-review/i.test(n));
  const cost = result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null;

  // What each review task of the configuration needs from this arm's session: the command its prompt starts with must be listed.
  const prerequisites = { pluginLoaded: hasPlugin(cfg, arm) ? plugins.some((n) => belongsTo(n, cfg.arms[arm].pluginName)) : null, reviewCommands: [] };
  const seen = new Set();
  for (const [id, t] of Object.entries(cfg.tasks || {})) {
    if (!t || t.kind !== 'review') continue;
    const prompt = (cfg.arms[arm].promptPrefix || '') + (cfg.arms[arm].reviewPrompt || '');
    const cmd = leadingCommand(prompt);
    if (!cmd || seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    prerequisites.reviewCommands.push({ task: id, command: cmd.name, kind: cmd.kind, listed: slash.map(bare).includes(cmd.name.toLowerCase()) || skills.map(bare).includes(cmd.name.toLowerCase()) });
  }
  prerequisites.ok = prerequisites.pluginLoaded !== false && prerequisites.reviewCommands.every((c) => c.listed);

  const out = {
    arm, startedAt, experiment: cfg.experiment, prompt: PROBE_PROMPT, maxBudgetUsd: PROBE_CAP_USD,
    model: init.model || null, claudeCodeVersion: init.claude_code_version || null,
    plugins, skillsCount: skills.length, slashCommandsCount: slash.length, slashCommandsCodeReview: codeReview,
    agents: names(init.agents), prerequisites,
    resultSubtype: result ? result.subtype ?? null : null, isError: result ? Boolean(result.is_error) : null, costUsd: cost,
    wallS: r.wallS, exitCode: r.code,
  };
  fs.mkdirSync(cfg.workRoot, { recursive: true });
  fs.writeFileSync(path.join(cfg.workRoot, `probe-${arm}.json`), JSON.stringify(out, null, 2));
  // It spent money outside `run`: it goes in the log the ledger sums (a missing cost counts as the probe cap, the most it could cost).
  const spendFile = cfg.graderSpendPath;
  if (spendFile) {
    fs.mkdirSync(path.dirname(spendFile), { recursive: true });
    if (!fs.existsSync(spendFile) || !fs.readFileSync(spendFile, 'utf8').trim()) fs.writeFileSync(spendFile, 'date,usd,note\n');
    else if (!/\n$/.test(fs.readFileSync(spendFile, 'utf8'))) fs.appendFileSync(spendFile, '\n');
    fs.appendFileSync(spendFile, `${startedAt},${cost === null ? PROBE_CAP_USD : cost},probe ${arm}\n`);
  }
  return out;
}
