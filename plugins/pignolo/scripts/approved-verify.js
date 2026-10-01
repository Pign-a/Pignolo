#!/usr/bin/env node
'use strict';
// Verificación de un aprobado visual (de lectura; la puede correr cualquiera).
//   node approved-verify.js --path design/approved/<flujo> [--project <raíz>] [--sha <manifest sha>]
// Sin --sha, el esperado sale de .pignolo/state/decisions/* o de `## Decisions` de DESIGN.md
// (el último gana). Exit 0 ok, 1 BLOCKED con los problemas, 2 uso.
const path = require('node:path');
const { verifyApproved, registeredSha, APPROVED_PATH } = require('../lib/approved');

function usage(msg) {
  process.stderr.write(`${msg}\nuso: approved-verify.js --path design/approved/<flujo> [--project <raíz>] [--sha <sha256>]\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const o = {};
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (!['--path', '--project', '--sha'].includes(a)) usage(`argumento desconocido: ${a}`);
  if (argv[i + 1] === undefined) usage(`${a} necesita un valor`);
  o[a.slice(2)] = argv[i + 1];
  i += 1;
}
if (!o.path) usage('falta --path');
if (!APPROVED_PATH.test(o.path)) usage(`--path debe cumplir ${APPROVED_PATH}`);
if (o.sha !== undefined && !/^[0-9a-f]{64}$/.test(o.sha)) usage('--sha debe ser un sha256 en hexadecimal');

const projectRoot = path.resolve(o.project || process.cwd());
const expected = o.sha || registeredSha(projectRoot, o.path);
if (!expected) {
  process.stdout.write(`${JSON.stringify({ status: 'BLOCKED', problems: [{ problem: 'no-entry' }] })}\n`);
  process.exit(1);
}
const r = verifyApproved({ projectRoot, approvedPath: o.path, expectedManifestSha: expected });
process.stdout.write(`${JSON.stringify({ status: r.ok ? 'ok' : 'BLOCKED', problems: r.problems })}\n`);
process.exit(r.ok ? 0 : 1);
