'use strict';
// Expansión de llaves de bash y reglas de opciones destructivas (revisión R1 de la guardia).
// `{-f,origin}` son dos palabras: la guardia las expande en literal y evalúa cada regla sobre el resultado; lo que no
// puede expandir (comillas mezcladas, rangos raros, más de 64 palabras) queda dinámico y se niega.
// Protects: ninguna opción denegada (push --force, reset --hard, clean, branch -D, stash drop) se esconde en una llave.
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo } = require('./helpers');

const repo = makeRepo();
const run = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', cwd: repo, ...o });
const sub = (command) => run(command, { subagent: true, agentType: 'pignolo:implementer' });

// [comando, regla que debe aplicar al expandir]
const DENIED = [
  ['git reset {--hard,HEAD}', 'reset-hard'],
  ['git reset --ha{rd,rd}', 'reset-hard'],
  ['git clean {-f,-d}', 'clean'],
  ['git clean -{f,d}', 'clean'],
  ['git stash {drop,x}', 'stash'],
  ['git push {-f,origin} main', 'push-force'],
  ['git push origin {+main,feat}', 'push-force'],
  ['git push --mir{ror,} origin', 'push-force'],
  ['git push origin main {-f,}', 'push-force'],
  ['git {push,--force,origin,main}', 'push-force'],
  ['git push {--no-verify,origin}', 'no-verify'],
  ['git checkout {-f,x}', 'checkout-force'],
  ['git push origin {a,{+b,c}}', 'push-force'],
];
for (const [cmd, rule] of DENIED) {
  test(`brace expansion does not hide a denied option: ${cmd}`, () => {
    const v = run(cmd);
    assert.deepStrictEqual([v.decision, v.rule], [rule === 'branch-delete' ? 'ask' : 'block', rule], `${cmd} -> ${JSON.stringify(v)}`);
  });
}

test('brace expansion does not hide branch -D (asks like branch -D)', () => {
  const v = run('git branch {-D,x}');
  assert.deepStrictEqual([v.decision, v.rule], ['ask', 'branch-delete']);
});

// Lo que no se puede expandir en literal se niega en los verbos destructivos.
for (const cmd of ['git push "-"{f,x} main', 'git reset "-"{-hard,x}', 'git push origin {1..200}', 'git push origin {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}{o,p}']) {
  test(`brace expansion that cannot be expanded is denied: ${cmd}`, () => {
    const v = run(cmd);
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify(v)}`);
  });
}

// Lo común sigue pasando: llaves sin opciones peligrosas y rangos chicos.
for (const cmd of ['git push origin {main,feat}', 'git push origin feat{1..3}', 'git add {a,b}.txt', 'git log {main,feat}..HEAD', 'git checkout -b feat/{a,b}']) {
  test(`brace expansion without a denied option still passes: ${cmd}`, () => {
    const v = run(cmd);
    assert.notStrictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify(v)}`);
  });
}

test('brace expansion of a subagent push is judged on the expanded refspec', () => {
  assert.strictEqual(sub('git push origin {main,feat}').decision, 'block');
  assert.strictEqual(sub('git push origin {feat,fix}').decision, 'allow');
});

test('quoted braces are not an expansion', () => {
  assert.strictEqual(run('git push origin "{a,b}"').decision, 'allow');
});
