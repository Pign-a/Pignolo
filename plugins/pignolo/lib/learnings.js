'use strict';
// Aprendizajes (spec §10.4; R-8 y R-9 del hito 6). Propuesta en learnings/proposed/, piso mecánico, duplicados
// y evidencia sin modelo, decisión pura (decideAcceptance: nada se acepta sin el sí del humano) y
// movimiento del archivo (applyDecision). Subir al plugin sigue siendo del humano. Engram queda fuera de la v1 (D-6-1): la memoria es learnings/accepted/, en git.
const { writeEntry, readEntries, setStatus, moveEntry, stateDir } = require('./state-store');
const path = require('node:path');
const fs = require('node:fs');

const SOURCES = Object.freeze(['session', 'web', 'human']);
const SCOPES = Object.freeze(['project', 'general']);
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

// La usa close-session (init ya no migra la auto-memoria, R7).
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

// Cuerpo de una entrada: el texto sin el frontmatter.
function bodyOf(text) {
  const m = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(String(text));
  return m ? String(text).slice(m[0].length) : String(text);
}
const normalize = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// R-9: duplicado exacto tras normalizar (minúsculas, sin espacios ni puntuación) contra `existing`
// (entradas de readEntries con `file`, o con `body`). Un texto vacío nunca es duplicado.
function findDuplicate({ body, existing = [] } = {}) {
  const n = normalize(bodyOf(body || ''));
  if (!n) return { duplicate: false };
  for (const e of existing) {
    let text = typeof e.body === 'string' ? e.body : null;
    if (text === null && e.file) { try { text = bodyOf(fs.readFileSync(e.file, 'utf8')); } catch (_) { text = null; } }
    if (text !== null && normalize(text) === n) return { duplicate: true, of: e.id };
  }
  return { duplicate: false };
}

// Las entradas contra las que se compara una propuesta: accepted/, rejected/ y el resto de
// proposed/, nunca ella misma.
function existingFor({ main, id }) {
  const out = [];
  for (const kind of ['learnings/accepted', 'learnings/rejected', 'learnings/proposed']) {
    for (const e of readEntries({ main, kind }).entries) if (!(kind === 'learnings/proposed' && e.id === id)) out.push(e);
  }
  return out;
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const FILE_LINE_RE = /^(.+):(\d+)$/;

// R-9: cada `ruta:línea` existe dentro del repo y cada sha existe como commit (`run(args)` ejecuta git
// y lanza si falla). Sin referencia reconocible → verified false. Nunca lee fuera del repo.
function checkEvidence({ main, evidence, run } = {}) {
  const checked = [];
  let root;
  try { root = fs.realpathSync(main); } catch (_) { root = path.resolve(main); }
  for (const ref of String(evidence || '').split(/[\s,;"'()<>[\]]+/).filter(Boolean)) {
    const fl = FILE_LINE_RE.exec(ref);
    if (fl) {
      const rel = fl[1];
      const line = Number(fl[2]);
      let ok = false;
      const unsafe = path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || /^[\\/]/.test(rel) || rel.split(/[\\/]/).includes('..');
      if (!unsafe) {
        try {
          const real = fs.realpathSync(path.resolve(root, rel));
          if (real.startsWith(root + path.sep) && fs.statSync(real).isFile()) {
            const lines = fs.readFileSync(real, 'utf8').split(/\r?\n/);
            if (lines[lines.length - 1] === '') lines.pop();
            ok = line >= 1 && line <= lines.length;
          }
        } catch (_) { ok = false; }
      }
      checked.push({ ref, kind: 'file-line', ok });
    } else if (SHA_RE.test(ref)) {
      let ok = false;
      try { if (typeof run === 'function') { run(['cat-file', '-e', `${ref}^{commit}`]); ok = true; } } catch (_) { ok = false; }
      checked.push({ ref, kind: 'commit', ok });
    }
  }
  return { verified: checked.length > 0 && checked.every((c) => c.ok), checked };
}

// R-8, en este orden: un hallazgo del piso mecánico → rejected; un duplicado → rejected; "no" del
// humano → rejected; "yes" → accepted; sin respuesta → human con flags. Nada se acepta sin
// answer === 'yes' (ni siquiera un session limpio). Lo general aceptado suma promoteCandidate.
function decideAcceptance({ entry, scan, duplicate, evidence, reservedMatch = false, answer } = {}) {
  const fields = (entry && entry.fields) || {};
  const flags = [];
  if (fields.source === 'web') flags.push('web');
  if (reservedMatch) flags.push('reserved');
  if (!evidence || evidence.verified !== true) flags.push('evidence-unverified');
  const findings = (scan && Array.isArray(scan.findings)) ? scan.findings : [];
  if (findings.length) return { decision: 'rejected', reason: `piso mecánico: ${findings.map((f) => `${f.kind} (${f.match})`).join(', ')}`, promoteCandidate: false, flags };
  if (duplicate && duplicate.duplicate) return { decision: 'rejected', reason: `duplicado de ${duplicate.of}`, promoteCandidate: false, flags };
  if (answer === 'no') return { decision: 'rejected', reason: 'human-no', promoteCandidate: false, flags };
  if (answer === 'yes') return { decision: 'accepted', reason: 'human-yes', promoteCandidate: fields.scope === 'general', flags };
  return { decision: 'human', reason: answer === undefined ? 'sin respuesta del humano: se le pregunta' : `respuesta desconocida: ${answer}`, promoteCandidate: false, flags };
}

// Mueve de proposed/ a accepted/ o rejected/ (git mv si está versionada, rename si no) y fija el status.
// human no mueve nada.
function applyDecision({ main, id, decision }) {
  if (decision === 'human') return { ok: true, moved: false, decision };
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

module.exports = { SOURCES, SCOPES, SIZE_LIMIT, proposeLearning, scanLearning, findDuplicate, existingFor, checkEvidence, decideAcceptance, applyDecision, readProposal, bodyOf };
