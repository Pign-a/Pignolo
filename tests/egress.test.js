'use strict';
// Egreso (spec §15 `egress`, R-7, R-12): tabla, un caso por fila.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const egress = require(path.join(PLUGIN_ROOT, 'lib', 'egress.js'));
const handler = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'egress.js'));

const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const RESEARCHER = 'pignolo:researcher';
const PII = '\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b';

function setup({ run = 'running', pii = [PII] } = {}) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  const list = pii.map((p) => `  - '${p}'\n`).join('');
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), `---\ntype: code-tested\ntest-paths:\n  - tests/\npii-patterns:\n${list}---\n`);
  git(['remote', 'add', 'origin', 'https://example.invalid/acme/secret-project.git'], repo);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'task-wt');
  git(['worktree', 'add', '-q', '-b', 'tw', wt], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const file = path.join(repo, '.pignolo', 'run.json');
  const mk = (expires) => JSON.stringify({ v: 1, flow: 'review', started: new Date().toISOString(), expires, task: { id: 't1', worktree: wt, base, files: [], agents: [RESEARCHER] } });
  if (run === 'running') fs.writeFileSync(file, mk(new Date(Date.now() + 3600e3).toISOString()));
  else if (run === 'expired') fs.writeFileSync(file, mk(new Date(Date.now() - 3600e3).toISOString()));
  else if (run === 'malformed') fs.writeFileSync(file, '{"v":1,');
  return { repo, wt };
}
const payload = (cwd, tool, tool_input, agent) => ({ hook_event_name: 'PreToolUse', tool_name: tool, cwd, tool_input, ...(agent ? { agent_type: agent, agent_id: 'a1' } : {}) });
const run = (cwd, tool, ti, agent, e = env()) => handler.run(payload(cwd, tool, ti, agent), { env: e });

