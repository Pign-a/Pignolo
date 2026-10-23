// Metrics from a claude stream-json log.
import { DEFAULT_WEIGHTS, DEFAULT_MODEL_FACTOR, DEFAULT_NEUTRAL_PLUGINS } from './config.mjs';

const r2 = (x) => Math.round(x * 100) / 100;
const FINAL_TEXT_BYTES = 1024;

const rawWeighted = (t, w) => t.input * w.input + t.output * w.output + t.cacheRead * w.cacheRead + t.cacheWrite * w.cacheWrite;

// One weight set for every model; `factor` scales it for the model family (see modelFactorFor).
export function weightedTokens(t, w = DEFAULT_WEIGHTS, factor = 1) {
  return r2(rawWeighted(t, w) * factor);
}

// First family name that is a substring of the model id; null when none matches.
export function familyOf(model, factors = DEFAULT_MODEL_FACTOR) {
  const id = String(model || '').toLowerCase();
  for (const family of Object.keys(factors)) if (id.includes(family.toLowerCase())) return family;
  return null;
}

export function modelFactorFor(model, factors = DEFAULT_MODEL_FACTOR) {
  const f = familyOf(model, factors);
  return f === null ? 1 : Number(factors[f]);
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const sum = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const zero = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function fromUsage(u) {
  return {
    input: num(u.input_tokens), output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens),
  };
}

function fromModelUsage(mu) {
  const byModel = {};
  for (const [name, m] of Object.entries(mu)) {
    if (!m || typeof m !== 'object') continue;
    byModel[name] = {
      input: num(m.inputTokens), output: num(m.outputTokens),
      cacheRead: num(m.cacheReadInputTokens), cacheWrite: num(m.cacheCreationInputTokens),
    };
  }
  return byModel;
}

// A name belongs to a plugin when it is the plugin itself or one of its namespaced items.
export function belongsTo(name, plugin) {
  if (typeof name !== 'string' || !plugin) return false;
  const n = name.toLowerCase();
  const p = plugin.toLowerCase();
  return n === p || n.startsWith(`${p}:`) || n.startsWith(`${p}@`);
}

