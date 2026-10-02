// Agent cards of pignolo-ui (spec §7.4, §10): exact frontmatter, tool lists and the contract text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, makeTempDir, writeTree } from './helpers.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { extractJsonBlock, validateFindings } from '../lib/auditor-output.mjs';
import { judgmentIds, loadNorms } from '../lib/norms.mjs';
import { lintPlugin } from './support/lint-plugin.mjs';

const read = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');

function frontmatterOf(text) {
  const lines = text.split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    assert.ok(m, `frontmatter line not key: value -> ${line}`);
    fm[m[1]] = m[2];
  }
  return { fm, body: lines.slice(end + 1).join('\n') };
}

const EXPECTED = {
  'ui-option': {
    name: 'ui-option',
    description: '"Generates one static HTML option (mockup or style tile) along an assigned axis. No repo access."',
    tools: 'Write',
    model: 'sonnet',
    effort: 'medium',
    omitClaudeMd: 'true',
  },
  'ui-auditor': {
    name: 'ui-auditor',
    description: '"Audits one web screen from a prepared run folder against DESIGN.md, the rule catalog and written criteria; every finding cites evidence."',
    tools: 'Read, Grep, Glob',
    model: 'opus',
    effort: 'medium',
  },
};

const catalogIds = new Set(loadCatalog().rules.map((r) => r.id));
const citedIds = (text) => [...new Set(text.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) || [])].filter((id) => !/^J-/.test(id));

test('the frontmatter of each card is exactly the specified one', () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const { fm } = frontmatterOf(read(name));
    assert.deepEqual(fm, expected, name);
  }
});

test('tool lists: ui-option only Write; ui-auditor read-only', () => {
  const opt = frontmatterOf(read('ui-option')).fm.tools.split(',').map((t) => t.trim());
  assert.deepEqual(opt, ['Write']);
  for (const bad of ['Read', 'Bash', 'Grep', 'Agent']) assert.ok(!opt.includes(bad));
  assert.ok(!opt.some((t) => t.startsWith('mcp__')));
  const aud = frontmatterOf(read('ui-auditor')).fm.tools.split(',').map((t) => t.trim());
  for (const bad of ['Bash', 'Write', 'Edit', 'Agent']) assert.ok(!aud.includes(bad));
  assert.ok(!aud.some((t) => t.startsWith('mcp__')));
});

test('ui-option: patterns, rules, output contract, size, no absolute paths, only real catalog ids', () => {
  const { body } = frontmatterOf(read('ui-option'));
  const low = body.toLowerCase();
  assert.ok(body.length <= 7000, `${body.length} characters`);
  for (const needle of ['cream or off-white', 'italic', 'numbered', 'monospace', 'pill',
    'sample values', 'data-sample', 'never use real people', 'no personal data', 'never overwrite', 'data-primary="true"', '--color-primary',
    '--font-body', '--radius-sm', '<meta charset="utf-8">', 'datos de muestra', 'done:']) {
    assert.ok(low.includes(needle.toLowerCase()), `missing: ${needle}`);
  }
  assert.ok(!body.includes('‹'), 'the bare placeholder is gone: sample values are labelled with data-sample');
  // a drive letter on its own (C:\ or D:/), never the "s:/" of an https:// URL
  assert.doesNotMatch(body, /(?<![A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\//);
  const ids = citedIds(body);
  assert.ok(ids.length >= 4);
  for (const id of ids) assert.ok(catalogIds.has(id), `${id} is not in the catalog`);
});

test('ui-option: the three form rules and the fonts rule of the hito 4c (R-5, R-19) are in the card, and Write stays the only tool', () => {
  const { fm, body } = frontmatterOf(read('ui-option'));
  assert.equal(fm.tools.trim(), 'Write');
  for (const needle of ['every non-empty element is closed', 'in quotes', 'never use `{{`', 'never `}}` in text or attributes', '`<button>`, `<input>`, `<select>` or `<textarea>` inside an `<a>`',
    'x-dc', 'destination: canvas', 'destination: local', 'fonts.googleapis.com/css2', 'fonts.gstatic.com', 'display=swap']) {
    assert.ok(body.toLowerCase().includes(needle.toLowerCase()), `missing: ${needle}`);
  }
  assert.ok(!/no external fonts/i.test(body), 'the old blanket ban on fonts is now conditioned by the destination');
});

test('ui-auditor: phases, output keys, rules, size, real catalog ids', () => {
  const { body } = frontmatterOf(read('ui-auditor'));
  assert.ok(body.length <= 7000, `${body.length} characters`);
  for (const needle of ['Preparation', 'Render', 'Interaction', 'Script', 'Judgment', 'run.json', 'norms.md',
    '"id"', '"severity"', '"scope"', '"plain"', '"evidence"', '"why"', 'notVerified', 'independent',
    'never `bloquea` without script or browser evidence', 'no self-grade', 'notVerified']) {
    assert.ok(body.toLowerCase().includes(needle.toLowerCase()), `missing: ${needle}`);
  }
  for (const id of citedIds(body)) assert.ok(catalogIds.has(id), `${id} is not in the catalog`);
});

test('the JSON example of ui-auditor passes validateFindings against a synthetic run (card and validator agree)', () => {
  const { body } = frontmatterOf(read('ui-auditor'));
  const output = extractJsonBlock(body);
  assert.ok(output, 'the card has a json block');
  const project = makeTempDir();
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  const fingerprint = output.findings[0].evidence.fingerprint;
  writeTree(run, { 'ui-check.json': JSON.stringify({ entries: [{ id: output.findings[0].id, status: 'fail', severity: 'alto', scope: 'new', fingerprint }] }) });
  const res = validateFindings({ output, run, project, catalog: loadCatalog(), judgmentIds: judgmentIds(loadNorms({}).base) });
  assert.deepEqual(res, { ok: true, problems: [] });
});

test('the plugin linter stays green with the cards', () => {
  assert.deepEqual(lintPlugin(PLUGIN_ROOT), []);
});