test('classifyTool, projectIdentifiers and textOf', () => {
  assert.deepStrictEqual(['WebSearch', 'WebFetch', 'mcp__foo__bar', 'mcp__x', 'Bash', 'Read', ''].map(egress.classifyTool), ['web', 'web', 'mcp', 'mcp', 'other', 'other', 'other']);
  const ids = egress.projectIdentifiers({ main: 'C:\\repos\\proj', worktrees: ['C:\\a', '/tmp/wt-task1'], originPath: 'acme/secret-project' });
  assert.ok(ids.includes('c:/repos/proj') && ids.includes('c:\\repos\\proj'));
  assert.ok(ids.includes('/tmp/wt-task1') && ids.includes('\\tmp\\wt-task1'));
  assert.ok(ids.includes('acme/secret-project') && ids.includes('acme\\secret-project'));
  assert.ok(!ids.some((i) => i.includes('c:\\a') || i === 'c:/a'));
  assert.deepStrictEqual(egress.textOf({ query: 'a', nested: { prompt: 'b', n: 3, list: ['c', { d: 'd' }] } }), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(egress.textOf(null), []);
  assert.strictEqual(egress.originPathOf('git@example.invalid:acme/secret-project.git'), 'acme/secret-project');
  assert.strictEqual(egress.originPathOf('https://example.invalid/acme/secret-project.git'), 'acme/secret-project');
});

test('researcher + WebSearch: clean query allowed; main path, pii match and a worktree path with backslashes denied', () => {
  const { repo, wt } = setup();
  assert.strictEqual(run(repo, 'WebSearch', { query: 'how does git worktree prune work' }, RESEARCHER).exit, 0);
  const r = run(repo, 'WebSearch', { query: `why does ${repo} fail` }, RESEARCHER);
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /identificador del proyecto.*Alternativa: reformulá la pregunta en abstracto/s);
  const pii = run(repo, 'WebSearch', { query: 'cliente 20.123.456' }, RESEARCHER);
  assert.strictEqual(pii.exit, 2);
  assert.match(pii.stderr, /pii-pattern/);
  const back = wt.replace(/\//g, '\\');
  const fetch = run(repo, 'WebFetch', { url: 'https://example.invalid/docs', prompt: `summarize what applies to ${back}` }, RESEARCHER);
  assert.strictEqual(fetch.exit, 2);
  const fwd = run(repo, 'WebFetch', { url: 'https://example.invalid/docs', prompt: `summarize what applies to ${wt.replace(/\\/g, '/')}` }, RESEARCHER);
  assert.strictEqual(fwd.exit, 2);
  const origin = run(repo, 'WebSearch', { query: 'acme/secret-project issues' }, RESEARCHER);
  assert.strictEqual(origin.exit, 2);
});

test('implementer + WebFetch, researcher + mcp, explorer + mcp: denied with the alternative while a flow runs', () => {
  const { repo } = setup();
  const a = run(repo, 'WebFetch', { url: 'https://example.invalid' }, 'pignolo:implementer');
  assert.strictEqual(a.exit, 2);
  assert.match(a.stderr, /solo pignolo:researcher.*Alternativa:/s);
  const b = run(repo, 'mcp__foo__bar', { q: 'x' }, RESEARCHER);
  assert.strictEqual(b.exit, 2);
  assert.match(b.stderr, /ningún subagente usa herramientas MCP.*Alternativa:/s);
  assert.strictEqual(run(repo, 'mcp__x__y', {}, 'pignolo:explorer').exit, 2);
});

test('main thread is free with and without a flow; every subagent is bound only while a flow runs', () => {
  const running = setup();
  const idle = setup({ run: 'none' });
  for (const { repo } of [running, idle]) {
    assert.strictEqual(run(repo, 'WebSearch', { query: `about ${repo}` }).exit, 0);
    assert.strictEqual(run(repo, 'mcp__x__y', { q: `about ${repo}` }).exit, 0);
  }
  assert.strictEqual(run(running.repo, 'mcp__playwright__browser_navigate', { url: 'https://example.invalid' }, 'pignolo-ui:ui-option').exit, 2);
  assert.strictEqual(run(running.repo, 'WebFetch', { url: 'https://example.invalid' }, 'general-purpose').exit, 2);
  assert.strictEqual(run(idle.repo, 'mcp__playwright__browser_navigate', { url: 'https://example.invalid' }, 'pignolo-ui:ui-option').exit, 0);
  assert.strictEqual(run(idle.repo, 'WebFetch', { url: 'https://example.invalid' }, 'general-purpose').exit, 0);
});

test('no pignolo, expired run, /pignolo:off or PIGNOLO_DISABLED allow everything; a malformed run.json rules', () => {
  const plain = makeRepo();
  assert.strictEqual(run(plain, 'mcp__x__y', {}, 'pignolo:explorer').exit, 0);
  const { repo: expired } = setup({ run: 'expired' });
  assert.strictEqual(run(expired, 'mcp__x__y', {}, 'pignolo:explorer').exit, 0);
  const { repo: mal } = setup({ run: 'malformed' });
  const m = run(mal, 'mcp__x__y', {}, 'pignolo:explorer');
  assert.strictEqual(m.exit, 2);
  assert.match(m.stderr, /no se puede leer/);
  assert.strictEqual(run(mal, 'WebFetch', { url: 'https://example.invalid' }, 'pignolo:implementer').exit, 2);
  const { repo: off } = setup();
  fs.writeFileSync(path.join(off, '.pignolo', '.disabled'), '');
  assert.strictEqual(run(off, 'mcp__x__y', {}, 'pignolo:explorer').exit, 0);
  const { repo: dis } = setup();
  assert.strictEqual(run(dis, 'mcp__x__y', {}, 'pignolo:explorer', { ...env(), PIGNOLO_DISABLED: '1' }).exit, 0);
});

test('an unknown tool_input field is still read; a missing or non-object tool_input allows without throwing', () => {
  const { repo } = setup();
  assert.strictEqual(run(repo, 'WebSearch', { q: `about ${repo}` }, RESEARCHER).exit, 2);
  assert.strictEqual(run(repo, 'WebSearch', undefined, RESEARCHER).exit, 0);
  assert.strictEqual(run(repo, 'WebSearch', 'texto', RESEARCHER).exit, 0);
  assert.strictEqual(run(repo, 'WebSearch', 7, RESEARCHER).exit, 0);
});

test('short identifiers cause no false denies; an invalid pii regex denies with the reason (fail closed)', () => {
  const d = egress.decideEgress({ tool: 'WebSearch', agentType: RESEARCHER, hasAgentId: true, flow: { running: true }, toolInput: { query: 'a and c together' }, project: { piiPatterns: [], identifiers: egress.projectIdentifiers({ main: 'C:\\a', worktrees: ['/c'] }) } });
  assert.deepStrictEqual(d, { allow: true });
  const bad = egress.decideEgress({ tool: 'WebSearch', agentType: RESEARCHER, hasAgentId: true, flow: { running: true }, toolInput: { query: 'clean' }, project: { piiPatterns: ['('], identifiers: [] } });
  assert.strictEqual(bad.allow, false);
  assert.match(bad.reason, /regex inválida: \(/);
  const chk = egress.checkQuery({ texts: ['x'], piiPatterns: ['['] });
  assert.strictEqual(chk.reason, 'pii-pattern-invalid');
});

test('regression guard: the hook never looks at Bash or PowerShell (guard corpus unchanged)', () => {
  const { repo } = setup();
  const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'guard', f), 'utf8'));
  for (const c of [...load('must-allow.json'), ...load('must-block.json')]) {
    const tool = c.shell === 'powershell' ? 'PowerShell' : 'Bash';
    assert.strictEqual(run(repo, tool, { command: c.command }, 'pignolo:implementer').exit, 0, c.command);
  }
});
