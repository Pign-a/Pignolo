'use strict';
// Lenguaje natural (decisión del autor, 2026-10-03): ocho skills se activan con una frase normal; on y off
// siguen solo humanas. Protege: description que dice cuándo usarla, la confirmación con AskUserQuestion como
// primer paso (salvo status, que solo lee) y que entry mande los pedidos de UI a pignolo-ui.
// Se rompe si: vuelve disable-model-invocation en una de las ocho, lo pierden on u off, una description
// no empieza por "Use when the user asks to", pasa el tope de 1536 caracteres o entry deja de nombrar pignolo-ui.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');

const CORE = ['status', 'close-session', 'init', 'setup'];
const ASKING = ['close-session', 'init', 'setup'];
const UI_ROOT = path.join(PLUGIN_ROOT, '..', 'pignolo-ui');
const UI = ['new', 'improve', 'audit', 'define'];

// El primer paso numerado del cuerpo: desde "0." o "1." hasta el siguiente.
function firstStep(text) {
  const m = /^\d+\. [\s\S]*?(?=^\d+\. |^## |(?![\s\S]))/m.exec(text.slice(text.indexOf('\n---', 4)));
  assert.ok(m, 'no step found');
  return m[0];
}

for (const name of CORE) {
  test(`${name}: the model may invoke it and its description says when to use it`, () => {
    const s = readSkill(name);
    assert.strictEqual(s.data['disable-model-invocation'], undefined);
    assert.match(s.data.description, /^Use when the user asks to /);
    assert.ok(s.data.description.length <= 1536, `${s.data.description.length} characters`);
    assert.match(s.data.description, /'[^']+'/, 'typical phrases between quotes');
  });
}

for (const name of ['on', 'off']) {
  test(`${name}: stays human-only`, () => {
    assert.strictEqual(readSkill(name).data['disable-model-invocation'], true);
  });
}

for (const name of ASKING) {
  test(`${name}: the first step confirms with AskUserQuestion when the skill was not typed as a command`, () => {
    const s = readSkill(name);
    const step = firstStep(s.text);
    assert.match(step, /^0\. /);
    for (const lit of ['AskUserQuestion', 'recommended', 'activation-confirm.md', '<command-name>']) assert.ok(step.includes(lit), lit);
    assert.deepStrictEqual(brokenReferences(s.text), []);
  });
}

test('status only reads: it never asks', () => {
  assert.doesNotMatch(readSkill('status').text, /AskUserQuestion/);
});

test('activation-confirm.md holds the shared rules', () => {
  const t = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'activation-confirm.md'), 'utf8');
  for (const lit of ['AskUserQuestion', 'recommended', 'End this skill', '<command-name>']) assert.ok(t.includes(lit), lit);
});

test('entry sends UI requests to the matching pignolo-ui skill when it is installed', () => {
  const { text } = readSkill('entry');
  for (const lit of ['pignolo-ui:new', 'pignolo-ui:improve', 'pignolo-ui:audit', 'pignolo-ui:define']) assert.ok(text.includes(lit), lit);
});

test('the pignolo-ui skills are the four that the entry names (the names exist)', () => {
  for (const n of UI) assert.ok(fs.existsSync(path.join(UI_ROOT, 'skills', n, 'SKILL.md')), n);
});
