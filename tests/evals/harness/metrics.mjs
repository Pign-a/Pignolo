// Metrics from a claude stream-json log.
import { DEFAULT_WEIGHTS, DEFAULT_MODEL_FACTOR, DEFAULT_NEUTRAL_PLUGINS, DEFAULT_HANG_SILENCE_S } from './config.mjs';

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

export function parseStream(text, { ownPlugin, otherPlugin, otherPluginDir = null, otherPlugins = [], weights = DEFAULT_WEIGHTS, modelFactor = DEFAULT_MODEL_FACTOR, neutralPlugins = DEFAULT_NEUTRAL_PLUGINS, neutralPluginNames = [], ownHooksDeclared = false, prompt = '' } = {}) {
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
  // Every plugin of the other arms (name and folder). The legacy single otherPlugin/otherPluginDir still works.
  const others = [...(otherPlugin ? [{ name: otherPlugin, dir: otherPluginDir }] : []), ...(otherPlugins || [])]
    .filter((o) => o && o.name)
    .map((o) => ({ name: o.name, dir: o.dir ? String(o.dir).replace(/\\/g, '/').toLowerCase() : null }));
  // An arm without a plugin has no "own" plugin: no activation, and any non-neutral plugin that loads is contamination.
  const noPlugin = !ownPlugin;

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
        for (const n of names(list)) if (others.some((o) => belongsTo(n, o.name))) hits.push(`${kind}:${n}`);
      }
    } else if (o.type === 'system') {
      if (/^hook_/.test(String(o.subtype))) {
        hookMessages += 1;
        if (ownLower && JSON.stringify(o).toLowerCase().includes(ownLower)) ownHookNamed = true;
      }
      // Hook and other system messages: contaminated when they point into the other plugin's folder.
      const s = JSON.stringify(o).replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
      for (const x of others) if (x.dir && s.includes(x.dir)) hits.push(`${o.subtype || 'system'}:${x.name}`);
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
  const ownPluginLoaded = noPlugin ? null : loaded.some((n) => belongsTo(n, ownPlugin));
  if (!noPlugin && !ownPluginLoaded) hits.push('own_plugin_not_loaded');
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
    ownSkillCalls: noPlugin ? null : ownSkillCalls,
    ownSkillNames: [...new Set(ownSkills)].sort(),
    slashActivations,
    activationVia: noPlugin ? 'n/a' : activationVia,
    warnings,
    // true: a hook message names the plugin; false: hooks ran, none names it and the plugin declares hooks; unknown: cannot tell.
    ownHookRan: noPlugin ? 'n/a' : ownHookNamed ? 'true' : (hookMessages > 0 && ownHooksDeclared ? 'false' : 'unknown'),
    init,
    hasInit: init !== null,
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

// ---- How the run ended -------------------------------------------------------------------------------------------------
// A run ends in one of these ways (field `termination`):
//   ok            it finished normally (a successful result)
//   budget_cap    the per-run budget cap (--max-budget-usd) cut it: a RESULT of the model, valid, censored
//   model_timeout the wall timeout cut it while the agent was still working: a RESULT, valid, censored
//   infra_fault   something outside the model failed (crash, API error, no result...): INVALID, rerun (up to 2 times)
//   hang          the wall timeout cut it after a long silence: the process was stuck, an infrastructure fault
// A censored run counts as NOT green with cost = the reported cost, or the per-run cap when there is none. It stays in the analysis.
// More lines than this that are not JSON, with no result, make the stream unreadable (one stray line is not).
const CORRUPT_BAD_LINES = 3;
// Native crash codes on Windows (0xC0000000 and up, for example 0xC0000409) and negative codes.
const isCrashCode = (c) => typeof c === 'number' && (c >= 0xC0000000 || c < 0);
const exitFailed = (m) => (m.exitCode !== null && m.exitCode !== undefined && m.exitCode !== 0) || Boolean(m.signal);
// Error text of the API or the account: overload, rate or usage limits, authentication, network. Assumed shapes: confirm with a real run.
const API_ERROR = /overload|\b529\b|rate.?limit|\b429\b|too many requests|usage limit|limit reached|authenticat|unauthori[sz]ed|\b40[13]\b|invalid (x-)?api.?key|please run \/login|credit balance|billing|quota|econn\w*|etimedout|enotfound|eai_again|socket hang up|fetch failed|network|connection (error|refused|reset|timed out)|service unavailable|bad gateway|gateway time-?out|internal server error|\b50[0234]\b/i;
// The reasons for which a run is an infrastructure fault that is rerun by itself. Others (an error result we cannot place,
// contamination, an escape...) stay invalid and listed, but are never rerun automatically: a person decides.
const RETRYABLE_INFRA = new Set(['crash', 'no_result', 'api_error', 'execution_error', 'corrupt_stream', 'failed_to_start', 'hang', 'exit_nonzero']);
export const isRetryableInfra = (reasons) => (reasons || []).some((x) => RETRYABLE_INFRA.has(x));

// Pure: from the measured fields of a run (hasResult, resultSubtype, isError, finalText, exitCode, signal, timedOut, silentTailS,
// hangSilenceS, badLines, hasInit) to { termination, censored, reasons } where `reasons` are the invalid reasons that come from
// how the run ended (empty for ok, budget_cap and model_timeout).
export function classifyTermination(m) {
  const hangS = m.hangSilenceS === null || m.hangSilenceS === undefined || !Number.isFinite(Number(m.hangSilenceS)) ? DEFAULT_HANG_SILENCE_S : Number(m.hangSilenceS);
  const hasResult = Boolean(m.hasResult);
  const subtype = String(m.resultSubtype ?? '');
  const infra = (reasons) => ({ termination: 'infra_fault', censored: false, reasons });
  // A successful result is a completion, even when the wall timeout or a late kill came after it. If the process still exits
  // with an error, result and exit disagree and the run is not trusted.
  if (hasResult && subtype === 'success' && !m.isError) {
    if (!m.timedOut && exitFailed(m)) return infra([isCrashCode(m.exitCode) || m.signal ? 'crash' : 'exit_nonzero']);
    return { termination: 'ok', censored: false, reasons: [] };
  }
  if (hasResult && /budget/i.test(subtype)) return { termination: 'budget_cap', censored: true, reasons: [] };
  if (m.timedOut && !hasResult) {
    const silent = m.silentTailS === null || m.silentTailS === undefined ? NaN : Number(m.silentTailS);
    if (Number.isFinite(silent) && silent > hangS) return { termination: 'hang', censored: false, reasons: ['hang'] };
    return { termination: 'model_timeout', censored: true, reasons: [] };
  }
  if (hasResult) {
    const reasons = [];
    if (m.isError) reasons.push('is_error');
    if (API_ERROR.test(`${subtype} ${m.finalText || ''}`)) reasons.push('api_error');
    else if (subtype === 'error_during_execution') reasons.push('execution_error');
    else if (subtype !== 'success') reasons.push('result_not_success');
    return infra(reasons);
  }
  // No result message and no timeout of ours.
  const reasons = [];
  if (isCrashCode(m.exitCode) || m.signal) reasons.push('crash');
  else if (exitFailed(m)) reasons.push('exit_nonzero');
  reasons.push('no_result');
  if (m.hasInit === false) reasons.push('failed_to_start');
  if (Number(m.badLines) > CORRUPT_BAD_LINES) reasons.push('corrupt_stream');
  return infra(reasons);
}

// The fields a run stores about how it ended. A censored run costs what it reported, or the per-run cap when that is missing or zero.
export function terminationFields(m, { perRunCapUsd } = {}) {
  const c = classifyTermination(m);
  const reported = typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) ? m.costUsd : null;
  const cap = Number(perRunCapUsd);
  const costUsd = c.censored && !(reported > 0) && cap > 0 ? cap : reported;
  return { termination: c.termination, censored: c.censored, terminationReasons: c.reasons, costReportedUsd: reported, costUsd };
}

// Reasons why a run cannot be trusted. Empty list: the run is valid. Hitting the budget cap or the wall timeout while the
// agent was working is NOT one: it is a result (see classifyTermination).
export function invalidReasons(m) {
  const t = classifyTermination(m);
  const r = [...t.reasons];
  const hits = m.contaminationHits || [];
  if (hits.includes('own_plugin_not_loaded')) r.push('own_plugin_not_loaded');
  if (hits.some((h) => h !== 'own_plugin_not_loaded') || (m.neutralConfigArmNamed && m.neutralConfigArmNamed.length)) r.push('contaminated');
  if (m.escapedCwd) r.push('escaped_cwd');
  if (m.nm && m.nm.snapshotChanged) r.push('nm_changed');
  if (m.nm && m.nm.sourceChanged) r.push('source_nm_changed');
  if (m.nm && m.nm.dropFailed) r.push('drop_failed');
  if (m.postRunError && m.postRunError.length) r.push('post_run_error');
  if (m.treesError) r.push('trees_unmeasurable');
  else if (m.trees && m.trees.noChanges && !m.isFixture && t.termination === 'ok') r.push('no_changes'); // validating does not change the code
  return r;
}
