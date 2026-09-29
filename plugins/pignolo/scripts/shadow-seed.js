'use strict';
// Siembra del repo sombra (spec §11.6). La lanza SessionStart en segundo plano;
// también sirve a mano. Uso: node shadow-seed.js [--cwd <dir>] [--session <id>]
// Imprime el resultado en JSON (null si no es un repo). Las fallas quedan en
// ~/.pignolo/logs/backup-failures.log y en el estado de la sombra, que el
// próximo SessionStart y cada instantánea en el repo muestran.
const { seedShadow } = require('../lib/git-backup');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

try {
  const result = seedShadow({ cwd: arg('cwd', process.cwd()), sessionId: arg('session', undefined) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (e) {
  process.stderr.write(`pignolo shadow-seed: ${e.message}\n`);
  process.exitCode = 1;
}
