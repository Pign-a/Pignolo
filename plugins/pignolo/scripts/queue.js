'use strict';
// Cola de integración (spec §11.3, hito 7a). Solo el hilo principal y el `integrator` la operan (regla pignolo-queue).
// Uso: node queue.js sync|preview|merge --plan P --task <rama|nn> [--resolve-trivial] [--cwd <dir>]
//      node queue.js run --plan P --task <rama|nn> [--resolve-trivial]     (la entrada completa: merge, pre-merge sellado, avance, tag cp/)
//      node queue.js revert --plan P --commit <sha>                         (regresión tardía en int/: revert primero, mismo pipeline)
//      node queue.js status --plan P                                        (solo lectura: lock, queue/ contra int/, últimos cp/)
// Salida JSON por stdout. Exit 0 ok; 1 con `kind` estructurado y `Alternativa:` en stderr; 2 uso incorrecto o cola
// ocupada (`busy`); 3 no se pudo dejar el estado consistente (`cp-missing`).
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
require('../lib/panel-hook').panelRefreshOnExit();
const { panelDo } = require('../lib/panel-hook');
const Q = require('../lib/queue');
const B = require('../lib/branches');

const VERBS = {
  sync: { value: ['plan', 'cwd'], bool: [] },
  preview: { value: ['plan', 'task', 'cwd'], bool: [] },
  merge: { value: ['plan', 'task', 'cwd'], bool: ['resolve-trivial'] },
  run: { value: ['plan', 'task', 'cwd'], bool: ['resolve-trivial'] },
  revert: { value: ['plan', 'commit', 'cwd'], bool: [] },
  status: { value: ['plan', 'cwd'], bool: [] },
};

class Usage extends Error {}

function parse(verb, argv) {
  const spec = VERBS[verb];
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Usage(`argumento inesperado: ${a}`);
    const name = a.slice(2);
    if (spec.bool.includes(name)) o[name] = true;
    else if (spec.value.includes(name)) {
      i += 1;
      if (argv[i] === undefined) throw new Usage(`--${name} necesita un valor`);
      o[name] = argv[i];
    } else throw new Usage(`opción desconocida para ${verb}: ${a}`);
  }
  return o;
}

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

const ALTERNATIVE = {
  'already-merged': 'si la rama se revirtió en int/, reintegrala revirtiendo el revert; si no, no hay nada que integrar',
  conflict: 'devolvé la tarea a su rama: rebase en su worktree y registrá la falla del plan',
  'queue-dirty': 'revisá la worktree de la cola a mano y repetí',
  'queue-path-occupied': 'revisá esa ruta a mano y repetí',
  'preview-failed': 'revisá que ambas ramas existan; la previsión es opcional, el merge real corre igual',
  'commit-failed': 'revisá el hook del proyecto que rechazó el commit y repetí',
  'merge-failed': 'revisá la salida de git y repetí',
  'gate-failed': 'la tarea vuelve a su rama: es una falla del plan',
  flaky: 'la tarea vuelve a su rama: corregí el test inestable',
  'int-moved': 'repetí la entrada una vez; si vuelve a pasar, pedí contexto al hilo principal',
  'state-change': 'el estado de .pignolo/state/ entra solo por commits del hilo principal; sacalo de la tarea',
  'config-change': 'la configuración de la compuerta la decide el autor; sacá project.md de la tarea',
  'not-ancestor': 'rebaseá la tarea sobre el contrato en su worktree',
};

// Una rama de tarea que la cola no pudo integrar y queda esperando al autor (conflicto de lógica, compuerta roja o inestable): el
// panel la marca "espera" (⚑); cuando la cola la integra, la marca se va. Protegido: el registro nunca cambia el resultado.
const WAITING_KINDS = ['conflict', 'gate-failed', 'flaky'];
let current = null; // { root, plan, task } de la llamada en curso
function markWaiting(waiting) {
  if (!current || !current.task) return;
  panelDo(current.root, (panel, main) => {
    const branch = Q.resolveTask({ main, plan: current.plan, task: current.task });
    panel.setWaiting(main, { branch, waiting });
  });
}

