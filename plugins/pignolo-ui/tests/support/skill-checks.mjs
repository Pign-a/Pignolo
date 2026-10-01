// Helpers of the skill tests (hito 4b): what a SKILL.md or a reference/*.md calls must exist.
//
// readSkill(name) -> { frontmatter, body, text }      readReference(name) -> string
// scriptCalls(text) -> [{ script, sub }]              assertScriptsExist(calls)
// referencedFiles(text) -> string[]                   assertNoVariables(text)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PLUGIN_ROOT } from '../helpers.mjs';

export function readSkill(name) {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
  const lines = text.split(/\r?\n/);
  const end = lines.indexOf('---', 1);
  const frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m) frontmatter[m[1]] = m[2];
  }
  return { frontmatter, body: lines.slice(end + 1).join('\n'), text };
}

export const readReference = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'reference', name), 'utf8');

// node "${CLAUDE_PLUGIN_ROOT}/scripts/<x>.mjs" <sub>   (SKILL.md)
// node "<root>/scripts/<x>.mjs" <sub>                  (reference/*.md)
export function scriptCalls(text) {
  const out = [];
  const re = /node\s+"(?:\$\{CLAUDE_PLUGIN_ROOT\}|<root>)\/scripts\/([\w-]+)\.mjs"(?:\s+([a-z][\w-]*))?/g;
  for (const m of text.matchAll(re)) out.push({ script: `${m[1]}.mjs`, sub: m[2] ?? null });
  return out;
}

// Subcommands each multi-command script accepts (anything else is a usage error at run time).
export const SUBCOMMANDS = {
  'run.mjs': ['env', 'init', 'config', 'present', 'norms', 'check', 'leak-values', 'git-state', 'options-check', 'discard', 'auditor-check', 'menu', 'report-skeleton', 'report-line', 'verdict', 'compare-html'],
  'design-md.mjs': ['validate', 'extract', 'patch'],
  'files.mjs': ['save', 'verify', 'restore'],
  'approve.mjs': ['save', 'record', 'verify'],
  'compare.mjs': ['fingerprint', 'distance', 'options', 'approved'],
  'browser.mjs': ['capture', 'measure', 'dom'],
};

export function assertScriptsExist(calls) {
  assert.ok(calls.length > 0, 'no script calls found');
  for (const { script, sub } of calls) {
    assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'scripts', script)), `script ${script} does not exist`);
    if (SUBCOMMANDS[script]) assert.ok(SUBCOMMANDS[script].includes(sub), `${script} has no subcommand ${sub}`);
  }
}

export function referencedFiles(text) {
  return [...new Set([...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/reference\/([\w.-]+)/g)].map((m) => m[1]))];
}

export function assertNoVariables(text) {
  assert.ok(!text.includes('${'), 'a reference file must not contain ${...}: variables are only substituted in SKILL.md');
}

export const indexOrder = (text, needles) => {
  let from = 0;
  for (const n of needles) {
    const i = text.indexOf(n, from);
    assert.ok(i >= 0, `missing or out of order: ${n}`);
    from = i + n.length;
  }
};
