#!/usr/bin/env node
'use strict';
// Registro del plan (R-5), solo lo ejecuta el hilo principal. JSON por stdout.
// Exit 0; 1 con el motivo en stderr; 2 por uso incorrecto.
// Uso: node plan.js <verbo> --plan <slug> [opciones] [--cwd <dir>]
//   new --request-file <f> [--spec <ruta>]
//   claims set --file <claims.json> | --none-reason <texto>
//   claims resolve --id <K> --status <estado> [--source <s>] [--by <quién>] [--note <t>] [--superseded]
//   claims check                       (exit 1 si queda alguna sin cerrar)
//   scope-card save --file <md> | approve --quote-file <f> | status
//   tasks set --file <tasks.json>
//   runnable [--profile <p>]           (tareas ejecutables antes de la aprobación, D-5-3)
//   advance --to <etapa> [--reopen] [--plan-file <ruta>]
///   status
//   list [--text] [--cwd <dir>]        (todos los planes con su etapa; solo lectura; no pide --plan)
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const ps = require('../lib/plan-state');
const { PROFILE_PARAMS } = require('../lib/roles');
const { readConfig } = require('../lib/profiles');
const { planList } = require('../lib/next');

class Usage extends Error {}
class Fail extends Error {}

const VERBS = {
  new: { value: ['plan', 'request-file', 'spec', 'cwd'], need: ['plan', 'request-file'] },
  'claims set': { value: ['plan', 'file', 'none-reason', 'cwd'], need: ['plan'] },
  'claims resolve': { value: ['plan', 'id', 'status', 'source', 'by', 'note', 'cwd'], bool: ['superseded'], need: ['plan', 'id', 'status'] },
  'claims check': { value: ['plan', 'cwd'], need: ['plan'] },
  'scope-card save': { value: ['plan', 'file', 'cwd'], need: ['plan', 'file'] },
  'scope-card approve': { value: ['plan', 'quote-file', 'cwd'], need: ['plan', 'quote-file'] },
  'scope-card status': { value: ['plan', 'cwd'], need: ['plan'] },
  'tasks set': { value: ['plan', 'file', 'cwd'], need: ['plan', 'file'] },
  runnable: { value: ['plan', 'profile', 'cwd'], need: ['plan'] },
  advance: { value: ['plan', 'to', 'plan-file', 'cwd'], bool: ['reopen'], need: ['plan', 'to'] },
  status: { value: ['plan', 'cwd'], need: ['plan'] },
  list: { value: ['cwd'], bool: ['text'], need: [] }, // el único verbo sin --plan (A7M-19)
};
const GROUPED = new Set(['claims', 'scope-card', 'tasks']);

function parse(argv) {
  let verb = argv[0];
  let rest = argv.slice(1);
  if (GROUPED.has(verb)) {
    verb = `${verb} ${rest[0] || ''}`.trim();
    rest = rest.slice(1);
  }
  const spec = VERBS[verb];
  if (!spec) throw new Usage('uso: plan.js new|claims set|claims resolve|claims check|scope-card save|approve|status|tasks set|runnable|advance|status|list --plan <slug> [opciones] (list no pide --plan)');
  const o = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Usage(`argumento inesperado: ${a}`);
    const name = a.slice(2);
    if ((spec.bool || []).includes(name)) o[name] = true;
    else if (spec.value.includes(name)) {
      i += 1;
      if (rest[i] === undefined) throw new Usage(`--${name} necesita un valor`);
      o[name] = rest[i];
    } else throw new Usage(`opción desconocida para ${verb}: ${a}`);
  }
  const missing = spec.need.filter((k) => !o[k]);
  if (missing.length) throw new Usage(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
  if (o.plan !== undefined && !ps.SLUG_RE.test(o.plan)) throw new Usage(`--plan debe cumplir ${ps.SLUG_RE}`);
  return { verb, o };
}

