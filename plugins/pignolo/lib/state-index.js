'use strict';
// INDEX.md generado (spec §10.1, R-2 del hito 6): una sección por tipo con un puntero por
// entrada (id, título, una línea), orden estable (tipo, status, id), LF y sin fecha de
// generación: con el mismo estado sale el mismo archivo y el diff del commit es solo lo que
// cambió. `plans/` (hito 5) se lista sin moverlo; `archive` solo como contador. Una entrada
// ilegible aparece como "ilegible" y en `errors`: nunca se pierde en silencio.
// Lo escribe solo scripts/state-index.js desde el hilo principal; protect-paths lo niega a Edit/Write.
const fs = require('node:fs');
const path = require('node:path');
const { KINDS, stateRoot, readEntries, writeAtomic } = require('./state-store');
const { listPlans, readPlan } = require('./plan-state');

const HEADER = '<!-- generado por pignolo state-index; no editar a mano -->';
const INDEX_NAME = 'INDEX.md';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function indexFile(main) { return path.join(stateRoot(main), INDEX_NAME); }

function pointer(e) {
  const title = e.title || e.id;
  return `- ${e.id} — ${title}${e.line ? `: ${e.line}` : ''} [${e.status}]`;
}

// { text, errors: [{ file, error }] }
function buildIndex({ main }) {
  const out = [HEADER, '', '# Estado del proyecto', ''];
  const errors = [];
  for (const kind of KINDS) {
    const r = readEntries({ main, kind });
    errors.push(...r.errors);
    if (!r.entries.length && !r.errors.length) continue;
    out.push(`## ${kind}`, '');
    if (kind === 'archive') {
      out.push(`- ${r.entries.length} entradas archivadas`);
    } else {
      const sorted = [...r.entries].sort((a, b) => cmp(a.status, b.status) || cmp(a.id, b.id));
      for (const e of sorted) out.push(pointer(e));
    }
    for (const err of [...r.errors].sort((a, b) => cmp(a.file, b.file))) out.push(`- ${path.basename(err.file)} — ilegible: ${err.error}`);
    out.push('');
  }
  const plans = listPlans(main);
  if (plans.length) {
    out.push('## plans', '');
    for (const slug of plans) {
      const p = readPlan({ main, plan: slug });
      if (p.ok) out.push(`- plan ${slug} — etapa ${p.plan.stage}`);
      else {
        out.push(`- plan ${slug} — registro ilegible`);
        errors.push({ file: path.join(stateRoot(main), 'plans', slug, 'plan.json'), error: p.error });
      }
    }
    out.push('');
  }
  return { text: `${out.join('\n').replace(/\n+$/, '')}\n`, errors };
}

function readCurrent(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

// Atómica; `changed: false` si el texto es idéntico (no toca el archivo ni su mtime).
function writeIndex({ main }) {
  const { text, errors } = buildIndex({ main });
  const file = indexFile(main);
  if (readCurrent(file) === text) return { ok: true, file, changed: false, errors };
  writeAtomic(file, text);
  return { ok: true, file, changed: true, errors };
}

// No escribe: { ok: true, file, errors } si INDEX.md coincide; si no, refused 'stale-index'.
function checkIndex({ main }) {
  const { text, errors } = buildIndex({ main });
  const file = indexFile(main);
  const cur = readCurrent(file);
  if (cur === text) return { ok: true, file, changed: false, errors };
  return { ok: false, refused: 'stale-index', reason: cur === null ? `no existe ${file}` : `${file} difiere del estado; regeneralo con scripts/state-index.js`, file, errors };
}

module.exports = { HEADER, INDEX_NAME, indexFile, buildIndex, writeIndex, checkIndex };
