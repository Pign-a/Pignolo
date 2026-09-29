'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parsePsAst, PsUnavailable, PS_TIMEOUT_MS } = require('../plugins/pignolo/lib/ps-ast');

test('the native AST returns each command with its words unquoted (spec §11.6)', () => {
  const r = parsePsAst("git status 'a b'; Write-Output \"x\"");
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.cmds.map((c) => c.words.map((w) => w.value)), [['git', 'status', 'a b'], ['Write-Output', 'x']]);
  assert.strictEqual(r.cmds[0].words[2].quoted, true);
});

test('a dynamic argument is marked dynamic, an assignment keeps its literal value', () => {
  const r = parsePsAst('$d = "src"; git checkout $env:REF');
  assert.deepStrictEqual(r.assigns.map((a) => [a.name, a.value]), [['d', 'src']]);
  const ref = r.cmds[0].words[2];
  assert.strictEqual(ref.dyn, true);
});

// Protects: borrados por pipeline (G2, auditoría 3) · Breaks if: el comando que recibe
// el pipeline no sabe de qué comando le llegan las rutas.
test('a piped command knows the previous command of its pipeline, and a piped string', () => {
  const r = parsePsAst("Get-ChildItem dist -Recurse | Where-Object { $_.Length } | Remove-Item; '.git' | Remove-Item");
  const [gci, where, rm, rm2] = r.cmds;
  assert.deepStrictEqual([gci.prev, where.prev && where.prev.words[0].value, rm.prev && rm.prev.words[0].value], [null, 'Get-ChildItem', 'Where-Object']);
  assert.deepStrictEqual([rm.pipedIn, rm2.pipedIn, rm2.prev, rm2.stdinBody], [true, true, null, '.git']);
});

test('without powershell.exe the parser throws PsUnavailable, never a partial result', () => {
  assert.throws(() => parsePsAst('git status', { exe: 'pignolo-no-existe-powershell.exe' }), PsUnavailable);
});

// Protects: spec §8.3 y §15 (powershell.exe colgado → ask en interactivo) ·
// Breaks if: el timeout propio del parseo vuelve a igualar o superar el plazo de 3 s del launcher.
test('the parse timeout is below the launcher 3 s deadline, and running out of time is PsUnavailable (spec §8.3)', () => {
  assert.strictEqual(typeof PS_TIMEOUT_MS, 'number');
  assert.ok(PS_TIMEOUT_MS >= 1000 && PS_TIMEOUT_MS <= 2000, `PS_TIMEOUT_MS = ${PS_TIMEOUT_MS}`);
  assert.throws(() => parsePsAst('git status --short', { timeoutMs: 1 }), PsUnavailable);
});
