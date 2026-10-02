'use strict';
// Rutas comparables con las que informa git (I7): git da siempre la ruta real (sin junctions, enlaces simbólicos ni
// nombres cortos), y `path.resolve` no resuelve nada de eso. Un repo alcanzado por una junction o por /tmp -> /private/tmp
// hacía que la cola y el listado de worktrees no reconocieran sus propias worktrees.
const fs = require('node:fs');
const path = require('node:path');

// La ruta real de `p`; si no existe, la del directorio más cercano que exista + el resto.
function realPath(p) {
  const abs = path.resolve(p);
  const tail = [];
  let cur = abs;
  for (let i = 0; i < 64; i += 1) {
    try {
      const real = (fs.realpathSync.native || fs.realpathSync)(cur);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (_) {
      const up = path.dirname(cur);
      if (up === cur) return abs;
      tail.push(path.basename(cur));
      cur = up;
    }
  }
  return abs;
}

// Para comparar: real y, en Windows, sin distinguir mayúsculas.
function realNorm(p) {
  const r = realPath(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

module.exports = { realPath, realNorm };
