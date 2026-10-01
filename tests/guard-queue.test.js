'use strict';
// Reglas pignolo-queue, pignolo-worktree-tools y pignolo-protected-refs de la guardia (hito 7a, Task 8; R-13, R-21, R-22).
// Detección estructural: solo EJECUTAR el script desde un subagente se niega; leerlo, nunca.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const guard = require('../plugins/pignolo/hooks/handlers/guard');

const P = PLUGIN_ROOT.split(path.sep).join('/');
const PS_T = 30000;
const MODE = 'bypassPermissions';
const IMPL = 'pignolo:implementer';
const verdict = (command, o = {}) => evaluate(command, { shell: 'bash', mode: MODE, psTimeoutMs: PS_T, subagent: true, agentType: IMPL, ...o });
const rule = (command, o) => { const v = verdict(command, o); return v.decision === 'block' ? v.rule : v.decision; };

test('pignolo-queue: ejecutar queue.js lo hace solo el hilo principal y el integrator (con y sin cd, con y sin .js)', async (t) => {
  const run = `node "${P}/scripts/queue.js" run --plan p --task 01`;
  for (const who of ['pignolo:implementer', 'pignolo:fixer', 'pignolo:test-writer', 'pignolo:review-risk', 'pignolo:validator']) {
    await t.test(`${who} niega`, () => {
      assert.strictEqual(rule(run, { agentType: who }), 'pignolo-queue');
      assert.strictEqual(rule(`cd "/tmp/wt" && ${run}`, { agentType: who }), 'pignolo-queue', 'con cd');
      assert.strictEqual(rule(`node "${P}/scripts/queue" run --plan p --task 01`, { agentType: who }), 'pignolo-queue', 'sin .js');
    });
  }
  const v = verdict(run);
  assert.match(v.alternative, /la cola la opera el integrator; pedile la integración al hilo principal/);
  assert.strictEqual(rule(run, { subagent: false, agentType: null }), 'allow', 'hilo principal');
  assert.strictEqual(rule(run, { agentType: 'pignolo:integrator' }), 'allow', 'integrator');
  assert.strictEqual(rule(`node "${P}/scripts/queue.js" revert --plan p --commit abc`, { agentType: 'pignolo:integrator' }), 'allow');
  assert.strictEqual(rule(`node "${P}/scripts/queue.js" status --plan p`), 'allow', 'queue.js status: cualquiera');
  assert.strictEqual(rule('node "${CLAUDE_PLUGIN_ROOT}/scripts/queue.js" run --plan p --task 01'), 'pignolo-queue', 'por CLAUDE_PLUGIN_ROOT');
  assert.strictEqual(rule(`PLUGIN=x node "${P}/scripts/queue.js" run --plan p --task 01`), 'pignolo-queue', 'con variable de entorno delante');
  assert.strictEqual(rule(`node -e "require('${P}/scripts/queue.js')"`), 'pignolo-queue', 'node -e que lo carga');
  assert.strictEqual(rule(`node -r "${P}/scripts/queue.js" x.js`), 'pignolo-queue', 'node -r lo precarga y lo corre');
});

test('pignolo-queue / worktree-tools en PowerShell (R-22: solo lo que la guardia ya detecta)', () => {
  const ps = (c, o) => rule(c, { shell: 'powershell', ...o });
  assert.strictEqual(ps(`& node "${P}/scripts/queue.js" run --plan p --task 01`), 'pignolo-queue');
  assert.strictEqual(ps(`Set-Location C:\\tmp; node "${P}/scripts/worktree.js" create --plan p --nn 01 --slug a`), 'pignolo-worktree-tools');
  assert.strictEqual(ps(`& node "${P}/scripts/queue.js" run --plan p --task 01`, { agentType: 'pignolo:integrator' }), 'allow');
  assert.strictEqual(ps(`Get-Content "${P}/scripts/queue.js"`), 'allow', 'leer no es ejecutar');
  assert.strictEqual(ps(`Select-String -Path "${P}/scripts/worktree.js" -Pattern queue`), 'allow');
  assert.strictEqual(ps(`Get-Content "${P}/scripts/cleanup.js" | Select-Object -First 20`), 'allow');
});

