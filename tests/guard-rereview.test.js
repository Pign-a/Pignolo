'use strict';
// Hallazgos de la re-revisión del arreglo de la guardia (rama core/guard-sin-confirmar-push, 2f1e65b). Cada test FALLA con ese código.
// Protects: un subagente no mueve main con un cambio de rama que en realidad no cambia de rama; cmd /d/c se desenvuelve como cmd /c.
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const onFeat = makeRepo();
git(['checkout', '-q', '-b', 'feat'], onFeat);
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', cwd: onFeat, subagent: true, agentType: 'pignolo:implementer', ...o });

// RR1 (importante): `git checkout HEAD` y `git checkout @` no cambian de rama (HEAD sigue en main), pero `switchedTo` los toma por
// un cambio a una rama literal que no es main y baja `onMain` (arreglo de R7). Real (git 2.52): `git checkout main && git checkout @ && git merge feat` movió main.
for (const cmd of [
  'git checkout main && git checkout HEAD && git merge feat',
  'git checkout main && git checkout @ && git merge feat',
  'git checkout main && git checkout HEAD && git push',
  'git checkout main && git checkout @ && git push',
]) {
  test(`RR1: un checkout que no cambia de rama no baja onMain: ${cmd}`, () => {
    const v = sub(cmd);
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify({ decision: v.decision, rule: v.rule })}`);
  });
}

// RR2 (importante, preexistente, declarado en G50): `analyzeCmd` no reconoce `/d/c` pegado. En PowerShell `cmd /d/c "…"` corre el comando
// (probado en esta máquina) y la guardia da allow. El arreglo de R3 cubrió `//c` pero no esta variante.
test('RR2: cmd /d/c se desenvuelve igual que cmd /d /c (PowerShell)', () => {
  const v = evaluate('cmd /d/c "git push -f origin main"', { shell: 'powershell', mode: 'bypassPermissions', cwd: onFeat, psTimeoutMs: 30000 });
  assert.strictEqual(v.decision, 'block', JSON.stringify({ decision: v.decision, rule: v.rule }));
});
