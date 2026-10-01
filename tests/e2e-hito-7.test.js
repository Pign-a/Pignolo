'use strict';
// Pruebas de punta a punta del hito 7a (spec §15 `queue`, `worktree`, `state-queue`): git de verdad y el launcher real, sin
// agentes. La Task 8 abre el archivo con el humo de la guardia; la Task 11 lo completa.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, runLauncher } = require('./helpers');

const P = PLUGIN_ROOT.split(path.sep).join('/');

test('humo por el launcher real: un implementer con agent_id que ejecuta queue.js run sale con exit 2 y Alternativa', () => {
  const repo = makeRepo();
  const payload = (who, command = `node "${P}/scripts/queue.js" run --plan p --task 01`) => ({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: repo, permission_mode: 'default', ...who,
  });
  const denied = runLauncher('guard', payload({ agent_id: 'a1', agent_type: 'pignolo:implementer' }), { PIGNOLO_CANARY: '1' });
  assert.strictEqual(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, /Alternativa: la cola la opera el integrator; pedile la integración al hilo principal/);
  // leer el script no es ejecutarlo
  const read = runLauncher('guard', payload({ agent_id: 'a1', agent_type: 'pignolo:implementer' }, `cat "${P}/scripts/queue.js"`), { PIGNOLO_CANARY: '1' });
  assert.strictEqual(read.status, 0, read.stderr);
  // el hilo principal y el integrator pasan
  assert.strictEqual(runLauncher('guard', payload({}), { PIGNOLO_CANARY: '1' }).status, 0);
  assert.strictEqual(runLauncher('guard', payload({ agent_id: 'a2', agent_type: 'pignolo:integrator' }), { PIGNOLO_CANARY: '1' }).status, 0);
});
