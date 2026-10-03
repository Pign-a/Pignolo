'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { nextStep, suggestionText, toRegistry } = require(path.join(PLUGIN_ROOT, 'lib', 'next-steps.js'));

const br = (o = {}) => ({ name: 'feat/x', stage: 'review', review: 'none', suite: 'none', commits: 3, waiting: false, merged: false, ...o });
const dec = (o = {}) => ({ id: 'Q-1', question: '¿plantilla corta?', options: [{ label: 'sí' }], recommended: 'sí', status: 'open', kind: 'user', ...o });
const card = (id, status = 'todo') => ({ id, status });
const facts = (o = {}) => ({ busy: false, attention: [], decisions: [], branches: [], main: null, plan: { slug: 'p', stage: 'executing' }, cards: [], ...o });

test('next-steps rule decision: an open decision gives its question with the recommended answer', () => {
  const r = nextStep(facts({ decisions: [dec()] }));
  assert.equal(r.main.rule, 'decision');
  assert.equal(r.main.text, '¿plantilla corta?');
  assert.equal(r.main.prompt, 'Decisión Q-1: sí');
  assert.match(r.main.why, /"sí"/);
  assert.equal(nextStep(facts({ decisions: [dec({ status: 'answered' })] })).main, null);
});

test('next-steps rule merge: APPROVE with a green suite gives "uní <rama> a main"', () => {
  const r = nextStep(facts({ branches: [br({ review: 'APPROVE', suite: 'green' })] }));
  assert.equal(r.main.rule, 'merge');
  assert.equal(r.main.prompt, 'uní feat/x a main');
});

test('next-steps rule merge: APPROVE with a red or missing suite does not suggest merging', () => {
  for (const suite of ['red', 'none']) {
    const r = nextStep(facts({ branches: [br({ review: 'APPROVE', suite })] }));
    assert.ok(!r.main || r.main.rule !== 'merge', suite);
  }
});

test('next-steps rule review: a branch with commits and no review gives "revisá <rama>" and says the review costs an opus run', () => {
  const r = nextStep(facts({ branches: [br()] }));
  assert.equal(r.main.rule, 'review');
  assert.equal(r.main.prompt, 'revisá feat/x');
  assert.equal(suggestionText(r.main), 'revisá feat/x (usa una revisión opus)');
  assert.equal(nextStep(facts({ branches: [br({ commits: 0 })] })).main, null);
});

test('next-steps rule push: main ahead of origin and nothing running gives "hacé push de main"', () => {
  const r = nextStep(facts({ main: { ahead: 2 } }));
  assert.equal(r.main.prompt, 'hacé push de main');
});

test('next-steps rule push: unknown ahead does not suggest', () => {
  assert.equal(nextStep(facts({ main: null })).main, null);
  assert.equal(nextStep(facts({ main: { ahead: 0 } })).main, null);
});

test('next-steps rule card: the first todo card gives "seguí con <id>" when nothing is before it', () => {
  const r = nextStep(facts({ cards: [card('T1', 'done'), card('T2'), card('T3')] }));
  assert.equal(r.main.prompt, 'seguí con T2');
  assert.equal(nextStep(facts({ cards: [card('T1', 'failed'), card('T2')] })).main, null);
});

test('next-steps does not suggest while an agent, a task, a live queue lock or a running card exists', () => {
  assert.deepEqual(nextStep(facts({ busy: true, decisions: [dec()] })), { main: null, alternatives: [], none: 'busy' });
  assert.equal(nextStep(facts({ cards: [card('T1', 'running'), card('T2')], decisions: [dec()] })).none, 'busy');
});

test('next-steps does not suggest with two candidates at the top level', () => {
  assert.equal(nextStep(facts({ branches: [br(), br({ name: 'feat/y' })] })).none, 'ambiguous');
  assert.equal(nextStep(facts({ decisions: [dec(), dec({ id: 'Q-2' })] })).none, 'ambiguous');
});

test('next-steps does not suggest a step with new cost and no approval, and says the cost when approved', () => {
  const blocked = nextStep(facts({ branches: [br({ costOk: { ok: false, usd: 3 } })] }));
  assert.deepEqual([blocked.main, blocked.none], [null, 'cost']);
  const ok = nextStep(facts({ branches: [br({ costOk: { ok: true, usd: 3 } })] }));
  assert.equal(suggestionText(ok.main), 'revisá feat/x (usa una revisión opus · ~3 USD, ya aprobado)');
});

test('next-steps does not suggest for a branch that waits for the user', () => {
  assert.equal(nextStep(facts({ branches: [br({ waiting: true })] })).main.rule, 'close-session'); // no review: espera al usuario
  assert.equal(nextStep(facts({ branches: [br({ waiting: true, review: 'APPROVE', suite: 'green' })] })).main.rule, 'close-session');
});

test('next-steps: attention kinds (task-blocked, queue-conflict, run-malformed, sabotage-pending, flow-expired-task, plan-unreadable) never become a suggestion', () => {
  for (const kind of ['task-blocked', 'queue-conflict', 'run-malformed', 'sabotage-pending', 'flow-expired-task', 'plan-unreadable']) {
    const r = nextStep(facts({ attention: [kind], decisions: [dec()], main: { ahead: 3 } }));
    assert.deepEqual([r.main, r.none], [null, 'attention'], kind);
    assert.deepEqual(toRegistry(r), { none: 'attention' });
  }
});

test('next-steps rule close-session: nothing running and only user decisions pending gives "/pignolo:close-session"', () => {
  const r = nextStep(facts({ decisions: [dec({ status: 'postponed' })] }));
  assert.equal(r.main.rule, 'close-session');
  assert.equal(r.main.prompt, '/pignolo:close-session');
  assert.equal(nextStep(facts()).none, 'nothing');
});

test('next-steps rule close-session: not suggested while anything runs, or when a card, branch or push step is still available', () => {
  const post = [dec({ status: 'postponed' })];
  assert.equal(nextStep(facts({ decisions: post, busy: true })).none, 'busy');
  assert.equal(nextStep(facts({ decisions: post, cards: [card('T1')] })).main.rule, 'card');
  assert.equal(nextStep(facts({ decisions: post, branches: [br()] })).main.rule, 'review');
  assert.equal(nextStep(facts({ decisions: post, main: { ahead: 1 } })).main.rule, 'push');
  assert.equal(nextStep(facts({ decisions: post, branches: [br({ costOk: { ok: false } })] })).none, 'cost');
});

test('next-steps: the order is decision, merge, review, push, card and gives at most 2 alternatives', () => {
  const r = nextStep(facts({
    decisions: [dec()],
    branches: [br({ review: 'APPROVE', suite: 'green', name: 'a' }), br({ name: 'b' })],
    main: { ahead: 1 }, cards: [card('T1')],
  }));
  assert.equal(r.main.rule, 'decision');
  assert.deepEqual(r.alternatives.map((a) => a.rule), ['merge', 'review']);
  const r2 = nextStep(facts({ branches: [br({ review: 'APPROVE', suite: 'green', name: 'a' })], main: { ahead: 1 }, cards: [card('T1')] }));
  assert.deepEqual([r2.main.rule, ...r2.alternatives.map((a) => a.rule)], ['merge', 'push', 'card']);
  const reg = toRegistry(r2);
  assert.equal(reg.rule, 'merge');
  assert.equal(reg.alternatives.length, 2);
});
