'use strict';
// Estado de la auditoría del plan (R-1, R-2): el archivo de modo que deciden los hooks, la
// lectura de los informes del plan-auditor y el armado del veredicto. Pura salvo mode.json
// y bash-calls.log bajo <main>/.pignolo/tmp/plan-audit/<plan>/ (autoignorado).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { toFindings } = require('./plan-check');

const MAX_CLAIMS = 8;
const MAX_BLOCKS = 2;
const TTL_MIN = 30;
const VERDICTS = ['holds', 'false', 'inconclusive'];

function auditDir(main, plan) { return path.join(main, '.pignolo', 'tmp', 'plan-audit', plan); }
const modeFile = (main, plan) => path.join(auditDir(main, plan), 'mode.json');
const isStr = (v) => typeof v === 'string' && v.trim() !== '';

function toMs(now) {
  if (now === undefined || now === null) return Date.now();
  if (typeof now === 'number') return now;
  const t = Date.parse(now instanceof Date ? now.toISOString() : String(now));
  return Number.isNaN(t) ? Date.now() : t;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Último bloque ```json del texto, parseado: { value } o { error }.
function lastJson(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return { error: 'no hay un bloque ```json en el mensaje' };
  try { return { value: JSON.parse(blocks[blocks.length - 1][1]) }; } catch (e) { return { error: `el último bloque json no parsea: ${e.message}` }; }
}

function parseReview(text) {
  const r = lastJson(text);
  if (r.error) return { findings: [], claims: [], error: r.error };
  const v = r.value;
  const bad = (error) => ({ findings: [], claims: [], error });
  if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('el bloque json debe ser un objeto { findings, claims }');
  if (!Array.isArray(v.findings)) return bad('falta la lista findings');
  if (!Array.isArray(v.claims)) return bad('falta la lista claims');
  if (v.claims.length > MAX_CLAIMS) return bad(`hay ${v.claims.length} afirmaciones; el máximo es ${MAX_CLAIMS}`);
  const ids = new Set();
  for (const c of v.claims) {
    if (!c || !isStr(c.id)) return bad('cada afirmación necesita un id no vacío');
    if (ids.has(c.id)) return bad(`id de afirmación repetido: ${c.id}`);
    ids.add(c.id);
    if (!isStr(c.claim) || !isStr(c.how)) return bad(`la afirmación ${c.id} necesita claim y how no vacíos`);
  }
  return { findings: v.findings, claims: v.claims };
}

function parseVerification(text, claims) {
  const ids = (claims || []).map((c) => c.id);
  const r = lastJson(text);
  if (r.error) return { entries: [], missing: ids, error: r.error };
  if (!Array.isArray(r.value)) return { entries: [], missing: ids, error: 'el bloque json debe ser una lista de entradas' };
  const entries = r.value.filter((e) => e && ids.includes(e.id) && VERDICTS.includes(e.verdict) && isStr(e.experiment));
  const have = new Set(entries.map((e) => e.id));
  return { entries, missing: ids.filter((id) => !have.has(id)) };
}

function beginMode({ main, plan, mode, claims = [], planSha256 = '', now, ttlMin = TTL_MIN }) {
  if (!['review', 'verify'].includes(mode)) throw new Error(`modo inválido: ${mode}`);
  const t = toMs(now);
  const obj = {
    v: 1, plan, mode, started: new Date(t).toISOString(), expires: new Date(t + ttlMin * 60000).toISOString(),
    claims, experiments: 0, blocks: 0, incomplete: false, planSha256, scratch: path.join(auditDir(main, plan), 'scratch'),
  };
  writeAtomic(modeFile(main, plan), `${JSON.stringify(obj, null, 2)}\n`);
  return obj;
}

// El modo vigente más reciente. Vencido, ausente o ilegible = inactivo (no bloquea: un
// mode.json viejo no puede dejar al plan-auditor sin Bash para siempre).
function readMode({ main, now } = {}) {
  const t = toMs(now);
  const root = path.join(main, '.pignolo', 'tmp', 'plan-audit');
  let best = null;
  let dirs = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (_) { return { active: false }; }
  for (const d of dirs) {
    let m;
    try { m = JSON.parse(fs.readFileSync(modeFile(main, d), 'utf8')); } catch (_) { continue; }
    if (!m || typeof m !== 'object' || !['review', 'verify'].includes(m.mode) || Number.isNaN(Date.parse(m.expires))) continue;
    if (Date.parse(m.expires) <= t) continue;
    if (!best || Date.parse(m.started) > Date.parse(best.started)) best = m;
  }
  return best ? { active: true, ...best } : { active: false };
}

