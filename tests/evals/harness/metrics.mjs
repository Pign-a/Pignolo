// Metrics from a claude stream-json log.
import { DEFAULT_WEIGHTS } from './config.mjs';

const r2 = (x) => Math.round(x * 100) / 100;

export function weightedTokens(t, w = DEFAULT_WEIGHTS) {
  return r2(t.input * w.input + t.output * w.output + t.cacheRead * w.cacheRead + t.cacheWrite * w.cacheWrite);
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

function fromUsage(u) {
  return {
    input: num(u.input_tokens), output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens),
  };
}

function fromModelUsage(mu) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const m of Object.values(mu)) {
    if (!m || typeof m !== 'object') continue;
    t.input += num(m.inputTokens);
    t.output += num(m.outputTokens);
    t.cacheRead += num(m.cacheReadInputTokens);
    t.cacheWrite += num(m.cacheCreationInputTokens);
  }
  return t;
}

// A name belongs to a plugin when it is the plugin itself or one of its namespaced items.
export function belongsTo(name, plugin) {
  if (typeof name !== 'string' || !plugin) return false;
  const n = name.toLowerCase();
  const p = plugin.toLowerCase();
  return n === p || n.startsWith(`${p}:`) || n.startsWith(`${p}@`) || n.startsWith(`${p}-`);
}

const names = (list) => (Array.isArray(list) ? list.map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean) : []);

export function parseStream(text, { ownPlugin, otherPlugin, otherPluginDir = null, weights = DEFAULT_WEIGHTS } = {}) {
  let result = null;
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
      init = { model: typeof o.model === 'string' ? o.model : null, claude_code_version: typeof o.claude_code_version === 'string' ? o.claude_code_version : null };
      for (const n of names(o.plugins)) {
        loaded.push(n);
        // Any plugin that is not the arm's own is contamination, whatever its name.
        if (!belongsTo(n, ownPlugin)) hits.push(`plugin:${n}`);
      }
      for (const [kind, list] of [['skill', o.skills], ['agent', o.agents], ['command', o.slash_commands]]) {
        for (const n of names(list)) if (belongsTo(n, otherPlugin)) hits.push(`${kind}:${n}`);
      }
    } else if (o.type === 'system') {
      // Hook and other system messages: contaminated when they point into the other plugin's folder.
      const s = JSON.stringify(o).replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
      if (otherDir && s.includes(otherDir)) hits.push(`${o.subtype || 'system'}:${otherPlugin}`);
    } else if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b && b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) {
          const id = b.id || `noid-${anon++}`;
          if (!agentIds.has(id)) {
            agentIds.add(id);
            if (!o.parent_tool_use_id) mainIds.add(id);
          }
        }
      }
    } else if (o.type === 'result') {
      result = o;
    }
  }

  let tokens = null;
  let tokenSource = null;
  let usageMainThread = null;
  if (result) {
    if (result.usage && typeof result.usage === 'object') usageMainThread = fromUsage(result.usage);
    if (result.modelUsage && typeof result.modelUsage === 'object' && Object.keys(result.modelUsage).length) {
      tokens = fromModelUsage(result.modelUsage);
      tokenSource = 'modelUsage';
    } else if (usageMainThread) {
      tokens = usageMainThread;
      tokenSource = 'usage';
    }
  }
  const ownPluginLoaded = loaded.some((n) => belongsTo(n, ownPlugin));
  if (!ownPluginLoaded) hits.push('own_plugin_not_loaded');
  const uniqueHits = [...new Set(hits)];
  return {
    hasResult: Boolean(result),
    resultSubtype: result ? result.subtype ?? null : null,
    isError: result ? Boolean(result.is_error) : null,
    costUsd: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    durationMs: result && typeof result.duration_ms === 'number' ? result.duration_ms : null,
    turns: result && typeof result.num_turns === 'number' ? result.num_turns : null,
    tokens,
    tokenSource,
    usageMainThread,
    modelUsage: result && result.modelUsage && typeof result.modelUsage === 'object' ? result.modelUsage : null,
    weights,
    weightedTokens: tokens ? weightedTokens(tokens, weights) : null,
    agents: agentIds.size,
    agentsMain: mainIds.size,
    contamination: uniqueHits.length > 0,
    contaminationHits: uniqueHits,
    ownPluginLoaded,
    init,
    pluginsLoaded: loaded,
    badLines,
  };
}

// First tool_use whose input names the source repo, the private folder or a sibling run folder.
// Everything is compared with forward slashes and lowercase. Returns { match, tool, command } or null.
export function findEscape(text, { sourceRepo, privateRoot, workRoot, runDirName }) {
  const slash = (p) => String(p).replace(/\\/g, '/').toLowerCase();
  const norm = (p) => slash(p).replace(/\/+$/, '');
  const needles = [['sourceRepo', norm(sourceRepo)], ['privateRoot', norm(privateRoot)]];
  const work = `${norm(workRoot)}/`;
  const own = String(runDirName).toLowerCase();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes('tool_use')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) {
      if (!b || b.type !== 'tool_use') continue;
      // JSON.stringify doubles the backslashes of Windows paths; undo that before comparing.
      const raw = JSON.stringify(b.input === undefined ? '' : b.input);
      const hay = slash(raw.replace(/\\\\/g, '\\'));
      let match = null;
      for (const [name, n] of needles) if (n && hay.includes(n)) { match = name; break; }
      if (!match) {
        let from = 0;
        for (;;) {
          const at = hay.indexOf(work, from);
          if (at < 0) break;
          const seg = hay.slice(at + work.length).match(/^[^/"\s\\]*/)[0];
          // The shared snapshot of node_modules is reached through the junction; its manifest guards it.
          if (seg !== own && seg !== '_nm') { match = 'otherRun'; break; }
          from = at + work.length;
        }
      }
      if (match) {
        const i = b.input;
        const shown = i && typeof i === 'object' ? (i.command ?? i.file_path ?? i.path ?? raw) : raw;
        return { match, tool: b.name || null, command: String(shown).slice(0, 200) };
      }
    }
  }
  return null;
}

// Reasons why a run cannot be trusted. Empty list: the run is valid.
export function invalidReasons(m) {
  const r = [];
  if (m.contaminationHits && m.contaminationHits.includes('own_plugin_not_loaded')) r.push('own_plugin_not_loaded');
  if (m.contaminationHits && m.contaminationHits.some((h) => h !== 'own_plugin_not_loaded')) r.push('contaminated');
  if (m.escapedCwd) r.push('escaped_cwd');
  return r;
}
