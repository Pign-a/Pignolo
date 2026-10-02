'use strict';
// ¿El proyecto está en blanco? (decisión del autor D-1, 2026-10-02). Conservador: solo es blanco si todo lo que hay en el
// disco es oculto (nombre con punto), un documento simple de la raíz (README, LICENSE...) o un README del esqueleto de init.
// Todo lo demás (código, manifiestos, carpetas desconocidas, enlaces, junctions, otros markdown) lo impide. No lee contenido
// ni usa git (git no ve lo ignorado ni lo que no tiene commits). Si no puede leer la raíz, lanza: el que llama falla cerrado.
const nodeFs = require('node:fs');
const path = require('node:path');
const { PLACE_DEFAULTS, RECOMMENDED_REFERENCE } = require('./places');

const ROOT_DOC = /^(?:README|LICENSE|LICENCE|COPYING|NOTICE|AUTHORS)(?:\.(?:md|markdown|txt|rst))?$/i;
const SKELETON_FOLDERS = [...Object.values(PLACE_DEFAULTS), RECOMMENDED_REFERENCE].map((p) => p.replace(/\/$/, ''));
const SKELETON_READMES = new Set(SKELETON_FOLDERS.map((p) => `${p}/README.md`.toLowerCase()));
const SKELETON_TOPS = new Set(SKELETON_FOLDERS.map((p) => p.split('/')[0].toLowerCase()));

const hidden = (name) => name.startsWith('.');

// Primera ruta bajo `rel` que no es del esqueleto, o null. Una carpeta que no se puede leer cuenta como contenido desconocido.
function strayUnder(root, rel, fs) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, ...rel.split('/')), { withFileTypes: true }); } catch (_) { return rel; }
  for (const e of entries) {
    if (hidden(e.name)) continue;
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      const s = strayUnder(root, r, fs);
      if (s) return s;
    } else if (!(e.isFile() && SKELETON_READMES.has(r.toLowerCase()))) return r;
  }
  return null;
}

function blankProject({ root, fs = nodeFs } = {}) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  let seen = 0;
  for (const e of entries) {
    if (hidden(e.name)) continue;
    if (e.isFile() && ROOT_DOC.test(e.name)) { seen += 1; continue; }
    if (e.isDirectory() && SKELETON_TOPS.has(e.name.toLowerCase())) {
      const s = strayUnder(root, e.name, fs);
      if (s) return { blank: false, reason: 'has-files', firstFile: s };
      continue;
    }
    return { blank: false, reason: 'has-files', firstFile: e.name };
  }
  return { blank: true, reason: seen ? 'only-plain-docs' : 'empty', firstFile: null };
}

module.exports = { blankProject };
