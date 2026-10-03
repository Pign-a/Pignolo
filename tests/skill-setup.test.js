'use strict';
// Forma de la skill setup (plan 2026-10-02, Tarea 5): una pantalla con lo recomendado, tres opciones, preguntas con
// AskUserQuestion y respaldo en texto; todo lo que nombra existe en setup.js. Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');

const SKILL = readSkill('setup');
const SETUP_SRC = fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', 'setup.js'), 'utf8');

test('setup: frontmatter human-only, scripts y verbos reales, sin rutas de usuario', () => {
  assert.equal(SKILL.data.name, 'setup');
  assert.equal(SKILL.data['disable-model-invocation'], undefined);
  assert.deepEqual(brokenReferences(SKILL.text), []);
  assert.doesNotMatch(SKILL.text, /[A-Za-z]:[\\/]+Users|\/home\/|\/Users\//);
});

test('setup: respuestas cerradas con AskUserQuestion, recomendada primero, hasta 4 por llamada y respaldo en texto', () => {
  const t = SKILL.text;
  assert.match(t, /`AskUserQuestion` tool/);
  assert.match(t, /recommended option first, labelled as recommended, up to 4 questions per call/);
  assert.match(t, /If the tool is not available, ask in plain text with the same options/);
});

test('setup: el flujo rápido tiene las tres opciones y el sí explícito cuenta solo para lo mostrado', () => {
  const t = SKILL.text;
  assert.ok(t.indexOf('## Fast flow') < t.indexOf('## Review point by point'));
  for (const re of [/\*\*Apply the recommended setup\*\* \(recommended\)/, /\*\*Review point by point\*\*/, /\*\*Cancel\*\*/]) assert.match(t, re, String(re));
  assert.match(t, /explicit yes in their own turn/);
  assert.match(t, /counts as that yes only for the exact setup shown/);
  assert.match(t, /Cancel: say nothing was written/);
  assert.match(t, /Never edit any user rule file/);
});

test('setup: el detalle técnico es a pedido y la revisión punto por punto conserva sus seis pasos', () => {
  const t = SKILL.text;
  assert.match(t, /only if the human asks or something fails/);
  assert.match(t, /One step per message/);
  const review = t.slice(t.indexOf('## Review point by point'));
  assert.deepEqual([...review.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6]);
});

test('setup: toda opción y subcomando que nombra existe en setup.js; permissions --apply solo con el sí explícito', () => {
  const t = SKILL.text;
  for (const flag of ['--profile', '--presentation', '--language', '--target', '--apply', '--check', '--record']) {
    assert.match(t, new RegExp(flag), flag);
    assert.ok(SETUP_SRC.includes(flag), flag);
  }
  assert.ok(SETUP_SRC.includes('--list'));
  assert.match(t, /conflicts --list/);
  assert.match(t, /Only after an explicit yes from the human, in their own turn, run the same command with `--apply`/);
  assert.match(t, /`notice`/);
  assert.match(t, /economy/);
});

test('setup: no es más larga que antes por más de un margen chico', () => {
  assert.ok(SKILL.text.length <= 7300, String(SKILL.text.length));
});

test('setup: las reglas retiradas van en templates/setup-retired.md; sin escribir antes de la pantalla y --apply solo tras el sí', () => {
  assert.match(SKILL.text, /templates\/setup-retired\.md/);
  const tpl = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'setup-retired.md'), 'utf8');
  assert.match(tpl, /setup\.js" retired`\. It writes nothing/);
  assert.match(tpl, /Only after that yes run `setup\.js retired --apply`/);
  assert.match(tpl, /run `--apply` only after an explicit yes from the human, in their own turn/);
});
