'use strict';
// CLI mínimo (spec §2): instantánea WIP fuera de los hooks.
// Uso: node wip-snapshot.js [--cwd <dir>] [--reason <texto>] [--session <id>]
// Imprime el resultado en JSON (null si no es un repo o el árbol está limpio).
const { snapshotWip } = require('../lib/git-backup');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

try {
  const result = snapshotWip({ cwd: arg('cwd', process.cwd()), reason: arg('reason', 'manual'), sessionId: arg('session', undefined), timeoutMs: 60000 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  process.stderr.write(`pignolo wip-snapshot: ${e.message}\n`);
  process.exitCode = 1;
}
