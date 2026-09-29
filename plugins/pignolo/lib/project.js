'use strict';
// Estado del proyecto para los hooks que dependen de pignolo configurado.
const fs = require('node:fs');
const path = require('node:path');
const { readState, projectRoot } = require('./disabled');

// root: la misma raíz que usa el interruptor (projectRoot: sube sin git hasta
// .pignolo/project.md o .git; si no hay ninguno, el cwd), así /pignolo:off y la
// allowlist nunca miran carpetas distintas.
// active: hay project.md en ese root y /pignolo:off (o PIGNOLO_DISABLED=1) no está puesto.
function projectState({ cwd = process.cwd(), env = process.env } = {}) {
  const root = projectRoot(cwd);
  const configured = fs.existsSync(path.join(root, '.pignolo', 'project.md'));
  return { root, active: configured && !readState({ env, cwd: root }).hooksOff };
}

// Flujo de pignolo en curso (decisión del autor, 2026-09-29): la allowlist de agentes rige
// solo mientras exista <root>/.pignolo/run.json con `expires` (ISO) en el futuro. Lo
// escriben las skills de los flujos (hito 3+). Uno ilegible cuenta como en curso: falla
// cerrado dentro de un flujo; uno vencido no cuenta, así una sesión cortada no bloquea.
function runState(root, now = Date.now()) {
  const file = path.join(root, '.pignolo', 'run.json');
  if (!fs.existsSync(file)) return { running: false, file };
  let run;
  try { run = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { running: true, malformed: true, file }; }
  const expires = run && typeof run.expires === 'string' ? Date.parse(run.expires) : NaN;
  if (Number.isNaN(expires)) return { running: true, malformed: true, file };
  return { running: expires > now, file };
}

module.exports = { projectState, runState };