function fail(kind, message, extra, exit = 1) {
  if (WAITING_KINDS.includes(kind)) markWaiting(true);
  out({ ok: false, kind, message, ...extra });
  const alt = ALTERNATIVE[kind] || 'revisá el motivo y repetí';
  process.stderr.write(`pignolo queue: ${kind}: ${message}${/Alternativa:/.test(message) ? '' : `. Alternativa: ${alt}`}\n`);
  process.exitCode = exit;
}

function main() {
  const argv = process.argv.slice(2);
  const verb = argv[0];
  if (!VERBS[verb]) throw new Usage('uso: queue.js sync|preview|merge|run|revert|status --plan P [--task <rama|nn>] [--commit <sha>] [--resolve-trivial] [--cwd <dir>]');
  const o = parse(verb, argv.slice(1));
  if (!o.plan) throw new Usage(`${verb} necesita --plan`);
  B.intBranch(o.plan); // valida el nombre
  const root = mainRoot(o.cwd ? path.resolve(o.cwd) : process.cwd());
  // sync y merge reescriben la worktree de la cola: toman el mismo lock que `run` (R-8, un solo escritor; M4). `run` y `revert` lo
  // toman por dentro.
  const locked = (fn) => {
    const lock = Q.acquireQueueLock({ main: root, plan: o.plan });
    try { return fn(); } finally { lock.release(); }
  };
  if (verb === 'sync') { out({ ok: true, ...locked(() => Q.syncQueue({ main: root, plan: o.plan })) }); return; }
  if (verb === 'status') { out({ ok: true, ...Q.queueStatus({ main: root, plan: o.plan }) }); return; }
  if (verb === 'revert') {
    if (!o.commit) throw new Usage('revert necesita --commit');
    out(Q.revertOnInt({ main: root, plan: o.plan, commit: o.commit }));
    return;
  }
  if (!o.task) throw new Usage(`${verb} necesita --task`);
  current = { root, plan: o.plan, task: o.task };
  if (verb === 'run') {
    const r = Q.integrate({ main: root, plan: o.plan, task: o.task, resolveTrivial: o['resolve-trivial'] === true });
    if (r && r.status === 'integrated') markWaiting(false);
    out(r);
    return;
  }
  const task = Q.resolveTask({ main: root, plan: o.plan, task: o.task });
  const pre = Q.precheck({ main: root, plan: o.plan, task });
  if (!pre.ok) { fail(pre.kind, `la tarea no pasa el precheck (${pre.kind}): ${(pre.files || []).join(', ')}`, { files: pre.files }); return; }
  if (verb === 'preview') { out({ ok: true, task, ...Q.previewMerge({ main: root, plan: o.plan, task }) }); return; }
  // merge no sincroniza: opera sobre lo que dejó `sync`. Ojo: `run` vuelve a sincronizar la cola desde int/ y descarta lo que `merge`
  // dejó sin integrar (el merge suelto sirve para ver el conflicto y su resolución trivial, no para acumular).
  const r = locked(() => Q.mergeIntoQueue({ main: root, plan: o.plan, task, resolveTrivial: o['resolve-trivial'] === true }));
  if (r.status === 'conflict') { fail('conflict', `conflicto en ${[...r.logic, ...r.trivial].map((x) => x.path).join(', ')}`, { trivial: r.trivial, logic: r.logic }); return; }
  if (r.status === 'already-merged') { fail('already-merged', `${task} ya está unida a ${B.queueBranch(o.plan)}`, {}); return; }
  out({ ok: true, task, ...r });
}

try {
  main();
} catch (e) {
  if (e instanceof Usage || /^nombre inválido/.test(e.message)) {
    process.stderr.write(`pignolo queue: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e.kind) {
    const { kind, message, exit, ...rest } = e;
    const extra = {};
    for (const k of ['files', 'trivial', 'logic', 'worktree', 'status', 'sealFile', 'repeat', 'logTail', 'sha', 'sealSha', 'tip', 'lock', 'indexLock']) if (rest[k] !== undefined) extra[k] = rest[k];
    fail(kind, message, extra, exit || 1);
  } else {
    process.stderr.write(`pignolo queue: ${e.message}\n`);
    process.exitCode = 1;
  }
}
