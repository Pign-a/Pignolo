'use strict';
// Una sola interfaz para "el agente que corre experimentos" (R-16, D-5-1 opción a: el
// mismo plan-auditor con dos despachos). Sin dependencias: lo carga el launcher.
const REVIEW_AGENT = 'pignolo:plan-auditor';
const VERIFY_AGENT = 'pignolo:plan-auditor';

module.exports = { REVIEW_AGENT, VERIFY_AGENT };
