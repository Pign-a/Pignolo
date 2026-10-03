'use strict';
// Protects: el aviso de volver a correr /pignolo:init cuando un proyecto inicializado en blanco ya tiene código (plan 2026-10-02, Tarea 3).
// Breaks if: el aviso sale sin la marca, con project.md, con el repo aún en blanco, o no llega a `next` ni a SessionStart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git, PLUGIN_ROOT } = require('./helpers');
const { deriveNext } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));
const ss = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'session-start.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const NEXT = path.join(PLUGIN_ROOT, 'scripts', 'next.js');
const write = (cwd, rel, text = 'x\n') => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

// Un repo en blanco al que init ya le aplicó el camino en blanco (deja la marca).
function initializedBlank() {
  const repo = makeTempDir('pignolo-nxblank-');
  git(['init', '-q', '-b', 'main'], repo);
  const home = makeTempDir('pignolo-nxhome-');
  const planFile = path.join(makeTempDir('pignolo-nxplan-'), 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ v: 1, approved: ['ignores', 'gitattributes', 'skeleton'], answers: {}, proposal: {} }));
  const r = spawnSync(process.execPath, [INIT, 'apply', '--plan', planFile, '--cwd', repo], { encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: home, CLAUDE_CONFIG_DIR: makeTempDir('pignolo-nxcfg-') }, timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'tmp', 'init-blank.json')));
  return { repo, home };
}
const next = (repo, home) => deriveNext({ cwd: repo, env: { PIGNOLO_HOME: home } });

test('con la marca y un manifiesto nuevo: init-blank-ready en una línea que pide volver a correr init', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'package.json', '{}');
  const n = next(repo, home);
  assert.equal(n.kind, 'init-blank-ready');
  assert.match(n.text, /\/pignolo:init/);
  assert.doesNotMatch(n.text, /\n/);
});

test('con la marca y código sin manifiesto también avisa', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'main.py', 'print(1)\n');
  assert.equal(next(repo, home).kind, 'init-blank-ready');
});

test('con la marca pero el repo sigue en blanco: nada', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'README.md');
  assert.equal(next(repo, home).kind, 'nothing');
});

test('con la marca, un manifiesto y project.md: nada (init ya corrió completo)', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'package.json', '{}');
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  assert.equal(next(repo, home).kind, 'nothing');
});

test('sin la marca y con un manifiesto: nada (un repo común no recibe el aviso)', () => {
  const repo = makeTempDir('pignolo-nxplain-');
  git(['init', '-q', '-b', 'main'], repo);
  write(repo, 'package.json', '{}');
  assert.equal(next(repo, makeTempDir('pignolo-nxhome-')).kind, 'nothing');
});

test('un plan abierto gana al aviso', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'package.json', '{}');
  assert.ok(ps.newPlan({ main: repo, plan: 'p1', request: 'pedido', spec: 's' }).ok);
  assert.match(next(repo, home).kind, /^plan-/);
});

test('next.js --text imprime la línea', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'go.mod', 'module x\n');
  const r = spawnSync(process.execPath, [NEXT, '--cwd', repo, '--text'], { encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: home }, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^El proyecto se inicializó en blanco .*\/pignolo:init/);
});

test('SessionStart lleva la línea al contexto', () => {
  const { repo, home } = initializedBlank();
  write(repo, 'package.json', '{}');
  const r = ss.run({ source: 'startup', cwd: repo, session_id: 's' }, { env: { PIGNOLO_HOME: home, PIGNOLO_DISABLED: '' } });
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\/pignolo:init/);
});
