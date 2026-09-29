'use strict';
// protect-paths: los subagentes no escriben .pignolo/run.json; el hilo principal sí.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const payload = (cwd, file_path, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd, tool_input: { file_path, content: '{}' }, ...extra });

test('a subagent cannot write .pignolo/run.json (with an Alternativa)', () => {
  const repo = makeRepo();
  const r = protect.run(payload(repo, '.pignolo/run.json', { agent_id: 'a1' }), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa:/);
});

test('the main thread can write run.json', () => {
  const repo = makeRepo();
  assert.strictEqual(protect.run(payload(repo, '.pignolo/run.json'), { env: env() }).exit, 0);
});

test('a subagent in a worktree is blocked on the main checkout run.json by absolute path', () => {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tw', wt], repo);
  const target = path.join(repo, '.pignolo', 'run.json');
  assert.strictEqual(protect.run(payload(wt, target, { agent_id: 'a1' }), { env: env() }).exit, 2);
  assert.strictEqual(protect.run(payload(wt, target), { env: env() }).exit, 0);
  // Otros archivos de .pignolo/ no quedan afectados.
  assert.strictEqual(protect.run(payload(wt, path.join(repo, '.pignolo', 'notas.md'), { agent_id: 'a1' }), { env: env() }).exit, 0);
});