test('pignolo-worktree-tools: create, tag-contract y cleanup apply solo el hilo principal; list, report y status los puede correr cualquiera', () => {
  const c = (script, rest) => `node "${P}/scripts/${script}.js" ${rest}`;
  assert.strictEqual(rule(c('worktree', 'create --plan p --nn 03 --slug cola')), 'pignolo-worktree-tools');
  assert.strictEqual(rule(c('worktree', 'tag-contract --plan p --n 1')), 'pignolo-worktree-tools');
  assert.strictEqual(rule(c('worktree', 'list')), 'allow');
  assert.strictEqual(rule(c('cleanup', 'apply --proposal abc')), 'pignolo-worktree-tools');
  assert.strictEqual(rule(c('cleanup', 'apply --proposal abc'), { agentType: 'pignolo:integrator' }), 'pignolo-worktree-tools', 'ni el integrator aplica la limpieza');
  assert.strictEqual(rule(c('cleanup', 'report --days 7')), 'allow');
  assert.strictEqual(rule(c('queue', 'status --plan p')), 'allow');
  assert.strictEqual(rule(c('waves', '--plan-file plan.md')), 'allow', 'waves.js es de solo lectura');
  assert.strictEqual(rule(c('worktree', 'create --plan p --nn 01 --slug a'), { subagent: false, agentType: null }), 'allow', 'hilo principal');
  assert.match(verdict(c('worktree', 'create --plan p --nn 01 --slug a')).alternative, /pedile al hilo principal/);
});

test('subcomando (A7-21): el primer operando posicional, saltando --cwd; dinámico, ausente o desconocido se niega', () => {
  const w = (rest) => `node "${P}/scripts/worktree.js" ${rest}`;
  assert.strictEqual(rule(w('--cwd x create --plan p --nn 01 --slug a')), 'pignolo-worktree-tools', 'rojo: tomar --cwd como subcomando');
  assert.strictEqual(rule(w('--cwd=x create --plan p')), 'pignolo-worktree-tools');
  assert.strictEqual(rule(w('--cwd x list')), 'allow', 'con --cwd, list sigue siendo lectura');
  assert.strictEqual(rule(w('"$S" --plan p')), 'pignolo-worktree-tools', 'subcomando dinámico');
  assert.strictEqual(rule(w('$(echo create) --plan p')), 'pignolo-worktree-tools');
  assert.strictEqual(rule(`node "${P}/scripts/queue.js"`), 'pignolo-queue', 'sin subcomando');
  assert.strictEqual(rule(`node "${P}/scripts/queue.js" foo`), 'pignolo-queue', 'subcomando desconocido');
  assert.strictEqual(rule(w('--cwd')), 'pignolo-worktree-tools', '--cwd sin valor');
  assert.strictEqual(rule(w('--cwd --plan list')), 'pignolo-worktree-tools', '--cwd con un valor que es otra opción');
  assert.strictEqual(rule(w('--bogus list')), 'pignolo-worktree-tools', 'opción desconocida antes del subcomando');
  // un scripts/cleanup.js del PROYECTO corrido con una variable pasa (falso positivo evitado)
  assert.strictEqual(rule('node scripts/cleanup.js "$S"'), 'allow');
  assert.strictEqual(rule('node ./tools/scripts/worktree.js "$S" create'), 'allow');
});

test('leer no es ejecutar (R-21): cat, grep, head, sed -n, git show, node --check y un texto que nombra el script pasan (implementer, fixer, review-risk)', async (t) => {
  const reads = [
    `cat "${P}/scripts/queue.js"`,
    `grep -n "queue" "${P}/scripts/worktree.js"`,
    `head -n 20 "${P}/scripts/cleanup.js"`,
    `sed -n 1,40p "${P}/lib/queue.js"`,
    'git show HEAD:plugins/pignolo/scripts/queue.js',
    `node --check "${P}/scripts/queue.js"`,
    `echo "node ${P}/scripts/queue.js run --plan p"`,
    'grep -rn "scripts/queue.js run" docs/',
    'grep -n queue.js docs/x.md',
    'cat scripts/queue.js',
    'git log --oneline queue/p',
    'git log int/p',
    'git tag -l \'cp/*\'',
    'git show cp/p/1',
  ];
  for (const who of ['pignolo:implementer', 'pignolo:fixer', 'pignolo:review-risk']) {
    await t.test(who, () => {
      for (const cmd of reads) assert.strictEqual(rule(cmd, { agentType: who }), 'allow', cmd);
    });
  }
});

