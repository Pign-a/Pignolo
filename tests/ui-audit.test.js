'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const SKILL_DIR = path.join(PLUGIN, 'skills', 'ui-audit');
const AUDIT = path.join(PLUGIN, 'ui-audit');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');

function split(file) {
  const m = read(file).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `${file}: sin frontmatter`);
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, raw: m[1], body: m[2] };
}

const skill = () => split(path.join(SKILL_DIR, 'SKILL.md'));
const agent = () => split(path.join(PLUGIN, 'agents', 'ui-auditor.md'));

// ---- skill ----
test('ui-audit: description en una línea, con las frases en español e inglés', () => {
  const { data, raw } = skill();
  const lines = raw.split('\n').filter((l) => l.startsWith('description:'));
  assert.strictEqual(lines.length, 1);
  const d = data.description.toLowerCase();
  assert.ok(d.includes('auditá la pantalla'), 'falta "auditá la pantalla"');
  assert.ok(d.includes('audit this page'), 'falta "audit this page"');
  assert.strictEqual(data.name, 'ui-audit');
});

test('ui-audit: SKILL.md dice no verificado, se pide aparte y no forma parte de validate', () => {
  const { body } = skill();
  assert.match(body, /no verificado/);
  assert.match(body, /\/pignolo:ui-audit/);
  assert.match(body, /not part of `validate`/);
  assert.match(body, /on its own/);
});

test('ui-audit: SKILL.md no menciona Artifact ni canvas, ni publica nada', () => {
  const all = read(SKILL_DIR, 'SKILL.md') + read(SKILL_DIR, 'references', 'prepare-run.md');
  assert.ok(!/artifact/i.test(all), 'menciona Artifact');
  assert.ok(!/canvas/i.test(all), 'menciona canvas');
  assert.ok(!/AskUserQuestion/.test(all), 'sigue pidiendo confirmación previa');
});

test('ui-audit: el gate de fundación es un aviso, no un bloqueo', () => {
  const { body } = skill();
  assert.match(body, /base norms/);
  assert.match(body, /Nothing blocks/i);
  assert.ok(!/PRODUCT\.md/.test(body), 'ya no existe PRODUCT.md');
  assert.ok(!/pignolo-ui/.test(body), 'quedó una referencia al plugin viejo');
});

test('ui-audit: cada comando de la skill usa un subcomando que existe', async () => {
  const text = read(SKILL_DIR, 'SKILL.md') + read(SKILL_DIR, 'references', 'prepare-run.md');
  const { SUBCOMMANDS } = await import(path.join(AUDIT, 'scripts', 'audit.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const used = [...text.matchAll(/ui-audit\/scripts\/audit\.mjs"?\s+([a-z-]+)/g)].map((m) => m[1]);
  assert.ok(used.length >= 5, 'pocos comandos audit.mjs en la skill');
  for (const sub of used) assert.ok(SUBCOMMANDS.includes(sub), `subcomando inexistente: ${sub}`);
  for (const gone of ['scripts/run.mjs', 'audit.mjs" context', '--mode', '--implements', 'extract']) {
    assert.ok(!text.includes(gone), `quedó ${gone}`);
  }
  for (const script of ['browser.mjs', 'design-md.mjs', 'report-check.mjs']) {
    assert.ok(fs.existsSync(path.join(AUDIT, 'scripts', script)));
  }
  assert.ok(fs.existsSync(path.join(SKILL_DIR, 'references', 'prepare-run.md')));
});

// ---- agente ----
test('ui-auditor: model opus, effort medium, solo lectura y una línea por valor', () => {
  const { data, raw } = agent();
  assert.strictEqual(data.name, 'ui-auditor');
  assert.strictEqual(data.model, 'opus');
  assert.strictEqual(data.effort, 'medium');
  const tools = data.tools.split(',').map((t) => t.trim()).sort();
  assert.deepStrictEqual(tools, ['Glob', 'Grep', 'Read']);
  for (const k of ['hooks', 'permissionMode', 'mcpServers']) assert.ok(!(k in data), k);
  assert.ok(raw.split('\n').every((l) => /^[A-Za-z][\w-]*:/.test(l)), 'valor en varias líneas');
});

test('ui-auditor: lee design.md y cita evidencia; sin restos del flujo viejo', () => {
  const { body } = agent();
  assert.match(body, /design\.md/);
  assert.match(body, /evidence/i);
  for (const gone of ['PRODUCT.md', 'brief.md', 'product.md', 'canvas', 'Verdict mode', 'verdict', 'foundation']) {
    assert.ok(!body.includes(gone), `quedó ${gone}`);
  }
});

// ---- design.md: la identidad guarda tokens que la auditoría lee ----
test('plantilla design.md: el validador de ui-audit la acepta (exit 0)', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-uiaudit-'));
  try {
    const file = path.join(PLUGIN, 'skills', 'ui', 'templates', 'design.md');
    const r = spawnSync(process.execPath, [
      path.join(AUDIT, 'scripts', 'design-md.mjs'), 'validate', '--file', file, '--project', project,
    ], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).status, 'valid');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('identity.md: la fase de identidad guarda paleta, tipografía, radios y espaciado como tokens YAML', () => {
  const t = read(PLUGIN, 'skills', 'ui', 'references', 'identity.md');
  assert.match(t, /templates\/design\.md/);
  for (const k of ['colors', 'typography', 'rounded', 'spacing']) assert.ok(t.includes(k), `falta ${k}`);
  assert.match(t, /frontmatter|front matter/i);
  assert.match(t, /ui-audit/);
});
