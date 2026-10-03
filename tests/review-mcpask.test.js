'use strict';
// Hallazgos de la revisión final de fix/reglas-mcp-setup (2026-10-03). Tests que fallan hasta el arreglo; no editarlos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.js');
const ask = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions.ask.filter((r) => r.startsWith('mcp__'));
const globRegex = (rule) => new RegExp('^' + rule.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const caught = (tool) => ask.filter((r) => globRegex(r).test(tool));

// RM-01 (importante). templates/permissions.json: `mcp__*__*deploy*` y `mcp__*__*publish*` atrapan lecturas
// (list_deployments, get_deployment, get_publishable_keys). Como `ask` le gana a `allow`, es el mismo error que
// `*navigate*`: el usuario es preguntado siempre por algo que no cambia nada.
test('RM-01: las reglas MCP "ask" nuevas no atrapan herramientas de solo lectura', () => {
  for (const t of [
    'mcp__claude_ai_Vercel__list_deployments', 'mcp__claude_ai_Vercel__get_deployment', 'mcp__claude_ai_Vercel__list_deployment_files',
    'mcp__claude_ai_Vercel__get_deployment_file_contents', 'mcp__claude_ai_Supabase__get_publishable_keys',
  ]) {
    assert.deepEqual(caught(t), [], t);
  }
});

// RM-02 (importante). scripts/setup.js retired: si un archivo no se puede escribir, writeFileSync lanza a mitad del bucle;
// los archivos anteriores ya quedaron cambiados (con respaldo) pero el JSON no sale, así que la skill no sabe qué se
// escribió ni dónde está el respaldo. Debe seguir y avisar por archivo, como con un settings inválido.
test('RM-02: retired --apply con un settings sin permiso de escritura informa lo aplicado y el error por archivo', () => {
  const home = makeTempDir('pignolo-rm-home-');
  const cwd = makeTempDir('pignolo-rm-cwd-');
  const cfg = path.join(home, '.claude');
  fs.mkdirSync(cfg, { recursive: true });
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  const proj = path.join(cwd, '.claude', 'settings.json');
  const user = path.join(cfg, 'settings.json');
  const body = JSON.stringify({ permissions: { ask: ['mcp__*__*navigate*'] } });
  fs.writeFileSync(proj, body);
  fs.writeFileSync(user, body);
  fs.chmodSync(user, 0o444);
  try {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg, HOME: home, USERPROFILE: home, PIGNOLO_HOME: path.join(home, '.pignolo') };
    const r = spawnSync(process.execPath, [SETUP, 'retired', '--apply'], { env, cwd, encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 0, r.stderr);
    const files = JSON.parse(r.stdout).files;
    const p = files.find((f) => f.file === proj);
    const u = files.find((f) => f.file === user);
    assert.ok(p.applied && p.backup && fs.existsSync(p.backup), 'el archivo escrito se informa con su respaldo');
    assert.ok(!u.applied && u.error, 'el que no se pudo escribir se informa con error');
  } finally {
    fs.chmodSync(user, 0o666);
  }
});
