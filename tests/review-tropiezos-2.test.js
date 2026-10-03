'use strict';
// Revisión de la etapa 2 de guardia-sin-tropiezos (RT2-nn): formas que en `main` (0.18.0) se negaban y que la
// etapa 2 abre sin que el plan lo decida. Cada test falla en la rama revisada y pasa en `main`.
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const MODE = { mode: 'bypassPermissions' };
const blocked = (cmds, opts = {}) => {
  for (const cmd of cmds) {
    const v = evaluate(cmd, { ...MODE, ...opts });
    assert.notStrictEqual(v.decision, 'allow', `pasa y no debería: ${cmd}`);
  }
};

// RT2-01: el código inline que lanza un proceso que borra .git pasaba como inline-code (no verificable); con T7
// pasa porque el texto no nombra `git` como palabra (`.git` no cuenta).
test('RT2-01: inline code that spawns a shell deleting .git is not allowed', () => {
  blocked([
    `node -e "require('child_process').execSync('rm -rf .git')"`,
    `python3 -c "import os; os.system('rm -rf .git')"`,
    `node -e "require('child_process').execSync('touch .pignolo/.disabled')"`,
  ]);
});

// RT2-02: git nombrado en la misma línea pero fuera del código (argv del intérprete o una variable de entorno).
test('RT2-02: git named on the line outside the inline code (argv, env) still counts', () => {
  blocked([
    `node -e "require('child_process').execSync(process.argv[1])" "git reset --hard"`,
    `C='git reset --hard' node -e "require('child_process').execSync(process.env.C)"`,
    `python3 -c "import sys,os; os.system(sys.argv[1])" "git stash drop"`,
  ]);
});

// RT2-03: git por una biblioteca que lanza procesos sin nombrar child_process/subprocess en el texto.
test('RT2-03: git through a process-spawning library or project helper is not allowed', () => {
  blocked([
    `node -e "require('./plugins/pignolo/lib/git').gitRun(['reset','--hard'],'.')"`,
    `node -e "require('execa').execaSync('git',['reset','--hard'])"`,
    `node -e "require('cross-spawn').sync('git',['reset','--hard'])"`,
    `python3 -c "import git; git.Repo('.').git.reset('--hard')"`,
    `python3 -c "import pexpect; pexpect.run('git reset --hard')"`,
  ]);
});

// RT2-04: el escáner del R-9 toma la comilla de un literal de regex (o de q()/s/// de perl, ?" de ruby) como
// inicio de cadena y esconde la llamada.
test('RT2-04: a quote inside a regex or quote-like literal does not hide a git call', () => {
  blocked([
    `node -e "/'/;require(\\"child_process\\").execSync(\\"git stash drop\\");/'/"`,
    "node -e '/`/;require(\"child_process\").execSync(\"git stash drop\");/`/'",
    `perl -e 's/"/x/; system("git stash drop"); s/"/x/'`,
    `perl -e '$x=q("); system("git stash drop"); $y=q(")'`,
  ]);
});

// RT2-05: destino dinámico de una redirección. La parte "literal" que mira T5 no incluye el texto de una
// sustitución ni el valor por defecto de `${X:-…}`, ni las variables que ya apuntan a la config de Claude.
test('RT2-05: dynamic redirect targets that reach .git, the flag or the plugin are not allowed', () => {
  blocked([
    'echo x > "$(git rev-parse --git-dir)/hooks/pre-commit"',
    'echo x > "$(git rev-parse --git-path hooks)/pre-commit"',
    'echo x > "${GIT_DIR:-.git}/config"',
    'echo x > "$(echo .pignolo/.disabled)"',
    'echo x > "${X:-.pignolo/.disabled}"',
    'echo x > "$(echo ~/.claude/settings.json)"',
    'echo x > "$CLAUDE_PLUGIN_ROOT/lib/git-guard.js"',
    'echo x > "$CLAUDE_PLUGIN_ROOT/hooks/launcher.js"',
  ]);
});

// RT2-06: escritura del flag con comodín o variable. copyDest toma `-d`/`-D` de cp/install/ln como destino
// (las abreviaturas de -Destination de PowerShell), `{}` de find/xargs no cuenta como tramo desconocido y
// flagReachable no mira el cwd.
test('RT2-06: flag writes through cp -d / install -D, find/xargs placeholders and a cd into .pignolo', () => {
  blocked([
    'install -D /dev/null .pig*/.disabled',
    'cp -d x "$P/.pignolo/.disabled"',
    'ln -d x .pig*/.disabled',
    'find . -name .pignolo -exec touch {}/.disabled \\;',
    'echo .pignolo | xargs -I{} touch {}/.disabled',
    'cd .pignolo && touch *disabled*',
    'cd .pignolo && echo x > "$X.disabled"',
  ]);
});

// RT2-07: ejecutar el launcher detrás de un envoltorio que no está en LAUNCHER_EXEC ni en WRAPPERS.
test('RT2-07: the launcher run through an unlisted wrapper is still execution', () => {
  blocked([
    'yarn node plugins/pignolo/hooks/launcher.js toggle',
    'cross-env A=1 node plugins/pignolo/hooks/launcher.js toggle',
    'nvm exec 22 node plugins/pignolo/hooks/launcher.js toggle',
    'volta run node plugins/pignolo/hooks/launcher.js toggle',
    'corepack node plugins/pignolo/hooks/launcher.js toggle',
  ]);
});

// M3: un lector del launcher cuya salida se redirige o se canaliza a algo que escribe copia el launcher (y la copia
// ya no lleva el nombre que la guardia mira). Solo pasa con la salida en la terminal.
const L = 'plugins/pignolo/hooks/launcher.js';
test('M3: a launcher reader whose output is redirected or piped to a writer is not allowed', () => {
  blocked([
    `cat "${L}" > copia.js`,
    `cat "${L}" >> copia.js`,
    `cat "${L}" 2>&1 > copia.js`,
    `cat "${L}" &> copia.js`,
    `cat "${L}" >| copia.js`,
    `cat "${L}" 1> copia.js`,
    `cat "${L}" > copia.js && node copia.js toggle`,
    `cat "${L}" | tee copia.js`,
    `cat "${L}" | sh`,
    `cat "${L}" | node`,
    `cat "${L}" | grep x | tee copia.js`,
    `git show HEAD:${L} > copia.js`,
    `git cat-file -p HEAD:${L} > copia.js`,
    `cp "${L}" copia.js`,
    `grep -n panel "${L}" > copia.js`,
  ]);
  blocked([
    `Get-Content ${L} | Out-File copia.js`,
    `Get-Content ${L} | Set-Content copia.js`,
    `Get-Content ${L} > copia.js`,
    `gc ${L} | Select-String x | Set-Content copia.js`,
    `Copy-Item ${L} copia.js`,
  ], { shell: 'powershell' });
});

test('M3: reading the launcher with the output on the terminal still passes', () => {
  for (const cmd of [`cat ${L}`, `grep -n panel ${L}`, `git diff -- ${L}`, `cat ${L} | grep x`, `cat ${L} 2>&1`, `cat ${L} 2>/dev/null | head -5`,
    `git show HEAD:${L}`]) {
    assert.strictEqual(evaluate(cmd, MODE).decision, 'allow', `se niega y debería pasar: ${cmd}`);
  }
  assert.strictEqual(evaluate(`Get-Content ${L} | Select-String x`, { ...MODE, shell: 'powershell' }).decision, 'allow');
});
