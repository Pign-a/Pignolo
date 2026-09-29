'use strict';
// Forma de la skill daily (hito 3b): el orden de 3a y las reglas de cada escritor.
const test = require('node:test');
const assert = require('node:assert');
const { readSkill, brokenReferences } = require('./skill-forms');

test('daily: frontmatter invocable por el modelo (D-3b-2), entrada por pignolo:entry y referencias reales', () => {
  const s = readSkill('daily');
  assert.strictEqual(s.data.name, 'daily');
  assert.strictEqual(s.data['disable-model-invocation'], undefined);
  assert.match(s.data.description, /pignolo:entry/);
  assert.deepStrictEqual(brokenReferences(s.text), []);
});

test('daily: orden de 3a (task del test-writer, rojo, testRef, implementer) hasta el merge', () => {
  const { text } = readSkill('daily');
  const order = [
    /run\.js" start --flow daily/,
    /git worktree add -b task\/daily\/<YYYY-MM-DD>-<slug> "<main>\/\.pignolo\/worktrees\/<slug>"/,
    /--agent pignolo:test-writer/,
    /Prove red yourself/,
    /--test-ref <T>[^\n]*--agent pignolo:implementer/,
    /risk\.js" --diff <base>/,
    /pignolo:review/,
    /git merge --no-ff -F/,
    /run\.js" end/,
  ];
  let at = 0;
  for (const re of order) {
    const m = re.exec(text.slice(at));
    assert.ok(m, `falta o está fuera de orden: ${re}`);
    at += m.index + m[0].length;
  }
});

test('daily: status tras cada escritor, re-registro, renew, barras normales, modelos y categorías', () => {
  const { text } = readSkill('daily');
  for (const re of [/run\.js" status/, /handback\.accepted/, /At most 2 automatic continuations/, /register the task again/,
    /run\.js" renew/, /uses `\/`/, /setup\.js" models/, /templates\/task-card\.md/, /category `irreversible`/]) {
    assert.match(text, re);
  }
});
