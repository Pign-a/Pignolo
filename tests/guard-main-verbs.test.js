'use strict';
// R6 (decisión del autor, 2026-10-03): un subagente no mueve main local con los verbos que equivalen a un merge:
// con HEAD en main `pull`, `rebase`, `cherry-pick`, `reset <x>`; desde otra rama `rebase <x> main`, `fetch . x:main`,
// `worktree add -B main`. Complementa a tests/review-guard-push.test.js (12 filas R6, que no se toca) con las
// formas con -C / cd / env -C, las envolturas, las mayúsculas y los falsos positivos en la rama de tarea.
// Protects: el hilo principal sigue pasando; commit, revert y am sobre main NO entran (decisión pendiente).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const { makeRepo, git } = require('./helpers');

const main = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: 30000, ...o });
const sub = (command, o = {}) => main(command, { subagent: true, agentType: 'pignolo:implementer', ...o });
const show = (v) => JSON.stringify({ decision: v.decision, rule: v.rule });
const M = makeRepo();
const F = makeRepo();
git(['checkout', '-q', '-b', 'feat'], F);
const MD = M.split(path.sep).join('/');

test('R6: -C, cd y env -C hacia main negados para el subagente, libres para el hilo principal', () => {
  for (const cmd of [`git -C "${MD}" rebase feat`, `git -C "${MD}" reset feat`, `git -C "${MD}" reset --keep feat`, `git -C "${MD}" fetch . feat:main`,
    `git -C "${MD}" pull`, `git -C "${MD}" pull --rebase origin feat`, `cd "${MD}" && git pull`, `cd "${MD}" && git reset --soft feat`,
    `cd "${MD}" && git rebase feat`, `env -C "${MD}" git pull`, `env -C "${MD}" git rebase feat`]) {
    assert.strictEqual(sub(cmd, { cwd: F }).rule, 'subagent-main', `${cmd} -> ${show(sub(cmd, { cwd: F }))}`);
    assert.strictEqual(main(cmd, { cwd: F }).decision, 'allow', `hilo principal: ${cmd}`);
  }
});

test('R6: con HEAD en main, reset y pull en sus formas (también el hilo principal sigue libre)', () => {
  for (const cmd of ['git pull', 'git pull --rebase', 'git pull origin feat', 'git reset x', 'git reset --soft x', 'git reset --keep x', 'git reset --mixed x', 'git cherry-pick x', 'git rebase x']) {
    assert.strictEqual(sub(cmd, { cwd: M }).rule, 'subagent-main', cmd);
    assert.strictEqual(main(cmd, { cwd: M }).decision, 'allow', `hilo principal: ${cmd}`);
  }
});

test('R6: formas que intentan saltar la guardia (llaves, bash -c, cmd /c, mayúsculas, rutas largas)', () => {
  for (const [cmd, cwd] of [['{ git pull; }', M], ['git {pull,}', M], ['bash -c "git pull"', M], ['sh -c "git cherry-pick feat"', M], ['cmd /c git pull', M],
    ['git fetch . feat:Main', F], ['git fetch . feat:refs/heads/MAIN', F], ['git fetch . feat:heads/main', F], ['git fetch . feat:ma*', F], ['git fetch origin "refs/heads/*:refs/heads/*"', F],
    ['git fetch . "$x"', F], ['git rebase feat MAIN', F], ['git worktree add -B Main w feat', F], ['git checkout MAIN && git pull', F], ['git pull origin feat:main', F]]) {
    assert.strictEqual(sub(cmd, { cwd }).rule, 'subagent-main', `${cmd} -> ${show(sub(cmd, { cwd }))}`);
  }
  // un alias por -c no se puede interpretar: ya se niega con su propia regla
  assert.strictEqual(sub('git -c alias.p=pull p', { cwd: M }).decision, 'block');
  // PowerShell
  for (const cmd of ['git pull', '& git pull', 'cmd /c "git pull"']) assert.strictEqual(sub(cmd, { cwd: M, shell: 'powershell' }).rule, 'subagent-main', cmd);
});

test('R6: sin falsos positivos en la rama de tarea ni en lo que no mueve la rama', () => {
  for (const [cmd, cwd] of [['git pull', F], ['git pull --rebase origin main', F], ['git rebase main', F], ['git cherry-pick x', F], ['git fetch origin', F], ['git fetch origin main', F],
    ['git fetch origin feat:feat', F], ['git fetch', M], ['git fetch origin', M], ['git worktree add -b task w main', F], ['git worktree add w main', F],
    ['git reset', M], ['git reset HEAD', M], ['git reset -- f', M], ['git commit -m x', M], ['git revert HEAD', M]]) {
    assert.strictEqual(sub(cmd, { cwd }).decision, 'allow', `${cmd} -> ${show(sub(cmd, { cwd }))}`);
  }
  // reset --hard conserva su regla, no pasa a subagent-main
  assert.strictEqual(sub('git reset --hard', { cwd: M }).rule, 'reset-hard');
});

test('R6: el handler real niega con agent_id y deja pasar al hilo principal', () => {
  const run = (extra) => guard.run({ tool_name: 'Bash', tool_input: { command: 'git pull' }, cwd: M, ...extra }, { env: {}, snapshot: () => null });
  const denied = run({ agent_id: 'a1', agent_type: 'pignolo:implementer' });
  assert.strictEqual(denied.exit, 2);
  assert.match(denied.stderr, /main/);
  assert.strictEqual(run({}).exit, 0);
});

test('R6: fuera de todo repo no hay rama que mover; un directorio que no existe sigue cerrado', () => {
  const { makeTempDir } = require('./helpers');
  const outside = makeTempDir('pignolo-outside-');
  assert.strictEqual(sub('git rebase x', { cwd: outside }).decision, 'allow');
  assert.strictEqual(sub('git pull', { cwd: outside }).decision, 'allow');
  assert.strictEqual(sub('git -C no-existe pull', { cwd: F }).rule, 'subagent-main');
  assert.strictEqual(sub('cd no-existe && git rebase x', { cwd: F }).rule, 'subagent-main');
});
