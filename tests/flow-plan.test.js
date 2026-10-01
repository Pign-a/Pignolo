'use strict';
// Forma de la skill plan (hito 5b, Task 16): el orden de los pasos y las frases que
// hacen cumplir §4.5, §5.3 y §6. Los comandos que nombra tienen que existir de verdad.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { readSkill, brokenReferences } = require('./skill-forms');
const { PLUGIN_ROOT } = require('./helpers');

const { text, data } = readSkill('plan');

test('plan: frontmatter, se entra por pignolo:entry y las referencias existen', () => {
  assert.strictEqual(data.name, 'plan');
  assert.match(data.description, /pignolo:entry/);
  assert.deepStrictEqual(brokenReferences(text), []);
});

test('plan: los pasos van en este orden', () => {
  const order = [
    /plan\.js"? claims set/, /refuter/, /scope-card save/, /scope-card approve/, /plan-audit\.js"? begin-review/,
    /`probes`|plan-audit\.js"? probes/, /begin-verify/, /plan-audit\.js"? finish/, /advance --plan <plan> --to audited/,
    /plan\.js"? runnable/, /validator/,
  ];
  let at = 0;
  for (const re of order) {
    const m = re.exec(text.slice(at));
    assert.ok(m, `falta o está fuera de orden: ${re}`);
    at += m.index + m[0].length;
  }
});

test('plan: nunca replay, y solo la aprobación del humano en su turno', () => {
  assert.match(text, /never replay/i);
  assert.match(text, /only the human's approval in their own turn/i);
});

test('plan: sin restauraciones por git que pisan trabajo ajeno', () => {
  assert.doesNotMatch(text, /git checkout -- /);
  assert.doesNotMatch(text, /git stash/);
});

test('plan: la auditoría usa un Agent por modo, los dos modos y las sondas que solo refutan', () => {
  assert.match(text, /mode `review`/);
  assert.match(text, /mode `verify`/);
  assert.match(text, /only refute/);
  assert.match(text, /one `Agent` per mode/);
});

test('plan: cada verbo de plan.js y plan-audit.js que nombra existe en el script', () => {
  const src = (n) => fs.readFileSync(path.join(PLUGIN_ROOT, 'scripts', n), 'utf8');
  for (const [script, re] of [['plan.js', /(?<!-)plan\.js"? ((?:claims|scope-card|tasks) [a-z]+|[a-z]+)/g], ['plan-audit.js', /plan-audit\.js"? ([a-z-]+)/g]]) {
    const body = src(script);
    const verbs = new Set([...text.matchAll(re)].map((m) => m[1]));
    assert.ok(verbs.size >= 3, `${script}: pocos verbos`);
    for (const v of verbs) assert.ok(body.includes(`'${v}'`) || body.includes(`${v}:`), `${script} no tiene el verbo ${v}`);
  }
});

test('plan: ejecución serial con los pasos de daily, merge con pregunta irreversible y scope-gate', () => {
  assert.match(text, /pignolo:daily/);
  assert.match(text, /`irreversible`/);
  assert.match(text, /scope-gate/);
  assert.match(text, /approved\.js" save/);
});
