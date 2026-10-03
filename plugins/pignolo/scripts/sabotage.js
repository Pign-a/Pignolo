'use strict';
// CLI del sabotaje (spec §4, §11.6): rojo demostrado sobre código commiteado.
// Uso: node sabotage.js --patch <archivo> [--gate on-edit|on-done] [--cwd <dir>] [--timeout-min <n>]
//      node sabotage.js --recover [--cwd <dir>]
// Plazo por defecto: 8 min (debajo de los 10 de la herramienta Bash).
// Exit: 0 rojo demostrado y restaurado; 1 el test siguió verde; 2 uso inválido o negativa
// (con --recover: hay un sabotaje en curso); 3 no se pudo restaurar (con --recover: los
// archivos cambiaron después del corte y no se tocó nada).
const path = require('node:path');
require('../lib/panel-hook').panelRefreshOnExit();
const { sabotage, recover, DEFAULT_TIMEOUT_MS } = require('../lib/sabotage');

function usage(msg) {
  process.stderr.write(`pignolo sabotage: ${msg}\n`);
  process.exit(2);
}

function parse(argv) {
  const o = { recover: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage(`falta el valor de ${a}`); i += 1; return argv[i]; };
    if (a === '--patch') o.patch = val();
    else if (a === '--gate') o.gate = val();
    else if (a === '--cwd') o.cwd = val();
    else if (a === '--timeout-min') o.timeoutMin = Number(val());
    else if (a === '--recover') o.recover = true;
    else usage(`argumento desconocido: ${a}`);
  }
  if (o.recover && (o.patch || o.gate || o.timeoutMin !== undefined)) usage('--recover solo acepta --cwd');
  if (!o.recover && !o.patch) usage('falta --patch <archivo> (o --recover)');
  if (o.gate !== undefined && !['on-edit', 'on-done'].includes(o.gate)) usage('--gate debe ser on-edit | on-done');
  if (o.timeoutMin !== undefined && !(o.timeoutMin > 0)) usage('--timeout-min debe ser un número positivo');
  return o;
}

const restoreHint = (files) => `Corré: git restore --source=HEAD -- ${files.join(' ')}`;

async function main() {
  const o = parse(process.argv.slice(2));
  const cwd = path.resolve(o.cwd || process.cwd());
  if (o.recover) {
    const r = recover({ cwd });
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    for (const x of r.recovered) process.stderr.write(`pignolo sabotage: restauré ${x.files.length} archivos en ${x.worktree}.\n`);
    for (const b of r.busy) process.stderr.write(`pignolo sabotage: hay un sabotaje en curso en ${b.worktree} (pid ${b.pid}, candado ${b.gitdir}); no se tocó nada. Alternativa: esperá a que termine; si no hay ninguno corriendo, el candado queda viejo en 30 s sin latido y --recover lo restaura.\n`);
    return r.busy.length ? 2 : 0;
  }
  const r = await sabotage({
    cwd, patchFile: path.resolve(process.cwd(), o.patch), level: o.gate, env: process.env,
    timeoutMs: o.timeoutMin ? o.timeoutMin * 60000 : DEFAULT_TIMEOUT_MS,
  });
  process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  if (r.notRestored.length) {
    process.stderr.write(`pignolo sabotage: ⚠ NO SE PUDO RESTAURAR ${r.notRestored.join(', ')}: siguen con el parche aplicado. ${restoreHint(r.notRestored)}\n`);
    return 3;
  }
  if (r.newFiles.length) process.stderr.write(`pignolo sabotage: el comando dejó otros cambios en el árbol: ${r.newFiles.join(', ')}.\n`);
  if (r.red) {
    // Evidencia roja para el panel (una línea; no cambia nada del resultado).
    const hook = require('../lib/panel-hook');
    const line = String(r.logTail || '').split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
    hook.panelEvidence(cwd, hook.cardOfWorktree(cwd), { red: line ? `falla: ${line}` : 'falla (rojo demostrado)' });
    return 0;
  }
  if (r.logTail) process.stderr.write(`${r.logTail}\n`);
  process.stderr.write(`pignolo sabotage: el comando siguió verde con el parche${r.timedOut ? ' (no terminó en el plazo, eso no es rojo)' : ''}: el test no protege lo que dice. Alternativa: revisá el test o el parche.\n`);
  return 1;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  const exit = typeof e.exit === 'number' ? e.exit : 2;
  const out = { error: e.message };
  for (const k of ['refused', 'greenBefore', 'commandExit', 'notRestored', 'newFiles', 'logTail']) if (e[k] !== undefined) out[k] = e[k];
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (e.logTail) process.stderr.write(`${e.logTail}\n`);
  const strong = exit === 3 ? '⚠ NO SE PUDO RESTAURAR: ' : '';
  process.stderr.write(`pignolo sabotage: ${strong}${e.message}\n`);
  process.exitCode = exit;
});
