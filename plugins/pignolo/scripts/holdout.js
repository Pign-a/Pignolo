'use strict';
// CLI del holdout (spec §8.2), fuera de todo hook. Lo ejecutan solo el hilo principal
// y el validator (regla pignolo-holdout de la guardia).
// Uso: node holdout.js save --plan <p> --from <dir>
//      node holdout.js list --plan <p>
//      node holdout.js run --plan <p> [--ref <commit>] [--gate on-done]
//      node holdout.js drop --plan <p>
// Exit: 0 bien (run: el holdout pasa), 1 run falla, 2 uso o error.
const { saveHoldout, countHoldout, runHoldout, dropHoldout } = require('../lib/holdout');

const COMMANDS = ['save', 'list', 'run', 'drop'];

function usage(msg) {
  process.stderr.write(`pignolo holdout: ${msg}\n`);
  process.exit(2);
}

function parse(argv) {
  const o = { cmd: argv[0] };
  if (!COMMANDS.includes(o.cmd)) usage(`subcomando desconocido: ${o.cmd} (${COMMANDS.join(' | ')})`);
  const allowed = { save: ['--plan', '--from'], list: ['--plan'], run: ['--plan', '--ref', '--gate'], drop: ['--plan'] }[o.cmd];
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!allowed.includes(a)) usage(`argumento desconocido para ${o.cmd}: ${a}`);
    if (i + 1 >= argv.length) usage(`falta el valor de ${a}`);
    i += 1;
    o[a.slice(2)] = argv[i];
  }
  if (!o.plan) usage('falta --plan');
  if (o.cmd === 'save' && !o.from) usage('falta --from');
  return o;
}

function main() {
  const o = parse(process.argv.slice(2));
  const base = { cwd: process.cwd(), env: process.env, plan: o.plan };
  let out;
  if (o.cmd === 'save') out = saveHoldout({ ...base, from: o.from });
  else if (o.cmd === 'list') out = countHoldout(base);
  else if (o.cmd === 'drop') out = dropHoldout(base);
  else {
    out = runHoldout({ ...base, ref: o.ref, gate: o.gate });
    if (out.depsFailed) process.stderr.write('pignolo holdout: no se pudieron instalar las dependencias (deps-install de .pignolo/project.md).\n');
    else if (!out.pass) process.stderr.write(`pignolo holdout: el holdout de ${o.plan} falló (exit ${out.exit}).\n`);
    process.exitCode = out.pass ? 0 : 1;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`pignolo holdout: ${e.message}\n`);
  process.exitCode = 2; // uso o error propio: nunca es un veredicto del holdout
}
