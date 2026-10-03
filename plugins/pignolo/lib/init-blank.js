'use strict';
// ¿El proyecto está en blanco? (decisión del autor D-1, 2026-10-02). Conservador: solo es blanco si todo lo que hay en el
// disco es una herramienta conocida o archivo de editor/sistema (.git, .claude, .pignolo, .gitignore, .gitattributes, .vscode, .idea, .editorconfig, .DS_Store, Thumbs.db, desktop.ini, .gitkeep), un documento simple de la raíz
// (README, LICENSE...) o un README del esqueleto de init. Todo lo demás (código, manifiestos, archivos o carpetas ocultos
// desconocidos, carpetas desconocidas, enlaces, junctions, otros markdown) lo impide: ante la duda no es blanco (RI-01). No lee contenido
// ni usa git (git no ve lo ignorado ni lo que no tiene commits). Si no puede leer la raíz, lanza: el que llama falla cerrado.
const nodeFs = require('node:fs');
const path = require('node:path');
const { PLACE_DEFAULTS, RECOMMENDED_REFERENCE } = require('./places');

const ROOT_DOC = /^(?:README|LICENSE|LICENCE|COPYING|NOTICE|AUTHORS)(?:\.(?:md|markdown|txt|rst))?$/i;
const SKELETON_FOLDERS = [...Object.values(PLACE_DEFAULTS), RECOMMENDED_REFERENCE].map((p) => p.replace(/\/$/, ''));
// `local/` lleva su propio .gitignore (init-skeleton.js): es lo único oculto que el esqueleto escribe dentro de sus carpetas.
const SKELETON_FILES = new Set([...SKELETON_FOLDERS.map((p) => `${p}/README.md`), `${PLACE_DEFAULTS.private.replace(/\/$/, '')}/.gitignore`].map((x) => x.toLowerCase()));
const SKELETON_TOPS = new Set(SKELETON_FOLDERS.map((p) => p.split('/')[0].toLowerCase()));

// Pasos que valen en un proyecto en blanco: el esqueleto y lo que no depende de la detección. Nada más.
const BLANK_STEPS = Object.freeze(['ignores', 'gitattributes', 'reflog', 'skeleton']);

// Lo oculto que es de las herramientas, no del proyecto (sin distinguir mayúsculas). Estas carpetas no se recorren: el esqueleto de
// pignolo y los ajustes locales no son código. Cualquier otro nombre con punto (.config, .scripts, .bashrc) cuenta como contenido.
// Un enlace o una junction no es carpeta ni archivo para Dirent: tampoco es herramienta.
// Lista cerrada, en un solo lugar (RR-01): archivos y carpetas de editor y sistema que no son del proyecto. Sirve a blankProject y a hasCodeOrManifest.
const TOOL_DIRS = new Set(['.git', '.claude', '.pignolo', '.vscode', '.idea']);
const TOOL_FILES = new Set(['.gitignore', '.gitattributes', '.git', '.editorconfig', '.ds_store', 'thumbs.db', 'desktop.ini', '.gitkeep']);
const toolEntry = (e) => {
  const n = e.name.toLowerCase();
  return (e.isDirectory() && TOOL_DIRS.has(n)) || (e.isFile() && TOOL_FILES.has(n));
};

// Primera ruta bajo `rel` que no es del esqueleto, o null. Una carpeta que no se puede leer cuenta como contenido desconocido.
function strayUnder(root, rel, fs) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, ...rel.split('/')), { withFileTypes: true }); } catch (_) { return rel; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      const s = strayUnder(root, r, fs);
      if (s) return s;
    } else if (!(e.isFile() && SKELETON_FILES.has(r.toLowerCase()))) return r;
  }
  return null;
}

function blankProject({ root, fs = nodeFs } = {}) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  let seen = 0;
  for (const e of entries) {
    if (toolEntry(e)) continue;
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

// ¿Hay código o un manifiesto (RI-02)? Más estricto que "no es blanco": un documento (md, txt, rst, CHANGELOG...) o algo dentro de las
// carpetas del esqueleto (docs/, design/, local/) no lo es. Cualquier otro archivo, oculto o no, sí (main.py, package.json, .scripts/x).
// Solo para un aviso: ante un error de lectura, un enlace o un tope de entradas, dice false (sin aviso).
const DOC_FILE = /\.(?:md|markdown|txt|rst)$|^(?:CHANGELOG|CONTRIBUTING|CODEOWNERS|CODE_OF_CONDUCT|SECURITY)$/i;
const MAX_SCAN = 5000;

function hasCodeOrManifest({ root, fs = nodeFs } = {}) {
  let budget = MAX_SCAN;
  const walk = (dir, top) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (budget-- <= 0) return false;
      if (top && toolEntry(e)) continue;
      if (e.isDirectory()) {
        if (top && SKELETON_TOPS.has(e.name.toLowerCase())) continue;
        if (walk(path.join(dir, e.name), false)) return true;
      } else if (e.isFile() && !DOC_FILE.test(e.name) && !ROOT_DOC.test(e.name)) return true;
    }
    return false;
  };
  try { return walk(root, true); } catch (_) { return false; }
}

module.exports = { blankProject, hasCodeOrManifest, BLANK_STEPS };
