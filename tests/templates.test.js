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
