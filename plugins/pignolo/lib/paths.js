'use strict';
// Normalización de rutas para compararlas contra los flags del interruptor y .git.
// Windows ignora los puntos y espacios al final de cada componente, y
// 'archivo:stream' o 'archivo::$DATA' escriben sobre el mismo 'archivo'.
// Todo se compara en minúsculas y con '/'. Límite declarado: no resuelve
// nombres cortos 8.3 (PIGNOL~1) ni enlaces simbólicos.
const path = require('node:path');

const FLAG_RE = /(^|\/)\.?pignolo\/\.?disabled$/;
const PIGNOLO_DIR_RE = /(^|\/)\.pignolo$/;
const GIT_DIR_RE = /(^|\/)\.git(\/|$)/;

function cleanPath(p) {
  return String(p).replace(/\\/g, '/').split('/').map((seg, i) => {
    let s = seg;
    if (i === 0 && /^[A-Za-z]:$/.test(s)) return s.toLowerCase();
    const colon = s.indexOf(':');
    if (colon >= 0 && !(i === 0 && colon === 1)) s = s.slice(0, colon);
    if (s !== '.' && s !== '..') s = s.replace(/[. ]+$/, '');
    return s.toLowerCase();
  }).join('/');
}

function isAbsoluteClean(p) {
  return p.startsWith('/') || /^[a-z]:\//.test(p) || p.startsWith('~');
}

// Resuelve `p` contra `base` (ambas crudas) y devuelve la forma normalizada.
function resolveClean(p, base) {
  const c = cleanPath(p);
  const joined = isAbsoluteClean(c) ? c : `${cleanPath(base).replace(/\/+$/, '')}/${c}`;
  return path.posix.normalize(joined);
}

module.exports = { cleanPath, resolveClean, FLAG_RE, PIGNOLO_DIR_RE, GIT_DIR_RE };
