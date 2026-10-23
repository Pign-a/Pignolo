'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'pignolo');
const SKILLS = ['session', 'start', 'ui', 'ui-audit', 'validate', 'work'];

const exists = (p) => fs.existsSync(p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Frontmatter simple: claves `clave: valor` entre dos líneas `---`.
function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `${file}: falta el frontmatter`);
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { data, body: m[2] };
}

test('plugin.json: name, version y licencia', () => {
  const p = readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.strictEqual(p.name, 'pignolo');
  assert.strictEqual(p.version, '1.0.0');
  assert.strictEqual(p.license, 'MIT');
});

test('marketplace.json lista un solo plugin: pignolo', () => {
  const m = readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json'));
  assert.strictEqual(m.plugins.length, 1);
  assert.strictEqual(m.plugins[0].name, 'pignolo');
  assert.strictEqual(m.plugins[0].source, './plugins/pignolo');
});

test('no hay hooks ni hooks.json', () => {
  assert.ok(!exists(path.join(PLUGIN, 'hooks')));
  assert.ok(!exists(path.join(PLUGIN, 'hooks.json')));
  assert.ok(!exists(path.join(PLUGIN, '.claude-plugin', 'hooks.json')));
});

test('no existe plugins/pignolo-panel', () => {
  assert.ok(!exists(path.join(ROOT, 'plugins', 'pignolo-panel')));
});

test('no existe plugins/pignolo-ui', { skip: 'se activa en T7' }, () => {
  assert.ok(!exists(path.join(ROOT, 'plugins', 'pignolo-ui')));
});

test('las carpetas de skills son exactamente las seis', () => {
  const dirs = fs.readdirSync(path.join(PLUGIN, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepStrictEqual(dirs, SKILLS);
  assert.ok(!dirs.includes('code-review'));
});

test('cada SKILL.md: name igual a la carpeta, description 1..1536, cuerpo <= 750 palabras', () => {
  for (const name of SKILLS) {
    const { data, body } = frontmatter(path.join(PLUGIN, 'skills', name, 'SKILL.md'));
    assert.strictEqual(data.name, name);
    assert.ok(data.description && data.description.length >= 1 && data.description.length <= 1536,
      `${name}: description fuera de rango`);
    const words = body.split(/\s+/).filter(Boolean).length;
    assert.ok(words <= 750, `${name}: ${words} palabras`);
  }
});

const agentsDir = path.join(PLUGIN, 'agents');
const agentFiles = exists(agentsDir)
  ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')) : [];

test('agentes: frontmatter completo y sin claves prohibidas', () => {
  for (const f of agentFiles) {
    const { data } = frontmatter(path.join(agentsDir, f));
    for (const k of ['name', 'description', 'model', 'effort']) {
      assert.ok(data[k], `${f}: falta ${k}`);
    }
    assert.match(data.model, /^(haiku|sonnet|opus)$/, `${f}: model`);
    for (const k of ['hooks', 'permissionMode', 'mcpServers']) {
      assert.ok(!(k in data), `${f}: clave prohibida ${k}`);
    }
  }
});

test('los agents/review-*.md solo leen: tools dentro de Read, Grep, Glob, Bash', () => {
  const reviewers = agentFiles.filter((f) => /^review-.*\.md$/.test(f));
  for (const f of reviewers) {
    const { data } = frontmatter(path.join(agentsDir, f));
    assert.ok(data.tools, `${f}: falta tools`);
    const tools = data.tools.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tools) {
      assert.ok(['Read', 'Grep', 'Glob', 'Bash'].includes(t), `${f}: tool no permitida ${t}`);
    }
  }
});
