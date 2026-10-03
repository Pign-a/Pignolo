'use strict';
// Revisión de la etapa 1 (RT1-02, anterior a la etapa: también falla en main 18f62d5). `eval` corre en la shell actual:
// un `cd` dentro de `eval` mueve el directorio de lo que sigue. La guardia analiza el texto del eval sobre una copia del
// estado (`code()`), así que el `cd` no sale y el `git merge` que sigue se evalúa en la carpeta de antes. Un subagente
// parado en su rama de tarea mueve main con `eval "cd <checkout en main>" && git merge feat`.
// Con 1f69bbf, además, `cd W; eval "cd M"; git merge feat` desde main pasó de negado a permitido.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, git } = require('./helpers');

const posix = (p) => p.split(path.sep).join('/');
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', subagent: true, agentType: 'pignolo:implementer', ...o });
const out = (v) => (v.decision === 'block' ? v.rule : v.decision);

const mainRepo = makeRepo();
const wt = makeRepo();
git(['checkout', '-q', '-b', 'plan/x'], wt);
const W = posix(wt);
const M = posix(mainRepo);

const CASES = [
  ['desde la rama de tarea: eval "cd main" && merge', `eval "cd '${M}'" && git merge feat`, wt],
  ['desde la rama de tarea: eval "cd main"; merge', `eval "cd '${M}'"; git merge feat`, wt],
  ['desde main: cd tarea; eval "cd main"; merge', `cd "${W}"; eval "cd '${M}'"; git merge feat`, mainRepo],
];

for (const [name, cmd, cwd] of CASES) {
  test(`cd dentro de eval mueve el directorio: ${name}`, () => {
    const v = sub(cmd, { cwd });
    assert.strictEqual(out(v), 'subagent-main', `${cmd} -> ${JSON.stringify({ decision: v.decision, rule: v.rule })}`);
  });
}
