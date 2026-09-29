'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pignoloHome } = require('./home');

function flagPaths({ env = process.env, cwd = process.cwd() } = {}) {
  return {
    global: path.join(pignoloHome(env), 'disabled'),
    project: path.join(cwd, '.pignolo', '.disabled'),
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

module.exports = { readState, flagPaths };
