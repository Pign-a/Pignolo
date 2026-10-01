'use strict';
// Almacén de entradas de estado (spec §10.1, R-1 del hito 6): un archivo por entrada en
// <main>/.pignolo/state/<tipo>/YYYY-MM-DD-<slug>.md con frontmatter (id, status, evidence,
// source, superseded_by, created, review_after y `priority` opcional). Cerrar es cambiar
// `status`; el cuerpo nunca se reescribe. Escrituras atómicas (temporal + rename), LF, sin BOM.
// `plans/` es del hito 5 (lib/plan-state.js) y acá solo se lista: no es un KIND.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseFrontmatter, YamlLiteError } = require('./yaml-lite');

const KINDS = Object.freeze(['work', 'decisions', 'issues', 'learnings/proposed', 'learnings/accepted', 'learnings/rejected', 'sessions', 'metrics', 'archive']);
const LEARNING = Object.freeze(['proposed', 'accepted', 'rejected']);
// Ruling técnico: `sessions` y `metrics` son registros cerrados al escribirse; `archive` recibe lo
// que `archive` mueve con su status intacto (closed, decided o superseded).
const STATUSES = Object.freeze({
  work: Object.freeze(['open', 'closed']),
  issues: Object.freeze(['open', 'closed']),
  decisions: Object.freeze(['open', 'decided', 'superseded']),
  'learnings/proposed': LEARNING,
  'learnings/accepted': LEARNING,
  'learnings/rejected': LEARNING,
  sessions: Object.freeze(['closed']),
  metrics: Object.freeze(['recorded']),
  archive: Object.freeze(['closed', 'decided', 'superseded']),
});
const TERMINAL = Object.freeze(['accepted', 'rejected']);
const PRIORITIES = Object.freeze(['high', 'normal']);
const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,60}$/;
// Orden fijo de los campos del frontmatter; lo que no está acá va después, en orden alfabético.
const FIELD_ORDER = ['id', 'status', 'priority', 'evidence', 'source', 'superseded_by', 'created', 'review_after'];
const LINE_MAX = 140;

const refuse = (refused, reason) => ({ ok: false, refused, reason });

function stateRoot(main) { return path.join(main, '.pignolo', 'state'); }
function stateDir(main, kind) { return path.join(stateRoot(main), ...String(kind).split('/')); }

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

// { ok: true, entry: { id, status, priority, title, line, fields } } | { ok: false, error }
function parseEntry(text) {
  if (typeof text !== 'string') return { ok: false, error: 'la entrada no es texto' };
  let parsed;
  try { parsed = parseFrontmatter(text); } catch (e) {
    if (e instanceof YamlLiteError) return { ok: false, error: e.message };
    throw e;
  }
  const { data, body } = parsed;
  if (!/^﻿?---\r?\n/.test(text)) return { ok: false, error: 'sin frontmatter' };
  if (typeof data.id !== 'string' || !ID_RE.test(data.id)) return { ok: false, error: `id inválido o ausente: ${JSON.stringify(data.id === undefined ? null : data.id)}` };
  if (typeof data.status !== 'string' || data.status === '') return { ok: false, error: 'falta status' };
  let priority = 'normal';
  if (data.priority !== undefined && data.priority !== null) {
    if (!PRIORITIES.includes(data.priority)) return { ok: false, error: `priority "${data.priority}" no es high ni normal` };
    priority = data.priority;
  }
  let title = '';
  let line = '';
  for (const raw of body.split('\n')) {
    const l = raw.replace(/\r$/, '').trim();
    if (!l) continue;
    if (/^#+\s/.test(l)) {
      if (!title && /^#\s/.test(l)) title = l.replace(/^#\s+/, '').trim();
      continue;
    }
    if (!line) line = l.length > LINE_MAX ? l.slice(0, LINE_MAX) : l;
    if (title) break;
  }
  return { ok: true, entry: { id: data.id, status: data.status, priority, title, line, fields: data } };
}

// Todas las entradas de un tipo: { entries: [{ kind, file, name, ...entry }], errors: [{ file, error }] }.
// Una entrada ilegible va a errors, nunca se omite en silencio. Carpeta ausente: vacío.
function readEntries({ main, kind }) {
  const dir = stateDir(main, kind);
  const entries = [];
  const errors = [];
  let names;
  try { names = fs.readdirSync(dir); } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return { entries, errors };
    throw e;
  }
  for (const name of names.filter((n) => n.endsWith('.md')).sort()) {
    const file = path.join(dir, name);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { errors.push({ file, error: e.message }); continue; }
    const r = parseEntry(text);
    if (!r.ok) { errors.push({ file, error: r.error }); continue; }
    const base = name.slice(0, -3);
    if (r.entry.id !== base) { errors.push({ file, error: `el id "${r.entry.id}" no coincide con el nombre del archivo ${name}` }); continue; }
    entries.push({ kind, file, name, ...r.entry });
  }
  return { entries, errors };
}

