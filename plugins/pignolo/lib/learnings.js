'use strict';
// Aprendizajes (spec §10.4; R-8 y R-9 del hito 6). Propuesta en learnings/proposed/, piso mecánico
// sin modelo (scanLearning), lectura de la salida del learning-validator (parseValidation), decisión
// pura (decideAcceptance) y movimiento del archivo (applyDecision). Subir al plugin sigue siendo
// del humano. Engram queda fuera de la v1 (D-6-1): la memoria es learnings/accepted/, en git.
const { writeEntry, readEntries, setStatus, moveEntry, stateDir } = require('./state-store');
const path = require('node:path');
const fs = require('node:fs');

const SOURCES = Object.freeze(['session', 'web', 'human']);
const SCOPES = Object.freeze(['project', 'general']);
const CHECKS = Object.freeze(['novelty', 'evidence', 'contradictions', 'safety', 'size', 'scope']);
const STATUS_WORDS = Object.freeze(['DONE', 'BLOCKED', 'NEEDS_CONTEXT']);
const SIZE_LIMIT = 1200;
const SECRET_RES = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /password\s*[:=]/i,
];
const PERMISSION_RES = [/\bbypass\b/i, /\bdangerously\b/i, /\ballow all\b/i, /\bskip[- ]permissions?\b/i, /--no-verify\b/];

const refuse = (refused, reason) => ({ ok: false, refused, reason });

// Es lo que usará /pignolo:init (hito 8) para migrar la auto-memoria.
function proposeLearning({ main, id, source, evidence, scope = 'project', body = '', created, fields = {} }) {
  if (!SOURCES.includes(source)) return refuse('invalid-source', `source "${source}" no es ninguno de ${SOURCES.join(', ')}`);
  if (!SCOPES.includes(scope)) return refuse('invalid-scope', `scope "${scope}" no es ninguno de ${SCOPES.join(', ')}`);
  if (typeof evidence !== 'string' || !evidence.trim()) return refuse('no-evidence', 'un aprendizaje sin evidencia no se propone');
  return writeEntry({ main, kind: 'learnings/proposed', id, fields: { ...fields, status: 'proposed', source, scope, evidence: evidence.trim(), created: created || new Date().toISOString().slice(0, 10) }, body });
}

// Piso mecánico (R-9): { findings: [{ kind: 'pii'|'secret'|'permission'|'size', match }] }.
// Una regex inválida en piiPatterns no pasa en silencio: lanza con el patrón nombrado.
function scanLearning({ text, piiPatterns = [] } = {}) {
  const t = typeof text === 'string' ? text : '';
  const findings = [];
  for (const p of piiPatterns) {
    let re;
    try { re = new RegExp(p); } catch (e) { throw new Error(`pii-patterns: "${p}" no es una regex válida (${e.message})`); }
    const m = re.exec(t);
    if (m) findings.push({ kind: 'pii', match: m[0] });
  }
  for (const re of SECRET_RES) { const m = re.exec(t); if (m) findings.push({ kind: 'secret', match: m[0] }); }
  for (const re of PERMISSION_RES) { const m = re.exec(t); if (m) findings.push({ kind: 'permission', match: m[0] }); }
  if (t.length > SIZE_LIMIT) findings.push({ kind: 'size', match: `${t.length} > ${SIZE_LIMIT}` });
  return { findings };
}

// Último bloque ```json del informe y la última palabra DONE | BLOCKED | NEEDS_CONTEXT.
// { ok: true, results, status } | { ok: false, error }. Con `ids`, un id que no se pidió es error.
function parseValidation(text, { ids } = {}) {
  if (typeof text !== 'string') return { ok: false, error: 'el informe no es texto' };
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)].map((m) => m[1]);
  if (!blocks.length) return { ok: false, error: 'el informe no trae un bloque ```json' };
  let parsed;
  try { parsed = JSON.parse(blocks[blocks.length - 1]); } catch (e) { return { ok: false, error: `el bloque json no parsea: ${e.message}` }; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.results)) return { ok: false, error: 'el bloque json no trae results' };
  const words = text.trim().split(/\s+/);
  const status = words[words.length - 1].replace(/[^A-Z_]/g, '');
  if (!STATUS_WORDS.includes(status)) return { ok: false, error: `el informe no termina con DONE, BLOCKED o NEEDS_CONTEXT (termina con "${words[words.length - 1]}")` };
  const seen = new Set();
  const results = [];
  for (const r of parsed.results) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return { ok: false, error: 'un resultado no tiene id' };
    if (seen.has(r.id)) return { ok: false, error: `id repetido en results: ${r.id}` };
    seen.add(r.id);
    if (Array.isArray(ids) && !ids.includes(r.id)) return { ok: false, error: `el validador informó un aprendizaje que no se pidió: ${r.id}` };
    const checks = r.checks && typeof r.checks === 'object' ? r.checks : {};
    const out = {};
    for (const c of CHECKS) {
      if (checks[c] !== 'pass' && checks[c] !== 'fail') return { ok: false, error: `${r.id}: el chequeo ${c} falta o no es pass/fail` };
      out[c] = checks[c];
    }
    results.push({
      id: r.id,
      checks: out,
      contradicts: Array.isArray(r.contradicts) ? r.contradicts.map(String) : [],
      promoteCandidate: r.promoteCandidate === true,
      notes: typeof r.notes === 'string' ? r.notes : '',
    });
  }
  return { ok: true, results, status };
}

