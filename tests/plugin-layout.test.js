'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// PIGNOLO_LAYOUT_PLUGIN apunta a otro árbol del plugin (tests/ui-arms.test.js corre este archivo contra el brazo U3).
const PLUGIN = process.env.PIGNOLO_LAYOUT_PLUGIN || path.join(ROOT, 'plugins', 'pignolo');
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
  assert.strictEqual(p.version, '1.1.0');
  assert.strictEqual(p.license, 'MIT');
});

test('marketplace.json lista un solo plugin: pignolo', () => {
  const m = readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json'));
  assert.strictEqual(m.plugins.length, 1);
  assert.strictEqual(m.plugins[0].name, 'pignolo');
  assert.strictEqual(m.plugins[0].source, './plugins/pignolo');
});

// Decisión del autor (2026-10-25): un único hook de SessionStart que solo inyecta contexto (un recordatorio de qué skill usar).
// No bloquea, no escribe nada y no corre otra cosa que `cat` sobre un JSON ya armado.
test('el único hook es un SessionStart que imprime session-context.json', () => {
  assert.ok(!exists(path.join(PLUGIN, 'hooks.json')));
  assert.ok(!exists(path.join(PLUGIN, '.claude-plugin', 'hooks.json')));
  const h = readJson(path.join(PLUGIN, 'hooks', 'hooks.json'));
  assert.deepStrictEqual(Object.keys(h.hooks), ['SessionStart']);
  const entries = h.hooks.SessionStart;
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].hooks.length, 1);
  const cmd = entries[0].hooks[0];
  assert.strictEqual(cmd.type, 'command');
  assert.strictEqual(cmd.command, 'cat "${CLAUDE_PLUGIN_ROOT}/hooks/session-context.json"');
  assert.ok(!/exit\s+2|\bdeny\b|\bblock\b/i.test(JSON.stringify(h)), 'el hook no bloquea');
});

test('session-context.json sale de session-context.md y nombra cada skill', () => {
  const md = fs.readFileSync(path.join(PLUGIN, 'hooks', 'session-context.md'), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  const j = readJson(path.join(PLUGIN, 'hooks', 'session-context.json'));
  assert.strictEqual(j.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.strictEqual(j.hookSpecificOutput.additionalContext, `<IMPORTANT>\n${md}\n</IMPORTANT>`, 'corré node plugins/pignolo/hooks/build-context.mjs');
  for (const s of ['start', 'work', 'ui', 'ui-audit', 'validate', 'session']) assert.ok(md.includes('/pignolo:' + s), s);
  assert.ok(!md.includes('—'), 'sin em dashes');
  assert.ok(md.length < 1800, 'el recordatorio se queda corto: cuesta tokens en cada sesión');
});

test('no existe plugins/pignolo-panel', () => {
  assert.ok(!exists(path.join(ROOT, 'plugins', 'pignolo-panel')));
});

test('no existe plugins/pignolo-ui', () => {
  assert.ok(!exists(path.join(ROOT, 'plugins', 'pignolo-ui')));
});

test('las carpetas de skills son exactamente las seis', () => {
  const dirs = fs.readdirSync(path.join(PLUGIN, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepStrictEqual(dirs, SKILLS);
  assert.ok(!dirs.includes('code-review'));
});

// ui lleva además la sección de armado de pantallas (tres pasos): su tope sube a 850; el resto sigue en 750.
// work pasó de 698 a unas 910 palabras al sumar ser la entrada de todo cambio de varios pasos, los pasos de la pantalla siguiente (Handoffs) y el paralelismo (decisiones del autor, 2026-10-25).
const WORD_CAP = { ui: 850, work: 920 };

test('cada SKILL.md: name igual a la carpeta, description 1..1536, cuerpo dentro del tope de palabras (750; ui 850; work 920)', () => {
  for (const name of SKILLS) {
    const { data, body } = frontmatter(path.join(PLUGIN, 'skills', name, 'SKILL.md'));
    assert.strictEqual(data.name, name);
    assert.ok(data.description && data.description.length >= 1 && data.description.length <= 1536,
      `${name}: description fuera de rango`);
    const words = body.split(/\s+/).filter(Boolean).length;
    const cap = WORD_CAP[name] || 750;
    assert.ok(words <= cap, `${name}: ${words} palabras (tope ${cap})`);
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

test('cada description es YAML válido: entre comillas o sin ": " crudo', () => {
  for (const name of SKILLS) {
    const raw = fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const m = raw.match(/^description:[ \t]*(.*)$/m);
    assert.ok(m, `${name}: falta description`);
    const v = m[1].trim();
    const quoted = v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")));
    assert.ok(quoted || !v.includes(': '), `${name}: description sin comillas con ": " (YAML estricto la rechaza)`);
  }
});

const AGENTS = ['review-security', 'review-database', 'review-code', 'review-tests', 'review-hygiene', 'review-docs', 'ui-option', 'ui-auditor'];

test('los ocho agentes existen, el name coincide con el archivo y todo effort es válido', () => {
  assert.ok(exists(agentsDir), 'falta la carpeta agents');
  assert.deepStrictEqual(agentFiles.map((f) => f.replace(/\.md$/, '')).sort(), [...AGENTS].sort());
  for (const name of AGENTS) {
    const file = path.join(agentsDir, `${name}.md`);
    assert.ok(exists(file), `falta el agente ${name}`);
    const { data } = frontmatter(file);
    assert.strictEqual(data.name, name, `${name}: el name no coincide con el archivo`);
    assert.match(data.effort, /^(low|medium|high|xhigh|max)$/, `${name}: effort`);
  }
});

test('los revisores son exactamente los seis review-*.md', () => {
  const reviewers = agentFiles.filter((f) => /^review-.*\.md$/.test(f));
  assert.strictEqual(reviewers.length, 6);
  const expected = ['security', 'database', 'code', 'tests', 'hygiene', 'docs'].map((i) => `review-${i}.md`);
  assert.deepStrictEqual([...reviewers].sort(), expected.sort());
});

test('cada references/ y templates/ que nombra un SKILL.md existe en esa skill', () => {
  let seen = 0;
  for (const name of SKILLS) {
    const dir = path.join(PLUGIN, 'skills', name);
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    for (const m of text.matchAll(/\b((?:references|templates)\/[A-Za-z0-9._-]+)/g)) {
      seen += 1;
      assert.ok(exists(path.join(dir, m[1])), `${name}: no existe ${m[1]}`);
    }
  }
  assert.ok(seen >= 10, `se esperaban varias referencias, hubo ${seen}`);
});

test('el plugin instalado lleva su LICENSE (copia de la raíz) y su CREDITS al día', () => {
  const lic = path.join(PLUGIN, 'LICENSE');
  assert.ok(exists(lic), 'falta plugins/pignolo/LICENSE');
  assert.strictEqual(fs.readFileSync(lic, 'utf8').replace(/\r\n/g, '\n'),
    fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'));
  const credits = fs.readFileSync(path.join(PLUGIN, 'CREDITS.md'), 'utf8');
  assert.ok(!/`plan` skill/.test(credits), 'CREDITS nombra una skill plan que ya no existe');
  assert.match(credits, /`start`/);
});

test('plugin.json: la descripción nombra la parte de interfaz y no lleva la palabra clave tdd', () => {
  const p = readJson(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));
  assert.match(p.description, /interfaces web/i);
  assert.ok(!p.keywords.includes('tdd'));
  assert.ok(p.keywords.length > 0);
});
