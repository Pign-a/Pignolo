'use strict';
// Estado de la auditoría del plan (R-1, R-2): el archivo de modo que deciden los hooks, la
// lectura de los informes del plan-auditor y el armado del veredicto. Pura salvo mode.json
// y bash-calls.log bajo <main>/.pignolo/tmp/plan-audit/<plan>/ (autoignorado).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

const sleepMs = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) { /* sin espera */ } };

// Único escritor de mode.json (plan-audit.js, hilo principal): reintento corto ante
// EPERM/EBUSY, que en Windows aparecen si un hook lo está leyendo (R-15).
function writeModeFile(file, text) {
  for (let i = 0; ; i += 1) {
    try { writeAtomic(file, text); return; } catch (e) {
      if (i >= 5 || !['EPERM', 'EBUSY'].includes(e.code)) throw e;
      sleepMs(20 * (i + 1));
    }
  }
}

// mode.json no guarda contadores (R-15): los de los hooks son logs de solo-agregar.
// Empezar un modo abre cuenta nueva (borra los logs del anterior).
function beginMode({ main, plan, mode, claims = [], planSha256 = '', now, ttlMin = TTL_MIN }) {
  if (!['review', 'verify'].includes(mode)) throw new Error(`modo inválido: ${mode}`);
  const t = toMs(now);
  const obj = {
    v: 1, plan, mode, started: new Date(t).toISOString(), expires: new Date(t + ttlMin * 60000).toISOString(), claims, planSha256,
  };
  fs.mkdirSync(auditDir(main, plan), { recursive: true });
  fs.rmSync(path.join(auditDir(main, plan), 'bash-calls.log'), { force: true });
  fs.rmSync(path.join(auditDir(main, plan), 'stops.log'), { force: true });
  writeModeFile(modeFile(main, plan), `${JSON.stringify(obj, null, 2)}\n`);
  return obj;
}

const countLines = (file, only) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => (only ? l.trim() === only : l.trim() !== '')).length;
  } catch (_) { return 0; }
};

// Los contadores de un plan aunque su modo haya vencido (los usa plan-audit.js finish).
function readCounters({ main, plan }) {
  const dir = auditDir(main, plan);
  return {
    experiments: countLines(path.join(dir, 'bash-calls.log')),
    attempts: countLines(path.join(dir, 'stops.log'), 'stop'),
    incomplete: countLines(path.join(dir, 'stops.log'), 'incomplete') > 0,
  };
}

// El modo vigente más reciente. Vencido, ausente o ilegible = inactivo (no bloquea: un
// mode.json viejo no puede dejar al plan-auditor sin Bash para siempre).
function readMode({ main, now } = {}) {
  const t = toMs(now);
  const root = path.join(main, '.pignolo', 'tmp', 'plan-audit');
  let dirs = [];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (_) { return { active: false }; }
  let best = null;
  for (const d of dirs) {
    let m;
    try { m = JSON.parse(fs.readFileSync(modeFile(main, d), 'utf8')); } catch (_) { continue; }
    if (!m || typeof m !== 'object' || !['review', 'verify'].includes(m.mode) || Number.isNaN(Date.parse(m.expires)) || Number.isNaN(Date.parse(m.started))) continue;
    if (Date.parse(m.expires) <= t) continue;
    if (!best || Date.parse(m.started) > Date.parse(best.started)) best = { ...m, plan: d };
  }
  if (!best) return { active: false };
  const dir = auditDir(main, best.plan);
  return {
    active: true, plan: best.plan, mode: best.mode, dir, claims: best.claims || [], started: best.started, expires: best.expires,
    planSha256: best.planSha256,
    experiments: countLines(path.join(dir, 'bash-calls.log')),
    attempts: countLines(path.join(dir, 'stops.log'), 'stop'),
    incomplete: countLines(path.join(dir, 'stops.log'), 'incomplete') > 0,
  };
}

// Un appendFileSync por evento (una línea): no pierde incrementos bajo llamadas paralelas.
function recordExperiment({ main, plan, command, now }) {
  const line = `${new Date(toMs(now)).toISOString()} ${String(command || '').replace(/\s*\r?\n\s*/g, ' ')}\n`;
  fs.mkdirSync(auditDir(main, plan), { recursive: true });
  fs.appendFileSync(path.join(auditDir(main, plan), 'bash-calls.log'), line);
}

function recordStop({ main, plan }) {
  fs.mkdirSync(auditDir(main, plan), { recursive: true });
  const file = path.join(auditDir(main, plan), 'stops.log');
  fs.appendFileSync(file, 'stop\n');
  return countLines(file, 'stop');
}

function markIncomplete({ main, plan }) {
  fs.mkdirSync(auditDir(main, plan), { recursive: true });
  fs.appendFileSync(path.join(auditDir(main, plan), 'stops.log'), 'incomplete\n');
}

function endMode({ main, plan }) {
  fs.rmSync(modeFile(main, plan), { force: true });
}

// null = dejar terminar; { block: true, reason } = bloquear el cierre; { block: false,
// incomplete: true } = ya se bloqueó MAX_BLOCKS veces y todavía falta algo (quien llama hace
// markIncomplete). Pura: no escribe nada. `mode` es lo que devuelve readMode.
function stopDecision({ mode, lastMessage, attempt = 1 }) {
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
      const scratch = mode.dir ? path.join(mode.dir, 'scratch') : 'scratch/';
      reason = `You ran ${mode.experiments || 0} experiment(s) for ${claims.length} claim(s): ${k} still missing; for each remaining claim (${ids}) write a script in ${scratch} with Write, run it with Bash, and give the final json array again, with one entry { id, verdict, experiment, evidence } per claim.`;
    }
  }
  if (!reason) return null;
  if (attempt > MAX_BLOCKS) return { block: false, incomplete: true };
  return { block: true, reason };
}

// Los hallazgos de plan-check no entran: son evidencia para el revisor del paso 1, que repite
// en sus findings lo que confirma y descarta la falsa alarma (carta del plan-auditor).
function buildAudit({ review, probe, verification, mode }) {
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
  beginMode, readMode, readCounters, recordExperiment, recordStop, markIncomplete, endMode, stopDecision, buildAudit,
};
