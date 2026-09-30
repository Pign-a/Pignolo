'use strict';
// Forma de salida de los revisores (hito 3b): un bloque json que ledger.js build copia tal
// cual. Solo forma, no el texto libre.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const agent = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');
const REVIEWERS = {
  'review-risk': 'risk', 'review-resilience': 'resilience', 'review-readability': 'readability',
  'review-reliability': 'reliability', 'review-testability': 'testability', 'judge-a': 'judge-a', 'judge-b': 'judge-b',
};

for (const [name, lens] of Object.entries(REVIEWERS)) {
  test(`${name}: hallazgos en un bloque json con las claves del ledger y su lente`, () => {
    const s = agent(name);
    assert.match(s, /one fenced `json` block/);
    assert.match(s, /keys in this order: `id`[^\n]*`lens` \(`[a-z-]+`\), `location` \(`path:line`[^\n]*`severity`, `evidence`[^\n]*`repro`/);
    assert.ok(s.includes(`\`lens\` (\`${lens}\`)`));
    assert.match(s, /APPROVE[^\n]*REQUEST_CHANGES[^\n]*ESCALATE/);
  });
}

for (const name of Object.keys(REVIEWERS)) {
  test(`${name}: el bloque json va siempre, también vacío, antes del veredicto`, () => {
    assert.match(agent(name), /The block is required in every report, before the verdict word: with no findings it is exactly `\[\]`/);
  });
}

test('refuter: veredictos en un bloque json claim, verdict, reason', () => {
  assert.match(agent('refuter'), /one fenced `json` block[^\n]*keys in this order: `claim`[^\n]*`verdict`, `reason`/);
});

// Calibración del hito 3 (decisiones del autor, 2026-09-30). Solo forma: fijan que la regla
// esté escrita en el prompt; si el modelo la cumple lo miden las evals.
for (const name of Object.keys(REVIEWERS)) {
  test(`${name}: bloquea solo por lo que el diff introduce o empeora; lo anterior va como WARNING o SUGGESTION`, () => {
    const s = agent(name);
    assert.match(s, /BLOCKER and CRITICAL are only for problems the diff introduces or makes worse/);
    assert.match(s, /pre-existing problem[^\n]*WARNING or SUGGESTION[^\n]*predates the change/);
    assert.match(s, /A defect the diff introduces or makes worse keeps its full severity/);
    assert.match(s, /A missing control in code the diff adds counts as introduced/);
  });

  test(`${name}: la última línea del informe es solo la palabra del veredicto, y la regla cierra el prompt`, () => {
    const lines = agent(name).trimEnd().split('\n');
    const last = lines[lines.length - 1];
    assert.match(last, /The last line of your report is only the verdict word/);
    assert.match(last, /Nothing after it/);
    assert.match(last, /File reviewed:/);
  });
}

test('review-resilience: CRITICAL solo si rompe la promesa de la tarea o pierde datos; un endurecimiento es WARNING', () => {
  const s = agent('review-resilience');
  assert.match(s, /CRITICAL only when it breaks what the task-card promises or loses data in a realistic scenario within the task's scope/);
  assert.match(s, /Hardening beyond what the task-card promises[^\n]*is WARNING, with the reason/);
  assert.doesNotMatch(s, /fsync/); // no copiar el caso limpio de la eval al prompt
  // El defecto plantado (un catch que devuelve true) sigue siendo bloqueante: rompe la promesa.
  assert.match(s, /reports success after a failed write[^\n]*BLOCKER/);
});
