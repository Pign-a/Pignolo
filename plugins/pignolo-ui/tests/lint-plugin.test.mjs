import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, makeTempDir, writeTree } from './helpers.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';

const SKILL_OK = [
  '---',
  'name: audit',
  'description: "Audits one web screen and reports findings with evidence."',
  'disable-model-invocation: true',
  '---',
  '',
  'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/ui-check.mjs` and read [the criteria](reference/criteria.md).',
  'Escaped argument: \\$1.',
  '',
].join('\n');

const AGENT_OK = [
  '---',
  'name: ui-auditor',
  'description: "Audits one web screen from a prepared run folder."',
  'tools: Read, Grep, Glob',
  'model: opus',
  '---',
  '',
  'Body.',
  '',
].join('\n');

// A minimal plugin that passes every rule; each test adds one defect.
function makePlugin(extra = {}, manifest = {}) {
  const root = path.join(makeTempDir(), 'pignolo-ui');
  writeTree(root, {
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'pignolo-ui', version: '0.1.0', license: 'MIT', ...manifest }),
    'skills/audit/SKILL.md': SKILL_OK,
    'skills/audit/reference/criteria.md': 'Criteria.\n',
    'agents/ui-auditor.md': AGENT_OK,
    'lib/a.mjs': "import fs from 'node:fs';\nimport { b } from './b.mjs';\nexport const a = b + String(fs.sep);\n",
    'lib/b.mjs': 'export const b = 1;\n',
    'README.md': '# x\n',
    'LICENSE': 'MIT\n',
    ...extra,
  });
  return root;
}

function rules(root) {
  return lintPlugin(root).map((f) => f.rule);
}

test('the real plugin has no findings', () => {
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});

test('a minimal clean plugin has no findings', () => {
  assert.deepEqual(lintPlugin(makePlugin()), []);
});

test('manifest: name must match the folder and be kebab-case, version semver', () => {
  assert.deepEqual(rules(makePlugin({}, { name: 'other' })), ['manifest']);
  assert.deepEqual(rules(makePlugin({}, { version: 'v1' })), ['manifest']);
});

test('layout: no hooks, bin or unknown top-level entries; no hooks or mcpServers keys', () => {
  assert.deepEqual(rules(makePlugin({ 'hooks/hooks.json': '{}' })), ['layout']);
  assert.deepEqual(rules(makePlugin({ 'bin/tool': 'x\n' })), ['layout']);
  assert.deepEqual(rules(makePlugin({ 'notes.txt': 'x\n' })), ['layout']);
  assert.deepEqual(rules(makePlugin({}, { hooks: './h.json' })), ['layout']);
  assert.deepEqual(rules(makePlugin({}, { mcpServers: {} })), ['layout']);
});

test('no-binaries: NUL bytes, invalid UTF-8 and executable extensions', () => {
  const root = makePlugin();
  fs.writeFileSync(path.join(root, 'lib', 'blob.json'), Buffer.from([0x7b, 0x00, 0x7d]));
  assert.deepEqual(rules(root), ['no-binaries']);
  const root2 = makePlugin();
  fs.writeFileSync(path.join(root2, 'lib', 'latin1.json'), Buffer.from([0x22, 0xe9, 0x22]));
  assert.deepEqual(rules(root2), ['no-binaries']);
  assert.deepEqual(rules(makePlugin({ 'scripts/run.ps1': 'Write-Host x\n' })), ['no-binaries']);
});

test('no-agent-context-files: CLAUDE.md or AGENTS.md anywhere, any case', () => {
  assert.deepEqual(rules(makePlugin({ 'templates/claude.md': 'x\n' })), ['no-agent-context-files']);
  assert.deepEqual(rules(makePlugin({ 'tests/fixtures/AGENTS.md': 'x\n' })), ['no-agent-context-files']);
});

test('skill-frontmatter: name and quoted description; disable-model-invocation is optional', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('name: audit', 'name: Audit') })), ['skill-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('description: "Audits one web screen and reports findings with evidence."', 'description: Audits one screen') })), ['skill-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK.replace('disable-model-invocation: true\n', '') })), []); // lenguaje natural: ya no se exige
  assert.deepEqual(rules(makePlugin({ 'skills/new/reference.md': 'x\n' })), ['skill-frontmatter']);
});

test('skill-size: a SKILL.md above ~3k tokens', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'word '.repeat(2500) })), ['skill-size']);
});

test('dollar-digit and bang-command in skill and agent text', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'Use $1 here.\n' })), ['dollar-digit']);
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK + 'Cost: $2.\n' })), ['dollar-digit']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + 'Status: !`git status`\n' })), ['bang-command']);
});

test('home-claude-path: runtime files must not point into the user Claude folder', () => {
  const home = '~/' + '.claude/settings.json';
  assert.deepEqual(rules(makePlugin({ 'skills/audit/reference/criteria.md': `See ${home}\n` })), ['home-claude-path']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': `export const p = '${home}';\n` })), ['home-claude-path']);
});

test('md-links: relative links must exist and stay inside the plugin', () => {
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](reference/missing.md)\n' })), ['md-links']);
  const escaping = makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](../../../outside.md)\n' });
  fs.writeFileSync(path.join(escaping, '..', 'outside.md'), 'exists, but outside the plugin\n');
  assert.deepEqual(rules(escaping), ['md-links']);
  assert.deepEqual(rules(makePlugin({ 'skills/audit/SKILL.md': SKILL_OK + '[x](https://example.com) [y](#top)\n' })), []);
});

test('imports: node builtins or relative with extension and forward slashes', () => {
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import yaml from 'yaml';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { b } from './b';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { b } from '.\\\\b.mjs';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "export { b } from 'lodash/b.js';\n" })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': 'export const load = (p) => import(p);\n' })), ['imports']);
  assert.deepEqual(rules(makePlugin({ 'lib/c.mjs': "import { pathToFileURL } from 'node:url';\nexport const load = (p) => import(pathToFileURL(p).href);\n" })), []);
});

test('agent-frontmatter: name matches the file and description is quoted', () => {
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK.replace('name: ui-auditor', 'name: auditor') })), ['agent-frontmatter']);
  assert.deepEqual(rules(makePlugin({ 'agents/ui-auditor.md': AGENT_OK.replace('description: "Audits one web screen from a prepared run folder."', 'description: Audits') })), ['agent-frontmatter']);
});
