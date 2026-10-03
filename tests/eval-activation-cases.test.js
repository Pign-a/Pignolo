'use strict';
// Forma de la prueba de activación (tests/evals/activation-cases.js y activation-run.js), sin correr claude.
// Protege: 20 frases que deben activar una skill concreta (con la del autor) y 10 que no activan ninguna de
// las ocho; el parser del stream y el grader; el runner no gasta en --dry-run.
// Se rompe si: cambia el reparto 20/10, una frase positiva apunta a una skill que no existe o el grader
// da por buena una skill equivocada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CASES, EIGHT, invokedSkill, grade } = require('./evals/activation-cases');

const ROOT = path.join(__dirname, '..');

test('20 positive phrases (the author\'s one among them) and 10 negative ones, unique ids and prompts', () => {
  assert.equal(CASES.filter((c) => c.expect).length, 20);
  assert.equal(CASES.filter((c) => !c.expect).length, 10);
  assert.ok(CASES.some((c) => c.prompt === 'quiero que hagamos ahora el panel de datos de la app' && c.expect === 'pignolo-ui:new'));
  assert.equal(new Set(CASES.map((c) => c.id)).size, 30);
  assert.equal(new Set(CASES.map((c) => c.prompt)).size, 30);
});

test('every expected skill is one of the eight and has a SKILL.md without disable-model-invocation', () => {
  for (const c of CASES.filter((x) => x.expect)) {
    assert.ok(EIGHT.includes(c.expect), c.expect);
    const [plugin, name] = c.expect.split(':');
    const text = fs.readFileSync(path.join(ROOT, 'plugins', plugin, 'skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text.split('\n---')[0], /disable-model-invocation/);
  }
  assert.deepEqual([...new Set(CASES.filter((c) => c.expect).map((c) => c.expect))].sort(), [...EIGHT].sort());
});

test('invokedSkill reads the first Skill tool_use of a stream-json; grade scores positives and negatives', () => {
  const ev = (content) => JSON.stringify({ type: 'assistant', message: { content } });
  const stream = [JSON.stringify({ type: 'system' }), ev([{ type: 'text', text: 'ok' }]), ev([{ type: 'tool_use', name: 'Skill', input: { skill: 'pignolo-ui:new' } }])].join('\n');
  assert.equal(invokedSkill(stream), 'pignolo-ui:new');
  assert.equal(invokedSkill(ev([{ type: 'text', text: 'hola' }])), null);
  assert.equal(invokedSkill('no es json\n{roto'), null);
  assert.equal(grade('pignolo-ui:new', 'pignolo-ui:new'), true);
  assert.equal(grade('pignolo-ui:new', 'pignolo-ui:improve'), false);
  assert.equal(grade('pignolo-ui:new', null), false);
  assert.equal(grade(null, null), true);
  assert.equal(grade(null, 'pignolo:status'), false);
  assert.equal(grade(null, 'pignolo:entry'), true);
});

test('the runner in --dry-run spends nothing and reports the number of runs; it needs an arm', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tests', 'evals', 'activation-run.js'), ...a], { encoding: 'utf8' });
  const ok = run('--arm', 'treatment', '--reps', '3', '--dry-run');
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).runs, 90);
  assert.equal(JSON.parse(run('--arm', 'control', '--reps', '1', '--dry-run').stdout).runs, 30);
  assert.equal(run('--dry-run').status, 2);
});
