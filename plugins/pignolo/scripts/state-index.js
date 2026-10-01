#!/usr/bin/env node
'use strict';
// Genera <main>/.pignolo/state/INDEX.md (spec §10.1). Solo lo ejecuta el hilo principal.
// Uso: node state-index.js [--cwd <dir>] [--check]
//   sin --check: escribe y devuelve { ok, file, changed, errors }
//   con --check: no escribe; exit 1 con { ok: false, refused: 'stale-index', reason } si difiere.
// Exit 2 solo por uso incorrecto.
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const { writeIndex, checkIndex } = require('../lib/state-index');

const argv = process.argv.slice(2);
let cwd = process.cwd();
let check = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--cwd' && argv[i + 1] !== undefined) { cwd = path.resolve(argv[i + 1]); i += 1; } else if (argv[i] === '--check') check = true;
  else {
    process.stderr.write(`pignolo state-index: argumento desconocido: ${argv[i]}\nuso: state-index.js [--cwd <dir>] [--check]\n`);
    process.exit(2);
  }
}

const main = mainRoot(cwd);
const r = check ? checkIndex({ main }) : writeIndex({ main });
process.stdout.write(`${JSON.stringify(r)}\n`);
process.exit(r.ok ? 0 : 1);
