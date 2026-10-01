'use strict';
// Atajos de solo-payload que el launcher consulta ANTES de crear el Worker (R-15 iv): si el
// payload no puede concernir al hook, sale con 0 sin cargar nada. Con cuatro launchers por
// Bash y la suite en paralelo se midieron 3,5 s contra el plazo de 3 s: un hook que no tiene
// nada que decidir no puede sumar denegaciones al azar. Cualquier otro nombre o un payload
// sin la forma esperada: false (sigue el camino de siempre y el handler decide).
// Sin dependencias salvo plan-agents.js.
const { REVIEW_AGENT, VERIFY_AGENT } = require('./plan-agents');

// El prefiltro de scope-gate (regla 3 de la Task 9): una sola constante, la usa también el decide.
// git en Windows no distingue mayúsculas (`Git merge`), así que el prefiltro tampoco.
const GIT_RE = /\bgit\b/i;
const VERB_RE = /\b(merge|push|pull|rebase|fetch|branch|update-ref|reset|cherry-pick|checkout|switch)\b/i;

function skips(name, input) {
  if (!input || typeof input !== 'object') return false;
  if (name === 'plan-audit-gate') return input.agent_type !== REVIEW_AGENT && input.agent_type !== VERIFY_AGENT;
  if (name === 'scope-gate') {
    const ti = input.tool_input;
    const command = ti && typeof ti === 'object' ? ti.command : undefined;
    if (typeof command !== 'string') return false;
    return !(GIT_RE.test(command) && VERB_RE.test(command));
  }
  return false;
}

module.exports = { skips, GIT_RE, VERB_RE };
