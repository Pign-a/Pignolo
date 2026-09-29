'use strict';
// Auxiliar de tests/handback-gate.test.js (carga perezosa): requiere solo el handler, lo
// llama con el payload de argv[2] y escribe el resultado y los módulos cargados.
const path = require('node:path');

const handler = require(path.join(__dirname, '..', '..', 'plugins', 'pignolo', 'hooks', 'handlers', 'handback-gate.js'));
const result = handler.run(JSON.parse(process.argv[2]), { env: process.env });
process.stdout.write(JSON.stringify({ result, cache: Object.keys(require.cache) }));
