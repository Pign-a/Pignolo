'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { PROBES, triggerText, runProbes } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-probes.js'));

const byId = (id) => PROBES.find((p) => p.id === id);

test('the five probes exist with the required shape', () => {
  assert.deepStrictEqual(PROBES.map((p) => p.id).sort(), ['git-apply-numstat', 'kill-leaves-grandchild', 'kill0-eperm', 'npm-without-shell', 'spawnsync-blocks-loop']);
  for (const p of PROBES) {
    assert.ok(p.triggers instanceof RegExp, p.id);
    assert.strictEqual(typeof p.run, 'function', p.id);
    assert.ok(Array.isArray(p.keywords), p.id);
  }
});

const TRIGGERS = [
  ['npm-without-shell', ["`spawn('npm', ['test'])` runs without a shell on Windows"], ['the plan documents the npm test script', 'run npm test in a shell']],
  ['kill-leaves-grandchild', ['killing the child also kills its grandchild'], ['the child timed out', 'kill the stale lock file']],
  ['spawnsync-blocks-loop', ['spawnSync does not block the heartbeat timer'], ['spawnSync runs the gate']],
  ['git-apply-numstat', ['`git apply --numstat` proves the patch applies'], ['`git apply --check` validates the patch', 'git apply']],
  ['kill0-eperm', ['`process.kill(pid, 0)` throws only if the process is dead'], ['the pid is stored']],
];

for (const [id, yes, no] of TRIGGERS) {
  test(`trigger ${id}`, () => {
    const re = byId(id).triggers;
    for (const t of yes) assert.ok(re.test(t), `should fire: ${t}`);
    for (const t of no) assert.ok(!re.test(t), `should not fire: ${t}`);
  });
}

function fake(id, falsified, counter) {
  const real = byId(id);
  return { ...real, run() { counter.n += 1; return { falsified, evidence: 'fake' }; } };
}

test('the trigger reads only the claim text, not the task', () => {
  const counter = { n: 0 };
  const probes = PROBES.map((p) => fake(p.id, true, counter));
  const claims = [{ id: 'C1', task: 'T1', claim: 'the helper returns the list sorted', how: 'call it with an unsorted list' }];
  assert.strictEqual(triggerText(claims[0]), 'the helper returns the list sorted\ncall it with an unsorted list');
  // la tarea del plan menciona spawn npm y kill; no se le pasa a la sonda
  const r = runProbes({ claims, probes, planText: '### Task T1\nspawn npm and kill the child grandchild' });
  assert.deepStrictEqual(r.results, []);
  assert.strictEqual(counter.n, 0);
});

test('a probe fires once and closes only on falsified: true', () => {
  const counter = { n: 0 };
  const probes = [fake('git-apply-numstat', true, counter)];
  const claims = [
    { id: 'C1', task: 'T1', claim: '`git apply --numstat` proves it applies', how: 'run it' },
    { id: 'C2', task: 'T2', claim: 'git apply --numstat applies the patch', how: 'run it' },
  ];
  const r = runProbes({ claims, probes });
  assert.strictEqual(counter.n, 1);
  assert.deepStrictEqual(r.closed, ['C1', 'C2']);
  assert.strictEqual(r.findings.length, 2);
  assert.strictEqual(r.findings[0].kind, 'probe git-apply-numstat');
  assert.strictEqual(r.findings[0].task, 'T1');
});

test('a probe that does not falsify closes nothing and reports nothing', () => {
  const counter = { n: 0 };
  const probes = [fake('git-apply-numstat', false, counter)];
  const r = runProbes({ claims: [{ id: 'C1', task: 'T1', claim: '`git apply --numstat` proves it applies', how: 'x' }], probes });
  assert.strictEqual(counter.n, 1);
  assert.strictEqual(r.results.length, 1);
  assert.deepStrictEqual(r.closed, []);
  assert.deepStrictEqual(r.findings, []);
});

test('real probes on this machine', () => {
  assert.strictEqual(byId('git-apply-numstat').run().falsified, true);
  assert.strictEqual(byId('kill0-eperm').run().falsified, process.platform === 'win32');
  assert.strictEqual(byId('npm-without-shell').run().falsified, process.platform === 'win32');
});
