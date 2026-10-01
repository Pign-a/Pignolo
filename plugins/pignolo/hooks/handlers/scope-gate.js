'use strict';
// PreToolUse Bash|PowerShell (spec §8.3, R-7, R-14): dentro de un plan, un comando que
// lleva ramas del plan a main sin la tarjeta de alcance aprobada se niega. Callado si no
// aplica. Con PIGNOLO_DISABLED=1 o /pignolo:off no hace nada (el decide mira el interruptor).
const { decide } = require('../../lib/scope-gate');

exports.run = (input, ctx = {}) => {
  const env = { ...process.env, ...(ctx.env || {}) };
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const command = input.tool_input ? input.tool_input.command : undefined;
  if (typeof command !== 'string') return { exit: 0 };
  const shell = String(input.tool_name || '').toLowerCase() === 'powershell' ? 'powershell' : 'bash';
  let v;
  try {
    v = decide({ command, cwd, env, shell, deps: ctx.deps });
  } catch (e) {
    // Un fallo inesperado del propio hook no frena comandos ajenos a un plan ni deja pasar uno de un plan
    // sin avisar: el prefiltro ya dejó pasar lo que no es git, así que un fallo del decide
    // llegado hasta acá siempre se niega.
    return { exit: 2, stderr: `pignolo bloqueó el comando: scope-gate no pudo decidir (${e.message}). Alternativa: reintentá el comando; si persiste, revisá el registro del plan con plan.js status.\n` };
  }
  if (!v) return { exit: 0 };
  return { exit: 2, stderr: `pignolo bloqueó el comando: ${v.reason}. Alternativa: ${v.alternative}.\n` };
};
