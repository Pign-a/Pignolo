'use strict';
// Forma de la skill present (hito 5b, Task 17): las frases que la hacen cumplir §4.6.
const test = require('node:test');
const assert = require('node:assert');
const { readSkill, brokenReferences } = require('./skill-forms');

const { text, data } = readSkill('present');

test('present: frontmatter invocable por el modelo y referencias reales', () => {
  assert.strictEqual(data.name, 'present');
  assert.strictEqual(data['disable-model-invocation'], undefined);
  assert.deepStrictEqual(brokenReferences(text), []);
});

test('present: decide, luego elección artifact/texto, y check antes de publicar (en ese orden)', () => {
  const i = text.indexOf('present.js" decide');
  const j = text.indexOf('`1) artifact` / `2) texto`');
  const k = text.indexOf('present.js" check');
  const l = text.indexOf('Call the Artifact tool');
  assert.ok(i >= 0 && j > i && k > j && l > k, `orden: ${[i, j, k, l]}`);
  assert.match(text, /Publish only with exit 0/);
  assert.match(text, /Never publish without a `check` exit 0/);
});

const PHRASES = [
  [/Never choose `artifact` for them/, 'nunca elige artifact por el humano'],
  [/author has not approved that template\), fall back to text for this content/, 'cae a texto sin aprobación'],
  [/Fall back to text, with a one-line notice, when there is no Artifact tool, when the form has no approved template, or when the canvas has no consent/, 'regla: cae a texto sin herramienta, sin aprobación y sin consentimiento'],
  [/`formats\.<form>` is `false`/, 'formato sin aprobación'],
  [/If the tool does not exist or the call fails, say so in one line and use text/, 'sin herramienta'],
  [/`canvas: false`[^\n]*local HTML/, 'sin consentimiento de lienzo'],
  [/identical options/, 'opciones idénticas'],
  [/`presentation: text` nothing is ever published/, 'text nunca publica'],
  [/It stays private/, 'publica privado'],
];
for (const [re, what] of PHRASES) {
  test(`present: ${what}`, () => assert.match(text, re));
}

test('present (M2): el rótulo de una opción es el texto literal del elemento data-option, sin descripción adentro', () => {
  assert.match(text, /The text of that element is the label, literally: put `data-option` on the element that holds only the label/);
});
