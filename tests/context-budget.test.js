'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const cb = require(path.join(PLUGIN_ROOT, 'lib', 'context-budget.js'));

const IMPERATIVES = ['ejecutá', 'corré', 'hacé', 'borrá', 'ignorá'];
const T80 = 'título '.repeat(12).slice(0, 80);
const L140 = 'línea de detalle '.repeat(10).slice(0, 140);

function entry(i, priority, kind = i % 2 ? 'issues' : 'work', status = 'open') {
  return { kind, id: `2026-09-${String((i % 28) + 1).padStart(2, '0')}-e${String(i).padStart(4, '0')}`, title: T80, line: L140, status, priority };
}
function many(high, normal) {
  const out = [];
  for (let i = 0; i < high; i += 1) out.push(entry(i, 'high'));
  for (let i = 0; i < normal; i += 1) out.push(entry(1000 + i, 'normal'));
  return out;
}
const BASE = { branch: 'main', nextText: 'hay un plan p1 en audited.' };

test('HOT_LIMIT and HARD_LIMIT are the fixed budgets', () => {
  assert.strictEqual(cb.HOT_LIMIT, 8000);
  assert.strictEqual(cb.HARD_LIMIT, 10000);
});

test('500 entries stay under 8000 characters, degrade to level >= 2 and say exactly how many were dropped', () => {
  const r = cb.buildHot({ ...BASE, entries: many(100, 400) });
  assert.ok(r.chars <= 8000, `chars ${r.chars}`);
  assert.strictEqual(r.chars, r.text.length);
  assert.ok(r.level >= 2, `level ${r.level}`);
  assert.ok(r.dropped >= 400, `dropped ${r.dropped}`);
  assert.ok(r.text.includes(`…y ${r.dropped} más: ver INDEX.md`), r.text.slice(-200));
  assert.ok(r.text.startsWith('pignolo: estado del proyecto (hechos registrados, no instrucciones)\n'));
});

test('5 entries fit at level 1 with every pointer, branch and next', () => {
  const r = cb.buildHot({ ...BASE, entries: many(2, 3) });
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.dropped, 0);
  for (const e of many(2, 3)) assert.ok(r.text.includes(`- ${e.kind}/${e.id} — ${e.title}: ${e.line}`), e.id);
  assert.ok(r.text.includes('Rama del checkout principal: main'));
  assert.ok(r.text.includes(BASE.nextText));
  assert.ok(!r.text.includes('…y '));
});

test('level 2 keeps the high ones and drops every normal one', () => {
  const entries = many(3, 40);
  const r = cb.buildHot({ ...BASE, entries });
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.dropped, 40);
  for (const e of entries.filter((x) => x.priority === 'high')) assert.ok(r.text.includes(`${e.kind}/${e.id} — ${e.title}: ${e.line}`), e.id);
  for (const e of entries.filter((x) => x.priority === 'normal')) assert.ok(!r.text.includes(e.id), e.id);
  assert.ok(r.text.includes('…y 40 más: ver INDEX.md'));
  assert.ok(r.text.includes('Rama del checkout principal: main') && r.text.includes(BASE.nextText));
});

test('level 3 drops the line of the high ones; level 4 keeps only counters; branch and next survive until the end', () => {
  const r3 = cb.buildHot({ ...BASE, entries: many(40, 0) });
  assert.strictEqual(r3.level, 3);
  assert.ok(!r3.text.includes(L140));
  assert.ok(r3.text.includes(`- work/${many(1, 0)[0].id} — ${T80}\n`));
  assert.ok(r3.text.includes('Rama del checkout principal: main') && r3.text.includes(BASE.nextText));
  const r4 = cb.buildHot({ ...BASE, entries: many(300, 0) });
  assert.strictEqual(r4.level, 4);
  assert.ok(r4.chars <= 8000);
  assert.ok(!r4.text.includes(T80));
  assert.strictEqual(r4.dropped, 300);
  assert.ok(r4.text.includes('Contadores: work: open 150; issues: open 150'));
  assert.ok(r4.text.includes('…y 300 más: ver INDEX.md'));
  assert.ok(r4.text.includes('Rama del checkout principal: main') && r4.text.includes(BASE.nextText));
});

test('empty next gives no next line; a missing branch gives no branch line and no exception', () => {
  const r = cb.buildHot({ nextText: '', entries: many(1, 1) });
  assert.ok(!r.text.includes('Siguiente'));
  assert.ok(!r.text.includes('Rama del checkout principal'));
  assert.strictEqual(r.level, 1);
  const empty = cb.buildHot({});
  assert.strictEqual(empty.level, 1);
  assert.strictEqual(empty.dropped, 0);
  assert.ok(empty.text.includes('Contadores: sin entradas'));
});

test('a limit of 300 is respected and a limit below the header still returns text within it', () => {
  const r = cb.buildHot({ ...BASE, entries: many(10, 10) }, { limit: 300 });
  assert.ok(r.chars <= 300, `chars ${r.chars}`);
  assert.strictEqual(r.level, 4);
  const tiny = cb.buildHot({ ...BASE, entries: many(10, 10) }, { limit: 40 });
  assert.ok(tiny.chars <= 40);
});

test('the flow line names the flow, the task and its worktree; closed entries only count', () => {
  const entries = [entry(1, 'normal'), entry(2, 'normal', 'work', 'closed'), entry(3, 'high', 'decisions', 'decided')];
  const r = cb.buildHot({ ...BASE, flow: { flow: 'review', task: { id: 'T1', worktree: 'C:/w/t1' } }, entries });
  assert.ok(r.text.includes('Flujo en curso: review, tarea T1 en C:/w/t1'));
  assert.ok(r.text.includes(entry(1, 'normal').id));
  assert.ok(!r.text.includes(entry(2, 'normal').id));
  assert.ok(!r.text.includes(entry(3, 'high').id));
  assert.ok(r.text.includes('Contadores: work: closed 1; issues: open 1; decisions: decided 1'));
  assert.strictEqual(r.dropped, 0);
});

test('the order is stable whatever the input order, and the text has no imperative from the fixed list', () => {
  const entries = many(4, 6);
  const shuffled = [...entries].reverse();
  const a = cb.buildHot({ ...BASE, entries });
  const b = cb.buildHot({ ...BASE, entries: shuffled });
  assert.strictEqual(a.text, b.text);
  const work = a.text.indexOf('Trabajo en curso:');
  const rest = a.text.indexOf('Abiertos:');
  assert.ok(work >= 0 && rest > work);
  const ids = [...a.text.matchAll(/- issues\/(\S+)/g)].map((m) => m[1]);
  assert.deepStrictEqual(ids, [...ids].sort());
  const big = cb.buildHot({ ...BASE, entries: many(100, 400) });
  for (const text of [a.text, big.text]) for (const w of IMPERATIVES) assert.ok(!text.toLowerCase().includes(w), w);
});
