// Fake `claude` for the harness tests: spends nothing, prints plausible stream-json.
// Mode comes from FAKE_CLAUDE_MODE: ok | edit | hang | contaminated | nocost.
// FAKE_CLAUDE_LOG: file where the stub records argv, cwd and CLAUDE_CONFIG_DIR.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = process.env.FAKE_CLAUDE_MODE || 'ok';
if (process.env.FAKE_CLAUDE_LOG) {
  fs.writeFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({
    argv, cwd: process.cwd(), configDir: process.env.CLAUDE_CONFIG_DIR || null,
  }));
}
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

function pluginName(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name; }
  catch { return 'unknown'; }
}
const i = argv.indexOf('--plugin-dir');
const own = i >= 0 ? pluginName(argv[i + 1]) : null;
const plugins = own ? [{ name: own, path: argv[i + 1] }] : [];
const skills = own ? [`${own}:some-skill`] : [];
if (mode === 'contaminated') {
  const extra = process.env.FAKE_CLAUDE_EXTRA_PLUGIN;
  plugins.push({ name: extra, path: '/x' });
  skills.push(`${extra}:other-skill`);
}

out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'fake-model', plugins, skills, agents: [], slash_commands: [] });

if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  if (mode === 'edit') {
    fs.mkdirSync(path.join(process.cwd(), 'src'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'src', 'feature.js'), 'exports.a = 1;\nexports.b = 2;\nexports.c = 3;\n');
  }
  out({ type: 'assistant', parent_tool_use_id: null, message: { content: [
    { type: 'text', text: 'Working.' },
    { type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { prompt: 'x' } },
    { type: 'tool_use', id: 'toolu_2', name: 'Read', input: {} },
  ] } });
  // Same tool_use repeated (partial-message duplicates) and one inside a sub-agent.
  out({ type: 'assistant', parent_tool_use_id: null, message: { content: [
    { type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { prompt: 'x' } },
  ] } });
  out({ type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [
    { type: 'tool_use', id: 'toolu_3', name: 'Task', input: { prompt: 'y' } },
  ] } });
  out({ type: 'user', message: { content: [] } });
  process.stdout.write('this line is not json\n');
  const result = { type: 'result', subtype: 'success', is_error: false, duration_ms: 1234, num_turns: 4 };
  if (mode !== 'nocost') {
    Object.assign(result, {
      total_cost_usd: 0.5,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 400 },
      modelUsage: {
        'fake-model': { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 1000, cacheCreationInputTokens: 400, costUSD: 0.4 },
        'fake-sub': { inputTokens: 50, outputTokens: 10, cacheReadInputTokens: 500, cacheCreationInputTokens: 200, costUSD: 0.1 },
      },
    });
  }
  out(result);
  process.stderr.write('fake stderr\n');
}
