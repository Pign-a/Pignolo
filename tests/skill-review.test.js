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

// Revisión final 3b (2): el árbol sucio se mira ANTES de abrir el flujo, y start puede fallar.
for (const [name, step] of [['review', /1\. \*\*Flow and level\.\*\*/], ['judgment', /0\. \*\*Asked by the human\*\*/]]) {
  test(`${name}: a pedido del humano, git status --porcelain antes de run.js start, exit 1 de start y catch-all de end`, () => {
    const { text } = readSkill(name);
    const at = text.search(step);
    assert.ok(at >= 0);
    const line = text.slice(at).split('\n')[0];
    const porcelain = line.search(/cd "<main>" && git status --porcelain/);
    const start = line.search(/run\.js" start --flow review/);
    assert.ok(porcelain >= 0 && porcelain < start, 'el chequeo va antes de abrir el flujo');
    assert.match(line, /start[^\n]*exits 1[^\n]*stop and tell the human what the message says/);
    assert.match(text, /If you stop after opening the flow yourself, for any reason, run `run\.js end`/);
  });
}

// Revisión final 3b (3): una revisión solo-informe nunca escribe ni commitea, tampoco vía judgment.
test('review: pasa el modo solo-informe a judgment; resultado solo-informe según lo open en <L>', () => {
  const { text } = readSkill('review');
  assert.match(text, /pignolo:judgment[^\n]*report-only mode when this review is report-only/);
  assert.match(text, /APPROVED when `next` is `done`[^\n]*In report-only mode, APPROVED only if no BLOCKER or CRITICAL finding is `open` in `<L>`/);
  assert.doesNotMatch(text, /the frozen check of step 2 says so/);
});

test('judgment: modo solo-informe (pasos 1-4, 7 y 8; sin test-writer ni fixer); pedido directo = solo-informe salvo un sí explícito', () => {
  const { text } = readSkill('judgment');
  assert.match(text, /\*\*Report-only mode\*\*[^\n]*only steps 1 to 4, 7 and 8[^\n]*no test-writer and no fixer[^\n]*never commit/);
  assert.match(text, /asks for Judgment Day directly[^\n]*report-only unless they said an explicit yes to changing code/);
});

// Revisión final 3b (13): judgment usa <task> y <R> del fixer de review: definidos.
test('judgment: define <task>, <round> y <R>', () => {
  const { text } = readSkill('judgment');
  assert.match(text, /`<task>` is the task id the review skill passes[^\n]*or `judgment-<first 7 of the SHA>`/);
  assert.match(text, /`<round>` is the `round` of `<J>`/);
  assert.match(text, /`<R>` is the commit of the red repro tests of step 5/);
});

// Revisión final 3b (14): el test de reproducción es un archivo nuevo; borrar los no rojos no toca tests existentes.
test('review: un archivo de test nuevo por hallazgo; solo esos se borran si no dan rojo', () => {
  const { text } = readSkill('review');
  assert.match(text, /one new test file per finding[^\n]*does not exist at `<SHA>`/);
  assert.match(text, /remove the new test files that did not go red[^\n]*never an existing test/);
});
