'use strict';
// Estado del proyecto para los hooks que dependen de pignolo configurado.
const fs = require('node:fs');
const path = require('node:path');
const { gitRun } = require('./git');
const { readState } = require('./disabled');

// root: raíz del repo (plazo de 1 s) o, si no hay repo, el cwd.
// active: hay .pignolo/project.md y /pignolo:off (o PIGNOLO_DISABLED=1) no está puesto.
function projectState({ cwd = process.cwd(), env = process.env } = {}) {
  let root = cwd;
  try { root = path.resolve(cwd, gitRun(['rev-parse', '--show-toplevel'], cwd, { timeout: 1000 })); } catch (_) { /* sin repo */ }
  const active = fs.existsSync(path.join(root, '.pignolo', 'project.md')) && !readState({ env, cwd: root }).hooksOff;
  return { root, active };
}

module.exports = { projectState };
