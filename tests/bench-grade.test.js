'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { grade, extractFindings } = require('./bench/plans/grade');

const TRUTH = {
  p1: [
    { id: 'p1-sym', type: 'missing-symbol', tasks: ['T2'], keywords: ['roundCents', 'lib/money.js'] },
    { id: 'p1-cmd', type: 'broken-command', tasks: ['T3'], keywords: ['npm run report'] },
  ],
  multi: [{ id: 'm1', tasks: ['4', '7'], keywords: ['child.kill'] }],
  clean: [],
};
const f = (task, evidence, extra = {}) => ({ task, kind: 'x', evidence, keywords: [], ...extra });

test('un hallazgo que nombra la tarea y una palabra clave cuenta', () => {
  const r = grade({ findings: [f('T2', 'llama a roundCents() que no existe')], truth: TRUTH, plan: 'p1' });
  assert.deepStrictEqual(r.found, ['p1-sym']);
  assert.deepStrictEqual(r.missed, ['p1-cmd']);
  assert.deepStrictEqual(r.falsePositives, []);
  assert.strictEqual(r.error, null);
});

test('la palabra clave en otra tarea no cuenta y el hallazgo es falsa alarma', () => {
  const r = grade({ findings: [f('T3', 'roundCents no existe')], truth: TRUTH, plan: 'p1' });
  assert.deepStrictEqual(r.found, []);
  assert.strictEqual(r.falsePositives.length, 1);
});

test('la palabra clave puede venir en keywords y la tarea como "Task 2" o "2"', () => {
  const a = grade({ findings: [f('Task 2', 'x', { keywords: ['ROUNDCENTS'] })], truth: TRUTH, plan: 'p1' });
  assert.deepStrictEqual(a.found, ['p1-sym']);
  const b = grade({ findings: [f('2', 'lib/money.js')], truth: TRUTH, plan: 'p1' });
  assert.deepStrictEqual(b.found, ['p1-sym']);
});

test('un hallazgo sin coincidencia es falsa alarma; un duplicado de uno hallado no lo es', () => {
  const r = grade({
    findings: [f('T2', 'roundCents'), f('T2', 'roundCents otra vez'), f('T9', 'algo que no está')],
    truth: TRUTH, plan: 'p1',
  });
  assert.deepStrictEqual(r.found, ['p1-sym']);
  assert.strictEqual(r.falsePositives.length, 1);
  assert.strictEqual(r.falsePositives[0].task, 'T9');
});

test('un error plantado con varias tareas cuenta en cualquiera de ellas', () => {
  const r = grade({ findings: [f('7', 'child.kill deja vivo al nieto')], truth: TRUTH, plan: 'multi' });
  assert.deepStrictEqual(r.found, ['m1']);
});

test('en clean todo hallazgo es falsa alarma', () => {
  const r = grade({ findings: [f('T1', 'roundCents'), f('T2', 'lo que sea')], truth: TRUTH, plan: 'clean' });
  assert.deepStrictEqual(r.found, []);
  assert.strictEqual(r.falsePositives.length, 2);
  assert.strictEqual(grade({ findings: [], truth: TRUTH, plan: 'clean' }).falsePositives.length, 0);
});

test('un informe en texto: se toma el último bloque json', () => {
  const text = 'Hallazgos:\n```json\n[]\n```\nFinal:\n```json\n[{"task":"T3","kind":"k","evidence":"npm run report no existe","keywords":["report"]}]\n```\n';
  const r = grade({ findings: text, truth: TRUTH, plan: 'p1' });
  assert.deepStrictEqual(r.found, ['p1-cmd']);
});

test('json mal formado, ausente o que no es un arreglo: 0 encontrados y error registrado', () => {
  for (const text of ['```json\n[{"task": "T2", \n```', 'sin bloque alguno', '```json\n{"task":"T2"}\n```']) {
    const r = grade({ findings: text, truth: TRUTH, plan: 'p1' });
    assert.deepStrictEqual(r.found, [], text);
    assert.deepStrictEqual(r.missed, ['p1-sym', 'p1-cmd'], text);
    assert.ok(r.error, text);
  }
});

test('extractFindings devuelve el arreglo o el error', () => {
  assert.deepStrictEqual(extractFindings('```json\n[{"task":"T1"}]\n```'), { findings: [{ task: 'T1' }], error: null });
  assert.ok(extractFindings('nada').error);
});

test('truth.json: 14 del caso real y 6 por sintético, uno de cada tipo; clean sin errores', () => {
  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'bench', 'plans', 'truth.json'), 'utf8'));
  assert.strictEqual(truth.real.length, 14);
  const types = ['missing-symbol', 'wrong-signature', 'test-cannot-fail', 'contradiction', 'false-platform-assumption', 'broken-command'];
  for (const p of ['p1', 'p2', 'p3']) assert.deepStrictEqual(truth[p].map((e) => e.type).sort(), [...types].sort(), p);
  assert.deepStrictEqual(truth.clean, []);
  for (const e of Object.values(truth).flat()) {
    assert.ok(e.id && (e.tasks || []).length >= 1 && e.keywords.length >= 1 && e.keywords.length <= 6, e.id);
  }
});
