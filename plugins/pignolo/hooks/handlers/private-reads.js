'use strict';
// PreToolUse Read|Grep|Glob|Bash|PowerShell (spec §8.3, hito 4a): un subagente que no es
// el validator no lee el holdout ni los sellos (<pignoloHome>/holdout y /seals). Rige solo
// con pignolo activo en el proyecto y sin /pignolo:off; el hilo principal no se toca.
// Best-effort: la protección fuerte es que el almacén vive fuera del repo y del worktree
// de la tarea. Por no ser siempre activo, no lleva canario.
const path = require('node:path');
const { projectState } = require('../../lib/project');
const { privateRoots } = require('../../lib/holdout');
const { pignoloHome, userHomes } = require('../../lib/home');
const { cleanPath, resolveClean, isWithin } = require('../../lib/paths');

const MESSAGE = 'pignolo bloqueó la lectura: el holdout y los sellos solo los lee el validator por los scripts de pignolo. '
  + 'Alternativa: trabajá con los tests del repo; si necesitás el resultado del holdout, pedíselo al hilo principal.\n';

// PIGNOLO_HOME cuenta solo usado como ruta ($PIGNOLO_HOME, ${PIGNOLO_HOME}, %PIGNOLO_HOME%,
// $env:PIGNOLO_HOME): `grep -rn PIGNOLO_HOME plugins/` es texto y pasa.
const MENTION_RE = /\.pignolo[\\/]+(holdout|seals)\b|\$\{?(env:)?PIGNOLO_HOME\b|%PIGNOLO_HOME%/i;
// Prefijo fijo de un patrón glob: lo que está antes del primer segmento con comodín.
const GLOB_CHAR = /[*?[\]{}]/;
function staticPrefix(pattern) {
  const segs = String(pattern).replace(/\\/g, '/').split('/');
  const i = segs.findIndex((s) => GLOB_CHAR.test(s));
  return (i < 0 ? segs : segs.slice(0, i)).join('/') || '.';
}
// Lo mismo para un argumento de la shell: `/*` es la raíz, no el cwd; `--opt=<ruta>` mira la ruta.
const SHELL_GLOB = /[*?[]/;
function shellPrefix(tok) {
  const segs = tok.replace(/^-[^=]*=/, '').replace(/\\/g, '/').split('/');
  const i = segs.findIndex((x) => SHELL_GLOB.test(x));
  if (i === 0) return '.';
  return segs.slice(0, i).join('/') || '/';
}

// Búsquedas recursivas por la shell: programa -> ¿es recursiva con estos argumentos?
const SEARCHERS = new Set(['find', 'rg', 'tree', 'grep', 'egrep', 'gci', 'get-childitem', 'ls', 'dir']);
const PS_RECURSE = /^-r(e(c(u(r(s(e)?)?)?)?)?)?(:\S*)?$/i;
const BASH_R = /^(-[a-zA-Z]*R[a-zA-Z]*|--recursive)$/;
function recursive(prog, args, ps) {
  if (['find', 'rg', 'tree'].includes(prog)) return true;
  if (prog === 'grep' || prog === 'egrep') return args.some((a) => /^(-[a-zA-Z]*[rR][a-zA-Z]*|--(dereference-)?recursive)$/.test(a));
  if (prog === 'gci' || prog === 'get-childitem') return args.some((a) => PS_RECURSE.test(a));
  if (prog === 'ls' || prog === 'dir') return args.some((a) => (ps ? PS_RECURSE.test(a) : BASH_R.test(a)) || (prog === 'dir' && /^\/s$/i.test(a)));
  return false;
}

// `~`, $HOME, $env:USERPROFILE, %USERPROFILE%, /mnt/c: se expanden antes de resolver.
function expand(tok, home) {
  const t = tok.replace(/^(\$HOME|\$env:(USERPROFILE|HOME)|%USERPROFILE%)(?=[\\/]|$)/i, home);
  return t.replace(/^\/mnt\/([a-zA-Z])(?=\/|$)/, '$1:');
}

function shellDenied(command, ps, { cwd, home, roots, store }) {
  if (MENTION_RE.test(command)) return true;
  const text = command.replace(/\\/g, '/').toLowerCase();
  const gitBash = (p) => p.replace(/^([a-z]):/, '/$1');
  if (roots.some((r) => text.includes(r) || text.includes(gitBash(r)))) return true;
  // Un recorrido recursivo cuya raíz es un ancestro del almacén (o la raíz del disco).
  const broad = (p) => isWithin(store, p) || roots.some((r) => isWithin(r, p));
  // Un comodín cuyo prefijo fijo está dentro del almacén privado o es un ancestro
  // (`cat ~/.pign*/hold*/*/*/*`): la shell lo expande sin que el texto nombre la ruta.
  const insideOrAbove = (p) => roots.some((r) => isWithin(p, r) || isWithin(r, p));
  const globHit = (tok) => SHELL_GLOB.test(tok) && insideOrAbove(resolveClean(expand(shellPrefix(tok), home), cwd, home));
  for (const seg of command.replace(/\$\{(\w+)\}/g, '$$$1').split(/[;&|\n\r(){}`]+/)) {
    const toks = seg.replace(/["']/g, '').trim().split(/\s+/).filter(Boolean);
    if (toks.some(globHit)) return true;
    for (let i = 0; i < toks.length; i += 1) {
      const prog = path.basename(toks[i].replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
      if (!SEARCHERS.has(prog)) continue;
      const args = toks.slice(i + 1);
      if (!recursive(prog, args, ps)) continue;
      const flag = (x) => x.startsWith('-') || (prog === 'dir' && /^\/[a-z]$/i.test(x));
      const paths = args.filter((x) => !flag(x));
      if (!paths.length) paths.push('.');
      if (paths.some((x) => broad(resolveClean(expand(x, home), cwd, home)))) return true;
    }
  }
  return false;
}

exports.run = (input, ctx = {}) => {
  if (!input.agent_id || input.agent_type === 'pignolo:validator') return { exit: 0 };
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (!projectState({ cwd, env }).active) return { exit: 0 };

  const home = userHomes(env)[0];
  const roots = privateRoots(env).map((r) => resolveClean(r, cwd, home));
  const store = resolveClean(pignoloHome(env), cwd, home);
  const at = (p, base = cwd) => resolveClean(p, base, home);
  const inside = (p) => roots.some((r) => isWithin(p, r));
  const insideOrAbove = (p) => roots.some((r) => isWithin(p, r) || isWithin(r, p));
  const ti = input.tool_input || {};
  const tool = String(input.tool_name || '');

  let denied = false;
  if (tool === 'Read') denied = typeof ti.file_path === 'string' && inside(at(ti.file_path));
  else if (tool === 'Glob' || tool === 'Grep') {
    const base = typeof ti.path === 'string' && ti.path ? at(ti.path) : cleanPath(cwd);
    const pat = tool === 'Glob' ? ti.pattern : ti.glob;
    denied = insideOrAbove(base) || (typeof pat === 'string' && pat !== '' && insideOrAbove(at(staticPrefix(pat), base)));
  } else if ((tool === 'Bash' || tool === 'PowerShell') && typeof ti.command === 'string') {
    denied = shellDenied(ti.command, tool === 'PowerShell', { cwd, home, roots, store });
  }
  return denied ? { exit: 2, stderr: MESSAGE } : { exit: 0 };
};
