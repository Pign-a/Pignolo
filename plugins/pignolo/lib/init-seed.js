'use strict';
// Semillas por runner para el marcador {seed} de las compuertas (R-7, D-8-3).
// Solo se emite la opción de un runner cuya documentación se consultó (`verified: true`).
const SEED_ARGS = Object.freeze({
  vitest: { args: '--sequence.shuffle --sequence.seed={seed}', verified: true, source: 'https://vitest.dev/guide/cli (Context7 /vitest-dev/vitest, consultado 2026-10-01)' },
  jest: { args: '--randomize --seed={seed}', verified: true, source: 'https://jestjs.io/docs/cli (Context7 /websites/jestjs_io, 2026-10-01; solo con jest-circus)' },
  pytest: { args: '--randomly-seed={seed}', verified: true, source: 'https://github.com/pytest-dev/pytest-randomly (2026-10-01; solo con el plugin pytest-randomly declarado)' },
  go: { args: '-shuffle={seed}', verified: false, source: 'https://go.dev/doc/go1.17 confirma la opción -shuffle, pero no la sintaxis con semilla (2026-10-01)' },
  flutter: { args: '--test-randomize-ordering-seed={seed}', verified: false, source: 'no se encontró en la documentación consultada (2026-10-01); confirmar con `flutter test --help`' },
  'node-test': { args: null, verified: true, source: 'https://nodejs.org/docs/latest-v22.x/api/cli.html: `node --test` no tiene opción de semilla (2026-10-01)' },
  cargo: { args: null, verified: true, source: 'cargo test no tiene opción de semilla' },
});

function expandSeed(command, seed) {
  return String(command).split('{seed}').join(String(seed));
}

// El comando base es el del runner (o un gestor que corre un script): con un gestor, el
// script de test tiene que ser exactamente el runner.
const SIMPLE_RUNNER_WORD = { vitest: 'vitest', jest: 'jest', pytest: 'pytest', go: 'go', flutter: 'flutter', 'node-test': 'node', cargo: 'cargo' };

function seedCommand(baseCommand, runner, { testScript } = {}) {
  const row = SEED_ARGS[runner];
  const unused = (reason) => ({ command: baseCommand, seedPlan: 'unused', reason });
  if (!row) return unused(`runner desconocido: ${runner}`);
  if (row.args === null) return unused('el runner no tiene opción de semilla');
  if (!row.verified) return unused('no verificado contra la documentación del runner');
  const m = /^(npm|pnpm|yarn|bun)\s+run\s+\S+$/.exec(baseCommand.trim());
  if (m) {
    if (typeof testScript === 'string') {
      const chained = /&&|\|\||[;|]/.test(testScript);
      const runners = Object.keys(SIMPLE_RUNNER_WORD).filter((r) => r !== 'node-test' && new RegExp(`\\b${SIMPLE_RUNNER_WORD[r]}\\b`).test(testScript));
      if (chained || runners.length !== 1 || runners[0] !== runner) return unused('script-not-runner');
    }
    const sep = m[1] === 'npm' ? ' -- ' : ' ';
    return { command: `${baseCommand}${sep}${row.args}`, seedPlan: 'applied', reason: 'opción verificada' };
  }
  if (/&&|\|\||[;|]/.test(baseCommand)) return unused('script-not-runner');
  return { command: `${baseCommand} ${row.args}`, seedPlan: 'applied', reason: 'opción verificada' };
}

module.exports = { SEED_ARGS, expandSeed, seedCommand };
