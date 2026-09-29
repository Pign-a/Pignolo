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

test('F7: a redirect whose target starts with an unknown variable is unverifiable (ask/deny by mode)', () => {
  assert.strictEqual(evaluate('echo x > $OUT', { mode: 'default' }).decision, 'ask');
  for (const mode of ['auto', 'bypassPermissions', 'dontAsk']) {
    const v = evaluate('echo x > $OUT', { mode });
    assert.strictEqual(v.decision, 'block', mode);
    assert.strictEqual(v.rule, 'dynamic-redirect');
  }
  // Si el destino dinámico puede caer en .git o ~/.pignolo, sigue siendo deny en todos los modos.
  for (const cmd of ['echo x > "$R/.git/HEAD"', 'echo x > ".git/$f"', 'echo x > ~/.pignolo/$f']) {
    const v = evaluate(cmd, { mode: 'default' });
    assert.strictEqual(v.decision, 'block', cmd);
    assert.ok(['protected-path', 'protected-flag'].includes(v.rule), `${cmd} -> ${v.rule}`);
  }
  assert.strictEqual(rule('echo x > "$d/notas.txt"'), 'dynamic-redirect');
  assert.strictEqual(rule('echo x > "logs/$n.txt"'), null);
  assert.strictEqual(rule('echo x > "$CLAUDE_JOB_DIR/tmp/a.txt"'), null);
  assert.strictEqual(rule('echo x > .pignolo/$f'), 'protected-flag');
});
