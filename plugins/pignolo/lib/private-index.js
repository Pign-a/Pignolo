'use strict';
// Compuerta del commit (T2 del plan 2026-10-03-fuga-leak-values): qué archivos privados (lib/private-paths.js) va a
// llevar el commit. Mira lo que el commit va a registrar, no el índice a secas, y nunca cuenta lo que el commit BORRA
// (--diff-filter=d): `git rm --cached` de un privado ya commiteado y después `git commit` es la limpieza y tiene que pasar.
const path = require('node:path');
const { gitRun } = require('./git');
const { isPrivatePath } = require('./private-paths');

const TIMEOUT_MS = 1000;

function names(args, cwd) {
  const out = gitRun(args, cwd, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  return out ? out.split('\0').filter(Boolean) : [];
}

// ¿hay un commit de partida? (un commit raíz o un repo sin commits no tiene HEAD / HEAD^)
function exists(ref, cwd) {
  try { gitRun(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, { timeout: TIMEOUT_MS }); return true; } catch (_) { return false; }
}

// Rutas que el commit registraría (sin las que borra), según su forma:
//   `commit`            -> índice contra HEAD
//   `commit -a`         -> árbol de trabajo (lo rastreado) y el índice contra HEAD
//   `commit <rutas>`    -> el árbol de trabajo de esas rutas contra HEAD
//   `commit --amend`    -> contra HEAD^ (el commit corregido reemplaza a HEAD)
function commitPaths({ cwd, all = false, amend = false, paths = [] }) {
  const base = amend ? 'HEAD^' : 'HEAD';
  const hasBase = exists(base, cwd);
  const out = new Set();
  const add = (list) => list.forEach((p) => out.add(p));
  const f = ['--name-only', '--diff-filter=d', '-z'];
  if (paths.length) {
    // con rutas, git commit toma el contenido del árbol de trabajo de esas rutas
    if (hasBase) add(names(['diff', ...f, base, '--', ...paths], cwd));
    else add(names(['ls-files', '-z', '--cached', '--', ...paths], cwd));
    return [...out]; // --only (el modo por omisión): lo que ya estaba en el índice y no se nombra no viaja
  }
  if (hasBase) add(names(['diff', '--cached', ...f, base], cwd));
  else add(names(['ls-files', '-z', '--cached'], cwd));
  if (all && hasBase) add(names(['diff', ...f, base], cwd));
  return [...out];
}

// Rutas privadas del commit. Sin repo o si git falla -> [] (segunda capa: no frena lo que no puede ver).
function stagedPrivate(opts) {
  try { return commitPaths(opts).filter(isPrivatePath); } catch (_) { return []; }
}

// Comando para sacarlas del índice: hasta 5 rutas, o la carpeta madre. Un comando por vez (no lo encadenes con `&&` al
// commit: la compuerta mira el índice antes de que corra el primero).
function exitCommand(paths) {
  const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
  if (paths.length <= 5) return `git restore --staged -- ${paths.map(q).join(' ')}`;
  const roots = new Set(paths.map((p) => {
    const parts = p.split('/');
    const i = parts.findIndex((s) => s.toLowerCase() === '.pignolo-ui');
    if (i >= 0) return parts.slice(0, i + 1).join('/');
    const j = parts.findIndex((s, k) => s.toLowerCase() === '.pignolo' && k + 1 < parts.length);
    return j >= 0 ? parts.slice(0, j + 2).join('/') : path.posix.dirname(p);
  }));
  return `git restore --staged -- ${[...roots].map(q).join(' ')}`;
}

module.exports = { stagedPrivate, exitCommand, commitPaths };
