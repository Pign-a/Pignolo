'use strict';
// Re-revisión de la pasada de arreglos de fix/fuga-leak-values (2026-10-03), RR-01: la compuerta calcula el add previo
// con `git add --dry-run <args del usuario>`, pero git ignora --dry-run con -e/--edit: abre el editor y aplica el
// parche al índice. El hook (PreToolUse, antes de que corra o se apruebe el comando) modifica el índice del usuario.
// Va en tests/ (usa ./helpers).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runGuard, makeRepo, git } = require('./helpers');

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

for (const flag of ['-e', '--edit']) {
  test(`RR-01: evaluar \`git add ${flag} && git commit\` no toca el índice (el hook solo lee)`, () => {
    const prev = process.env.GIT_EDITOR;
    process.env.GIT_EDITOR = 'true'; // un editor que acepta el parche tal cual, sin ventana
    try {
      const repo = makeRepo();
      fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
      const before = git(['status', '--porcelain'], repo);
      runGuard(bash(`git add ${flag} && git commit -m x`, repo));
      assert.strictEqual(git(['status', '--porcelain'], repo), before, 'el hook indexó a.txt');
    } finally {
      if (prev === undefined) delete process.env.GIT_EDITOR; else process.env.GIT_EDITOR = prev;
    }
  });
}