function yamlScalar(v) {
  const s = String(v);
  if (s === '' || /^[\[{]/.test(s) || /^(true|false)$/.test(s) || /[#:]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

function renderFrontmatter(fields) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  const rank = (k) => { const i = FIELD_ORDER.indexOf(k); return i < 0 ? FIELD_ORDER.length : i; };
  keys.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const lines = ['---'];
  for (const k of keys) {
    const v = fields[k];
    if (v === null) lines.push(`${k}:`);
    else if (Array.isArray(v)) { lines.push(`${k}:`); for (const x of v) lines.push(`  - ${yamlScalar(x)}`); }
    else if (typeof v === 'boolean') lines.push(`${k}: ${v}`);
    else if (typeof v === 'object') { lines.push(`${k}:`); for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${yamlScalar(v2)}`); }
    else lines.push(`${k}: ${yamlScalar(v)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// Crea la entrada; nunca pisa una existente. { ok: true, file } | { ok: false, refused, reason }.
function writeEntry({ main, kind, id, fields = {}, body = '' }) {
  if (!KINDS.includes(kind)) return refuse('invalid-kind', `tipo desconocido: ${kind} (los válidos: ${KINDS.join(', ')})`);
  if (typeof id !== 'string' || !ID_RE.test(id)) return refuse('invalid-id', `id inválido: ${id} (forma YYYY-MM-DD-<slug>)`);
  const status = fields.status;
  if (!STATUSES[kind].includes(status)) return refuse('invalid-status', `status "${status}" no vale en ${kind} (los válidos: ${STATUSES[kind].join(', ')})`);
  if (fields.priority !== undefined && fields.priority !== null && !PRIORITIES.includes(fields.priority)) return refuse('invalid-priority', `priority "${fields.priority}" no es high ni normal`);
  const file = path.join(stateDir(main, kind), `${id}.md`);
  if (fs.existsSync(file)) return refuse('exists', `ya existe ${file}`);
  const text = `${renderFrontmatter({ ...fields, id, status })}\n${String(body).replace(/\r\n/g, '\n').replace(/^﻿/, '').replace(/\n*$/, '\n')}`;
  const check = parseEntry(text);
  if (!check.ok) return refuse('invalid-fields', `la entrada no se puede releer: ${check.error}`);
  writeAtomic(file, text);
  return { ok: true, file };
}

// Cambia solo la línea `status` (y `superseded_by` si se da); el resto del archivo queda byte a byte.
function setStatus({ main, kind, id, status, supersededBy }) {
  if (!KINDS.includes(kind)) return refuse('invalid-kind', `tipo desconocido: ${kind}`);
  if (!STATUSES[kind].includes(status)) return refuse('invalid-status', `status "${status}" no vale en ${kind} (los válidos: ${STATUSES[kind].join(', ')})`);
  const file = path.join(stateDir(main, kind), `${id}.md`);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return refuse('missing', `no existe ${file}`);
    throw e;
  }
  const cur = parseEntry(text);
  if (!cur.ok) return refuse('unreadable', `${file}: ${cur.error}`);
  if (TERMINAL.includes(cur.entry.status) && cur.entry.status !== status) return refuse('terminal', `${id} está en ${cur.entry.status} y no se reabre`);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split('\n');
  const end = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '') === '---');
  const fm = lines.slice(0, end);
  const si = fm.findIndex((l) => /^status:/.test(l));
  if (si < 0) return refuse('unreadable', `${file}: sin línea status`);
  fm[si] = `status: ${status}${nl === '\r\n' ? '\r' : ''}`;
  if (supersededBy !== undefined) {
    const line = `superseded_by: ${yamlScalar(supersededBy)}${nl === '\r\n' ? '\r' : ''}`;
    const bi = fm.findIndex((l) => /^superseded_by:/.test(l));
    if (bi >= 0) fm[bi] = line; else fm.splice(si + 1, 0, line);
  }
  writeAtomic(file, [...fm, ...lines.slice(end)].join('\n'));
  return { ok: true, file, status };
}

// Mueve una entrada entre tipos sin borrar nunca (hito 6, F6/C7): si el archivo está versionado
// (`git ls-files --error-unmatch`) va con `git mv` (figura como R); si no, o sin git, con rename.
// El destino no se pisa: refused 'exists'. Nunca commitea.
function moveEntry({ main, fromKind, toKind, id }) {
  if (!KINDS.includes(fromKind) || !KINDS.includes(toKind)) return refuse('invalid-kind', `tipo desconocido: ${fromKind} -> ${toKind}`);
  const from = path.join(stateDir(main, fromKind), `${id}.md`);
  const to = path.join(stateDir(main, toKind), `${id}.md`);
  if (!fs.existsSync(from)) return refuse('missing', `no existe ${from}`);
  if (fs.existsSync(to)) return refuse('exists', `ya existe ${to}`);
  // `ls-files --error-unmatch` sale 1 si no está versionada. Cualquier otro fallo de git (plazo vencido,
  // safe.directory, repo roto) en un checkout con .git no se toma por "no versionada": se rechaza (M5).
  let tracked = false;
  const { gitRun } = require('./git');
  try { gitRun(['ls-files', '--error-unmatch', '--', from], main, { timeout: 5000 }); tracked = true; } catch (e) {
    if (e.status !== 1 && fs.existsSync(path.join(main, '.git'))) return refuse('git-failed', `git no pudo decir si ${from} está versionada: ${String(e.stderr || e.message).trim().split(/\r?\n/)[0]}`);
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (tracked) gitRun(['mv', '--', from, to], main, { timeout: 5000 });
  else fs.renameSync(from, to);
  return { ok: true, file: to, from, how: tracked ? 'git-mv' : 'rename' };
}

module.exports = { KINDS, STATUSES, TERMINAL, ID_RE, stateRoot, stateDir, parseEntry, readEntries, writeEntry, setStatus, moveEntry, writeAtomic };
