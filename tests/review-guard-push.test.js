'use strict';
// Hallazgos de la revisión del cambio de la guardia (rama core/guard-sin-confirmar-push, 62bde34).
// Cada test de este archivo FALLA con el código revisado y pasa con el comportamiento correcto.
// El efecto real de cada comando se comprobó con git 2.52 en repos temporales (ver el informe de la revisión).
// Protects: push forzado negado en toda forma; solo el hilo principal mueve main/master.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const PS_T = 30000;
const AUTO = 'bypassPermissions';
const main = (command, o = {}) => evaluate(command, { shell: 'bash', mode: AUTO, psTimeoutMs: PS_T, ...o });
const sub = (command, o = {}) => main(command, { subagent: true, agentType: 'pignolo:implementer', ...o });
const show = (v) => JSON.stringify({ decision: v.decision, rule: v.rule });

const onMain = makeRepo();
const onFeat = makeRepo();
git(['checkout', '-q', '-b', 'feat'], onFeat);
const posix = (p) => p.split(path.sep).join('/');
const MAIN_DIR = posix(onMain);

// ---------------------------------------------------------------- R1 (crítico)
// La expansión de llaves de bash arma la opción o el refspec forzado después de que la guardia mira el texto.
// Antes del cambio estas formas pedían confirmación (regla `push`); ahora pasan sin que nadie las vea.
// Real: `git push {-f,origin} main` reescribió origin/main.
for (const cmd of [
  'git push {-f,origin} main',
  'git push {--force,origin} main',
  'git push origin main {-f,}',
  'git push origin {+main,feat}',
  'git push --forc{e,e} origin main',
  'git push --mir{ror,} origin',
]) {
  test(`R1 crítico: push forzado escondido en una expansión de llaves no pasa: ${cmd}`, () => {
    const v = main(cmd, { cwd: onFeat });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R2 (crítico)
// `git remote add --mirror=push` deja remote.<n>.mirror=true (la misma escritura que `git config remote.x.mirror true`,
// que la guardia niega) y el `git push <n>` siguiente es un push --mirror: fuerza y borra ramas remotas.
// Antes ese push pedía confirmación; ahora pasa. Real: origin/main reescrita y origin/other borrada.
for (const [shell, cmd] of [
  ['bash', 'git remote add --mirror=push m ../bare'],
  ['bash', 'git remote add --mirror=push m ../bare && git push m'],
  ['bash', 'git remote add m ../bare --mirror=push; git push m'],
  ['powershell', 'git remote add --mirror=push m ../bare; git push m'],
]) {
  test(`R2 crítico: un remoto espejo de push no se crea sin que nadie lo vea (${shell}): ${cmd}`, () => {
    const v = main(cmd, { cwd: onFeat, shell });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R3 (crítico, preexistente: también en main)
// En Git Bash `cmd //c` es la forma de escribir `cmd /c` (MSYS convierte `/c` en una ruta). La guardia solo
// desenvuelve `/c`. Real: `cmd //c "git push -f origin main"` reescribió origin/main.
for (const [cmd, rule] of [
  ['cmd //c "git push -f origin main"', 'push-force'],
  ['cmd //c git push --force origin main', 'push-force'],
  ['cmd //c "git reset --hard"', 'reset-hard'],
]) {
  test(`R3 crítico (preexistente): cmd //c se desenvuelve igual que cmd /c: ${cmd}`, () => {
    const v = main(cmd, { cwd: onFeat });
    assert.deepStrictEqual([v.decision, v.rule], ['block', rule], `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R4 (importante)
// Push de un subagente que actualiza main/master en el remoto sin nombrarla como `main`.
// Real (git 2.52): cada una avanzó origin/main. [shell, comando, cwd]
const PUSH_MAIN = [
  ['bash', 'git push origin @', onMain],
  ['bash', 'git push -u origin @', onMain],
  ['bash', "git push origin 'refs/heads/*:refs/heads/*'", onFeat],
  ['bash', "git push origin 'refs/heads/*'", onFeat],
  ['bash', "git push origin 'refs/heads/m*:refs/heads/m*'", onFeat],
  ['bash', 'git push origin HEAD:heads/main', onFeat],
  ['bash', 'git push origin feat:heads/master', onFeat],
  ['bash', 'git push origin heads/main', onFeat],
  ['bash', 'git push --branches origin', onFeat],
  ['bash', 'git push origin :', onFeat],
  ['bash', 'git -c push.default=matching push', onFeat],
  ['bash', 'git -c push.default=matching push origin', onFeat],
  ['bash', 'git -c push.default=upstream push', onFeat],
  ['bash', 'git config push.default matching && git push', onFeat],
  ['bash', `env -C "${MAIN_DIR}" git push`, onFeat],
  ['bash', `env --chdir="${MAIN_DIR}" git push origin HEAD`, onFeat],
  ['bash', `export GIT_DIR="${MAIN_DIR}/.git"; git push`, onFeat],
  ['powershell', "git push origin '@'", onMain],
  ['powershell', 'git push --branches', onFeat],
  ['powershell', 'git -c push.default=matching push', onFeat],
  ['powershell', `$env:GIT_DIR="${onMain}\\.git"; git push`, onFeat],
];
for (const [shell, cmd, cwd] of PUSH_MAIN) {
  test(`R4 importante: un subagente no hace push de main por otra forma (${shell}): ${cmd.split(MAIN_DIR).join('<main>').split(onMain).join('<main>')}`, () => {
    assert.notStrictEqual(main(cmd, { cwd, shell }).decision, 'block', `el hilo principal no se frena: ${cmd}`);
    const v = sub(cmd, { cwd, shell });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R5 (importante)
// Merge de un subagente sobre main cuando la guardia no ve que HEAD va a estar en main.
// Real: cada una movió main local. Las filas con `MAIN`/`Main` valen en un sistema de archivos que no
// distingue mayúsculas (Windows, macOS): git saca la rama y los commits van a refs/heads/main.
const CASELESS = process.platform === 'win32' || process.platform === 'darwin';
const MERGE_MAIN = [
  ['bash', 'git switch - && git merge feat', onFeat],
  ['bash', 'git checkout - && git merge feat', onFeat],
  ['bash', 'git worktree add w main && cd w && git merge feat', onFeat],
  ['bash', 'git worktree add w main && git -C w merge feat', onFeat],
  ['bash', `env -C "${MAIN_DIR}" git merge feat`, onFeat],
  ['powershell', `Start-Process git -ArgumentList 'merge','feat' -WorkingDirectory "${onMain}"`, onFeat],
  ...(CASELESS ? [
    ['bash', 'git checkout MAIN && git merge feat', onFeat],
    ['bash', 'git switch Main && git merge feat', onFeat],
    ['powershell', 'git switch Main; git merge feat', onFeat],
  ] : []),
];
for (const [shell, cmd, cwd] of MERGE_MAIN) {
  test(`R5 importante: un subagente no hace merge sobre main por otra forma (${shell}): ${cmd.split(MAIN_DIR).join('<main>').split(onMain).join('<main>')}`, () => {
    assert.notStrictEqual(main(cmd, { cwd, shell }).decision, 'block', `el hilo principal no se frena: ${cmd}`);
    const v = sub(cmd, { cwd, shell });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R6 (importante)
// Otros verbos con los que un subagente mueve main local y que ninguna regla cubre (pasan sin preguntar).
// La intención del autor es "solo el hilo principal actualiza main". Real: cada una movió main local.
const MOVES_MAIN = [
  ['git pull', onMain],
  ['git pull origin feat', onMain],
  ['git pull --rebase origin feat', onMain],
  ['git rebase feat', onMain],
  ['git cherry-pick feat', onMain],
  ['git reset --soft feat', onMain],
  ['git rebase feat main', onFeat],
  ['git fetch . feat:main', onFeat],
  ['git fetch origin feat:refs/heads/main', onFeat],
  ['git worktree add -B main ../w feat', onFeat],
  [`git -C "${MAIN_DIR}" pull origin feat`, onFeat],
  [`cd "${MAIN_DIR}" && git cherry-pick feat`, onFeat],
];
for (const [cmd, cwd] of MOVES_MAIN) {
  test(`R6 importante: un subagente no mueve main con otro verbo: ${cmd.split(MAIN_DIR).join('<main>')}`, () => {
    assert.notStrictEqual(main(cmd, { cwd }).decision, 'block', `el hilo principal no se frena: ${cmd}`);
    const v = sub(cmd, { cwd });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${show(v)}`);
  });
}

// ---------------------------------------------------------------- R7 (importante)
// Forma que debe pasar y hoy se niega: después de `switch main && switch feat`, HEAD está en feat
// (con `&&` lo que sigue solo corre si el cambio de rama anduvo), pero `st.onMain` queda marcado para siempre.
for (const cmd of [
  'git checkout main && git checkout feat && git merge main',
  'git switch main && git switch feat && git push',
]) {
  test(`R7 importante: push o merge de la rama de tarea tras pasar por main no se niega: ${cmd}`, () => {
    const v = sub(cmd, { cwd: onFeat });
    assert.strictEqual(v.decision, 'allow', `${cmd} -> ${show(v)}`);
  });
}
