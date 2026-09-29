'use strict';
// Glob propio (path.matchesGlob no está en Node 20). Sensible a mayúsculas.
//  - sin "/"            : cualquier segmento de la ruta lo cumple.
//  - termina en "/"     : algún directorio de la ruta lo cumple (sin "/" interno),
//                         o anclado a la raíz como prefijo de directorios (con "/" interno).
//  - con "/" interno    : anclado a la raíz; "**" = cero o más segmentos.

const cache = new Map();

function segRegex(seg) {
  let re = '';
  for (const ch of seg) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function compile(pattern) {
  let c = cache.get(pattern);
  if (c) return c;
  const dirOnly = pattern.endsWith('/');
  const body = dirOnly ? pattern.slice(0, -1) : pattern;
  const segs = body.split('/').filter((s) => s !== '');
  c = {
    dirOnly,
    anchored: body.includes('/'),
    segs: segs.map((s) => (s === '**' ? '**' : segRegex(s))),
  };
  cache.set(pattern, c);
  return c;
}

// Cumple todos los segmentos de path (i..) con los del patrón (j..).
function matchSegs(pat, i, parts, j) {
  if (i === pat.length) return j === parts.length;
  if (pat[i] === '**') {
    for (let k = j; k <= parts.length; k += 1) if (matchSegs(pat, i + 1, parts, k)) return true;
    return false;
  }
  return j < parts.length && pat[i].test(parts[j]) && matchSegs(pat, i + 1, parts, j + 1);
}

function matchGlob(pattern, relPath) {
  if (!pattern || typeof relPath !== 'string') return false;
  const c = compile(pattern);
  if (c.segs.length === 0) return false;
  const parts = relPath.split('/').filter((s) => s !== '');
  if (parts.length === 0) return false;
  if (c.dirOnly) {
    const dirs = parts.slice(0, -1);
    if (!c.anchored) return dirs.some((d) => c.segs[0].test(d));
    for (let n = 1; n <= dirs.length; n += 1) if (matchSegs(c.segs, 0, dirs.slice(0, n), 0)) return true;
    return false;
  }
  if (!c.anchored) return parts.some((p) => c.segs[0].test(p));
  return matchSegs(c.segs, 0, parts, 0);
}

function matchAny(patterns, relPath) {
  return patterns.some((p) => matchGlob(p, relPath));
}

module.exports = { matchGlob, matchAny };
