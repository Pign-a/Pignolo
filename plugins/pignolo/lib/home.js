'use strict';
const os = require('node:os');
const path = require('node:path');

function pignoloHome(env = process.env) {
  return env.PIGNOLO_HOME && env.PIGNOLO_HOME.trim() ? env.PIGNOLO_HOME : path.join(os.homedir(), '.pignolo');
}

// Home del entorno del hook: `~` de la shell (HOME) y el de Claude Code (USERPROFILE en
// Windows); sin ninguno, os.homedir().
function userHomes(env = process.env) {
  const list = [env.HOME, env.USERPROFILE].filter((h) => typeof h === 'string' && h.trim());
  return list.length ? [...new Set(list)] : [os.homedir()];
}

// Carpetas de configuración de Claude Code del usuario: ~/.claude de cada home y
// CLAUDE_CONFIG_DIR si está definida.
function claudeDirs(env = process.env) {
  const dirs = userHomes(env).map((h) => path.join(h, '.claude'));
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) dirs.push(env.CLAUDE_CONFIG_DIR);
  return dirs;
}

module.exports = { pignoloHome, userHomes, claudeDirs };
