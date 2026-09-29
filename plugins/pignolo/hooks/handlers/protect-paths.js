'use strict';
// PreToolUse Edit|Write|MultiEdit|NotebookEdit. Dos capas:
// - Conjunto catastrófico (spec §11.6), siempre activo, incluso con PIGNOLO_DISABLED:
//   nadie escribe .git/**, .claude/** (salvo .claude/worktrees/), .gitconfig,
//   ~/.pignolo/**, ~/.claude/settings*.json ni ~/.claude/plugins/** (lo que apagaría
//   la guardia en las sesiones siguientes). Cubre bypassPermissions, donde la
//   protección nativa no rige. `~` sale del HOME/USERPROFILE del entorno del hook.
// - Flags del interruptor (§3.3): apagable solo con PIGNOLO_DISABLED.
const { readState, flagPaths } = require('../../lib/disabled');
const { pignoloHome, userHomes, claudeDirs } = require('../../lib/home');
const { resolveClean, isProtectedWrite, FLAG_RE } = require('../../lib/paths');

const BLOCKED = 'pignolo bloqueó la escritura: los flags del interruptor solo los escribe /pignolo:off y /pignolo:on. Alternativa: pedile al humano que escriba el comando.\n';
const PROTECTED = 'pignolo bloqueó la escritura: nadie escribe en .git, .claude (salvo .claude/worktrees), .gitconfig, ~/.pignolo, ~/.claude/settings*.json ni ~/.claude/plugins. Alternativa: usá comandos git; lo que haya que cambiar ahí lo hace el humano.\n';

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (target === undefined || target === null || target === '') return { exit: 0 };
  if (typeof target !== 'string') return { exit: 2, stderr: 'pignolo bloqueó la escritura: la ruta no es texto.\n' };

  const home = userHomes(env)[0];
  const abs = resolveClean(target, cwd, home);
  if (isProtectedWrite(abs, { home, pignoloHome: pignoloHome(env), claudeDirs: claudeDirs(env) })) return { exit: 2, stderr: PROTECTED };
  if (readState({ env, cwd }).guardOff) return { exit: 0 };

  const flags = flagPaths({ env, cwd });
  if (FLAG_RE.test(abs) || abs === resolveClean(flags.global, cwd) || abs === resolveClean(flags.project, cwd)) {
    return { exit: 2, stderr: BLOCKED };
  }
  return { exit: 0 };
};
