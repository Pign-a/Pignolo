#!/usr/bin/env node
'use strict';
// node scripts/plan-check.js --plan <archivo> [--root <dir>] [--run-tests]
// Salida JSON. Exit 0 sin problemas, 1 con problemas, 2 uso.
const fs = require('node:fs');
const path = require('node:path');
const { checkPlan, problemCount } = require('../lib/plan-check');

function usage(msg) {
  process.stderr.write(`${msg}\nuso: plan-check.js --plan <archivo> [--root <dir>] [--run-tests]\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let plan = null;
let root = process.cwd();
let runTests = false;
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--plan') plan = argv[++i];
  else if (argv[i] === '--root') root = argv[++i];
  else if (argv[i] === '--run-tests') runTests = true;
  else usage(`argumento desconocido: ${argv[i]}`);
}
if (!plan) usage('falta --plan');
let planText;
try { planText = fs.readFileSync(plan, 'utf8'); } catch (e) { usage(`no se pudo leer el plan: ${e.message}`); }
if (!root || !fs.existsSync(root)) usage(`la raíz no existe: ${root}`);

const res = checkPlan({ planText, root: path.resolve(root), runTests });
const problems = problemCount(res);
process.stdout.write(`${JSON.stringify({ ...res, problems }, null, 2)}\n`);
process.exit(problems ? 1 : 0);
