'use strict';
// Estado del proyecto para los hooks que dependen de pignolo configurado.
const fs = require('node:fs');
const path = require('node:path');
const { readState, projectRoot } = require('./disabled');

// root: la misma raíz que usa el interruptor (projectRoot: sube sin git hasta
// .pignolo/project.md o .git; si no hay ninguno, el cwd), así /pignolo:off y la
// allowlist nunca miran carpetas distintas.
// active: hay project.md en ese root y /pignolo:off (o PIGNOLO_DISABLED=1) no está puesto.
function projectState({ cwd = process.cwd(), env = process.env } = {}) {
  const root = projectRoot(cwd);
  const configured = fs.existsSync(path.join(root, '.pignolo', 'project.md'));
  return { root, active: configured && !readState({ env, cwd: root }).hooksOff };
}

module.exports = { projectState };
