'use strict';
// Decisiones de diseño del autor durante el brainstorming (D-<n>), una por archivo en
// <main>/.pignolo/state/decisions/<fecha>-<plan>-d-<n>.md (lib/state-store.js, status `decided`).
// Cada una lleva la cita literal del autor: sin cita no hay decisión. Las lee el spec-reviewer y
// validateScopeCard como segunda fuente de citas junto al pedido (spec §4.5). Pura salvo el disco.
const fs = require('node:fs');
const store = require('./state-store');

const DECISION_ID_RE = /^D-\d{1,4}$/;
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const entryId = ({ plan, id, date }) => `${date}-${plan}-${id.toLowerCase()}`;

// { ok: true, id, file } | { ok: false, error }
function addDecision({ main, plan, id, text, quote, date }) {
  if (!DECISION_ID_RE.test(id || '')) return { ok: false, error: `--id debe ser D-<n> (recibí "${id}")` };
  const body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) return { ok: false, error: 'falta el texto de la decisión' };
  const q = oneLine(quote || '');
  if (!q) return { ok: false, error: 'falta la cita literal del autor: sin cita no hay decisión del autor' };
  const dup = listDecisions({ main, plan }).decisions.find((d) => d.id === id);
  if (dup) return { ok: false, error: `ya existe la decisión ${id} del plan ${plan} (${dup.file})` };
  const r = store.writeEntry({
    main, kind: 'decisions', id: entryId({ plan, id, date }),
    fields: { status: 'decided', source: 'human', plan, decision: id, created: date },
    body: `# ${id}\n\n- quote: ${q}\n\n${body}\n`,
  });
  if (!r.ok) return { ok: false, error: r.reason };
  return { ok: true, id, file: r.file };
}

// { decisions: [{ id, plan, date, text, quote, file }], errors } de un plan, en orden de id.
// Una entrada ilegible va a `errors`; nunca respalda una cita.
function listDecisions({ main, plan }) {
  const read = store.readEntries({ main, kind: 'decisions' });
  const decisions = [];
  const errors = [...read.errors];
  for (const e of read.entries) {
    const f = e.fields;
    if (!f.decision || !DECISION_ID_RE.test(String(f.decision)) || (plan !== undefined && f.plan !== plan)) continue;
    let raw;
    try { raw = fs.readFileSync(e.file, 'utf8'); } catch (err) { errors.push({ file: e.file, error: err.message }); continue; }
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const at = lines.findIndex((l) => /^- quote: /.test(l));
    if (at < 0) { errors.push({ file: e.file, error: 'sin línea "- quote:"' }); continue; }
    const text = lines.slice(at + 1).join('\n').trim();
    decisions.push({ id: String(f.decision), plan: String(f.plan), date: String(f.created), text, quote: lines[at].slice('- quote: '.length).trim(), file: e.file });
  }
  decisions.sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  return { decisions, errors };
}

module.exports = { DECISION_ID_RE, addDecision, listDecisions };
