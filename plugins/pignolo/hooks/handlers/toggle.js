'use strict';
// UserPromptExpansion: solo se dispara cuando el HUMANO escribe el comando.
// Como el modelo podría invocar el launcher a mano con un payload inventado,
// se exige además el evento y el texto literal que tipeó el humano; la guardia
// bloquea esa invocación por Bash/PowerShell (best-effort, declarado en el README).
const fs = require('node:fs');
const path = require('node:path');
const { flagPaths } = require('../../lib/disabled');

function kind(input) {
  if (input.hook_event_name !== 'UserPromptExpansion') return null;
  const typed = /^\/pignolo:(off|on)(\s|$)/.exec(String(input.prompt || ''));
  if (!typed) return null;
  const verb = typed[1];
  const name = String(input.command_name || '');
  const fromPlugin = input.command_source === 'plugin';
  return name === `pignolo:${verb}` || (name === verb && fromPlugin) ? verb : null;
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const k = kind(input);
  if (!k) return { exit: 0 };
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const scope = /\bglobal\b/i.test(String(input.command_args || '')) ? 'global' : 'project';
  const file = flagPaths({ env, cwd })[scope];

  if (k === 'off') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${new Date().toISOString()}\n`);
    if (scope === 'project') {
      const gi = path.join(cwd, '.pignolo', '.gitignore');
      if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.disabled\n');
    }
  } else {
    fs.rmSync(file, { force: true });
  }

  const where = scope === 'global' ? 'en toda la cuenta' : 'en este proyecto';
  const msg = k === 'off'
    ? `pignolo apagado (${where}). La guardia de git y los respaldos siguen activos; para apagarlos hay que arrancar Claude Code con PIGNOLO_DISABLED=1.`
    : `pignolo encendido (${where}).`;
  return {
    exit: 0,
    stdout: JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'UserPromptExpansion', additionalContext: msg } }),
  };
};
