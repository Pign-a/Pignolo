'use strict';
// Corpus de la guardia (spec §15 `guard`). must-block: los comandos de las auditorías
// ronda 2 y 3 que la guardia niega o manda a confirmar; los que siguen pasando están
// clasificados en tests/guard/residual-risk.md. must-allow: comandos genéricos de
// uso real (la medición sobre las transcripciones del autor corre en local).
// Se evalúa en bypassPermissions: lo no verificable también es deny ahí, y un allow
// en ese modo es allow en todos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
// Plazo holgado para el parseo de PowerShell: con la suite en paralelo, los 2 s reales
// vencen de a ratos (auditoría 3, G13). El plazo real lo prueba tests/ps-ast.test.js.
const PS_T = 30000;

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'guard', f), 'utf8'));
const MODE = 'bypassPermissions';

test('must-block: every command is denied or asked, with its rule', () => {
  const bad = [];
  for (const c of load('must-block.json')) {
    const v = evaluate(c.command, { shell: c.shell, mode: MODE, psTimeoutMs: PS_T });
    if (v.decision !== c.expect || v.rule !== c.rule) bad.push(`${c.shell} ${JSON.stringify(c.command)} -> ${v.decision}/${v.rule}, esperado ${c.expect}/${c.rule}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('must-allow: every command is allowed in every mode', () => {
  const bad = [];
  for (const c of load('must-allow.json')) {
    const v = evaluate(c.command, { shell: c.shell, mode: MODE, psTimeoutMs: PS_T });
    if (v.decision !== 'allow') bad.push(`${c.shell} ${JSON.stringify(c.command)} -> ${v.decision}/${v.rule}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('the residual-risk register names every audit command that still passes', () => {
  const reg = fs.readFileSync(path.join(__dirname, 'guard', 'residual-risk.md'), 'utf8');
  for (const cmd of ['git repack -a -d', "node -e \"require('fs').writeFileSync('.pig'+'nolo/.dis'+'abled','')\"",
    "[IO.File]::WriteAllText(('.pig'+'nolo\\.disabled'),'')", "[IO.File]::WriteAllText(('.pig'+'nolo/.dis'+'abled'),'')",
    'npx --yes git-reset-hard', 'git clean -f -n', `echo '{"env":{"PIGNOLO_DISABLED":"1"}}' > .claude/settings.local.json`, 'git stash -m x', 'git stash push -m x --keep-index',
    // ronda 3
    'node $(ls plugins/pignolo/hooks/launch*) toggle', 'git mv -f a.txt b.txt',
    "vim -es -c '!git reset --hard' -c q", "sqlite3 :memory: '.shell git reset --hard'", "script --command='git reset --hard' /dev/null",
    "flock --command='git reset --hard' /tmp/l", "su -c 'git reset --hard'", "sg staff -c 'git reset --hard'", "busybox sh -c 'git reset --hard'",
    'busybox rm -rf .git', 'rsync -a --delete vacio/ .git/',
    // revisión final (M7, M8, M9)
    'f() { cd "$1"; }; cd /tmp && f /ruta/al/repo && rm -rf .g*', 'CDPATH=.. cd repo && rm -rf .g*',
    `echo '{"disableAllHooks":true}' > .claude/settings.local.json`, 'rm -rf GIT~1', 'Remove-Item -LiteralPath GIT~1 -Recurse -Force']) {
    assert.ok(reg.includes(cmd.replace(/\|/g, '\\|')), cmd); // en la tabla, | va escapado
    assert.strictEqual(evaluate(cmd, { shell: /^(\[IO|Remove-Item)/.test(cmd) ? 'powershell' : 'bash', mode: MODE, psTimeoutMs: PS_T }).decision, 'allow', cmd);
  }
});
