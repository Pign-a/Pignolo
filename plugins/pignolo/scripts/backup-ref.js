'use strict';
// CLI mínimo (spec §2): respaldo de refs fuera de los hooks.
// Uso: node backup-ref.js [--cwd <dir>]
// Imprime el resultado en JSON (null si no es un repo).
const { backupRefs } = require('../lib/git-backup');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

try {
  const result = backupRefs({ cwd: arg('cwd', process.cwd()) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  process.stderr.write(`pignolo backup-ref: ${e.message}\n`);
  process.exitCode = 1;
}
