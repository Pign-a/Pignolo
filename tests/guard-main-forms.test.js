'use strict';
// Variantes de los hallazgos R2, R3, R4, R5 y R7 de la revisión de la guardia (push y merge sin confirmación, regla
// subagent-main) que tests/review-guard-push.test.js no cubre: otras formas de la misma causa y los cierres que no
// deben aflojarse. Complementa a ese archivo, que no se toca.
// Protects: remote add --mirror, cmd //c, destinos de push que alcanzan main, push.default, env -C / GIT_DIR y Start-Process
// -WorkingDirectory como cambio de directorio, mayúsculas, rama anterior, y que `&&` es lo único que baja onMain.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const PS_T = 30000;
const main = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: PS_T, ...o });
const sub = (command, o = {}) => main(command, { subagent: true, agentType: 'pignolo:implementer', ...o });
const show = (v) => JSON.stringify({ decision: v.decision, rule: v.rule });
const posix = (p) => p.split(path.sep).join('/');

const onMain = makeRepo();
const onFeat = makeRepo();
git(['checkout', '-q', '-b', 'feat'], onFeat);
const MAIN_DIR = posix(onMain);

// ---- R2: remote add --mirror
test('R2: remote add --mirror se niega en sus formas; --mirror=fetch y un remoto común pasan', () => {
  for (const cmd of ['git remote add --mirror m u', 'git remote add --mirror=push m u', 'git remote add --mir=push m u', 'git remote add m u --mirror=push',
    'git -C ../x remote add --mirror=push m u', 'git remote add --mirror=fetch --mirror=push m u', 'git remote add --mirror=$X m u']) {
    const v = main(cmd, { cwd: onFeat });
    assert.deepStrictEqual([v.decision, v.rule], ['block', 'push-force'], `${cmd} -> ${show(v)}`);
  }
  for (const cmd of ['git remote add m u', 'git remote add -f m u', 'git remote add --mirror=fetch m u', 'git remote -v', 'git remote set-url --push origin u']) {
    assert.strictEqual(main(cmd, { cwd: onFeat }).decision, 'allow', cmd);
  }
});

// ---- R3: cmd //c
test('R3: cmd //c con otras mayúsculas y opciones antes, y cmd /c sigue igual', () => {
  for (const [cmd, rule] of [['cmd //C git reset --hard', 'reset-hard'], ['cmd //d //c git reset --hard', 'reset-hard'], ['cmd.exe //c "git push -f origin main"', 'push-force'],
    ['cmd /c git reset --hard', 'reset-hard']]) {
    const v = main(cmd, { cwd: onFeat });
    assert.deepStrictEqual([v.decision, v.rule], ['block', rule], `${cmd} -> ${show(v)}`);
  }
  assert.strictEqual(main('cmd //c "echo hi"', { cwd: onFeat }).decision, 'allow');
});

// ---- R4: destinos que alcanzan main
test('R4: un subagente no empuja a main con --repo, @:main, otra capitalización, +: ni --branches abreviado', () => {
  for (const cmd of ['git push --repo=origin main', 'git push --repo origin main', 'git push origin @:main', 'git push origin HEAD:Main', 'git push origin HEAD:refs/heads/MASTER',
    'git push origin +:', 'git push --bran origin', 'git push origin +HEAD:heads/main', 'git push origin feat:heads/master']) {
    const v = sub(cmd, { cwd: onFeat });
    assert.notStrictEqual(v.decision, 'allow', `${cmd} -> ${show(v)}`);
  }
});

test('R4: push de otra rama o a otro destino sigue pasando para un subagente', () => {
  for (const cmd of ['git push origin feat', 'git push --repo=origin feat', 'git push origin HEAD:feat', 'git push origin feat:heads/feat', 'git push origin HEAD:refs/for/main',
    'git push origin fix/main', 'git push origin HEAD:mainline', 'git push --tags', 'git push origin feat --tags']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).decision, 'allow', cmd);
  }
});

// M9 de la revisión: `push --tags` sin refspec no cuenta como push de HEAD aunque HEAD esté en main.
test('R4: push --tags desde main pasa; un refspec dinámico se cierra', () => {
  assert.strictEqual(sub('git push --tags', { cwd: onMain }).decision, 'allow');
  assert.strictEqual(sub('git push origin $X', { cwd: onFeat }).decision, 'block');
  assert.strictEqual(sub('git push origin "$X"', { cwd: onFeat }).decision, 'block');
});

// M12 de la revisión: -C relativo a un repo en main, resuelto contra el cwd real.
test('R4/M12: git -C relativo a un repo en main se niega y a uno en feat pasa', () => {
  const parent = path.dirname(onFeat);
  const rel = (d) => posix(path.relative(parent, d));
  assert.strictEqual(sub(`git -C ${rel(onMain)} push`, { cwd: parent }).rule, 'subagent-main');
  assert.strictEqual(sub(`git -C ${rel(onFeat)} push`, { cwd: parent }).decision, 'allow');
});

test('R4: push.default no seguro se niega a un subagente, por -c y por git config; simple y current pasan', () => {
  for (const cmd of ['git -c push.default=matching push', 'git -c Push.Default=UPSTREAM push origin', 'git -c push.default=nothing push', 'git --config-env=push.default=V push',
    'git config push.default matching', 'git config --global push.default upstream', 'git config --add push.default matching', 'git config set push.default matching',
    'git config push.default matching --global']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).rule, 'subagent-main', cmd);
    assert.strictEqual(main(cmd, { cwd: onFeat }).rule === 'subagent-main', false, `hilo principal: ${cmd}`);
  }
  for (const cmd of ['git -c push.default=simple push', 'git -c push.default=current push', 'git config push.default simple', 'git config push.default current',
    'git config push.default', 'git config --unset push.default']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).decision, 'allow', cmd);
  }
});

