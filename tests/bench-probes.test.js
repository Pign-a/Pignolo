'use strict';
// Sondas fijas de M7: disparadores y agregación con run() inyectado. Las sondas reales
// corren en la prueba, no acá, salvo una rápida en Windows.
const test = require('node:test');
const assert = require('node:assert');
const { PROBES, runProbes, taskText } = require('./bench/plans/probes');

const PLAN = [
  '# Plan', '', '### Task 3: parser', 'Lee el archivo.', '',
  '### Task 4: lanzar comandos', 'Corre `npm test` con spawnSync y shell: false.', '',
  '### Task 5: otra', 'Nada de procesos.', '',
].join('\n');

function fakeProbe(id, triggers, falsified = true) {
  const probe = { id, triggers, keywords: [id], calls: 0, run() { probe.calls += 1; return { falsified, evidence: `evidencia de ${id}` }; } };
  return probe;
}

test('taskText: el texto de la tarea hasta el encabezado siguiente, con "Task 4", "T4" o "4"', () => {
  assert.match(taskText(PLAN, '4'), /npm test/);
  assert.doesNotMatch(taskText(PLAN, '4'), /parser|Nada de procesos/);
  assert.strictEqual(taskText(PLAN, 'Task 4'), taskText(PLAN, '4'));
  assert.strictEqual(taskText(PLAN, 'T9'), '');
});

test('runProbes: dispara por el texto de la afirmación o por el de su tarea; solo lo refutado agrega un hallazgo', () => {
  const npm = fakeProbe('npm', /\bnpm\b/i);
  const git = fakeProbe('git', /git apply/i);
  const calm = fakeProbe('calm', /parser/i, false);
  const claims = [
    { id: 'C1', task: '4', claim: 'los procesos se lanzan bien', how: 'correrlo' }, // npm solo por el texto de la tarea
    { id: 'C2', task: '5', claim: 'git apply --numstat prueba que aplica', how: 'x' },
    { id: 'C3', task: '3', claim: 'el parser lee UTF-8', how: 'x' }, // calm dispara pero no refuta
  ];
  const r = runProbes({ claims, planText: PLAN, probes: [npm, git, calm] });
  assert.deepStrictEqual(r.findings.map((f) => [f.task, f.kind]), [['4', 'probe npm'], ['5', 'probe git']]);
  const f = r.findings[0];
  assert.match(f.evidence, /evidencia de npm/);
  assert.match(f.evidence, /C1/);
  assert.deepStrictEqual(f.keywords, ['npm']);
  assert.deepStrictEqual(r.ran.sort(), ['calm', 'git', 'npm']);
});

test('runProbes: cada sonda corre una vez aunque la disparen varias afirmaciones; un hallazgo por sonda y tarea', () => {
  const npm = fakeProbe('npm', /\bnpm\b/i);
  const claims = [
    { id: 'C1', task: '4', claim: 'npm arranca', how: '' },
    { id: 'C2', task: 'T4', claim: 'npm otra vez', how: '' },
    { id: 'C3', task: '5', claim: 'npx y npm', how: '' },
  ];
  const r = runProbes({ claims, planText: PLAN, probes: [npm] });
  assert.strictEqual(npm.calls, 1);
  assert.deepStrictEqual(r.findings.map((f) => f.task), ['4', '5']);
});

test('runProbes: una sonda que revienta no corta las demás; sin afirmaciones no corre nada', () => {
  const boom = { id: 'boom', triggers: /npm/, keywords: [], run() { throw new Error('se cayó'); } };
  const npm = fakeProbe('npm', /npm/);
  const r = runProbes({ claims: [{ id: 'C1', task: '4', claim: 'npm', how: '' }], planText: PLAN, probes: [boom, npm] });
  assert.deepStrictEqual(r.findings.map((f) => f.kind), ['probe npm']);
  assert.deepStrictEqual(runProbes({ claims: [], planText: PLAN, probes: [npm] }), { findings: [], ran: [] });
});

test('las cinco sondas reales y sus disparadores', () => {
  const byId = Object.fromEntries(PROBES.map((p) => [p.id, p]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ['git-apply-numstat', 'kill-leaves-grandchild', 'kill0-eperm', 'npm-without-shell', 'spawnsync-blocks-loop']);
  const fires = (id, text) => byId[id].triggers.test(text);
  assert.ok(fires('npm-without-shell', "spawnSync('npx', ['vitest'], { shell: false })"));
  assert.ok(!fires('npm-without-shell', 'npm run report prints the summary'));
  assert.ok(fires('kill-leaves-grandchild', 'on timeout, child.kill() ends the test process tree'));
  assert.ok(!fires('kill-leaves-grandchild', 'the skill is killed by nothing'));
  assert.ok(fires('spawnsync-blocks-loop', 'the heartbeat timer keeps running while spawnSync waits'));
  assert.ok(!fires('spawnsync-blocks-loop', 'spawnSync returns the exit code'));
  assert.ok(fires('git-apply-numstat', 'git apply --numstat tells whether the patch applies'));
  assert.ok(fires('kill0-eperm', 'process.kill(pid, 0) throws when the lock owner is dead'));
  assert.ok(!fires('kill0-eperm', 'reads the lock file'));
  for (const p of PROBES) assert.ok(p.keywords.length > 0 && typeof p.run === 'function');
});

test('sonda real rápida en Windows: npm sin shell no arranca', { skip: process.platform !== 'win32' }, () => {
  const r = PROBES.find((p) => p.id === 'npm-without-shell').run();
  assert.strictEqual(r.falsified, true);
  assert.match(r.evidence, /shell: false/);
});
