// Fake `claude` for the harness tests: spends nothing, prints plausible stream-json.
// FAKE_CLAUDE_MODE is a comma list of modes:
//   ok (default) | edit | hang | contaminated | nocost | noplugin | budget | fail | ask
//   neutral | sync | sync-plugin | nm-modify | src-nm-modify | worktree | worktree-gone | branch-only | process-files | only-excluded | cfg-write | escape
// FAKE_CLAUDE_LOG: file where the stub records argv, cwd, CLAUDE_CONFIG_DIR, env names and stdin.
// FAKE_CLAUDE_ESCAPE_PATH: path named by the tool_use of the `escape` mode.
// FAKE_CLAUDE_SRC_NM: the (forbidden) source node_modules written by `src-nm-modify`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const modes = new Set((process.env.FAKE_CLAUDE_MODE || 'ok').split(',').map((s) => s.trim()).filter(Boolean));
const has = (m) => modes.has(m);
let stdin = '';
try { stdin = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
if (process.env.FAKE_CLAUDE_LOG) {
  fs.writeFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({
    argv, cwd: process.cwd(), configDir: process.env.CLAUDE_CONFIG_DIR || null, envNames: Object.keys(process.env), stdin,
  }));
}
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

function pluginName(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name; }
  catch { return 'unknown'; }
}
const i = argv.indexOf('--plugin-dir');
const own = i >= 0 ? pluginName(argv[i + 1]) : null;
let plugins = own ? [{ name: own, path: argv[i + 1] }] : [];
let skills = own ? [`${own}:some-skill`] : [];
if (has('noplugin')) { plugins = []; skills = []; }
if (has('sync-plugin')) plugins.push({ name: 'acme-tools', path: '/synced' });
if (has('neutral')) {
  for (const n of ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring']) plugins.push({ name: n, path: '/builtin' });
}
if (has('contaminated')) {
  const extra = process.env.FAKE_CLAUDE_EXTRA_PLUGIN;
  plugins.push({ name: extra, path: '/x' });
  skills.push(`${extra}:other-skill`);
}

out({
  type: 'system', subtype: 'init', cwd: process.cwd(), model: 'fake-model', claude_code_version: '9.9.9-fake',
  plugins, skills, agents: [], slash_commands: [],
});

if (has('hang')) {
  setInterval(() => {}, 1000);
} else {
  const feature = 'exports.a = 1;\nexports.b = 2;\nexports.c = 3;\n';
  if (has('edit')) {
    fs.mkdirSync(path.join(process.cwd(), 'src'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'src', 'feature.js'), feature);
  }
  if (has('nm-modify')) {
    fs.mkdirSync(path.join(process.cwd(), 'node_modules', 'zz-new'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'node_modules', 'zz-new', 'index.js'), 'module.exports = 2;\n');
  }
  if (has('src-nm-modify')) {
    fs.mkdirSync(path.join(process.env.FAKE_CLAUDE_SRC_NM, 'zz-src'), { recursive: true });
    fs.writeFileSync(path.join(process.env.FAKE_CLAUDE_SRC_NM, 'zz-src', 'index.js'), 'module.exports = 3;\n');
  }
  if (has('process-files')) {
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(process.cwd(), rel)), { recursive: true }); fs.appendFileSync(path.join(process.cwd(), rel), text); };
    w('docs/superpowers/plan.md', 'plan\n');
    w('.superpowers/note.md', 'note\n');
    w('docs/sessions/s.md', 'session\n');
    w('CLAUDE.md', 'more notes\n');
    w('.gitignore', '.worktrees/\n');
    w('docs/my notes/file with space.md', 'real doc\n');
    w('src/feature.js', feature);
  }
  if (has('only-excluded')) {
    fs.appendFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'a note only\n');
  }
  if (has('sync') && process.env.CLAUDE_CONFIG_DIR) {
    const c = process.env.CLAUDE_CONFIG_DIR;
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(c, rel)), { recursive: true }); fs.writeFileSync(path.join(c, rel), text); };
    w('skills/synced/b1/docx/SKILL.md', 'x');
    w('skills/synced/b1/pdf/SKILL.md', 'x');
    w('skills/synced/b1/pdf/ref.md', 'x');
    w('plugins/synced/b1/acme-tools/.claude-plugin/plugin.json', JSON.stringify({ name: 'acme-tools' }));
    w('plugins/synced/b1/acme-tools/.mcp.json', '{}');
    w('plugins/synced/b1/acme-tools/skills/x/SKILL.md', 'x');
    w('plugins/data/arm-inline/state.json', '{}');
  }
  if (has('cfg-write') && process.env.CLAUDE_CONFIG_DIR) {
    fs.mkdirSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'cache-x'), { recursive: true });
    fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'cache-x', 'f.txt'), 'x');
  }
  if (has('worktree')) {
    const wt = path.join(process.cwd(), '..', 'wt');
    const r = spawnSync('git', ['worktree', 'add', '-q', '-b', 'feature', wt], { cwd: process.cwd(), encoding: 'utf8' });
    if (r.status !== 0) process.stderr.write(`worktree failed: ${r.stderr}\n`);
    fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'src', 'feature.js'), feature);
  }
  if (has('worktree-gone')) {
    const wt = path.join(process.cwd(), '..', 'wt');
    spawnSync('git', ['worktree', 'add', '-q', '-b', 'feature', wt], { cwd: process.cwd(), encoding: 'utf8' });
    fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'src', 'feature.js'), feature);
    fs.rmSync(wt, { recursive: true, force: true });
  }
  if (has('branch-only')) {
    const wt = path.join(process.cwd(), '..', 'wt');
    const sh = (...a) => spawnSync('git', a, { cwd: wt, encoding: 'utf8' });
    spawnSync('git', ['worktree', 'add', '-q', '-b', 'feature', wt], { cwd: process.cwd(), encoding: 'utf8' });
    fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'src', 'feature.js'), feature);
    sh('add', '-A');
    sh('commit', '-q', '-m', 'feature');
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: process.cwd(), encoding: 'utf8' });
  }
  const blocks = [
    { type: 'text', text: 'Working.' },
    { type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { prompt: 'x' } },
    { type: 'tool_use', id: 'toolu_2', name: 'Read', input: {} },
  ];
  if (has('escape')) {
    blocks.push({ type: 'tool_use', id: 'toolu_9', name: 'Bash', input: { command: `type ${process.env.FAKE_CLAUDE_ESCAPE_PATH}` } });
  }
  out({ type: 'assistant', parent_tool_use_id: null, message: { content: blocks } });
  // Same tool_use repeated (partial-message duplicates) and one inside a sub-agent.
  out({ type: 'assistant', parent_tool_use_id: null, message: { content: [
    { type: 'tool_use', id: 'toolu_1', name: 'Agent', input: { prompt: 'x' } },
  ] } });
  out({ type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [
    { type: 'tool_use', id: 'toolu_3', name: 'Task', input: { prompt: 'y' } },
  ] } });
  out({ type: 'user', message: { content: [] } });
  process.stdout.write('this line is not json\n');
  const result = { type: 'result', subtype: 'success', is_error: false, duration_ms: 1234, num_turns: 4, result: 'Done.' };
  if (has('budget')) Object.assign(result, { subtype: 'error_max_budget_usd', is_error: true, result: undefined });
  if (has('fail')) Object.assign(result, { subtype: 'error_during_execution', is_error: true });
  if (has('ask')) result.result = `${'Long preamble. '.repeat(200)}Which option do you prefer, A or B?`;
  if (!has('nocost')) {
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
  if (has('fail')) process.exitCode = 1;
}
