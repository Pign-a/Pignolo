'use strict';
// Decisiones pospuestas, cierre de sesión, tope de gasto y la skill status (T2 del panel).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo } = require('./helpers');
const { readSkill, brokenReferences } = require('./skill-forms');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));

const project = () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
};
const cli = (script, args, dir) => spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', `${script}.js`), ...args, '--cwd', dir], { encoding: 'utf8', timeout: 60000 });
const decisions = (dir) => panel.read(dir).state.decisions;

test('panel script: postpone marks the decision postponed with postponedAt and keeps it out of next and out of autoOpen', () => {
  const dir = project();
  panel.ask(dir, { question: 'uno', options: ['a', 'b'], recommended: 'a' });
  assert.equal(panel.refresh(dir).next.rule, 'decision');
  const r = cli('panel', ['postpone', '--id', 'Q-1'], dir);
  assert.equal(r.status, 0, r.stderr);
  const d = decisions(dir)[0];
  assert.equal(d.status, 'postponed');
  assert.ok(Number.isFinite(Date.parse(d.postponedAt)));
  // fuera de next: ya no es la sugerencia "decision" (con lo pospuesto solo, lo que sigue es cerrar la sesión)
  const next = panel.refresh(dir).next;
  assert.notEqual(next.rule, 'decision');
  assert.equal(next.rule, 'close-session');
  // fuera de autoOpen: el mod solo anuncia decisiones con status open
  assert.ok(decisions(dir).filter((x) => x.status === 'open').length === 0);
  assert.deepEqual(panel.postpone(dir, { id: 'Q-9' }), { ok: false, reason: 'unknown-id' });
});

test('close-session: postponed decisions are listed and reopened', () => {
  const dir = project();
  panel.ask(dir, { question: 'uno', options: ['a'] });
  panel.ask(dir, { question: 'dos', options: ['a'] });
  panel.ask(dir, { question: 'tres', options: ['a'] });
  panel.postpone(dir, { id: 'Q-1' });
  panel.postpone(dir, { id: 'Q-2' });
  panel.answer(dir, { id: 'Q-3', answer: 'a' });
  const r = cli('close-session', ['panel'], dir);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.reopened.map((x) => [x.id, x.question]), [['Q-1', 'uno'], ['Q-2', 'dos']]);
  assert.deepEqual(decisions(dir).map((d) => d.status), ['open', 'open', 'answered']);
  // la skill lo pide y no responde por el humano
  const s = readSkill('close-session');
  assert.match(s.text, /close-session\.js" panel/);
  assert.match(s.text, /never answer one for them/);
  assert.deepEqual(brokenReferences(s.text), []);
});

test('refresh: at 80 percent of the approved cap of a milestone one budget decision appears with the text "el hito X lleva N de M USD, ¿seguimos?"', () => {
  const dir = project();
  panel.setBudget(dir, { hito: 'h1', spent: 7.9, cap: 10 });
  assert.equal(panel.refresh(dir).decisions.length, 0);
  panel.setBudget(dir, { hito: 'h1', spent: 8.4, cap: 10 });
  const s = panel.refresh(dir);
  assert.equal(s.decisions.length, 1);
  const d = s.decisions[0];
  assert.equal(d.question, 'el hito h1 lleva 8.4 de 10 USD, ¿seguimos?');
  assert.deepEqual([d.kind, d.status, d.options.map((o) => o.label)], ['budget', 'open', ['seguir', 'parar']]);
  assert.equal(s.budget[0].warned, true);
  assert.equal(s.next.rule, 'decision');
});

test('refresh: the budget decision is not created twice for the same milestone, nor below 80 percent', () => {
  const dir = project();
  panel.setBudget(dir, { hito: 'h1', spent: 9, cap: 10 });
  panel.setBudget(dir, { hito: 'h2', spent: 1, cap: 10 });
  panel.refresh(dir);
  panel.refresh(dir);
  panel.setBudget(dir, { hito: 'h1', spent: 9.5, cap: 10 }); // sigue subiendo: no repite el aviso
  panel.refresh(dir);
  const qs = decisions(dir).map((d) => d.question);
  assert.equal(qs.length, 1);
  assert.match(qs[0], /^el hito h1 /);
  assert.equal(panel.read(dir).state.budget.find((b) => b.hito === 'h2').warned, false);
});

test('refresh: answering the budget decision does not reopen it', () => {
  const dir = project();
  panel.setBudget(dir, { hito: 'h1', spent: 9, cap: 10 });
  panel.refresh(dir);
  assert.deepEqual(panel.answer(dir, { id: 'Q-1', answer: 'seguir' }), { ok: true });
  panel.refresh(dir);
  panel.setBudget(dir, { hito: 'h1', spent: 9.9, cap: 10 });
  const s = panel.refresh(dir);
  assert.deepEqual(s.decisions.map((d) => [d.id, d.status]), [['Q-1', 'answered']]);
  assert.notEqual(s.next.rule, 'decision');
});

test('status skill: shows the panel text only when there is something and still only reads', () => {
  const s = readSkill('status');
  assert.match(s.text, /panel\.js" show --text/);
  assert.match(s.text, /if it prints nothing, say nothing/i);
  assert.match(s.text, /Do not change any state/);
  assert.deepEqual(brokenReferences(s.text), []);
  // y el verbo que llama no escribe: show no crea el registro
  const dir = project();
  const r = cli('panel', ['show', '--text'], dir);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.ok(!fs.existsSync(panel.fileOf(dir)));
});
