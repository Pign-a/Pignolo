'use strict';
// Revisión de la etapa 1 (RT1-01): la certeza de `cd-chain` (1f69bbf) mira solo que la carpeta exista. Un `cd` a una
// carpeta que existe igual falla si lleva un argumento de más (`cd: too many arguments`), una opción inválida, o una
// redirección que no se puede abrir (bash no corre el comando). En PowerShell, `Set-Location X extra` falla al ligar
// parámetros y la línea sigue. En todos, el `git merge` que sigue por `;` corre en el directorio de antes (main).
// Probado en Git Bash 5.2 y Windows PowerShell 5.1: el cwd no cambia.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const PS_T = 30000;
const posix = (p) => p.split(path.sep).join('/');
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: PS_T, subagent: true, agentType: 'pignolo:implementer', ...o });
const out = (v) => (v.decision === 'block' ? v.rule : v.decision);

const mainRepo = makeRepo();
const wt = makeRepo();
git(['checkout', '-q', '-b', 'plan/x'], wt);
const W = posix(wt);

const CASES = [
  ['bash', 'cd con un argumento de más', `cd "${W}" junk; git merge feat`],
  ['bash', 'cd con una opción inválida', `cd -q "${W}"; git merge feat`],
  ['bash', 'cd con una entrada que no existe', `cd "${W}" </nonexistent/x; git merge feat`],
  ['bash', 'cd con una salida que no se puede abrir', `cd "${W}" >/nonexistent/x/f; git merge feat`],
  ['bash', 'pushd con un argumento de más', `pushd "${W}" junk; git merge feat`],
  ['powershell', 'Set-Location con un argumento de más', `Set-Location "${W}" junk; git merge feat`],
];

for (const [shell, name, cmd] of CASES) {
  test(`cd que falla aunque la carpeta exista: ${name} (${shell})`, () => {
    const v = sub(cmd, { cwd: mainRepo, shell });
    assert.strictEqual(out(v), 'subagent-main', `${cmd} -> ${JSON.stringify({ decision: v.decision, rule: v.rule })}`);
  });
}

// Verde hoy; protege la condición `(!prior || prior.sure)` de changeDir, que ningún test cubría (quitarla no rompía nada):
// si el primer cd falla, el `&&` salta el segundo y el merge corre en main.
test('cadena: primer cd a una carpeta que no existe && segundo a una que existe; merge', () => {
  assert.strictEqual(out(sub(`cd "${W}-nada" && cd "${W}"; git merge feat`, { cwd: mainRepo })), 'subagent-main');
});

test('control: el cd simple a la carpeta que existe sigue pasando', () => {
  assert.strictEqual(out(sub(`cd "${W}"; git merge main`, { cwd: mainRepo })), 'allow');
});
