'use strict';
// Limpieza de ramas y worktrees (spec §11.5, hito 7a). Solo el hilo principal aplica (regla pignolo-worktree-tools).
// Uso: node cleanup.js report [--days n] [--cwd <dir>]       (solo lectura: propone lo ya unido, informa el resto)
//      node cleanup.js apply --proposal <id> [--cwd <dir>]   (el humano aprobó la lista mostrada con un solo sí)
// Salida JSON por stdout. Exit 0 ok; 1 con `kind` (backup-failed, stale-proposal) y `Alternativa:` en stderr; 2 uso
// incorrecto (apply sin --proposal incluido); 3 no se pudo dejar el estado consistente (partial-remove).
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
require('../lib/panel-hook').panelRefreshOnExit();
const C = require('../lib/branch-cleanup');

const VERBS = {
  report: { value: ['days', 'cwd'] },
  apply: { value: ['proposal', 'cwd'] },
};

class Usage extends Error {}

function parse(verb, argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--') || !VERBS[verb].value.includes(a.slice(2))) throw new Usage(`opción desconocida para ${verb}: ${a}`);
    i += 1;
    if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = argv[i];
  }
  return o;
}

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

function main() {
  const argv = process.argv.slice(2);
  const verb = argv[0];
  if (!VERBS[verb]) throw new Usage('uso: cleanup.js report [--days n] | apply --proposal <id> [--cwd <dir>]');
  const o = parse(verb, argv.slice(1));
  const root = mainRoot(o.cwd ? path.resolve(o.cwd) : process.cwd());
  if (verb === 'report') {
    const days = o.days === undefined ? 7 : Number(o.days);
    if (!Number.isFinite(days) || days < 0) throw new Usage('--days debe ser un número >= 0');
    out({ ok: true, ...C.report({ main: root, days }) });
    return;
  }
  if (!o.proposal) throw new Usage('apply necesita --proposal <id> (el que dio `cleanup.js report`)');
  const r = C.apply({ main: root, proposalId: o.proposal });
  if (r.stale) {
    out({ ok: false, kind: 'stale-proposal', ...r });
    process.stderr.write('pignolo cleanup: stale-proposal: el estado cambió desde el reporte; no se tocó nada. Alternativa: corré cleanup.js report y volvé a aprobar la lista nueva\n');
    process.exitCode = 1;
    return;
  }
  out({ ok: true, ...r });
}

try {
  main();
} catch (e) {
  if (e instanceof Usage || e.kind === 'usage') {
    process.stderr.write(`pignolo cleanup: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e.kind) {
    const { kind, message, exit, ...rest } = e;
    out({ ok: false, kind, message, ...rest });
    process.stderr.write(`pignolo cleanup: ${kind}: ${message}${/Alternativa:/.test(message) ? '' : '. Alternativa: revisá el motivo y repetí'}\n`);
    process.exitCode = exit || 1;
  } else {
    process.stderr.write(`pignolo cleanup: ${e.message}\n`);
    process.exitCode = 1;
  }
}
