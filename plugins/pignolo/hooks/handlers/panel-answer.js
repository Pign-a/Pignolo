'use strict';
// UserPromptSubmit: marca como respondida una decisión del panel cuando el prompt cumple el formato exacto
// `Respuesta a la decisión Q-<n> ("<pregunta>"): <opción>.` (R-P4). Marca solo si el id, la pregunta citada y la opción
// coinciden EXACTAMENTE con una decisión abierta (RP-02); si algo no coincide no marca nada. Mejor esfuerzo y FALLA ABIERTO:
// nunca niega, nunca reescribe el prompt, siempre sale 0 (no es parte de la guardia). Solo lee el texto del prompt.
const { mainRoot } = require('../../lib/disabled');

const FORMAT = /^Respuesta a la decisión (Q-\d+) \("([^"]*)"\): (.+)\.$/;

exports.run = (input) => {
  try {
    if (!input || typeof input !== 'object' || typeof input.prompt !== 'string') return { exit: 0 };
    const m = FORMAT.exec(input.prompt.replace(/\r?\n$/, ''));
    if (!m) return { exit: 0 };
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const main = mainRoot(cwd);
    const panel = require('../../lib/panel-state');
    if (!require('node:fs').existsSync(panel.fileOf(main))) return { exit: 0 };
    panel.answer(main, { id: m[1], answer: m[3], question: m[2], strict: true });
  } catch (_) { /* falla abierto */ }
  return { exit: 0 };
};