const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);
const readText = (f, what) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { throw new Usage(`no se pudo leer ${what} (${f}): ${e.message}`); } };
const readJson = (f, what) => { try { return JSON.parse(readText(f, what)); } catch (e) { if (e instanceof Usage) throw e; throw new Fail(`${what} no es JSON: ${e.message}`); } };
const must = (r) => { if (!r.ok) throw new Fail(r.error); return r; };

function run(verb, o, main) {
  const base = { main, plan: o.plan };
  switch (verb) {
    case 'list': {
      const plans = planList(main);
      if (o.text) {
        for (const p of plans) process.stdout.write(`${p.unreadable ? `${p.plan} · ilegible` : `${p.plan} · ${p.stage} · tarjeta ${p.card}`}\n`);
        return undefined;
      }
      return out({ plans });
    }
    case 'new': {
      const r = must(ps.newPlan({ ...base, request: readText(o['request-file'], '--request-file').trim(), spec: o.spec || '' }));
      return out({ ok: true, plan: r.plan.plan, stage: r.plan.stage });
    }
    case 'claims set': {
      if (!o.file && o['none-reason'] === undefined) throw new Usage('falta --file o --none-reason');
      const claims = o.file ? readJson(o.file, '--file') : [];
      must(ps.setClaims({ ...base, claims, noneReason: o['none-reason'] }));
      return out({ ok: true, claims: claims.length });
    }
    case 'claims resolve':
      must(ps.resolveClaim({ ...base, id: o.id, status: o.status, source: o.source, by: o.by, note: o.note, superseded: o.superseded }));
      return out({ ok: true, id: o.id, status: o.status });
    case 'claims check': {
      const p = must(ps.readPlan(base)).plan;
      const open = ps.claimsOpen(p);
      out({ ok: open.length === 0, open });
      if (open.length) process.exitCode = 1;
      return undefined;
    }
    case 'scope-card save': {
      const r = ps.saveScopeCard({ ...base, text: readText(o.file, '--file') });
      if (!r.ok) { out({ ok: false, errors: r.errors || [r.error] }); throw new Fail(r.error); }
      return out({ ok: true, state: ps.scopeCardState(base) });
    }
    case 'scope-card approve':
      must(ps.approveScopeCard({ ...base, quote: readText(o['quote-file'], '--quote-file').trim() }));
      return out({ ok: true, state: ps.scopeCardState(base) });
    case 'scope-card status':
      must(ps.readPlan(base));
      return out({ state: ps.scopeCardState(base) });
    case 'tasks set': {
      const tasks = readJson(o.file, '--file');
      must(ps.setTasks({ ...base, tasks }));
      return out({ ok: true, tasks: tasks.length });
    }
    case 'runnable': {
      const p = must(ps.readPlan(base)).plan;
      const profile = o.profile || readConfig().profile;
      if (!PROFILE_PARAMS[profile]) throw new Usage(`perfil desconocido: ${profile}`);
      const limit = PROFILE_PARAMS[profile].preApprovalTasks;
      const approved = ps.scopeCardState(base) === 'approved';
      const tasks = approved ? p.tasks : ps.runnableBeforeApproval(p, { limit });
      return out({ profile, limit, approved, tasks });
    }
    case 'advance': {
      const r = must(ps.advance({ ...base, to: o.to, reopen: o.reopen, planFile: o['plan-file'] ? path.resolve(o['plan-file']) : undefined }));
      return out({ ok: true, stage: r.plan.stage });
    }
    default: { // status
      const p = must(ps.readPlan(base)).plan;
      return out({
        plan: p.plan, stage: p.stage, spec: p.spec, claimsOpen: ps.claimsOpen(p), scopeCard: ps.scopeCardState(base),
        tasks: p.tasks, audit: p.audit ? { verdict: p.audit.verdict, incomplete: Boolean(p.audit.incomplete) } : null,
      });
    }
  }
}

try {
  const { verb, o } = parse(process.argv.slice(2));
  run(verb, o, mainRoot(o.cwd || process.cwd()));
} catch (e) {
  process.stderr.write(`pignolo plan: ${e.message}\n`);
  process.exitCode = e instanceof Usage ? 2 : 1;
}
