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

// Holdout en preparación: <main>/.pignolo/tmp/holdout/, antes de holdout.js save. Lo lee solo
// el test-writer que lo escribe (y el validator). Se niega adentro, no en sus ancestros: buscar
// en el repo sigue permitido (Grep respeta el .gitignore de .pignolo; Glob NO: medido).
const STAGING_RE = /\.pignolo[\\/]+tmp[\\/]+holdout\b/i;
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

// La preparación por la shell: el texto `.pignolo/tmp/holdout` (también en la ruta absoluta y en su
// forma Git Bash `/c/...`, que lo contienen) o una ruta relativa que resuelve adentro
// (`cat ../../tmp/holdout/p1/x` desde el worktree de la tarea). Best-effort: `cd ../../tmp && cat
// holdout/p1/x` no se detecta.
function stagingDenied(command, { cwd, home, staging }) {
  if (STAGING_RE.test(command)) return true;
  return command.split(/[\s;&|()<>"'`]+/).some((tok) => /tmp[\\/]+holdout/i.test(tok) && isWithin(resolveClean(expand(tok, home), cwd, home), staging));
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

// Valores personales de pignolo-ui (T1 del plan 2026-10-03-fuga-leak-values): solo en este hook, no en lib/holdout.js
// (lo usan el guardado y el sello). Un subagente no los lee; el hilo principal sí.
const extraPrivateRoots = (env) => [path.join(pignoloHome(env), 'ui-leaks')];
const LEAK_MESSAGE = 'pignolo bloqueó la lectura: los valores personales de pignolo-ui (ui-leaks) no los lee un subagente. '
  + 'Alternativa: usá el resultado de leak-check; si necesitás saber qué valor falló, pedíselo al hilo principal.\n';

exports.run = (input, ctx = {}) => {
  if (!input.agent_id || input.agent_type === 'pignolo:validator') return { exit: 0 };
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const state = projectState({ cwd, env });
  if (!state.active) return { exit: 0 };

  const home = userHomes(env)[0];
  const store = resolveClean(pignoloHome(env), cwd, home);
  const at = (p, base = cwd) => resolveClean(p, base, home);
  const staging = input.agent_type === 'pignolo:test-writer' ? null : resolveClean(path.join(state.main, '.pignolo', 'tmp', 'holdout'), cwd, home);
  const staged = (p) => staging !== null && isWithin(p, staging);
  // Glob/Grep desde <main>/.pignolo o una carpeta suya que contiene la preparación (<main>/.pignolo/tmp):
  // Grep ahí devuelve el contenido (no respeta el .gitignore cuando la base ya está dentro de él).
  const pignoloDir = staging === null ? null : resolveClean(path.join(state.main, '.pignolo'), cwd, home);
  const stagedAbove = (p) => staging !== null && isWithin(p, pignoloDir) && isWithin(staging, p);
  const ti = input.tool_input || {};
  const tool = String(input.tool_name || '');

  // ¿se niega con estas raíces privadas? (la preparación del holdout solo cuenta en la primera pasada)
  const deniedWith = (rootList, withStaging) => {
    const roots = rootList.map((r) => resolveClean(r, cwd, home));
    const inside = (p) => roots.some((r) => isWithin(p, r));
    const insideOrAbove = (p) => roots.some((r) => isWithin(p, r) || isWithin(r, p));
    const st = (p) => withStaging && staged(p);
    const stAbove = (p) => withStaging && stagedAbove(p);
    if (tool === 'Read') return typeof ti.file_path === 'string' && (inside(at(ti.file_path)) || st(at(ti.file_path)));
    if (tool === 'Glob' || tool === 'Grep') {
      const base = typeof ti.path === 'string' && ti.path ? at(ti.path) : cleanPath(cwd);
      const pat = tool === 'Glob' ? ti.pattern : ti.glob;
      const prefix = typeof pat === 'string' && pat !== '' ? at(staticPrefix(pat), base) : null;
      return insideOrAbove(base) || st(base) || stAbove(base)
        || (prefix !== null && (insideOrAbove(prefix) || st(prefix) || stAbove(prefix)));
    }
    if ((tool === 'Bash' || tool === 'PowerShell') && typeof ti.command === 'string') {
      return shellDenied(ti.command, tool === 'PowerShell', { cwd, home, roots, store })
        || (withStaging && staging !== null && stagingDenied(ti.command, { cwd, home, staging }));
    }
    return false;
  };

  if (deniedWith(privateRoots(env), true)) return { exit: 2, stderr: MESSAGE };
  if (deniedWith(extraPrivateRoots(env), false)) return { exit: 2, stderr: LEAK_MESSAGE };
  return { exit: 0 };
};
