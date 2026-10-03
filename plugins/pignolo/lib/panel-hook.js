'use strict';
// Una línea por script: al terminar el proceso (`exit`) refresca el registro del panel. Protegido: un fallo del
// registro NUNCA cambia el código de salida ni escribe en stdout (R-P6). Solo actúa en un proyecto con pignolo
// configurado (.pignolo/project.md en la raíz principal).
const fs = require('node:fs');
const path = require('node:path');

const READONLY = new Set(['list', 'status', 'runnable', 'report', 'preview', 'show']);
const argCwd = (argv) => { const i = argv.indexOf('--cwd'); return i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd(); };

// Sin argumentos: toma el cwd de --cwd o process.cwd() y se salta los verbos de solo lectura.
// `only`: si se pasa, refresca solo para esos verbos (p. ej. ledger.js: solo `save`).
function panelRefreshOnExit({ only } = {}) {
  const argv = process.argv.slice(2);
  const words = argv.filter((a) => !a.startsWith('--')).slice(0, 2);
  if (only ? !only.includes(words[0]) : (READONLY.has(words[0]) || ['check', 'status', 'list'].includes(words[1]))) return;
  const cwd = argCwd(argv);
  process.on('exit', () => {
    const code = process.exitCode;
    try {
      const { mainRoot } = require('./disabled');
      const main = mainRoot(cwd || process.cwd());
      if (!fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return;
      require('./panel-state').refresh(main);
    } catch (_) { /* el registro nunca rompe el comando */ }
    process.exitCode = code;
  });
}

// Anota evidencia rojo/verde de la tarjeta de la tarea (sabotage.js, gate.js). Protegido.
function panelEvidence(cwd, card, fields) {
  try {
    const { mainRoot } = require('./disabled');
    const main = mainRoot(cwd || process.cwd());
    if (!card || !fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return;
    require('./panel-state').evidence(main, { card, ...fields });
  } catch (_) { /* idem */ }
}

// Escribe un evento en el registro desde un script de pignolo (una decisión, una respuesta, una rama que espera, el tope). Protegido
// como el resto: un fallo del registro nunca cambia lo que el script hace ni su código de salida. `fn(panel, main)`.
function panelDo(cwd, fn) {
  try {
    const { mainRoot } = require('./disabled');
    const main = mainRoot(cwd || process.cwd());
    if (!fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return null;
    return fn(require('./panel-state'), main);
  } catch (_) { return null; }
}

// La tarjeta (id de tarea) cuyo worktree es `dir`, según run.json.
function cardOfWorktree(cwd) {
  try {
    const { mainRoot } = require('./disabled');
    const { readRun, taskList } = require('./project');
    const st = readRun(mainRoot(cwd));
    const here = path.resolve(cwd).toLowerCase();
    const t = taskList(st.run).find((x) => path.resolve(x.worktree).toLowerCase() === here);
    return t ? t.id : null;
  } catch (_) { return null; }
}

module.exports = { panelRefreshOnExit, panelEvidence, panelDo, cardOfWorktree };
