'use strict';
// Falso positivo real (2026-10-03): un subagente con cwd en main corrió
//   cd <worktree-en-rama-plan> && git status --short | head; git merge main 2>&1 | tail -15; ls
// y la guardia lo negó con subagent-main. Unir main EN una rama de tarea no mueve main.
// En bash el `cd` de un tramo `&&` o `;` aplica a lo que sigue, aunque haya un pipe en medio;
// un `cd` dentro de un pipe o de un subshell no cambia el cwd del resto.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const PS_T = 30000;
const posix = (p) => p.split(path.sep).join('/');
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: PS_T, subagent: true, agentType: 'pignolo:implementer', ...o });
const out = (v) => (v.decision === 'block' ? v.rule : v.decision);

const mainRepo = makeRepo();
const wt = makeRepo();
git(['checkout', '-q', '-b', 'plan/x'], wt);
const W = posix(wt);

// [nombre, comando, esperado con cwd en main]
const CASES = [
  ['forma exacta del incidente', `cd "${W}" && git status --short | head; git merge main 2>&1 | tail -15; ls docs/plans`, 'allow'],
  ['cd && merge', `cd "${W}" && git merge main`, 'allow'],
  ['cd ; merge', `cd "${W}"; git merge main`, 'allow'],
  ['cd && a | b ; merge', `cd "${W}" && git status | head; git merge main`, 'allow'],
  ['cd && a | b && merge', `cd "${W}" && git status | head && git merge main`, 'allow'],
  ['cd && a | b | c ; merge | d', `cd "${W}" && echo a | cat | wc -l; git merge main 2>&1 | tail -3`, 'allow'],
  ['merge con salida a pipe tras cd &&', `cd "${W}" && git merge main 2>&1 | tail -15`, 'allow'],
  // lo que NO cambia el cwd del merge: sigue en main y se niega
  ['subshell: el cd no sale', `(cd "${W}"); git merge main`, 'subagent-main'],
  ['subshell que contiene el cd y el merge: el merge corre en la carpeta (bash)', `(cd "${W}"; git merge main)`, 'allow'],
  ['cd a la izquierda de un pipe', `cd "${W}" | cat; git merge main`, 'subagent-main'],
  ['dos cd, el segundo a una carpeta que no existe', `cd "${W}" && cd nada; git merge main`, 'subagent-main'],
  ['la carpeta es otra repo en main', `cd "${posix(mainRepo)}" && git status | head; git merge main`, 'subagent-main'],
  ['cd dentro de un pipe no mueve', `cd "${W}" | git merge main`, 'subagent-main'],
  ['cd en segundo plano no mueve', `cd "${W}" & git merge main`, 'subagent-main'],
  ['cd || merge: pudo no correr', `cd "${W}" || git merge main`, 'subagent-main'],
  // destino no resoluble: sigue negado
  ['destino variable', 'cd "$D" && git status | head; git merge main', 'subagent-main'],
  ['destino que no existe', `cd "${W}-nada" && git status | head; git merge main`, 'subagent-main'],
];

for (const [name, cmd, want] of CASES) {
  test(`cd arrastrado: ${name}`, () => {
    const v = sub(cmd, { cwd: mainRepo });
    assert.strictEqual(out(v), want, `${cmd} -> ${JSON.stringify(v)}`);
  });
}

test('el hilo principal pasa la forma exacta del incidente', () => {
  const v = sub(`cd "${W}" && git status --short | head; git merge main 2>&1 | tail -15; ls docs/plans`, { cwd: mainRepo, subagent: false, agentType: null });
  assert.strictEqual(v.decision, 'allow');
});

test('desde la misma rama de tarea sin cd: pasa; desde main sin cd: se niega', () => {
  assert.strictEqual(out(sub('git merge main', { cwd: wt })), 'allow');
  assert.strictEqual(out(sub('git merge main', { cwd: mainRepo })), 'subagent-main');
});

// Por el handler con agent_id (el camino real de un subagente).
const { runGuard } = require('./helpers');
const payload = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd, agent_id: 'a1', agent_type: 'pignolo:implementer' });

test('handler con agent_id: la forma exacta del incidente pasa (exit 0)', () => {
  const r = runGuard(payload(`cd "${W}" && git status --short | head; git merge main 2>&1 | tail -15; ls docs/plans`, mainRepo));
  assert.strictEqual(r.status, 0, r.stderr);
});

test('handler con agent_id: el mismo merge desde main sigue negado y cd a un destino variable también', () => {
  const a = runGuard(payload('git merge main', mainRepo));
  assert.strictEqual(a.status, 2);
  assert.match(a.stderr, /subagente/);
  const b = runGuard(payload('cd "$D" && git status | head; git merge main', mainRepo));
  assert.strictEqual(b.status, 2);
});