test('pignolo-protected-refs: git plano no escribe int/*, queue/*, cp/* ni contract/* desde un subagente', () => {
  for (const cmd of [
    'git switch int/p', 'git checkout queue/p', 'git switch -c int/otra', 'git checkout -b queue/otra',
    'git tag cp/p/9', 'git tag contract/p/v2', 'git tag -a -m x cp/p/10', 'git tag -d cp/p/1', 'git tag -f contract/p/v1 HEAD',
    'git branch -f int/p HEAD~1', 'git branch -d int/p', 'git branch -D queue/p', 'git branch -m task/p/01-a int/p', 'git branch int/nueva',
    'git update-ref refs/heads/int/p HEAD~1', 'git update-ref -d refs/tags/cp/p/1', 'git update-ref refs/tags/contract/p/v9 HEAD',
    'git push . HEAD:int/p', 'git push . HEAD:refs/heads/queue/p', 'git fetch . x:int/p',
    'cd /tmp/wt && git switch int/p && git merge task/p/01-a',
  ]) assert.strictEqual(rule(cmd), 'pignolo-protected-refs', cmd);
  assert.match(verdict('git tag cp/p/9').alternative, /trabajá en la rama de tu tarea/);
  // pasan: consultas, la propia rama de la tarea y lo que no es de esas familias
  for (const cmd of [
    "git tag -l 'cp/*'", 'git tag --list', 'git log int/p', 'git switch -c task/p/01-a', 'git tag wip/x', 'git show cp/p/1',
    'git branch --list "int/*"', 'git branch -a', 'git branch task/p/02-b int/p', 'git checkout -b task/p/03-c', 'git diff int/p...HEAD',
    'git merge-base --is-ancestor contract/p/v1 HEAD', 'git rev-parse int/p', 'git fetch origin task/p/01-a',
  ]) assert.strictEqual(rule(cmd), 'allow', cmd);
  // el hilo principal sigue como hoy (las mismas escrituras no se niegan por esta regla)
  for (const cmd of ['git tag cp/p/9', 'git update-ref refs/heads/int/p HEAD~1', 'git push . HEAD:int/p', 'git switch int/p']) {
    assert.notStrictEqual(verdict(cmd, { subagent: false, agentType: null }).rule, 'pignolo-protected-refs', cmd);
  }
});

test('pignolo-protected-refs: merge, reset, rebase, cherry-pick, commit y pull con HEAD en int/* o queue/* (el cwd real, también tras un cd)', () => {
  const repo = makeRepo();
  git(['branch', 'int/p'], repo);
  git(['branch', 'task/p/01-a'], repo);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', wt, 'task/p/01-a'], repo);
  git(['checkout', '-q', 'int/p'], repo);
  const at = (cmd, cwd, o) => rule(cmd, { cwd, ...o });
  for (const cmd of ['git merge task/p/01-a', 'git reset --soft HEAD~1', 'git rebase main', 'git cherry-pick abc123', 'git commit -m x', 'git pull']) {
    assert.strictEqual(at(cmd, repo), 'pignolo-protected-refs', `${cmd} con HEAD en int/p`);
  }
  // en la worktree de la tarea (rama task/...) pasan; y también con un cd desde el principal
  for (const cmd of ['git merge main', 'git commit -m x', 'git reset --soft HEAD~1']) assert.strictEqual(at(cmd, wt), 'allow', `${cmd} en la rama de la tarea`);
  assert.strictEqual(at(`cd "${wt.split(path.sep).join('/')}" && git commit -m x`, repo), 'allow', 'cd a la worktree de la tarea: la rama es la de ella');
  // el hilo principal no se ve afectado
  assert.notStrictEqual(at('git commit -m x', repo, { subagent: false, agentType: null }), 'pignolo-protected-refs');
  git(['checkout', '-q', 'main'], repo);
  assert.strictEqual(at('git commit -m x', repo), 'allow', 'HEAD en main');
  git(['checkout', '-q', '-b', 'queue/p'], repo);
  assert.strictEqual(at('git commit -m x', repo), 'pignolo-protected-refs', 'queue/p también');
});

test('límite pineado (known-limit, R-13): un archivo que hace require de lib/queue.js y se corre con node no lo ve la detección por argv', () => {
  // Existe para que quien algún día lo cierre lo cambie a propósito: lo que hace un script por dentro no lo ve la guardia (§1.9).
  assert.strictEqual(rule('node runner.js'), 'allow');
  assert.strictEqual(rule(`node "${P}/lib/queue.js"`), 'allow', 'la lib no es un script de entrada');
});

test('por el handler: el payload con agent_id/agent_type decide; sin agent_id (hilo principal) pasa', () => {
  const repo = makeRepo();
  const cmd = `node "${P}/scripts/queue.js" run --plan p --task 01`;
  const call = (who) => guard.run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd }, cwd: repo, permission_mode: 'default', ...who }, { snapshot: () => null });
  const denied = call({ agent_id: 'a1', agent_type: IMPL });
  assert.strictEqual(denied.exit, 2);
  assert.match(denied.stderr, /Alternativa: la cola la opera el integrator; pedile la integración al hilo principal/);
  assert.strictEqual(call({ agent_id: 'a1', agent_type: 'pignolo:integrator' }).exit, 0);
  assert.strictEqual(call({}).exit, 0);
});
