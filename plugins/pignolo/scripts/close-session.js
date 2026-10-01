#!/usr/bin/env node
'use strict';
// Cierre de sesión (spec §10.4; R-11 del hito 6). Verbos deterministas; el juicio (qué proponer,
// qué citar, commitear) es de la skill close-session. Solo lo ejecuta el hilo principal (la
// guardia lo niega a los subagentes). JSON por stdout.
// Uso: node close-session.js <verbo> [--cwd <dir>] [--session <id>]
//   evidence --since <iso|sha>             commits, archivos, sellos y el run.json vigente
//   scan --id <id>                         piso mecánico sobre una propuesta
//   decide --id <id> --validation-file <md> [--reserved]
//   archive [--days 14] [--dry-run]        mueve lo cerrado y viejo a archive/ (nunca borra)
//   index                                  regenera INDEX.md
//   prune                                  poda y gc de la sombra (necesita la sesión)
// Exit 0 (éxito, aun con entradas rechazadas una a una en refused: []), 1 (el verbo entero se
// rechaza: { ok: false, refused: '<motivo>', reason }), 2 (uso). Todos los verbos se niegan con
// refused 'merge-in-progress' si hay un merge, cherry-pick o rebase en el checkout principal.
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');

const VERBS = {
  evidence: { value: ['since'], need: ['since'] },
  scan: { value: ['id'], need: ['id'] },
  decide: { value: ['id', 'validation-file'], bool: ['reserved'], need: ['id', 'validation-file'] },
  archive: { value: ['days'], bool: ['dry-run'], need: [] },
  index: { value: [], need: [] },
  prune: { value: [], need: [] },
};
const COMMON = ['cwd', 'session'];

function usage(msg) {
  process.stderr.write(`pignolo close-session: ${msg}\nuso: close-session.js <evidence|scan|decide|archive|index|prune> [--cwd <dir>] [--session <id>] [opciones]\n`);
  process.exit(2);
}

function parse(argv) {
  const verb = argv[0];
  if (!verb || !VERBS[verb]) return usage(`verbo desconocido: ${verb || '(ninguno)'}`);
  const spec = VERBS[verb];
  const opts = { verb };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) return usage(`argumento inesperado: ${a}`);
    const name = a.slice(2);
    if ((spec.bool || []).includes(name)) { opts[name] = true; continue; }
    if (spec.value.includes(name) || COMMON.includes(name)) {
      if (argv[i + 1] === undefined) return usage(`falta el valor de --${name}`);
      opts[name] = argv[i + 1];
      i += 1;
      continue;
    }
    return usage(`opción desconocida para ${verb}: ${a}`);
  }
  for (const n of spec.need) if (opts[n] === undefined) return usage(`${verb} necesita --${n}`);
  return opts;
}

const out = (obj, code) => { process.stdout.write(`${JSON.stringify(obj)}\n`); process.exit(code); };
const refuse = (refused, reason, extra = {}) => out({ ok: false, refused, reason, ...extra }, 1);

