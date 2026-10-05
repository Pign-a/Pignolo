'use strict';
// Reglas de las preguntas con selector (RQ-05, RQ-09, RQ-11, RQ-13) y la carta de re-auditoría (RQ-10).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const read = (...p) => fs.readFileSync(path.join(PLUGIN_ROOT, ...p), 'utf8');
const SEVEN = ['entry', 'trivial', 'daily', 'plan', 'present', 'close-session', 'review'];
const PANEL = ['daily', 'plan', 'present', 'close-session', 'review'];

test('RQ-05: the seven skills and the question template say the chosen option is the yes for that question only, and what the quote holds', () => {
  for (const name of SEVEN) {
    const t = read('skills', name, 'SKILL.md');
    assert.match(t, /option chosen in `AskUserQuestion` is (the explicit yes|that approval) for that question only/, name);
    assert.match(t, /the question and the chosen label, literal, or (their|the human's) free text/, name);
  }
  const q = read('templates', 'question.md');
  assert.match(q, /option chosen in `AskUserQuestion` is the human's explicit yes for that question only/);
  assert.match(q, /the question and the chosen label, literal, or their free text/);
});

test('RQ-09: the panel rule sends a question to the panel only when it stays pending', () => {
  for (const name of PANEL) {
    const t = read('skills', name, 'SKILL.md');
    assert.match(t, /stays pending[^:]*also goes to the panel; one answered at once through `AskUserQuestion` does not/, name);
    assert.doesNotMatch(t, /A question that ends your turn also goes to the panel/, name);
  }
  const q = read('templates', 'question.md');
  assert.match(q, /stays pending[^:]*also written to the panel[^:]*one answered at once through `AskUserQuestion` is not/);
  assert.doesNotMatch(q, /ends your turn waiting for the human is also written/);
});

test('RQ-13: present asks artifact/texto through the selector and says what to do with more than 4 options', () => {
  const t = read('skills', 'present', 'SKILL.md');
  assert.match(t, /`1\) artifact` \/ `2\) texto` as the two options of one `AskUserQuestion`/);
  assert.doesNotMatch(t, /closed numbered list/);
  assert.match(t, /at most 4 options; with more, a numbered list in text/);
  assert.match(read('templates', 'question.md'), /More than 4 options: group them into two questions, or use the text form with a numbered list/);
});

test('RQ-11: the plan skill names the sonnet exception to the models rule and the economy notice does too', () => {
  assert.match(read('skills', 'plan', 'SKILL.md'), /the bounded re-audit of step 6 is the one exception: `sonnet`/);
  assert.match(read('lib', 'economy-notice.js'), /la re-auditoría acotada del plan va en sonnet/);
});

test('RQ-10: the plan-auditor charter covers the re-audit brief: the closed list, the ids and the carried claims', () => {
  const t = read('agents', 'plan-auditor.md');
  assert.match(t, /## Re-audit brief \(round 2\)/);
  assert.match(t, /"closed": \[ids\]/);
  assert.match(t, /missing from `closed`, or listed there and also returned as a finding, counts as blocking/);
  assert.match(t, /previous id in `id`/);
  assert.match(t, /added by the script: do not repeat them/);
});

test('RQ-03: the plan skill no longer tells to write the minors into the plan; the template keeps them in plan.json', () => {
  assert.doesNotMatch(read('skills', 'plan', 'SKILL.md'), /note them at the end of the plan/);
  assert.match(read('templates', 'plan-audit.md'), /minors` never block and are not written into the plan file/);
});

test('R-7: the template offers the three options of an ESCALATE reaudit-findings and the extra round only with its flag; the skill names them', () => {
  const t = read('templates', 'plan-audit.md');
  for (const re of [/"Arreglar y re-auditar solo lo cambiado \(Recomendado\)"/, /"Auditar de nuevo entero"/, /"Dejar el plan acá"/, /--extra-round/, /only after the human chose this option/, /own question and its own flag/, /None of the three skips the gate/]) assert.match(t, re);
  const skill = read('skills', 'plan', 'SKILL.md');
  assert.match(skill, /reaudit-findings[^.]*`AskUserQuestion`: fix and re-audit only what changed, audit again in full, or leave the plan/);
});
