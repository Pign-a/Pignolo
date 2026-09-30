'use strict';
// Cartas de los roles de tests (hito 4b): lo que 4a construyó (sabotaje, semilla, holdout,
// Protects, escritura por rol) escrito donde cada agente lo lee. Solo forma: si el modelo lo
// cumple lo miden las evals (tests/evals/testing-cases.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const agent = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');

test('implementer: rojo test-first, nunca romper y restaurar a mano; semilla del sello; no probar otro camino hacia los tests', () => {
  const s = agent('implementer');
  assert.doesNotMatch(s, /revert or mutate the code under test/);
  assert.match(s, /Never break and restore code by hand/);
  assert.match(s, /`Red is proved by: sabotage`[^\n]*must stay green[^\n]*`NEEDS_CONTEXT`/);
  assert.match(s, /scripts\/sabotage\.js/);
  assert.match(s, /--seed <seedOffered>/);
  assert.match(s, /never rerun until green/);
  assert.match(s, /`seedOffered` of the final seal/);
  assert.match(s, /do not try another way/);
});

test('test-writer: sin Bash (D-4-1), test-card, Protects en las primeras 20 líneas, rotura como comportamiento, holdout y sin debilitar', () => {
  const s = agent('test-writer');
  assert.match(s, /^tools: Read, Grep, Glob, Edit, Write$/m);
  assert.match(s, /Test-card/);
  assert.match(s, /`Protects: <id> · Breaks if: <what>` within the first 20 lines/);
  assert.doesNotMatch(s, /apply as written/);
  assert.match(s, /as a behavior of the code under test/);
  assert.match(s, /`<main>\/\.pignolo\/tmp\/holdout\/<plan>\/`, in the main checkout: never in the task worktree/);
  assert.match(s, /skip, only, todo, retries/);
});

test('review-testability: la rotura va como diff unificado en repro para confirmarla con sabotage.js; Protects y characterization', () => {
  const s = agent('review-testability');
  assert.match(s, /unified diff/);
  assert.match(s, /scripts\/sabotage\.js/);
  assert.match(s, /stays green with the patch/);
  // F5: la sección Output define repro también para el decorativo (si no, la carta se contradice).
  assert.match(s, /`repro` \(for a decorative test, the unified diff of the break you used, starting with `--- a\/<path>`/);
  assert.match(s, /; otherwise the repro-spec: input, action and the wrong observable result; only for BLOCKER and CRITICAL\)/);
  assert.doesNotMatch(s, /`repro` \(the repro-spec: input, action/);
  assert.match(s, /`Protects: <id> · Breaks if: <what>` in its first 20 lines is a WARNING/);
  assert.match(s, /`characterization`/);
  assert.match(s, /A decorative test \(cannot fail\) is a BLOCKER/);
});

test('validator: corre el holdout con holdout.js run (sin copiarlo a mano) y sin veredicto es "not verified"', () => {
  const s = agent('validator');
  assert.match(s, /holdout\.js" run --plan <plan> --ref <batch SHA>/);
  assert.doesNotMatch(s, /copy the acceptance tests/);
  assert.match(s, /exit 2[^\n]*not verified/);
  assert.match(s, /Never open, copy or list the holdout files yourself/);
});