// Persiste el modo tal cual (lo usan los hooks tras stopDecision, que lo muta).
function saveMode({ main, mode }) {
  const { active, ...rest } = mode;
  writeAtomic(modeFile(main, rest.plan), `${JSON.stringify(rest, null, 2)}\n`);
}

function countExperiment({ main, command, now }) {
  const m = readMode({ main, now });
  if (!m.active) return null;
  m.experiments += 1;
  saveMode({ main, mode: m });
  try { fs.appendFileSync(path.join(auditDir(main, m.plan), 'bash-calls.log'), `${new Date(toMs(now)).toISOString()} ${String(command || '').replace(/\r?\n/g, ' ')}\n`); } catch (_) { /* el log es auxiliar */ }
  return m;
}

function endMode({ main, plan }) {
  fs.rmSync(modeFile(main, plan), { force: true });
}

// null = dejar terminar; { block, reason } = bloquear el cierre. MUTA `mode` (suma a blocks;
// deja incomplete al agotar los bloqueos): quien lo llama lo persiste con saveMode.
function stopDecision({ mode, lastMessage }) {
  let reason = null;
  if (mode.mode === 'review') {
    const r = parseReview(lastMessage);
    if (r.error) reason = `Your final message must end with one json block { "findings": [...], "claims": [...] } (${r.error}).`;
  } else if (mode.mode === 'verify') {
    const claims = mode.claims || [];
    const v = parseVerification(lastMessage, claims);
    const short = claims.length - (mode.experiments || 0);
    if (short > 0 || v.missing.length > 0) {
      const k = short > 0 ? short : v.missing.length;
      const ids = (v.missing.length ? v.missing : claims.map((c) => c.id)).join(', ');
      const scratch = mode.scratch || 'scratch/';
      reason = `You ran ${mode.experiments || 0} experiment(s) for ${claims.length} claim(s): ${k} still missing; for each remaining claim (${ids}) write a script in ${scratch} with Write, run it with Bash, and give the final json array again, with one entry { id, verdict, experiment, evidence } per claim.`;
    }
  }
  if (!reason) return null;
  if ((mode.blocks || 0) >= MAX_BLOCKS) { mode.incomplete = true; return null; }
  mode.blocks = (mode.blocks || 0) + 1;
  return { block: true, reason };
}

function buildAudit({ review, probe, verification, planCheck, mode }) {
  const claims = (review && review.claims) || [];
  const closed = new Set((probe && probe.closed) || []);
  const findings = [...((review && review.findings) || []), ...((probe && probe.findings) || [])];
  const entries = (verification && verification.entries) || [];
  for (const e of entries.filter((x) => x.verdict === 'false')) {
    const c = claims.find((x) => x.id === e.id) || {};
    findings.push({
      task: c.task, kind: 'experiment-false',
      evidence: `Claim ${e.id}${c.claim ? ` ("${c.claim}")` : ''} is false: ${e.evidence || e.experiment}`,
      keywords: [e.id],
    });
  }
  if (planCheck) findings.push(...(Array.isArray(planCheck) ? planCheck : toFindings(planCheck)));
  const incomplete = Boolean(mode && mode.incomplete);
  if (findings.length) return { verdict: 'REQUEST_CHANGES', findings, incomplete };
  const unverified = claims.filter((c) => !closed.has(c.id)).some((c) => {
    const e = entries.find((x) => x.id === c.id);
    return !e || e.verdict === 'inconclusive';
  });
  if (unverified || incomplete) return { verdict: 'ESCALATE', findings, incomplete: true, reason: 'claims-not-verified' };
  return { verdict: 'APPROVE', findings, incomplete: false };
}

module.exports = {
  MAX_CLAIMS, MAX_BLOCKS, TTL_MIN, auditDir, parseReview, parseVerification,
  beginMode, readMode, saveMode, countExperiment, endMode, stopDecision, buildAudit,
};