function evidence({ main, since, env }) {
  const { gitRun, isGitFailure } = require('../lib/git');
  const { readRun } = require('../lib/project');
  const { sealDir, repoIdFor } = require('../lib/seals');
  let commits = [];
  let files = [];
  const isSha = /^[0-9a-f]{7,40}$/i.test(since);
  const range = isSha ? [`${since}..HEAD`] : [`--since=${since}`, 'HEAD'];
  try {
    const log = gitRun(['log', '--format=%H%x09%s', ...range], main, { timeout: 10000 });
    commits = log.split(/\r?\n/).filter(Boolean).map((l) => { const [sha, ...s] = l.split('\t'); return { sha, subject: s.join('\t') }; });
    const names = isSha
      ? gitRun(['diff', '--name-only', `${since}..HEAD`], main, { timeout: 10000 })
      : gitRun(['log', '--name-only', '--format=', ...range], main, { timeout: 10000 });
    files = [...new Set(names.split(/\r?\n/).filter(Boolean))].sort();
  } catch (e) {
    if (!isGitFailure(e) && e.code !== 'ENOENT') throw e;
    return refuse('git-failed', `no se pudo leer la historia desde ${since}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
  let seals = [];
  try {
    const dir = sealDir(env, repoIdFor({ cwd: main }));
    seals = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch (_) { seals = []; }
  return { ok: true, since, commits, files, seals, run: readRun(main) };
}

function piiOf(main) {
  const { readProjectConfig } = require('../lib/project-config');
  return readProjectConfig({ root: main }).piiPatterns;
}

function scan({ main, id }) {
  const L = require('../lib/learnings');
  const p = L.readProposal({ main, id });
  if (!p.ok) return refuse(p.refused, p.reason);
  let piiPatterns;
  try { piiPatterns = piiOf(main); } catch (e) { return refuse('project-md', e.message); }
  const r = L.scanLearning({ text: p.text, piiPatterns });
  return { ok: true, id, findings: r.findings, clean: r.findings.length === 0 };
}

function decide({ main, id, validationFile, reserved }) {
  const L = require('../lib/learnings');
  const p = L.readProposal({ main, id });
  if (!p.ok) return refuse(p.refused, p.reason);
  let text;
  try { text = fs.readFileSync(path.resolve(validationFile), 'utf8'); } catch (e) { return refuse('validation-file', `no se pudo leer ${validationFile}: ${e.message}`); }
  let piiPatterns;
  try { piiPatterns = piiOf(main); } catch (e) { return refuse('project-md', e.message); }
  const validation = L.parseValidation(text, { ids: [id] });
  const scanned = L.scanLearning({ text: p.text, piiPatterns });
  const d = L.decideAcceptance({ entry: p.entry, validation, scan: scanned, reservedMatch: Boolean(reserved) });
  const applied = L.applyDecision({ main, id, decision: d.decision });
  if (!applied.ok) return refuse(applied.refused, applied.reason, { decision: d.decision, reason: d.reason });
  return { ok: true, id, decision: d.decision, reason: d.reason, promoteCandidate: d.promoteCandidate, moved: applied.moved, file: applied.file || null, how: applied.how || null, validation: validation.ok ? validation.status : `ilegible: ${validation.error}` };
}

function archive({ main, days, dryRun }) {
  const { archiveEntries } = require('../lib/archive');
  const n = days === undefined ? 14 : Number(days);
  if (!Number.isInteger(n) || n < 0) return usage(`--days debe ser un entero >= 0 (${days})`);
  return archiveEntries({ main, days: n, now: Date.now(), dryRun: Boolean(dryRun) });
}

function index({ main }) {
  const { writeIndex } = require('../lib/state-index');
  return writeIndex({ main });
}

function prune({ main, env, session }) {
  const sessionId = session || env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) return refuse('no-session', 'prune necesita --session <id> o CLAUDE_CODE_SESSION_ID en el entorno; sin la clave de la sesión no se poda nada');
  const { closeShadow } = require('../lib/git-backup');
  const r = closeShadow({ cwd: main, env, sessionId, now: new Date() });
  if (r === null) return refuse('not-a-repo', `${main} no es un repo git`);
  if (!r.ok) return refuse(r.refused, r.reason, { pruned: r.pruned, gc: r.gc });
  return r;
}

function main() {
  const opts = parse(process.argv.slice(2));
  const env = process.env;
  const root = mainRoot(opts.cwd ? path.resolve(opts.cwd) : process.cwd());
  const { gitOperationInProgress } = require('../lib/archive');
  const op = gitOperationInProgress(root);
  if (op) return refuse('merge-in-progress', `hay un ${op} en curso en el checkout principal (${root}); terminalo o abortalo antes de cerrar la sesión`, { operation: op });
  let r;
  switch (opts.verb) {
    case 'evidence': r = evidence({ main: root, since: opts.since, env }); break;
    case 'scan': r = scan({ main: root, id: opts.id }); break;
    case 'decide': r = decide({ main: root, id: opts.id, validationFile: opts['validation-file'], reserved: opts.reserved }); break;
    case 'archive': r = archive({ main: root, days: opts.days, dryRun: opts['dry-run'] }); break;
    case 'index': r = index({ main: root }); break;
    case 'prune': r = prune({ main: root, env, session: opts.session }); break;
    default: return usage(`verbo desconocido: ${opts.verb}`);
  }
  return out(r, r && r.ok === false ? 1 : 0);
}

main();
