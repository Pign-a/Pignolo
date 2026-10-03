'use strict';
// Revisión final del asistente de inicio (RW). Cada test falla sobre feat/asistente-inicio y describe el hallazgo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT } = require('./helpers');

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.js');

// RW-01: el perfil de modelos es global (PIGNOLO_HOME/config.json). El asistente siempre marca `balanced` como recomendado y la
// skill aplica `setup.js config --profile <elegido>`: quien ya eligió `economy` (o `max`) con /pignolo:setup y pasa el asistente
// con lo marcado en otro proyecto pierde su perfil en TODOS los proyectos. setup recomienda el perfil vigente; el asistente debe igual.
test('RW-01 wizard-detect: the recommended profile is the one already configured, not always balanced', () => {
  const home = makeTempDir('pignolo-home-rw01-');
  const env = { ...process.env, PIGNOLO_HOME: home };
  const cfg = spawnSync(process.execPath, [SETUP, 'config', '--profile', 'economy'], { env, encoding: 'utf8' });
  assert.equal(cfg.status, 0, cfg.stderr);
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }));
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'base'], repo);
  const r = spawnSync(process.execPath, [INIT, 'wizard-detect', '--cwd', repo], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  const rec = d.profiles.filter((p) => p.recommended).map((p) => p.id);
  assert.deepEqual(rec, ['economy'], 'el asistente preselecciona un perfil distinto del vigente y la skill lo aplicaría a todos los proyectos');
});
