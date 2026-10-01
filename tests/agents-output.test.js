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

// Hito 5b, Task 15: cartas de spec-reviewer, plan-auditor e implementer.
const { SECTIONS } = require('../plugins/pignolo/lib/scope-card');
const { parseReview, parseVerification } = require('../plugins/pignolo/lib/plan-audit');
const jsonBlocks = (s) => [...s.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);

test('spec-reviewer: nombra los 8 encabezados de SECTIONS, en orden', () => {
  const s = agent('spec-reviewer');
  let at = -1;
  for (const h of SECTIONS) {
    const i = s.indexOf(`## ${h}\n`, at + 1);
    assert.ok(i > at, `falta o desordenado: ## ${h}`);
    at = i;
  }
  assert.match(s, /Added without being asked: exactly `none`, or one bullet per item as `A1: \.\.\.`/);
  assert.match(s, /ends with the quote from the request it comes from/);
});

test('spec-reviewer: el ejemplo de salida termina en una palabra de veredicto sola', () => {
  const s = agent('spec-reviewer');
  const ex = /# Output\s+Plain text in this order:\s+```text\n([\s\S]*?)```/.exec(s);
  assert.ok(ex, 'sin ejemplo de salida');
  const last = ex[1].trimEnd().split('\n').pop();
  assert.match(last, /^(APPROVE|REQUEST_CHANGES|ESCALATE)$/);
  assert.match(s, /last line of the report is the verdict word alone/);
});

test('plan-auditor: dos modos y el ejemplo de cada bloque json parsea', () => {
  const s = agent('plan-auditor');
  assert.match(s, /# Mode review/);
  assert.match(s, /# Mode verify/);
  assert.match(s, /No Bash: a hook denies it in this mode/);
  assert.match(s, /at most 8/);
  const [review, verify] = jsonBlocks(s);
  const r = parseReview(`x\n\`\`\`json\n${review}\`\`\`\n`);
  assert.strictEqual(r.error, undefined, r.error);
  assert.ok(r.claims.length >= 1 && r.findings.length >= 1);
  const claims = r.claims;
  const v = parseVerification(`\`\`\`json\n${verify}\`\`\``, claims);
  assert.strictEqual(v.error, undefined, v.error);
  assert.deepStrictEqual(v.missing, []);
  assert.match(s, /scratch\//);
  assert.match(s, /cannot finish with fewer experiments than claims/);
});

test('plan-auditor: ya no manda copiar el plan a una copia del repo (sin replay)', () => {
  const s = agent('plan-auditor');
  assert.doesNotMatch(s, /scratch copy/);
  assert.doesNotMatch(s, /copy each code block/i);
  assert.match(s, /Never copy the plan or its code blocks into a copy of the repository/);
});

test('implementer: con aprobado visual corre approved-verify.js y con exit 1 queda BLOCKED', () => {
  const s = agent('implementer');
  assert.match(s, /approved-verify\.js/);
  assert.match(s, /Exit 1[^\n]*`BLOCKED`/);
  assert.match(s, /never edit it/);
});
