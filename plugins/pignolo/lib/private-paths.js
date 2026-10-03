'use strict';
// Qué es privado en un repo (D4 de docs/plans/2026-10-03-fuga-leak-values.md): lo que pignolo y pignolo-ui guardan
// ignorado a propósito y no debe entrar al índice ni al historial. Una sola lista.
// `.pignolo/state/` NO es privado: se versiona a propósito.
const PRIVATE_DIRS = ['.pignolo-ui', '.pignolo/local', '.pignolo/tmp', '.pignolo/worktrees'];
const PRIVATE_FILES = ['.pignolo/run.json', '.pignolo/.disabled', '.pignolo/panel-state.json'];
const PRIVATE_NAMES = ['leak-values.json', 'leak-origins.json'];

const segs = (rel) => String(rel).replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').map((s) => s.toLowerCase());

// ¿la secuencia `seq` aparece como segmentos consecutivos de `parts` (en cualquier carpeta del repo)?
function hasRun(parts, seq, { last = false } = {}) {
  for (let i = 0; i + seq.length <= parts.length; i++) {
    if (!seq.every((s, k) => parts[i + k] === s)) continue;
    if (!last || i + seq.length === parts.length) return true;
  }
  return false;
}

// Acepta `/` y `\`, ignora mayúsculas y `./`; una ruta relativa al repo (o a una carpeta dentro de él).
function isPrivatePath(rel) {
  const parts = segs(rel);
  if (!parts.length) return false;
  if (PRIVATE_NAMES.includes(parts[parts.length - 1])) return true;
  // la carpeta en sí (`.pignolo-ui`) o algo debajo; un archivo con ese nombre exacto también cuenta
  if (PRIVATE_DIRS.some((d) => hasRun(parts, d.split('/')))) return true;
  return PRIVATE_FILES.some((f) => hasRun(parts, f.split('/'), { last: true }));
}

module.exports = { isPrivatePath, PRIVATE_DIRS, PRIVATE_FILES, PRIVATE_NAMES };
