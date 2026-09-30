'use strict';
// Hook Stop de M6 (require-experiments.js) con transcripciones sintéticas: ninguna llamada a claude.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');

const HOOK = path.join(__dirname, 'bench', 'plans', 'hooks', 'require-experiments.js');

function scratchWith(claims) {
  const dir = makeTempDir('bench-hook-');
  if (claims) fs.writeFileSync(path.join(dir, 'claims.json'), JSON.stringify(claims));
  return dir;
}
const claimsN = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, task: '4', claim: `c${i + 1}`, how: 'h' }));

// Una línea de transcripción de un mensaje del asistente con estos tool_use.
const assistant = (...tools) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: tools.map(([name, id]) => ({ type: 'tool_use', id, name, input: {} })) } });
function transcript(dir, lines) {
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

function run(scratch, payload) {
  const r = spawnSync(process.execPath, [HOOK, scratch], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}
const stop = (transcriptPath, active = false) => ({ hook_event_name: 'Stop', transcript_path: transcriptPath, stop_hook_active: active });
const state = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'hook-state.json'), 'utf8'));

test('bloquea si hubo menos Bash que afirmaciones y dice cuántos experimentos faltan', () => {
  const dir = scratchWith(claimsN(3));
  const tx = transcript(dir, [JSON.stringify({ type: 'user', message: { content: 'x' } }), assistant(['Write', 'w1'], ['Bash', 'b1'])]);
  const out = run(dir, stop(tx));
  assert.strictEqual(out.decision, 'block');
  assert.match(out.reason, /\b2\b/); // faltan 2 de 3
  assert.match(out.reason, /3/);
  assert.deepStrictEqual([state(dir).blocks, state(dir).lastCount], [1, 1]);
});

test('con tantos Bash como afirmaciones deja terminar; un mismo tool_use repetido cuenta una vez', () => {
  const dir = scratchWith(claimsN(2));
  const tx = transcript(dir, [assistant(['Bash', 'b1']), assistant(['Bash', 'b1']), 'no es json', assistant(['Bash', 'b2'])]);
  assert.strictEqual(run(dir, stop(tx)), null);
  assert.deepStrictEqual([state(dir).blocks, state(dir).lastCount], [0, 2]);
});

test('bloquea como mucho 2 veces por corrida y después deja terminar', () => {
  const dir = scratchWith(claimsN(1));
  const tx = transcript(dir, [assistant(['Read', 'r1'])]);
  assert.strictEqual(run(dir, stop(tx)).decision, 'block');
  assert.strictEqual(run(dir, stop(tx, true)).decision, 'block');
  assert.strictEqual(run(dir, stop(tx, true)), null);
  assert.strictEqual(state(dir).blocks, 2);
});

test('sin transcripción (-p con --no-session-persistence) cuenta los Bash que anotó PostToolUse', () => {
  const dir = scratchWith(claimsN(2));
  const missing = path.join(dir, 'no-existe.jsonl');
  assert.strictEqual(run(dir, { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'node a.js' } }), null);
  assert.strictEqual(run(dir, { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: {} }), null);
  assert.strictEqual(run(dir, stop(missing)).decision, 'block'); // 1 de 2
  run(dir, { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'node b.js' } });
  assert.strictEqual(run(dir, stop(missing, true)), null);
  assert.strictEqual(state(dir).lastCount, 2);
});

test('sin claims.json no hay nada que exigir', () => {
  const dir = scratchWith(null);
  assert.strictEqual(run(dir, stop(path.join(dir, 'x.jsonl'))), null);
});
