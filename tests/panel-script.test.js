'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const { ensureIgnored, PIGNOLO_IGNORED } = require(path.join(PLUGIN_ROOT, 'lib', 'pignolo-gitignore.js'));

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'panel.js');
const run = (dir, args) => spawnSync(process.execPath, [CLI, ...args, '--cwd', dir], { encoding: 'utf8', timeout: 60000 });
const project = () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
};

test('panel script: show --text prints plan, open decisions and next in plain text', () => {
  const dir = project();
  const q = path.join(dir, 'q.txt');
  fs.writeFileSync(q, '¿Usamos la plantilla corta?\n');
  const a = run(dir, ['ask', '--question-file', q, '--option', 'sí', '--pros', 'una página', '--option', 'no', '--recommended', 'sí']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(JSON.parse(a.stdout).id, 'Q-1');
  assert.ok(panel.read(dir).state.decisions[0].options[0].pros_contras === 'una página');
  const r = run(dir, ['refresh']);
  assert.equal(r.status, 0, r.stderr);
  const t = run(dir, ['show', '--text']);
  assert.equal(t.status, 0);
  assert.match(t.stdout, /Te toca \(1\)/);
  assert.match(t.stdout, /Q-1: ¿Usamos la plantilla corta\? \(recomendada: sí\)/);
  assert.match(t.stdout, /Siguiente: /);
  // sin nada que decir no imprime nada
  const empty = project();
  assert.equal(run(empty, ['show', '--text']).stdout, '');
  assert.equal(run(dir, ['nada']).status, 2);
});

test('panel script: a failing registry exits 0 when called from another command', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.pignolo', 'tmp'), { recursive: true });
  fs.writeFileSync(panel.lockOf(dir), '1\n'); // lock tomado: el registro no puede escribir
  const q = path.join(dir, 'q.txt');
  fs.writeFileSync(q, 'x');
  const r = run(dir, ['ask', '--question-file', q, '--option', 'a']);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /el registro falló/);
  assert.equal(JSON.parse(r.stdout).ok, false);
});

test('gitignore: panel-state.json is ignored by the pignolo ignore block', () => {
  const dir = makeRepo();
  ensureIgnored(dir, PIGNOLO_IGNORED);
  assert.ok(PIGNOLO_IGNORED.includes('panel-state.json'));
  fs.writeFileSync(path.join(dir, '.pignolo', 'panel-state.json'), '{}');
  assert.equal(git(['check-ignore', '.pignolo/panel-state.json'], dir), '.pignolo/panel-state.json');
});

test('panel script: ask refuses a free-text question given inline and a missing file', () => {
  const dir = project();
  assert.equal(run(dir, ['ask', '--question-file', path.join(PLUGIN_ROOT, 'no-existe-xyz.txt')]).status, 2);
});
