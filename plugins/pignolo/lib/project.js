'use strict';
// Estado del proyecto para los hooks que dependen de pignolo configurado.
const fs = require('node:fs');
const path = require('node:path');
const { readState } = require('./disabled');

// Sin git (no gasta plazo y no falla abierto si git vence o no está): sube desde el cwd
// buscando .pignolo/project.md hasta la raíz del filesystem o hasta el primer
// directorio que contenga .git (la raíz del repo, o de un repo anidado).
// root: donde está project.md; si no hay, ese primer directorio con .git o el cwd.
// active: hay project.md y /pignolo:off (o PIGNOLO_DISABLED=1) no está puesto en ese root.
function projectState({ cwd = process.cwd(), env = process.env } = {}) {
  const start = path.resolve(cwd);
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.pignolo', 'project.md'))) {
      return { root: dir, active: !readState({ env, cwd: dir }).hooksOff };
    }
    const parent = path.dirname(dir);
    if (fs.existsSync(path.join(dir, '.git')) || parent === dir) {
      return { root: fs.existsSync(path.join(dir, '.git')) ? dir : start, active: false };
    }
    dir = parent;
  }
}

module.exports = { projectState };
