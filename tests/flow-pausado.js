'use strict';
// El flujo de pantallas de `ui` (Brief, ficha de patrón y crítica) está pausado desde la 1.1.0: la ronda 2 no mostró ventaja
// (tests/evals/RESULTS-ui-flujo-ronda2.md). Sus pruebas se saltan mientras la sección "Building screens" no esté en la skill;
// al reactivarlo (docs/ui-flujo-pausado/README.md) vuelven a correr solas.
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', 'plugins', 'pignolo', 'skills', 'ui', 'SKILL.md');
const FLOW = fs.readFileSync(SKILL, 'utf8').includes('## 5. Building screens');
const SKIP = 'flujo de pantallas pausado (docs/ui-flujo-pausado/README.md)';

/** `flowTest(test)` devuelve un `test` que se salta cuando el flujo está pausado. */
const flowOnly = (test) => (name, fn) => test(name, FLOW ? {} : { skip: SKIP }, fn);

module.exports = { FLOW, SKIP, flowOnly };
