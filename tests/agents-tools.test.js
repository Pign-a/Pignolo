'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES, VOCABULARY } = require('../plugins/pignolo/lib/roles');

const AGENTS_DIR = path.join(__dirname, '..', 'plugins', 'pignolo', 'agents');
const PREFIX = 'Dispatched only by pignolo skills with a task-card; never use directly.';

// YAML-lite: `clave: valor` y listas separadas por coma.
function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) return null;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: raw.slice(m[0].length) };
}

for (const role of Object.keys(ROLES)) {
  test(`agent ${role}`, () => {
    const spec = ROLES[role];
    const buf = fs.readFileSync(path.join(AGENTS_DIR, `${role}.md`));
    assert.notDeepStrictEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM');
    const raw = buf.toString('utf8');
    assert.ok(!raw.includes('\r'), 'CRLF');
    const parsed = parseFrontmatter(raw);
    assert.ok(parsed, 'frontmatter no parsea');
    const { fm, body } = parsed;
    assert.strictEqual(fm.name, role);
    assert.ok(fm.description);
    const tools = fm.tools.split(',').map((t) => t.trim()).filter(Boolean);
    assert.deepStrictEqual([...tools].sort(), [...spec.tools].sort());
    assert.ok(!tools.includes('Agent'));
    for (const k of ['memory', 'hooks', 'mcpServers', 'permissionMode']) assert.ok(!(k in fm), k);
    assert.strictEqual(fm.effort, spec.effort);
    assert.strictEqual(fm.model, spec.models.balanced);
    for (const word of VOCABULARY[spec.vocabulary]) assert.ok(body.includes(word), word);
    assert.strictEqual('omitClaudeMd' in fm, Boolean(spec.omitClaudeMd));
    const d = fm.description;
    assert.ok(d.length <= 200, `description ${d.length} > 200`);
    assert.ok(d.startsWith(PREFIX));
    assert.ok(!d.slice(PREFIX.length).includes(':'), 'otro ":" en description');
    assert.ok(!/^["']/.test(d));
  });
}

test('no stray agents', () => {
  const files = fs.existsSync(AGENTS_DIR) ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')) : [];
  for (const f of files) assert.ok(ROLES[f.slice(0, -3)], `agente fuera de ROLES: ${f}`);
});

test('plan-auditor has Write (D-5-1), in roles.js and in its frontmatter', () => {
  const want = ['Read', 'Grep', 'Glob', 'Bash', 'Write'].sort();
  assert.deepStrictEqual([...ROLES['plan-auditor'].tools].sort(), want);
  const fm = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, 'plan-auditor.md'), 'utf8')).fm;
  assert.deepStrictEqual(fm.tools.split(',').map((t) => t.trim()).sort(), want);
});