test('R4: GIT_DIR o GIT_WORK_TREE puestas antes, exportadas o con env redirigen: un push sin refspec se cierra', () => {
  for (const cmd of ['env GIT_DIR=/x/.git git push', 'declare -x GIT_WORK_TREE=/x; git push', 'GIT_DIR=/x; git push', 'export GIT_DIR=/x && git push']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).rule, 'subagent-main', cmd);
    assert.strictEqual(main(cmd, { cwd: onFeat }).decision, 'allow', `hilo principal: ${cmd}`);
  }
  assert.strictEqual(sub('export GIT_DIR=/x; git push origin feat', { cwd: onFeat }).decision, 'allow', 'un refspec que no es main pasa');
});

test('R4 (PowerShell): $env:GIT_WORK_TREE y --branches abreviado', () => {
  assert.strictEqual(sub(`$env:GIT_WORK_TREE="${onMain}"; git push`, { cwd: onFeat, shell: 'powershell' }).rule, 'subagent-main');
  assert.strictEqual(sub('git push --bran', { cwd: onFeat, shell: 'powershell' }).rule, 'subagent-main');
});

// ---- R5: otro directorio, otra capitalización, rama anterior
test('R5: env -C en todas sus formas mueve el directorio del comando envuelto', () => {
  for (const cmd of [`env -C "${MAIN_DIR}" git merge feat`, `env -iC "${MAIN_DIR}" git merge feat`, `env -C"${MAIN_DIR}" git merge feat`, `env --chdir="${MAIN_DIR}" git merge feat`,
    `env --chd "${MAIN_DIR}" git merge feat`, `env --c "${MAIN_DIR}" git merge feat`, `env -C "$d" git merge feat`, `env -C "${MAIN_DIR}" FOO=1 git merge feat`,
    `nice env -C "${MAIN_DIR}" git merge feat`, `env -C "${MAIN_DIR}" -S 'git merge feat'`]) {
    const v = sub(cmd, { cwd: onFeat });
    assert.strictEqual(v.rule, 'subagent-main', `${cmd} -> ${show(v)}`);
  }
  // el directorio de la shell no cambia: lo que sigue corre donde estaba
  assert.strictEqual(sub(`env -C "${MAIN_DIR}" git status && git merge main`, { cwd: onFeat }).decision, 'allow');
  // env -C a un repo en feat: pasa
  assert.strictEqual(sub(`env -C "${posix(onFeat)}" git merge main`, { cwd: onMain }).decision, 'allow');
});

test('R5 (PowerShell): Start-Process -WorkingDirectory, también abreviado', () => {
  for (const flag of ['-WorkingDirectory', '-Work', '-workingdirectory']) {
    const v = sub(`Start-Process git -ArgumentList 'merge','feat' ${flag} "${onMain}"`, { cwd: onFeat, shell: 'powershell' });
    assert.strictEqual(v.rule, 'subagent-main', `${flag} -> ${show(v)}`);
  }
  assert.strictEqual(sub(`Start-Process git -ArgumentList 'merge','main' -WorkingDirectory "${onFeat}"`, { cwd: onMain, shell: 'powershell' }).decision, 'allow');
});

test('R5: mayúsculas en main/master, rama anterior y directorio que no existe', () => {
  for (const cmd of ['git checkout MASTER && git merge feat', 'git switch Main && git push', 'git checkout @{-1} && git merge feat', 'git switch - && git push',
    'git worktree add w main && cd w && git push', 'cd no-existe && git merge feat', 'git -C no-existe merge feat']) {
    const v = sub(cmd, { cwd: onFeat });
    assert.strictEqual(v.rule, 'subagent-main', `${cmd} -> ${show(v)}`);
    assert.notStrictEqual(main(cmd, { cwd: onFeat }).rule, 'subagent-main', `hilo principal: ${cmd}`);
  }
  assert.strictEqual(sub('git push origin Feature', { cwd: onFeat }).decision, 'allow');
});

// ---- R7: solo `&&` baja onMain
test('R7: pasar por main y volver con `&&` no se niega; con otro separador, sí', () => {
  for (const cmd of ['git switch main && git switch feat && git push', 'git checkout main && git checkout feat && git merge main', 'git switch main ; git switch feat && git push']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).decision, 'allow', cmd);
  }
  // el cambio a feat pudo fallar (; o ||) y HEAD seguir en main: se niega
  for (const cmd of ['git switch main && git switch feat ; git merge x', 'git switch main && git switch feat || git push', 'git switch main && git switch feat & git merge x',
    'git switch main && git switch feat | cat ; git push', 'git switch main && (git switch feat) && git push']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).rule, 'subagent-main', cmd);
  }
  // un cambio a main dentro del mismo `&&` vuelve a cerrar
  assert.strictEqual(sub('git switch feat && git switch main && git push', { cwd: onFeat }).rule, 'subagent-main');
});

// ---- menor 3: la forma con guion
test('menor 3: git-push --force conserva su regla (la forma con guion no descarta el primer operando)', () => {
  assert.strictEqual(main('git-push --force origin feat', { cwd: onFeat }).rule, 'push-force');
  assert.strictEqual(main('git-push origin feat', { cwd: onFeat }).decision, 'allow');
});
