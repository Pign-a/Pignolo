'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pignoloHome } = require('./home');

// Raíz del proyecto sin git (no gasta plazo): sube desde el cwd hasta el primer
// directorio con .pignolo/project.md o con .git; si no hay ninguno, el cwd. El cwd de
// la sesión persiste entre comandos, así que puede estar en un subdirectorio.
function projectRoot(cwd = process.cwd()) {
  const start = path.resolve(cwd);
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.pignolo', 'project.md')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return start;
  }
}

// Directorio git común del proyecto, sin git ni procesos: <root>/.git si es un directorio;
// si es un archivo (worktree enlazado) 'gitdir: X' -> X/commondir (relativo a X).
// { common, linked } o null si no hay .git o no se puede leer.
function gitCommon(cwd) {
  try {
    const root = projectRoot(cwd);
    const dotGit = path.join(root, '.git');
    const st = fs.statSync(dotGit);
    if (st.isDirectory()) return { root, common: dotGit, linked: false };
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    if (!m) return null;
    const gitdir = path.resolve(root, m[1]);
    let common = gitdir;
    try { common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim()); } catch (_) { /* gitdir sin commondir */ }
    return { root, common, linked: true };
  } catch (_) { return null; }
}

// Raíz del checkout principal (Review Focus 3): desde un worktree enlazado, el padre del
// directorio común (.git); en cualquier otro caso, projectRoot. Sin git ni procesos.
function mainRoot(cwd = process.cwd()) {
  const root = projectRoot(cwd);
  const g = gitCommon(cwd);
  if (g && g.linked && path.basename(g.common) === '.git') return path.dirname(g.common);
  return root;
}

function flagPaths({ env = process.env, cwd = process.cwd() } = {}) {
  return {
    global: path.join(pignoloHome(env), 'disabled'),
    project: path.join(mainRoot(cwd), '.pignolo', '.disabled'),
  };
}

// guardOff solo con PIGNOLO_DISABLED=1 en el entorno del proceso (spec §3.3).
// Los flags de /pignolo:off apagan los demás hooks, nunca la guardia ni los respaldos.
function readState({ env = process.env, cwd = process.cwd() } = {}) {
  const guardOff = env.PIGNOLO_DISABLED === '1';
  const p = flagPaths({ env, cwd });
  const globalFlag = fs.existsSync(p.global);
  const projectFlag = fs.existsSync(p.project);
  return { guardOff, hooksOff: guardOff || globalFlag || projectFlag, globalFlag, projectFlag };
}

module.exports = { readState, flagPaths, projectRoot, mainRoot, gitCommon };
