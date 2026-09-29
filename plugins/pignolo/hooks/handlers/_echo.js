'use strict';
// Handler de prueba del launcher. No se registra en hooks.json.
exports.run = (input) => ({ exit: 0, stdout: JSON.stringify(input) });
