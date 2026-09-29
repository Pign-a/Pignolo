'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, runLauncher } = require('./helpers');
const { CANARIES } = require('../plugins/pignolo/lib/git-guard');

const GUARD = path.join(PLUGIN_ROOT, 'lib', 'git-guard.js');
const explain = (...args) => spawnSync(process.execPath, [GUARD, ...args], { encoding: 'utf8' });

test('--explain prints the decision, the rule and the trace (spec §11.6)', () => {
  const r = explain('--explain', 'npm test && git reset --hard');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^decisión: block \(reset-hard, deny\)$/m);
  assert.match(r.stdout, /^alternativa: /m);
  assert.match(r.stdout, /\["npm","test"\] -> ok/);
  assert.match(r.stdout, /\["git","reset","--hard"\] -> reset-hard/);
  assert.match(explain('--explain', 'eval "$X"', '--mode', 'auto').stdout, /^decisión: block \(hidden-code, unverifiable\)$/m);
  assert.match(explain('--explain', 'eval "$X"').stdout, /^decisión: ask \(hidden-code, unverifiable\)$/m);
  assert.match(explain('--explain', '$b = git rev-parse HEAD', '--shell', 'powershell').stdout, /^decisión: allow$/m);
});

test('--explain without a command prints the usage and exits 2', () => {
  const r = explain();
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /uso: node git-guard\.js --explain/);
});

test('one canary per family of spec §8.4, and each is blocked through the real launcher', () => {
  assert.deepStrictEqual(CANARIES.map((c) => c.family),
    ['catastrophic', 'git-destructive', 'non-literal', 'powershell-ast', 'protected-write']);
  const cwd = makeRepo();
  for (const c of CANARIES) {
    const r = runLauncher(c.handler, { hook_event_name: 'PreToolUse', cwd, ...c.payload }, { PIGNOLO_CANARY: '1' });
    assert.strictEqual(r.status, 2, `${c.family}: ${r.stderr}`);
    assert.match(r.stderr, /pignolo bloqueó/, c.family);
  }
});
