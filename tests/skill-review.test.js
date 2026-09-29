'use strict';
// Forma de las skills review y judgment (hito 3b).
const test = require('node:test');
const assert = require('node:assert');
const { readSkill, brokenReferences } = require('./skill-forms');

function inOrder(text, order) {
  let at = 0;
  for (const re of order) {
    const m = re.exec(text.slice(at));
    assert.ok(m, `falta o está fuera de orden: ${re}`);
    at += m.index + m[0].length;
  }
}

for (const name of ['review', 'judgment']) {
  test(`${name}: frontmatter invocable por el modelo (D-3b-2) y referencias reales`, () => {
    const s = readSkill(name);
    assert.strictEqual(s.data.name, name);
    assert.strictEqual(s.data['disable-model-invocation'], undefined);
    assert.deepStrictEqual(brokenReferences(s.text), []);
  });

  test(`${name}: a pedido del humano, el nivel sale de risk.js sobre el diff`, () => {
    assert.match(readSkill(name).text, /risk\.js" --diff <base> --cwd "<wt>"/);
  });
}

test('review: congelado, plan, build verbatim, refute, repro, next, round, save siempre', () => {
  const { text } = readSkill('review');
  for (const re of [/ledger\.js" frozen/, /ledger\.js" plan --level/, /ledger\.js" build --sha/, /ledger\.js" refute --ledger/,
    /ledger\.js repro --ledger/, /ledger\.js" next --ledger/, /ledger\.js" round --ledger/, /ledger\.js" save --ledger/,
    /verbatim/, /run\.js" task --id <task>-repro/, /--agent pignolo:fixer/, /pignolo:judgment/, /templates\/review-summary\.md/]) {
    assert.match(text, re);
  }
});

test('review: frozen solo alrededor de los revisores; repro y fix mueven HEAD y entran por round --sha <SHA2>', () => {
  const { text } = readSkill('review');
  assert.doesNotMatch(text, /before accepting any result/);
  inOrder(text, [
    /ledger\.js" frozen --cwd "<wt>" --sha <SHA>`/,
    /Dispatch every lens/,
    /Dispatch `refuters` instances/,
    /--base <SHA>[^\n]*--agent pignolo:test-writer/,
    /--base <SHA>[^\n]*--test-ref <R>[^\n]*--agent pignolo:fixer/,
    /ledger\.js" frozen --cwd "<wt>" --sha <SHA2>`/,
    /dispatch the lenses that produced the confirmed findings/,
    /ledger\.js" round --ledger "<L>" --sha <SHA2>/,
  ]);
});

test('review: solo informe con cambios sin commitear en <main> → avisa y para, nunca commitea', () => {
  const { text } = readSkill('review');
  assert.match(text, /Report-only mode[^\n]*uncommitted[^\n]*stop[^\n]*never commit/);
});

test('judgment: su description dice que se entra por pignolo:review o a pedido explícito (D-3b-2)', () => {
  const d = readSkill('judgment').data.description;
  assert.match(d, /pignolo:review/);
  assert.match(d, /explicitly asks/);
});

test('judgment: jueces ciegos en paralelo, judgment + build --judgment, judge-conflict, save --kind judgment', () => {
  const { text } = readSkill('judgment');
  for (const re of [/pignolo:judge-a/, /pignolo:judge-b/, /Never show one judge the other/, /ledger\.js" judgment/,
    /--judgment "<j\.json>"/, /category `judge-conflict`/, /--kind judgment/]) {
    assert.match(text, re);
  }
});

test('judgment: la ronda siguiente congela <SHA2> y vuelve a emparejar con judgment + round --judgment', () => {
  const { text } = readSkill('judgment');
  assert.doesNotMatch(text, /before accepting any result/);
  inOrder(text, [
    /ledger\.js" frozen --cwd "<wt>" --sha <SHA2>`/,
    /ledger\.js" judgment "<a2\.json>" "<b2\.json>"/,
    /ledger\.js" round --ledger "<J>" --sha <SHA2>[^\n]*--judgment "<j2\.json>"/,
  ]);
});
