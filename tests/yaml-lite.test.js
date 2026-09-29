'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseFrontmatter, YamlLiteError } = require('../plugins/pignolo/lib/yaml-lite');

const fm = (yaml, body = 'notas') => `---\n${yaml}\n---\n${body}`;

test('valores válidos', async (t) => {
  const cases = [
    ['escalar y cuerpo', fm('type: code-tested'), (r) => { assert.strictEqual(r.data.type, 'code-tested'); assert.strictEqual(r.body, 'notas'); }],
    ['el ":" de adentro no corta', fm('gates:\n  on-done: npm run test:unit\n  pre-merge: "npm test -- --repeat 3"'), (r) => {
      assert.strictEqual(r.data.gates['on-done'], 'npm run test:unit');
      assert.strictEqual(r.data.gates['pre-merge'], 'npm test -- --repeat 3');
    }],
    ['lista en bloque', fm('test-paths:\n  - tests/\n  - "*.spec.ts"'), (r) => assert.deepStrictEqual(r.data['test-paths'], ['tests/', '*.spec.ts'])],
    ['booleano y comillas simples', fm("mutation: false\nprofile: 'max'"), (r) => { assert.strictEqual(r.data.mutation, false); assert.strictEqual(r.data.profile, 'max'); }],
    ['comentarios y vacías', fm('# comentario\n\ntype: docs\n  \n# otro'), (r) => assert.deepStrictEqual(r.data, { type: 'docs' })],
    ['CRLF', '---\r\ntype: docs\r\n---\r\nhola', (r) => { assert.strictEqual(r.data.type, 'docs'); assert.strictEqual(r.body, 'hola'); }],
    ['sin --- inicial', 'solo texto\ntype: docs', (r) => { assert.deepStrictEqual(r.data, {}); assert.strictEqual(r.body, 'solo texto\ntype: docs'); }],
  ];
  for (const [name, text, check] of cases) await t.test(name, () => check(parseFrontmatter(text)));
});

test('errores con número de línea', async (t) => {
  const cases = [
    ['tab al comienzo', fm('type: docs\n\tprofile: max'), 3],
    ['dos niveles (clave vacía en el mapa)', fm('gates:\n  a:\n    b: 1'), 3],
    ['dos niveles (sangría mayor)', fm('gates:\n  a: 1\n    b: 2'), 4],
    ['mezcla lista y mapa', fm('x:\n  - a\n  k: v'), 4],
    ['línea sin clave', fm('type: docs\nsolo texto'), 3],
    ['sin cierre', '---\ntype: docs\n', null],
    ['I3: lista en línea', fm('test-paths: [tests/**]'), 2],
    ['I3: mapa en línea', fm('gates: { on-done: npm test }'), 2],
    ['I3: ítem de lista en línea', fm('x:\n  - [a, b]'), 3],
  ];
  for (const [name, text, line] of cases) {
    await t.test(name, () => {
      assert.throws(() => parseFrontmatter(text), (e) => {
        assert.ok(e instanceof YamlLiteError);
        if (line !== null) assert.strictEqual(e.line, line);
        assert.match(e.message, /^yaml-lite: línea \d+: /);
        return true;
      });
    });
  }
});
