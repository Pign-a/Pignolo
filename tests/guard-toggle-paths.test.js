'use strict';
// Rutas del interruptor (spec §3.3, F6, F7). El interruptor no es un límite de
// seguridad: esto frena errores honestos, no a quien falsifica el stdin del launcher.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, runLauncher } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const rule = (cmd, opts = {}) => evaluate(cmd, { mode: 'bypassPermissions', ...opts }).rule;

test('F6: the launcher is recognized after cd, by its resolved path', () => {
  assert.strictEqual(rule('cd plugins/pignolo/hooks && node launcher.js toggle'), 'pignolo-launcher');
  assert.strictEqual(rule('cd "$P" && node launcher.js toggle'), 'pignolo-launcher');
  assert.strictEqual(rule('cd plugins/pignolo/hooks && node ./launcher.js session-start extra'), 'pignolo-launcher');
  assert.strictEqual(rule('node plugins/pignolo/hooks/launcher.js session-start'), null);
});

test('F7: flag writes through cd with a glob, cp, mkdir and ln', () => {
  for (const cmd of ['cd .pig*; touch .disabled', 'cp /dev/null .pignolo/.disabled', 'mkdir -p .pignolo/.disabled',
    'ln -s x .pignolo/.disabled', 'cd sub && touch ../.pignolo/.disabled', 'F=.pignolo/.disabled; echo x > $F']) {
    assert.strictEqual(rule(cmd), 'protected-flag', cmd);
  }
});

test('F7/T5: a redirect to an unknown variable passes unless the literal part names something protected', () => {
  for (const mode of ['default', 'auto', 'bypassPermissions', 'dontAsk']) {
    assert.strictEqual(evaluate('echo x > $OUT', { mode }).decision, 'allow', mode);
  }
  // Si el destino dinámico puede caer en .git o ~/.pignolo, sigue siendo deny en todos los modos.
  for (const cmd of ['echo x > "$R/.git/HEAD"', 'echo x > ".git/$f"', 'echo x > ~/.pignolo/$f']) {
    const v = evaluate(cmd, { mode: 'default' });
    assert.strictEqual(v.decision, 'block', cmd);
    assert.ok(['protected-path', 'protected-flag'].includes(v.rule), `${cmd} -> ${v.rule}`);
  }
  // H5: lo que apaga la guardia en la sesión siguiente tampoco se escribe por un destino dinámico.
  for (const cmd of ['echo {} > "$CLAUDE_CONFIG_DIR/settings.json"', 'echo {} > "$CLAUDE_PLUGIN_ROOT/hooks/hooks.json"', 'echo x > "$H/.gitconfig"']) {
    assert.strictEqual(rule(cmd), 'protected-path', cmd);
  }
  assert.strictEqual(rule('echo x > "$d/notas.txt"'), null);
  assert.strictEqual(rule('echo x > "$OUT/pignolo-notes.txt"'), null);
  assert.strictEqual(rule('echo x > "logs/$n.txt"'), null);
  assert.strictEqual(rule('echo x > "$CLAUDE_JOB_DIR/tmp/a.txt"'), null);
  assert.strictEqual(rule('echo x > .pignolo/$f'), 'protected-flag');
  assert.strictEqual(rule('echo x > "$D/.disabled"'), 'protected-flag');
});

test('relative paths resolve against the cwd of the payload', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  const payload = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
  // Solo el cwd del payload dice que `.disabled` es el flag.
  assert.strictEqual(runLauncher('guard', payload('touch .disabled', path.join(repo, '.pignolo'))).status, 2);
  assert.strictEqual(runLauncher('guard', payload('touch .disabled', repo)).status, 0);
});

// Protects: apagar pignolo desde la shell (M8, revisión final) · Breaks if: `claude plugin
// disable|uninstall|remove pignolo` pasa; el interruptor lo maneja el humano.
test('claude plugin disable|uninstall|remove targeting pignolo is protected-flag (M8)', () => {
  for (const cmd of ['claude plugin disable pignolo', 'claude plugin uninstall pignolo@pignolo', 'claude plugin remove pignolo',
    'claude plugins disable --scope project pignolo', 'claude.exe plugin uninstall pignolo', 'claude plugin disable "$P"',
    'claude plugin marketplace remove pignolo']) {
    for (const mode of ['default', 'bypassPermissions']) {
      const v = evaluate(cmd, { mode });
      assert.deepStrictEqual([v.decision, v.rule], ['block', 'protected-flag'], `${mode}: ${cmd}`);
    }
  }
  assert.strictEqual(evaluate('claude plugin disable pignolo', { shell: 'powershell', mode: 'default', psTimeoutMs: 30000 }).rule, 'protected-flag');
  for (const cmd of ['claude plugin list', 'claude plugin install pignolo', 'claude plugin disable pignolo-ui', 'claude plugin enable pignolo',
    'claude plugin marketplace add Pign-a/Pignolo', 'claude --version']) {
    assert.strictEqual(rule(cmd), null, cmd);
  }
});
