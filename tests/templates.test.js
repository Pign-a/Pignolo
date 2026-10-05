'use strict';
// Plantillas de texto de las skills de carriles (hito 3b): forma, no texto libre.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const tpl = (n) => fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', n), 'utf8');
const CATEGORIES = ['identity', 'scope', 'costs', 'dependencies', 'irreversible', 'security', 'contract', 'rule-conflict',
  'scope-card', 'test-authorization', 'needs-review-batch', 'judge-conflict', 'live-check-input', 'quota'];

test('question.md: dos capas, la lista cerrada de categorías completa, recomendación', () => {
  const t = tpl('question.md');
  for (const c of CATEGORIES) assert.ok(t.includes(c), c);
  assert.ok(t.indexOf('In plain words') < t.indexOf('Technical detail'));
  assert.match(t, /Recommendation/);
});

test('question.md: AskUserQuestion call, "(Recomendado)" and the text fallback; the 14 categories stay', () => {
  const t = tpl('question.md');
  assert.match(t, /AskUserQuestion/);
  assert.match(t, /\(Recomendado\)/);
  assert.match(t, /Without `AskUserQuestion`[^\n]*text form/);
  assert.doesNotMatch(t, /One question per message/i);
  for (const c of CATEGORIES) assert.ok(t.includes(c), c);
});

test('task-card.md: worktree, archivos, gate con --task, cierre con las tres palabras', () => {
  const t = tpl('task-card.md');
  for (const re of [/Worktree:/, /Files you may touch/, /gate\.js" --level on-done --task/, /DONE, BLOCKED or NEEDS_CONTEXT/, /forward slashes/]) {
    assert.match(t, re);
  }
});

test('review-summary.md: dos capas y los refutados siempre listados', () => {
  const t = tpl('review-summary.md');
  assert.ok(t.indexOf('In plain words') < t.indexOf('Technical detail'));
  for (const re of [/APPROVED \| ESCALATED/, /Refuted/, /Not reproduced/, /Suspect/, /ledger\.js save/]) assert.match(t, re);
});

// Hito 4b: la test-card de §9.1 dentro de la tarjeta del test-writer.
test('task-card.md: sección Test-card con los campos de §9.1 en orden, Protects, characterization, sabotaje y holdout', () => {
  const t = tpl('task-card.md');
  const at = t.indexOf('## Test-card');
  assert.ok(at > 0, 'falta la sección ## Test-card');
  const card = t.slice(at);
  let i = 0;
  for (const field of ['Behavior:', 'Origin of the expected value:', 'Protects:', 'What to break:', 'How red looks:',
    'What else would make it pass:', 'Level:', 'Doubles:', 'Real path:', 'Data:', 'Where:', 'Red is proved by:']) {
    const j = card.indexOf(field, i);
    assert.ok(j >= 0, `falta o está fuera de orden: ${field}`);
    i = j + field.length;
  }
  assert.match(t, /Tests that define done: [^\n]*`Red is proved by` \(`test-first` or `sabotage`\)/);
  for (const re of [/`Protects: <id> · Breaks if: <what>`/, /first 20 lines/, /`characterization`/,
    /after the implementer's change is committed/, /scripts\/sabotage\.js" --patch/, /`<main>\/\.pignolo\/tmp\/holdout\/<plan>\/<path>` in the main checkout, never in the task worktree/]) {
    assert.match(card, re);
  }
});

test('task-card.md: la línea Approved visual trae el comando de verificación', () => {
  const line = tpl('task-card.md').split('\n').find((l) => l.startsWith('- Approved visual'));
  assert.ok(line, 'sin línea Approved visual');
  assert.match(line, /approved-verify\.js" --path/);
  assert.match(line, /BLOCKED/);
});

test('question.md: the recommended option goes first and marked; the others keep their order (spec §4.4)', () => {
  const t = tpl('question.md');
  assert.match(t, /recommended option goes first/i);
  assert.match(t, /others keep\s+the order/i);
  assert.doesNotMatch(t, /never summarized or reordered/);
  const opts = [...t.matchAll(/^\d\. .*$/gm)].map((m) => m[0]);
  assert.match(opts[0], /recommended mark/i);
  assert.doesNotMatch(opts.slice(1).join('\n'), /recommended/i);
});

test('plan-audit.md: the gate, minors outside the plan file, ids, the closed list and sonnet for the re-audit', () => {
  const t = tpl('plan-audit.md');
  for (const re of [/sha256 of the current plan file/, /not written into the plan file/, /`audit\.minors`/, /`R2x1-1`/, /"closed": \[ids\]/, /`model: sonnet`/, /carried/]) assert.match(t, re);
});
