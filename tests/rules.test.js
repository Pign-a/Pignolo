'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const CORE = path.join(PLUGIN_ROOT, 'rules', 'core.md');
const MAX_CHARS = 1600;

function readCore() {
  return fs.readFileSync(CORE, 'utf8');
}

function ruleNumbers(text) {
  return text.split('\n').filter((l) => /^\d+\. /.test(l)).map((l) => Number(l.match(/^(\d+)\./)[1]));
}

test('core rules fit the injection budget (spec §6.1: <= 1600 characters)', () => {
  const chars = Array.from(readCore()).length;
  assert.ok(chars <= MAX_CHARS, `rules/core.md has ${chars} characters, budget is ${MAX_CHARS}`);
});

test('core rules are exactly six, numbered 1 to 6 in order (spec §6.1)', () => {
  assert.deepStrictEqual(ruleNumbers(readCore()), [1, 2, 3, 4, 5, 6]);
});

test('core rules have no carriage returns (the injected text must be stable across platforms)', () => {
  assert.ok(!readCore().includes('\r'), 'rules/core.md contains CR characters');
});

// Protects: texto por la shell (decisión 2026-09-28; #81273, #84429, codex #12288) ·
// Breaks if: la regla deja de pedir Write o `git commit -F` para archivos y mensajes.
test('core rules tell agents to write files and messages with Write or -F, not through shell quoting', () => {
  const rule6 = readCore().split('\n').find((l) => l.startsWith('6. '));
  assert.match(rule6, /Write tool or `git commit -F <file>`/);
  assert.match(rule6, /never by passing text through shell quoting \(`-c`, `-e`, `-m`, heredocs with backticks\)/);
});

// Protects: regla 1, verificación real (decisión técnica 2026-09-28; spec §6.1, cartas de rol) ·
// Breaks if: la regla 1 deja de decir que un chequeo solo de sintaxis, o que no arrancó, no cuenta.
test('core rule 1 says a syntax-only check, or one that failed to start, does not count', () => {
  const rule1 = readCore().split('\n').find((l) => l.startsWith('1. '));
  assert.match(rule1, /A syntax-only check, or a check that failed to start, does not count\./);
});