// A plugin name (without its @marketplace suffix) matches a neutral pattern, where * is any text and the match is anchored.
export function isNeutralPlugin(name, patterns = DEFAULT_NEUTRAL_PLUGINS) {
  const base = String(name).split('@')[0].toLowerCase();
  const toRegex = (p) => `^${String(p).toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
  return (patterns || []).some((p) => new RegExp(toRegex(p)).test(base));
}

const names = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean) : []);

export function parseStream(text, { ownPlugin, otherPlugin, otherPluginDir = null, weights = DEFAULT_WEIGHTS, modelFactor = DEFAULT_MODEL_FACTOR, neutralPlugins = DEFAULT_NEUTRAL_PLUGINS, neutralPluginNames = [], ownHooksDeclared = false, prompt = '' } = {}) {
  const initCommands = new Set();
  const agentTypes = [];
  // Activation of the plugin under test: Skill tool calls (all, and the arm's own), and whether its hook output shows up.
  const skillIds = new Set();
  const ownSkills = [];
  let skillCalls = 0;
  let ownSkillCalls = 0;
  let hookMessages = 0;
  let ownHookNamed = false;
  const ownLower = String(ownPlugin || '').toLowerCase();
  let result = null;
  const neutralLoaded = [];
  let badLines = 0;
  const agentIds = new Set();
  const mainIds = new Set();
  const hits = [];
  const loaded = [];
  let init = null;
  let anon = 0;
  const otherDir = otherPluginDir ? otherPluginDir.replace(/\\/g, '/').toLowerCase() : null;

  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { badLines += 1; continue; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) { badLines += 1; continue; }

    if (o.type === 'system' && o.subtype === 'init') {
      // Commands and skills the session lists: a prompt that starts with "/plugin:skill" is only an activation if it is one of them.
      for (const n of [...names(o.slash_commands), ...names(o.skills)]) initCommands.add(String(n).replace(/^\//, '').toLowerCase());
      init = { model: typeof o.model === 'string' ? o.model : null, claude_code_version: typeof o.claude_code_version === 'string' ? o.claude_code_version : null };
      for (const n of names(o.plugins)) {
        loaded.push(n);
        // Any plugin that is not the arm's own is contamination, unless it is one of the neutral built-ins (recorded apart).
        if (belongsTo(n, ownPlugin)) continue;
        // Neutral: a built-in pattern, or a plugin named in the account-synced content of the config dir.
        if (isNeutralPlugin(n, neutralPlugins) || neutralPluginNames.includes(String(n).split('@')[0])) neutralLoaded.push(n);
        else hits.push(`plugin:${n}`);
      }
      for (const [kind, list] of [['skill', o.skills], ['agent', o.agents], ['command', o.slash_commands]]) {
        for (const n of names(list)) if (belongsTo(n, otherPlugin)) hits.push(`${kind}:${n}`);
      }
    } else if (o.type === 'system') {
      if (/^hook_/.test(String(o.subtype))) {
        hookMessages += 1;
        if (ownLower && JSON.stringify(o).toLowerCase().includes(ownLower)) ownHookNamed = true;
      }
      // Hook and other system messages: contaminated when they point into the other plugin's folder.
      const s = JSON.stringify(o).replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
      if (otherDir && s.includes(otherDir)) hits.push(`${o.subtype || 'system'}:${otherPlugin}`);
    } else if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b && b.type === 'tool_use' && b.name === 'Skill') {
          const id = b.id || `noskill-${anon++}`;
          if (!skillIds.has(id)) {
            skillIds.add(id);
            skillCalls += 1;
            const raw = b.input && typeof b.input === 'object' ? String(b.input.skill ?? b.input.name ?? '') : '';
            const nm = raw.trim().toLowerCase();
            if (ownLower && (nm === ownLower || nm.startsWith(`${ownLower}:`))) { ownSkillCalls += 1; ownSkills.push(raw.trim()); }
          }
        }
        if (b && b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) {
          const id = b.id || `noid-${anon++}`;
          if (!agentIds.has(id)) {
            agentIds.add(id);
            if (!o.parent_tool_use_id) {
              mainIds.add(id);
              // Which agents the main thread chose to launch (names only): a measure of selection that does not depend on what the model prints.
              if (b.input && typeof b.input.subagent_type === 'string' && b.input.subagent_type) agentTypes.push(b.input.subagent_type);
            }
          }
        }
      }
    } else if (o.type === 'result') {
      result = o;
    }
  }

  let tokens = null;
  let tokenSource = null;
  let tokensByModel = null;
  let usageMainThread = null;
  if (result) {
    if (result.usage && typeof result.usage === 'object') usageMainThread = fromUsage(result.usage);
    if (result.modelUsage && typeof result.modelUsage === 'object' && Object.keys(result.modelUsage).length) {
      tokensByModel = fromModelUsage(result.modelUsage);
      tokenSource = 'modelUsage';
    } else if (usageMainThread) {
      tokensByModel = { [(init && init.model) || 'unknown']: usageMainThread };
      tokenSource = 'usage';
    }
    if (tokensByModel) tokens = Object.values(tokensByModel).reduce(sum, zero());
  }
  let weighted = null;
  const unknownModels = [];
  if (tokensByModel) {
    let total = 0;
    for (const [model, t] of Object.entries(tokensByModel)) {
      if (familyOf(model, modelFactor) === null) unknownModels.push(model);
      total += rawWeighted(t, weights) * modelFactorFor(model, modelFactor);
    }
    weighted = r2(total);
  }
  // Activation by slash command: the prompt starts with "/<pluginName>:<skill>" (a prefix of the arm), the session lists that
  // command and the run produced a successful result. The command expands the skill into the prompt: there is no Skill tool call.
  const slashActivations = [];
  const warnings = [];
  const slash = String(prompt).match(/^\s*\/([^\s:/]+):(\S+)/);
  if (slash && ownLower && slash[1].toLowerCase() === ownLower) {
    const cmd = `${slash[1]}:${slash[2]}`;
    if (!initCommands.has(cmd.toLowerCase())) warnings.push('slash_command_unknown');
    else if (result && !result.is_error && !/^error/.test(String(result.subtype || ''))) slashActivations.push(cmd);
  }
  for (const c of slashActivations) ownSkills.push(c);
  const ownSkillToolCalls = ownSkillCalls;
  ownSkillCalls += slashActivations.length;
  const activationVia = ownSkillToolCalls > 0 && slashActivations.length > 0 ? 'both' : ownSkillToolCalls > 0 ? 'skill_tool' : slashActivations.length > 0 ? 'slash_command' : 'none';
  const ownPluginLoaded = loaded.some((n) => belongsTo(n, ownPlugin));
  if (!ownPluginLoaded) hits.push('own_plugin_not_loaded');
  const uniqueHits = [...new Set(hits)];
  return {
    hasResult: Boolean(result),
    resultSubtype: result ? result.subtype ?? null : null,
    isError: result ? Boolean(result.is_error) : null,
    finalText: result && typeof result.result === 'string' ? result.result.slice(-FINAL_TEXT_BYTES) : null,
    resultText: result && typeof result.result === 'string' ? result.result : null,
    costUsd: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    durationMs: result && typeof result.duration_ms === 'number' ? result.duration_ms : null,
    turns: result && typeof result.num_turns === 'number' ? result.num_turns : null,
    tokens,
    tokenSource,
    tokensByModel,
    usageMainThread,
    modelUsage: result && result.modelUsage && typeof result.modelUsage === 'object' ? result.modelUsage : null,
    weights,
    modelFactor,
    unknownModels,
    weightedTokens: weighted,
    agents: agentIds.size,
    agentsMain: mainIds.size,
    agentTypes,
    contamination: uniqueHits.length > 0,
    contaminationHits: uniqueHits,
    ownPluginLoaded,
    neutralPluginsLoaded: neutralLoaded,
    skillCalls,
    ownSkillCalls,
    ownSkillNames: [...new Set(ownSkills)].sort(),
    slashActivations,
    activationVia,
    warnings,
    // true: a hook message names the plugin; false: hooks ran, none names it and the plugin declares hooks; unknown: cannot tell.
    ownHookRan: ownHookNamed ? 'true' : (hookMessages > 0 && ownHooksDeclared ? 'false' : 'unknown'),
    init,
    pluginsLoaded: loaded,
    badLines,
  };
}

// The text blocks of every top-level assistant message (subagent messages carry a parent_tool_use_id and are skipped), in
// order; a message with no text block (only tool calls) is not listed. The stream has one assistant event per message.
export function assistantTexts(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes('"assistant"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || o.type !== 'assistant' || o.parent_tool_use_id || !o.message || !Array.isArray(o.message.content)) continue;
    const blocks = o.message.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
    if (blocks.length) out.push(blocks.join('\n'));
  }
  return out;
}

// assistant-text.txt: the messages separated by a "----- mensaje N -----" line.
export function formatAssistantText(list) {
  return list.map((t, i) => `----- mensaje ${i + 1} -----\n${t}\n`).join('');
}

// Escape detection lives in escape.mjs.
export { findEscape } from './escape.mjs';

// Reasons why a run cannot be trusted. Empty list: the run is valid.
export function invalidReasons(m) {
  const r = [];
  if (!m.hasResult) r.push('no_result');
  if (m.timedOut) r.push('timed_out');
  else if ((m.exitCode !== null && m.exitCode !== undefined && m.exitCode !== 0) || m.signal) r.push('exit_nonzero');
  if (m.isError) r.push('is_error');
  if (m.hasResult) {
    if (/budget/i.test(String(m.resultSubtype))) r.push('budget_cap');
    else if (m.resultSubtype !== 'success') r.push('result_not_success');
  }
  const hits = m.contaminationHits || [];
  if (hits.includes('own_plugin_not_loaded')) r.push('own_plugin_not_loaded');
  if (hits.some((h) => h !== 'own_plugin_not_loaded') || (m.neutralConfigArmNamed && m.neutralConfigArmNamed.length)) r.push('contaminated');
  if (m.escapedCwd) r.push('escaped_cwd');
  if (m.nm && m.nm.snapshotChanged) r.push('nm_changed');
  if (m.nm && m.nm.sourceChanged) r.push('source_nm_changed');
  if (m.nm && m.nm.dropFailed) r.push('drop_failed');
  if (m.postRunError && m.postRunError.length) r.push('post_run_error');
  if (m.treesError) r.push('trees_unmeasurable');
  else if (m.trees && m.trees.noChanges && !m.isFixture) r.push('no_changes'); // validating does not change the code
  return r;
}
