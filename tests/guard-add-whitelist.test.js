'use strict';
// RR-01 (re-revisión de fix/fuga-leak-values): la compuerta de commit nunca le pasa a git los argumentos del usuario.
// Una opción de `git add` fuera de la lista blanca (-e, -p, -i, --pathspec-from-file, --chmod, -N...) no corre git:
// cae al cierre (lo sin rastrear no ignorado cuenta como indexado) y el índice del usuario queda como estaba.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runGuard, makeRepo, git } = require('./helpers');

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
const PRIV = '.pignolo-ui/runs/r1/leak-values.json';
function repoWith() {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  fs.mkdirSync(path.join(repo, '.pignolo-ui', 'runs', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(repo, ...PRIV.split('/')), '["SECRETO"]\n');
  return repo;
}

for (const flags of ['-e', '--edit', '-p', '-i', '--pathspec-from-file=x', '--chmod=+x', '-N', '-Ae']) {
  test(`RR-01: git add ${flags} && git commit: el índice no cambia y se usa el cierre (niega el privado sin rastrear)`, () => {
    const repo = repoWith();
    const before = git(['ls-files', '-s'], repo);
    const status = git(['status', '--porcelain'], repo);
    const r = runGuard(bash(`git add ${flags} && git commit -m x`, repo));
    assert.strictEqual(git(['ls-files', '-s'], repo), before, 'el hook cambió el índice');
    assert.strictEqual(git(['status', '--porcelain'], repo), status);
    assert.strictEqual(r.status, 2, r.stderr);
    assert.ok(r.stderr.includes(PRIV), r.stderr);
  });
}

test('RR-01: git add a.txt && git commit sigue andando; git add . && git commit con un privado se niega', () => {
  const repo = repoWith();
  const before = git(['ls-files', '-s'], repo);
  assert.strictEqual(runGuard(bash('git add a.txt && git commit -m x', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git add -A && git commit -m x', repo)).status, 2);
  assert.strictEqual(git(['ls-files', '-s'], repo), before);
});

test('RR-01: un argumento que parece opción pero va después de -- es una ruta, no una bandera', () => {
  const repo = repoWith();
  fs.writeFileSync(path.join(repo, '-e'), 'x\n');
  assert.strictEqual(runGuard(bash('git add -- -e && git commit -m x', repo)).status, 0);
});
