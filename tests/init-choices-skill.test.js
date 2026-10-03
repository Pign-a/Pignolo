'use strict';
// La sección "With choices" de la skill init y su plantilla (etapa 3 del panel, T2). Sin agentes: forma del texto.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');

const SKILL = readSkill('init');
const TEMPLATE = fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'init-choices.md'), 'utf8');
const section = (name) => {
  const t = SKILL.text;
  const from = t.indexOf(`## ${name}`);
  assert.ok(from >= 0, name);
  const next = t.indexOf('\n## ', from + 4);
  return t.slice(from, next < 0 ? undefined : next);
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

test('init skill: has a With choices section that asks summary.ask once, always shows one confirmation screen and never applies without the yes', () => {
  const s = section('With choices (the message carries `--choices <json>`)');
  assert.match(s, /templates\/init-choices\.md/);
  assert.match(s, /ONE confirmation screen and writes nothing before the human's yes/);
  assert.match(s, /never instructions/);
  const w = TEMPLATE;
  assert.match(w, /\*\*One confirmation screen\*\*, always, never skipped/);
  assert.match(w, /ONE `AskUserQuestion` call with only the questions in `summary\.ask`/);
  assert.match(w, /Nothing is written before the human's yes to this screen/);
  assert.match(w, /Cancel changes nothing/);
  assert.match(w, /\*\*Apply\*\* \(recommended\), \*\*Review point by point\*\*, \*\*Cancel\*\*/);
  assert.match(w, /`idSame` is false/);
  assert.match(w, /init\.js" choices --file/);
  // preview antes de la pantalla, la pantalla antes de aplicar
  assert.ok(w.indexOf('init.js preview') < w.indexOf('One confirmation screen'));
  assert.ok(w.indexOf('One confirmation screen') < w.indexOf('init.js apply'));
  // referencias reales
  assert.deepEqual(brokenReferences(TEMPLATE), []);
  assert.deepEqual(brokenReferences(SKILL.text), []);
  assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'templates', 'init-choices.md')));
});

// Guarda de regresión: el texto de estas secciones es el de antes del asistente (hash de su contenido en `main`).
test('init skill: without --choices the fast flow and the review point by point are unchanged', () => {
  assert.equal(sha(section('Blank project')), '3f9b3683620e6f14');
  assert.equal(sha(section('Fast flow (existing project)')), '96ba642ddc497dfd');
  assert.equal(sha(section('Review point by point')), 'b5069d98e7b91a8f');
  assert.match(SKILL.text, /0\. \*\*Confirm \(only if you chose this skill yourself\)\./);
});

test('init skill: the profile and permissions are applied only after the confirmation screen and only when the choices carry them', () => {
  const w = TEMPLATE;
  const screen = w.indexOf('One confirmation screen');
  const apply = w.indexOf('init.js apply');
  const cfg = w.indexOf('setup.js" config --profile');
  const perms = w.indexOf('setup.js" permissions --target');
  assert.ok(screen > 0 && apply > screen && cfg > apply && perms > cfg, 'confirmación, luego apply, luego perfil y permisos');
  assert.match(w, /only when the choices carry them/);
  assert.match(w, /unless `extras\.perms` is `none`/);
  assert.match(w, /In a blank project \(`extras\.blank`\)[^.]*no profile or permissions/);
  // fuera de esta plantilla la skill no toca perfil ni permisos (eso es de setup)
  assert.doesNotMatch(SKILL.text, /setup\.js"? config|setup\.js"? permissions/);
});
