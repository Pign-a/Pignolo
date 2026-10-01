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

// ---- arreglos de la revisión final de 5b (0.8.1) ----
const { STAGES } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const readFile = (rel) => fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');

test('plan (I1): cada advance de la skill lleva lo que plan-state.advance exige: --plan-file en plan-written y audited', () => {
  const seen = [];
  for (const m of text.matchAll(/advance --plan <plan> --to ([a-z-]+)([^\n`]*)/g)) {
    seen.push(m[1]);
    if (['plan-written', 'audited'].includes(m[1])) assert.match(m[2], /--plan-file "<path>"/, `advance --to ${m[1]} sin --plan-file`);
  }
  for (const s of ['claims', 'spec-review', 'scope-card', 'plan-written', 'audited', 'executing']) assert.ok(seen.includes(s), `falta advance --to ${s}`);
  for (const s of STAGES.slice(1)) assert.ok(text.includes(`\`${s}\``) || seen.includes(s), `la skill no nombra la etapa ${s}`);
});

test('plan (I2): el aprobado visual y su decisión se commitean por ruta en int/<plan> antes de los worktrees de las tareas', () => {
  const step9 = text.slice(text.indexOf('9. **Approved visuals.**'));
  assert.ok(step9.length > 0, 'falta el paso 9');
  assert.match(step9, /git add design\/approved\/<flow>\/ \.pignolo\/state\/decisions\//);
  assert.match(step9, /git commit -F/);
  assert.match(step9, /int\/<plan>[^\n]*before[^\n]*worktree/);
});

test('plan (M3): una afirmación refutada se cierra corrigiendo la spec y resolviéndola con --superseded', () => {
  const step3 = text.slice(text.indexOf('3. **Review the spec'), text.indexOf('4. **The scope-card.**'));
  assert.match(step3, /refuted/);
  assert.match(step3, /--status refuted --superseded --note "<what changed>"/);
});

test('plan (M4): la tarjeta que se guarda va de ## Goal al final de ## Cost estimate', () => {
  const step4 = text.slice(text.indexOf('4. **The scope-card.**'), text.indexOf('5. **The plan.**'));
  assert.match(step4, /from `## Goal` to the end of `## Cost estimate`/);
});

test('plan (M5): plan-audit.js check lleva --root "<main>"', () => {
  assert.match(text, /plan-audit\.js" check[^\n]*--root "<main>"/);
});

test('plan (M6): el presupuesto previo a la aprobación lo hace cumplir solo runnable; la skill lo declara', () => {
  const step7 = text.slice(text.indexOf('7. **Before the approval'), text.indexOf('8. **Per batch.**'));
  assert.match(step7, /nothing else stops a task that `runnable` does not list/);
});

test('plan (M7): todo placeholder de ruta va entre comillas y toda forma corta lleva node "<P>/scripts/…" --cwd "<main>"', () => {
  const unquoted = /--(?:file|plan-file|quote-file|from|path|report-file|request-file|patch|html|options-file) </;
  for (const [name, body] of [['skills/plan/SKILL.md', text], ['agents/implementer.md', readFile('agents/implementer.md')], ['templates/task-card.md', readFile('templates/task-card.md')]]) {
    const m = unquoted.exec(body);
    assert.ok(!m, `${name}: placeholder de ruta sin comillas: ${m && m[0]}`);
  }
  assert.match(text, /Every `plan\.js`, `plan-audit\.js` and `approved\.js` call below is `node "<P>\/scripts\/<script>" … --cwd "<main>"`/);
});
