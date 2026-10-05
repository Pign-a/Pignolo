'use strict';
// Revisión opus de fix/panel-activo-y-rama (1a1df72). Copiar a tests/ del worktree y correr con node --test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir, git } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const { nextStep } = require(path.join(PLUGIN_ROOT, 'lib', 'next-steps.js'));

function repo(branch) {
  const dir = makeTempDir('pignolo-rev-');
  git(['init', '-q', '-b', branch], dir);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(['config', k, v], dir);
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(['add', 'a.txt', '.pignolo/project.md'], dir);
  git(['commit', '-q', '-m', 'inicial'], dir);
  return dir;
}

// Pasa hoy: deja probado el camino de origin/HEAD (ningún test del ejecutor lo cubre; quitar originHead de la lista no da rojo).
test('rev: origin/HEAD pointing to develop makes develop the principal branch', () => {
  const dir = repo('main');
  git(['checkout', '-q', '-b', 'develop'], dir);
  const bare = makeTempDir('pignolo-rev-bare-');
  git(['init', '-q', '--bare'], bare);
  git(['remote', 'add', 'origin', bare], dir);
  git(['push', '-q', 'origin', 'main', 'develop'], dir);
  git(['remote', 'set-head', 'origin', 'develop'], dir);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'dos\n');
  git(['add', 'b.txt'], dir);
  git(['commit', '-q', '-m', 'adelantado'], dir);
  const s = panel.refresh(dir);
  assert.equal(s.main && s.main.name, 'develop');
  assert.equal(s.next.prompt, 'hacé push de develop');
});

// FALLA hoy: sin origin/master (repo local o rama nunca subida) derive deja main = null y se pierde el nombre;
// la regla merge cae a 'main' fijo y sugiere "uní feat/x a main" en un repo que solo tiene master.
test('rev: in a master repo without upstream the merge suggestion names master, not main', () => {
  const dir = repo('master');
  const s = panel.refresh(dir);
  const r = nextStep({ busy: false, attention: [], decisions: [], cards: [], plan: null, main: s.main,
    branches: [{ name: 'feat/x', stage: 'review', review: 'APPROVE', suite: 'green', commits: 1, waiting: false, merged: false }] });
  assert.equal(r.main.prompt, 'uní feat/x a master');
});
