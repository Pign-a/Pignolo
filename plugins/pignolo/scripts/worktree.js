'use strict';
// Worktrees por tarea y tag de contrato (spec §11.2, hito 7a).
// Uso: node worktree.js create --plan P --nn 03 --slug cola [--from <ref>] [--no-deps]
//      node worktree.js list
//      node worktree.js tag-contract --plan P --n 1 [--ref <ref>]      (todos aceptan --cwd <dir>)
// Salida JSON por stdout. Exit 0 ok; 1 con `kind` estructurado (exists, not-ancestor, deps-failed, partial,
// contract-order, no-cp, no-ref) y `Alternativa:` en stderr; 2 uso incorrecto.
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const W = require('../lib/worktrees');

const VERBS = {
  create: { value: ['plan', 'nn', 'slug', 'from', 'cwd'], bool: ['no-deps'] },
  list: { value: ['cwd'], bool: [] },
  'tag-contract': { value: ['plan', 'n', 'ref', 'cwd'], bool: [] },
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

function main() {
  const argv = process.argv.slice(2);
  const verb = argv[0];
  if (!VERBS[verb]) throw new Usage('uso: worktree.js create|list|tag-contract [opciones]');
  const o = parse(verb, argv.slice(1));
  const root = mainRoot(o.cwd ? path.resolve(o.cwd) : process.cwd());
  if (verb === 'list') { out({ ok: true, worktrees: W.listTaskWorktrees({ main: root }) }); return; }
  if (verb === 'create') {
    for (const k of ['plan', 'nn', 'slug']) if (!o[k]) throw new Usage(`create necesita --${k}`);
    const r = W.createTaskWorktree({ main: root, plan: o.plan, nn: o.nn, slug: o.slug, from: o.from, depsInstall: !o['no-deps'] });
    out({ ok: true, mechanism: W.MECHANISM, ...r });
    return;
  }
  if (!o.plan || o.n === undefined) throw new Usage('tag-contract necesita --plan y --n');
  const n = Number(o.n);
  if (!Number.isInteger(n) || n < 1) throw new Usage('--n debe ser un entero mayor que 0');
  out({ ok: true, ...W.tagContract({ main: root, plan: o.plan, n, ref: o.ref }) });
}

try {
  main();
} catch (e) {
  if (e instanceof Usage || /^nombre inválido/.test(e.message)) {
    process.stderr.write(`pignolo worktree: ${e.message}\n`);
    process.exitCode = 2;
  } else if (e.kind) {
    const { kind, worktree, branch, base, partial } = e;
    out({ ok: false, kind, worktree, branch, base, partial: partial === true, message: e.message });
    process.stderr.write(`pignolo worktree: ${e.message}${/Alternativa:/.test(e.message) ? '' : '. Alternativa: revisá `git worktree list` y decidí a mano; el script no borra nada'}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`pignolo worktree: ${e.message}\n`);
    process.exitCode = 1;
  }
}
