#!/usr/bin/env node
'use strict';
// Cierre de sesión (spec §10.4; R-11 del hito 6). Verbos deterministas; el juicio (qué proponer,
// qué citar, commitear) es de la skill close-session. Solo lo ejecuta el hilo principal (la
// guardia lo niega a los subagentes). JSON por stdout.
// Uso: node close-session.js <verbo> [--cwd <dir>] [--session <id>]
//   evidence --since <iso|sha|ref>         commits, archivos, sellos y el run.json vigente
//   scan --id <id>                         piso mecánico, duplicados y evidencia de una propuesta
//   decide --id <id> [--answer yes|no] [--reserved]   sin --answer nunca acepta (devuelve human)
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
  decide: { value: ['id', 'answer'], bool: ['reserved'], need: ['id'] },
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
  if (verb === 'decide' && opts.answer !== undefined && !['yes', 'no'].includes(opts.answer)) return usage(`--answer debe ser yes o no (${opts.answer})`);
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
  // --since: una fecha ISO (YYYY-MM-DD[Thh:mm...]) o algo que git resuelve a un commit (sha, HEAD~2, rama).
  // Cualquier otra cosa se rechaza: pasársela a --since= devolvía vacío o todo sin avisar.
  const isIso = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(since) && !Number.isNaN(Date.parse(since));
  let from = null;
  if (!isIso) {
    try {
      if (since.startsWith('-')) throw new Error('empieza con -');
      from = gitRun(['rev-parse', '--verify', '--quiet', `${since}^{commit}`], main, { timeout: 5000 }).trim();
      if (!from) throw new Error('no resuelve');
    } catch (_) {
      return refuse('bad-since', `--since "${since}" no es una fecha ISO ni algo que git resuelva a un commit (sha, HEAD~2, rama)`);
    }
  }
  const range = isIso ? [`--since=${since}`, 'HEAD'] : [`${from}..HEAD`];
  try {
    const log = gitRun(['log', '--format=%H%x09%s', ...range], main, { timeout: 10000 });
    commits = log.split(/\r?\n/).filter(Boolean).map((l) => { const [sha, ...s] = l.split('\t'); return { sha, subject: s.join('\t') }; });
    const names = gitRun(['log', '--name-only', '--format=', ...range], main, { timeout: 10000 });
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

// Piso mecánico, duplicado y evidencia de una propuesta (R-9).
function inspect({ main, id }) {
  const L = require('../lib/learnings');
  const { gitRun } = require('../lib/git');
  const p = L.readProposal({ main, id });
  if (!p.ok) return { refusal: p };
  let piiPatterns;
  try { piiPatterns = piiOf(main); } catch (e) { return { refusal: { refused: 'project-md', reason: e.message } }; }
  const scanned = L.scanLearning({ text: p.text, piiPatterns });
  const duplicate = L.findDuplicate({ body: p.text, existing: L.existingFor({ main, id }) });
  const evidence = L.checkEvidence({ main, evidence: p.entry.fields.evidence, run: (args) => gitRun(args, main, { timeout: 5000 }) });
  return { p, scanned, duplicate, evidence };
}

function scan({ main, id }) {
  const x = inspect({ main, id });
  if (x.refusal) return refuse(x.refusal.refused, x.refusal.reason);
  return { ok: true, id, findings: x.scanned.findings, clean: x.scanned.findings.length === 0, duplicate: x.duplicate, evidence: x.evidence };
}

function decide({ main, id, answer, reserved }) {
  const L = require('../lib/learnings');
  const x = inspect({ main, id });
  if (x.refusal) return refuse(x.refusal.refused, x.refusal.reason);
  const d = L.decideAcceptance({ entry: x.p.entry, scan: x.scanned, duplicate: x.duplicate, evidence: x.evidence, reservedMatch: Boolean(reserved), answer });
  const applied = L.applyDecision({ main, id, decision: d.decision });
  if (!applied.ok) return refuse(applied.refused, applied.reason, { decision: d.decision, reason: d.reason });
  return { ok: true, id, decision: d.decision, reason: d.reason, promoteCandidate: d.promoteCandidate, flags: d.flags, moved: applied.moved, file: applied.file || null, how: applied.how || null };
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
  if (op === 'git-failed') return refuse('git-failed', `git no responde en ${root}: no se puede saber si hay un merge en curso; arreglá git (safe.directory, repo) y repetí`);
  if (!fs.existsSync(path.join(root, '.pignolo', 'project.md')) && !fs.existsSync(path.join(root, '.pignolo', 'state')) && ['archive', 'index'].includes(opts.verb)) {
    return refuse('not-configured', `${root} no tiene .pignolo/project.md ni .pignolo/state/: pignolo no está configurado acá (/pignolo:init)`);
  }
  if (op) return refuse('merge-in-progress', `hay un ${op} en curso en el checkout principal (${root}); terminalo o abortalo antes de cerrar la sesión`, { operation: op });
  let r;
  switch (opts.verb) {
    case 'evidence': r = evidence({ main: root, since: opts.since, env }); break;
    case 'scan': r = scan({ main: root, id: opts.id }); break;
    case 'decide': r = decide({ main: root, id: opts.id, answer: opts.answer, reserved: opts.reserved }); break;
    case 'archive': r = archive({ main: root, days: opts.days, dryRun: opts['dry-run'] }); break;
    case 'index': r = index({ main: root }); break;
    case 'prune': r = prune({ main: root, env, session: opts.session }); break;
    default: return usage(`verbo desconocido: ${opts.verb}`);
  }
  return out(r, r && r.ok === false ? 1 : 0);
}

main();
