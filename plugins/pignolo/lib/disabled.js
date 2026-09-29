'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pignoloHome } = require('./home');

// Raíz del proyecto sin git (no gasta plazo): sube desde el cwd hasta el primer
// directorio con .pignolo/project.md o con .git; si no hay ninguno, el cwd. El cwd de
// la sesión persiste entre comandos, así que puede estar en un subdirectorio.
function projectRoot(cwd = process.cwd()) {
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.pignolo', 'project.md')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return start;
  }
}

function flagPaths({ env = process.env, cwd = process.cwd() } = {}) {
  return {
    global: path.join(pignoloHome(env), 'disabled'),
    project: path.join(projectRoot(cwd), '.pignolo', '.disabled'),
  };
}

// guardOff solo con PIGNOLO_DISABLED=1 en el entorno del proceso (spec §3.3).
// Los flags de /pignolo:off apagan los demás hooks, nunca la guardia ni los respaldos.
function readState({ env = process.env, cwd = process.cwd() } = {}) {
  const guardOff = env.PIGNOLO_DISABLED === '1';
  const p = flagPaths({ env, cwd });
  const globalFlag = fs.existsSync(p.global);
  const projectFlag = fs.existsSync(p.project);
  return { guardOff, hooksOff: guardOff || globalFlag || projectFlag, globalFlag, projectFlag };
}

module.exports = { readState, flagPaths, projectRoot };
