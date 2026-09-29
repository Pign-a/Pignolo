'use strict';
// Forma de las skills entry y trivial (hito 3b). Solo forma: el comportamiento de los
// scripts lo cubre tests/flow-lanes.test.js; el de los agentes, las evals y el checklist manual.
const test = require('node:test');
const assert = require('node:assert');
const { readSkill, brokenReferences } = require('./skill-forms');

for (const name of ['entry', 'trivial']) {
  test(`${name}: frontmatter invocable por el modelo (D-3b-2) y referencias reales`, () => {
    const s = readSkill(name);
    assert.strictEqual(s.data.name, name);
    assert.ok(s.data.description.length > 40);
    assert.strictEqual(s.data['disable-model-invocation'], undefined);
    assert.deepStrictEqual(brokenReferences(s.text), []);
  });
}

test('entry: dos capas con categoría, estado del flujo, piso de riesgo con barras normales', () => {
  const { text } = readSkill('entry');
  for (const re of [/templates\/question\.md/, /run\.js" status/, /risk\.js" --files-from/, /forward slashes/, /pignolo:trivial/, /pignolo:daily/]) {
    assert.match(text, re);
  }
});

test('entry: deriva a trivial o daily solo si el pedido autoriza un cambio; ante la duda, solo lectura y pregunta (D-3b-2)', () => {
  const { text } = readSkill('entry');
  assert.match(text, /When in doubt, stay read-only and ask/);
  const auth = text.search(/Does the request authorize a change\?/);
  assert.ok(auth >= 0 && text.search(/pignolo:trivial/) > auth && text.search(/pignolo:daily/) > auth, 'la autorización va antes del traspaso');
});

test('trivial: su description dice que se entra por pignolo:entry (D-3b-2)', () => {
  assert.match(readSkill('trivial').data.description, /pignolo:entry/);
});

test('trivial: gate on-done, riesgo sobre el diff real, commit -F y cierre del flujo', () => {
  const { text } = readSkill('trivial');
  for (const re of [/run\.js" start --flow trivial/, /gate\.js" --level on-done/, /risk\.js" --diff HEAD/, /git commit -F/, /run\.js" end/]) {
    assert.match(text, re);
  }
});
