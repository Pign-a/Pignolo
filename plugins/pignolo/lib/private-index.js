'use strict';
// Compuerta del commit (T2 del plan 2026-10-03-fuga-leak-values): qué archivos privados (lib/private-paths.js) va a
// llevar el commit. Mira lo que el commit va a registrar, no el índice a secas, y nunca cuenta lo que el commit BORRA
// (--diff-filter=d): `git rm --cached` de un privado ya commiteado y después `git commit` es la limpieza y tiene que pasar.
const path = require('node:path');
const { gitRun } = require('./git');
const { isPrivatePath } = require('./private-paths');

const TIMEOUT_MS = 1000;

// El hook nunca deja que git pida algo ni abra un editor: un hook que espera una ventana cuelga la sesion, y un editor que
// acepta lo que le pasan (GIT_EDITOR=true) es el peor caso. Toda llamada a git de esta compuerta lleva este entorno, sin
// stdin (lib/git.js) y con plazo.
const HOOK_ENV = { ...process.env, GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
const run = (args, cwd, opts = {}) => gitRun(args, cwd, { ...opts, env: HOOK_ENV, timeout: TIMEOUT_MS });

function names(args, cwd) {
  const out = run(args, cwd, { maxBuffer: 8 * 1024 * 1024 });
  return out ? out.split('\0').filter(Boolean) : [];
}

// ¿hay un commit de partida? (un commit raíz o un repo sin commits no tiene HEAD / HEAD^)
function exists(ref, cwd) {
  try { run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd); return true; } catch (_) { return false; }
}

// Rutas que el commit registraría (sin las que borra), según su forma:
//   `commit`            -> índice contra HEAD
//   `commit -a`         -> árbol de trabajo (lo rastreado) y el índice contra HEAD
//   `commit <rutas>`    -> el árbol de trabajo de esas rutas contra HEAD
//   `commit --amend`    -> contra HEAD^ (el commit corregido reemplaza a HEAD)
function commitPaths({ cwd, all = false, amend = false, paths = [], include = false }) {
  const base = amend ? 'HEAD^' : 'HEAD';
  const hasBase = exists(base, cwd);
  const out = new Set();
  const add = (list) => list.forEach((p) => out.add(p));
  const f = ['--name-only', '--diff-filter=d', '-z'];
  if (paths.length) {
    // con rutas, git commit toma el contenido del árbol de trabajo de esas rutas
    if (hasBase) add(names(['diff', ...f, base, '--', ...paths], cwd));
    else add(names(['ls-files', '-z', '--cached', '--', ...paths], cwd));
    if (!include) return [...out]; // --only (el modo por omisión): lo que ya estaba en el índice y no se nombra no viaja
    // -i/--include: el índice contra HEAD más esas rutas (sigue abajo)
  }
  if (hasBase) add(names(['diff', '--cached', ...f, base], cwd));
  else add(names(['ls-files', '-z', '--cached'], cwd));
  if (all && hasBase) add(names(['diff', ...f, base], cwd));
  return [...out];
}

// Opciones de `git add` que la compuerta reconoce. Cualquier otra (-e, -p, -i, --pathspec-from-file, --chmod, -N, una
// abreviatura...) puede abrir un editor o aplicar un parche aunque lleve --dry-run (git lo ignora con -e): con ella no se
// corre git.
const ADD_SHORT = new Set(['A', 'u', 'f', 'n', 'v']);
const ADD_LONG = { '--all': '-A', '--update': '-u', '--force': '-f', '--dry-run': '', '--verbose': '', '--no-ignore-removal': '' };

function parseAdd(args) {
  const known = new Set();
  let unknown = false;
  let noSpecs = false;
  for (const a of args) {
    if (a === '--') break;
    if (a.startsWith('--')) {
      if (a in ADD_LONG) { if (ADD_LONG[a]) known.add(ADD_LONG[a]); } else {
        unknown = true;
        if (/^--pathspec-/.test(a)) noSpecs = true;
      }
    } else if (a.length > 1 && a.startsWith('-')) {
      for (const ch of a.slice(1)) {
        if (!ADD_SHORT.has(ch)) unknown = true;
        else if (ch === 'A' || ch === 'u' || ch === 'f') known.add(`-${ch}`);
      }
    }
  }
  return { known: [...known], unknown, noSpecs };
}

// Archivos que un `git add <args>` indexaría, sin ejecutarlo. El hook no le pasa a git los argumentos del usuario: arma su
// propia invocacion (`add --dry-run --ignore-missing` con las banderas reconocidas y las rutas ya separadas, tras `--`).
// Con una opcion desconocida, o si git falla, cae al cierre: todo lo sin rastrear (el ignorado tambien si hay -f) bajo las
// rutas. Si ni eso se puede calcular, lanza (la guardia niega).
function addNames(args, cwd, specs) {
  const p = parseAdd(args);
  if (!p.unknown) {
    try {
      const out = run(['add', '--dry-run', '--ignore-missing', ...p.known, '--', ...specs], cwd, { maxBuffer: 8 * 1024 * 1024 });
      return String(out || '').split('\n').map((l) => /^(?:add|remove) '(.*)'$/.exec(l.trim())).filter(Boolean).map((m) => m[1]);
    } catch (_) { /* cae al cierre */ }
  }
  const ignored = p.known.includes('-f') ? [] : ['--exclude-standard'];
  return names(['ls-files', '-z', '--others', ...ignored, '--', ...(p.noSpecs ? [] : specs)], cwd);
}

// Lanza si no se pudo calcular: la compuerta de commit lo trata como un commit que se niega.
function addedPrivate({ cwd, args, positionals = [] }) {
  return addNames(args, cwd, positionals).filter(isPrivatePath);
}

function hasHead(cwd) { return exists('HEAD', cwd); }

// Rutas privadas del commit. Sin repo o si git falla -> [] (segunda capa: no frena lo que no puede ver).
function stagedPrivate(opts) {
  try { return commitPaths(opts).filter(isPrivatePath); } catch (_) { return []; }
}

// Comando para sacarlas del índice: hasta 5 rutas, o la carpeta madre. Un comando por vez (no lo encadenes con `&&` al
// commit: la compuerta mira el índice antes de que corra el primero).
function exitCommand(paths, { unborn = false } = {}) {
  // En un repo sin commits no hay HEAD y `restore --staged` falla: la salida es `git rm --cached` (no borra el archivo).
  const cmd = unborn ? 'git rm -r --cached --' : 'git restore --staged --';
  const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
  if (paths.length <= 5) return `${cmd} ${paths.map(q).join(' ')}`;
  const roots = new Set(paths.map((p) => {
    const parts = p.split('/');
    const i = parts.findIndex((s) => s.toLowerCase() === '.pignolo-ui');
    if (i >= 0) return parts.slice(0, i + 1).join('/');
    const j = parts.findIndex((s, k) => s.toLowerCase() === '.pignolo' && k + 1 < parts.length);
    return j >= 0 ? parts.slice(0, j + 2).join('/') : path.posix.dirname(p);
  }));
  return `${cmd} ${[...roots].map(q).join(' ')}`;
}

module.exports = { stagedPrivate, addedPrivate, hasHead, exitCommand, commitPaths };
