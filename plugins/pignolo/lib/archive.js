'use strict';
// Archivado de entradas de estado (spec §10.4 paso 5; R-11 del hito 6). Nunca borra: mueve
// entradas cerradas de work, decisions e issues a archive/<archivo> (plano: los ids llevan la
// fecha) con git mv si están versionadas y rename si no. learnings/*, plans y sessions no se
// archivan nunca (el filtro de novedad lee rejected/). La edad es `created` (R-1 no tiene fecha
// de cierre). Operación de git en curso en el checkout principal: se niega (F8).
const fs = require('node:fs');
const path = require('node:path');
const { readEntries, moveEntry } = require('./state-store');
const { gitRun, isGitFailure } = require('./git');

const ARCHIVABLE = Object.freeze(['work', 'decisions', 'issues']);
const CLOSED = new Set(['closed', 'decided', 'superseded']);
const DAY_MS = 24 * 60 * 60 * 1000;
const OPERATIONS = [['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase']];

// 'merge' | 'cherry-pick' | 'rebase' | null. Con `git rev-parse --git-path` desde el checkout
// principal (en un worktree enlazado esos archivos viven en .git/worktrees/<n>/, C8). Límite
// declarado: un merge que corre en OTRO worktree enlazado (la cola del hito 7) no se ve acá.
function gitOperationInProgress(main) {
  let out;
  try {
    out = gitRun(['rev-parse', ...OPERATIONS.flatMap(([f]) => ['--git-path', f])], main, { timeout: 5000 });
  } catch (e) {
    if (isGitFailure(e) || e.code === 'ENOENT') return null; // sin git o fuera de un repo
    throw e;
  }
  const lines = out.split(/\r?\n/);
  for (let i = 0; i < OPERATIONS.length; i += 1) {
    const p = lines[i];
    if (p && fs.existsSync(path.resolve(main, p))) return OPERATIONS[i][1];
  }
  return null;
}

// Candidatas y rechazadas una a una. { candidates: [{ kind, id, name, created }], refused: [{ id, reason }] }
function eligible({ main, days = 14, now = Date.now() }) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const candidates = [];
  const refused = [];
  for (const kind of ARCHIVABLE) {
    const r = readEntries({ main, kind });
    for (const err of r.errors) refused.push({ id: path.basename(err.file, '.md'), kind, reason: 'unreadable', detail: err.error });
    for (const e of r.entries) {
      if (!CLOSED.has(e.status)) continue;
      const created = Date.parse(String(e.fields.created || ''));
      if (Number.isNaN(created)) { refused.push({ id: e.id, kind, reason: 'no-created', detail: 'sin created legible en el frontmatter' }); continue; }
      if (t - created > days * DAY_MS) candidates.push({ kind, id: e.id, name: e.name, created: e.fields.created });
    }
  }
  return { candidates, refused };
}

// { ok: true, moved: [{ kind, id, file, how }], refused: [{ id, reason }], dryRun }
function archiveEntries({ main, days = 14, now = Date.now(), dryRun = false }) {
  const { candidates, refused } = eligible({ main, days, now });
  const moved = [];
  for (const c of candidates) {
    if (dryRun) { moved.push({ kind: c.kind, id: c.id, file: path.join(main, '.pignolo', 'state', 'archive', c.name), how: 'dry-run' }); continue; }
    const r = moveEntry({ main, fromKind: c.kind, toKind: 'archive', id: c.id });
    if (!r.ok) { refused.push({ id: c.id, kind: c.kind, reason: r.refused, detail: r.reason }); continue; }
    moved.push({ kind: c.kind, id: c.id, file: r.file, how: r.how });
  }
  return { ok: true, moved, refused, dryRun, days };
}

module.exports = { ARCHIVABLE, gitOperationInProgress, eligible, archiveEntries };