// R-8, en este orden. `entry` es la entrada parseada (fields.source, fields.scope); `validation` lo que
// devuelve parseValidation; `scan` lo que devuelve scanLearning; `reservedMatch` lo decide la skill.
function decideAcceptance({ entry, validation, scan, reservedMatch = false } = {}) {
  const id = entry && entry.id;
  const fields = (entry && entry.fields) || {};
  if (!validation || validation.ok !== true) return { decision: 'pending', reason: `sin resultado legible del validador${validation && validation.error ? `: ${validation.error}` : ''}`, promoteCandidate: false };
  if (validation.status !== 'DONE') return { decision: 'pending', reason: `el validador terminó en ${validation.status}`, promoteCandidate: false };
  const result = validation.results.find((r) => r.id === id);
  if (!result) return { decision: 'pending', reason: `el validador no informó ${id}`, promoteCandidate: false };
  const findings = (scan && Array.isArray(scan.findings)) ? scan.findings : [];
  if (findings.length) return { decision: 'rejected', reason: `piso mecánico: ${findings.map((f) => `${f.kind} (${f.match})`).join(', ')}`, promoteCandidate: false };
  const failed = CHECKS.filter((c) => result.checks[c] !== 'pass');
  if (failed.length) return { decision: 'rejected', reason: `chequeos en fail: ${failed.join(', ')}${result.notes ? ` — ${result.notes}` : ''}`, promoteCandidate: false };
  if (fields.source === 'web') return { decision: 'human', reason: 'source: web nunca se acepta solo', promoteCandidate: false };
  if (reservedMatch) return { decision: 'human', reason: 'toca una decisión reservada al humano', promoteCandidate: false };
  if (result.contradicts.length) return { decision: 'human', reason: `contradice: ${result.contradicts.join(', ')}`, promoteCandidate: false };
  if (fields.source !== 'session' && fields.source !== 'human') return { decision: 'human', reason: `source desconocido: ${fields.source}`, promoteCandidate: false };
  const promoteCandidate = fields.scope === 'general' || result.promoteCandidate === true;
  return { decision: 'accepted', reason: 'los seis chequeos en pass', promoteCandidate };
}

// Decisión del humano (R7 del autor, 2026-10-01: sin learning-validator, la aceptación es el piso
// mecánico más el sí del humano). El piso gana siempre: un hallazgo de scanLearning rechaza aunque
// el humano diga que sí. answer: 'accept' | 'reject'; otra cosa → pending.
function decideByHuman({ entry, scan, answer } = {}) {
  const fields = (entry && entry.fields) || {};
  const findings = (scan && Array.isArray(scan.findings)) ? scan.findings : [];
  if (findings.length) return { decision: 'rejected', reason: `piso mecánico: ${findings.map((f) => `${f.kind} (${f.match})`).join(', ')}`, promoteCandidate: false };
  if (answer === 'reject') return { decision: 'rejected', reason: 'el humano dijo que no', promoteCandidate: false };
  if (answer !== 'accept') return { decision: 'pending', reason: `respuesta del humano desconocida: ${answer}`, promoteCandidate: false };
  return { decision: 'accepted', reason: 'el humano dijo que sí', promoteCandidate: fields.scope === 'general' };
}

// Mueve de proposed/ a accepted/ o rejected/ (git mv si está versionada, rename si no) y fija el status.
// human y pending no mueven nada.
function applyDecision({ main, id, decision }) {
  if (decision === 'human' || decision === 'pending') return { ok: true, moved: false, decision };
  if (decision !== 'accepted' && decision !== 'rejected') return refuse('invalid-decision', `decisión desconocida: ${decision}`);
  const toKind = `learnings/${decision}`;
  const mv = moveEntry({ main, fromKind: 'learnings/proposed', toKind, id });
  if (!mv.ok) return mv;
  const st = setStatus({ main, kind: toKind, id, status: decision });
  if (!st.ok) return st;
  return { ok: true, moved: true, decision, file: mv.file, how: mv.how };
}

function readProposal({ main, id }) {
  const file = path.join(stateDir(main, 'learnings/proposed'), `${id}.md`);
  if (!fs.existsSync(file)) return refuse('missing', `no existe ${file}`);
  const r = readEntries({ main, kind: 'learnings/proposed' });
  const entry = r.entries.find((e) => e.id === id);
  if (!entry) { const err = r.errors.find((e) => e.file === file); return refuse('unreadable', err ? err.error : `no se pudo leer ${file}`); }
  return { ok: true, entry, text: fs.readFileSync(file, 'utf8') };
}

module.exports = { SOURCES, SCOPES, CHECKS, SIZE_LIMIT, proposeLearning, scanLearning, parseValidation, decideAcceptance, decideByHuman, applyDecision, readProposal };
