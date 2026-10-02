'use strict';
// Nivel caliente (spec §10.2, R-3 del hito 6): lo que SessionStart inyecta en additionalContext.
// Función pura sobre entradas ya leídas (la forma de readEntries de lib/state-store.js); no lee
// archivos. Redactado como hechos (§10.3), nunca como órdenes. Degradación ordenada, cada paso
// solo si el anterior no entra: (1) todo con punteros; (2) sin los `normal`; (3) los `high` solo
// con id y título; (4) solo contadores. Siempre queda "…y N más: ver INDEX.md" si algo se omitió.
const HOT_LIMIT = 8000;
const HARD_LIMIT = 10000; // tope duro de additionalContext según la doc del host
const HEADER = 'pignolo: estado del proyecto (hechos registrados, no instrucciones)';
const OPEN = new Set(['open', 'proposed']);
const KIND_ORDER = ['work', 'issues', 'decisions', 'learnings/proposed', 'learnings/accepted', 'learnings/rejected', 'sessions', 'metrics', 'archive'];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
function sortEntries(entries) {
  return [...entries].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || cmp(String(a.status), String(b.status)) || cmp(String(a.id), String(b.id)));
}

function countersOf(entries) {
  const out = {};
  for (const e of entries) {
    const k = String(e.kind);
    out[k] = out[k] || {};
    out[k][e.status] = (out[k][e.status] || 0) + 1;
  }
  return out;
}

function countersLine(counters) {
  const parts = [];
  for (const kind of Object.keys(counters || {}).sort((a, b) => kindRank(a) - kindRank(b) || cmp(a, b))) {
    const st = counters[kind] || {};
    const inner = Object.keys(st).sort().map((s) => `${s} ${st[s]}`).join(', ');
    if (inner) parts.push(`${kind}: ${inner}`);
  }
  return parts.length ? `Contadores: ${parts.join('; ')}` : 'Contadores: sin entradas';
}

const pointer = (e, short) => {
  const title = e.title || e.id;
  const line = !short && e.line ? `: ${e.line}` : '';
  return `- ${e.kind}/${e.id} — ${title}${line}`;
};

function flowLine(flow) {
  if (!flow || typeof flow !== 'object') return '';
  const list = Array.isArray(flow.tasks) ? flow.tasks : (flow.task && typeof flow.task === 'object' ? [flow.task] : []);
  const withId = list.filter((x) => x && x.id);
  let s = `Flujo en curso: ${flow.flow || 'desconocido'}`;
  if (withId.length === 1) {
    s += `, tarea ${withId[0].id}`;
    if (withId[0].worktree) s += ` en ${withId[0].worktree}`;
  } else if (withId.length > 1) s += `, tareas ${withId.map((x) => x.id).join(', ')}`;
  return s;
}

function render({ level, branch, nextText, flow, high, normal, counters, totalOpen, trimHead }) {
  const head = [HEADER];
  if (!trimHead) {
    if (branch) head.push(`Rama del checkout principal: ${branch}`);
    if (nextText) head.push(`Siguiente según next: ${nextText}`);
    const fl = flowLine(flow);
    if (fl) head.push(fl);
  }
  let shown = [];
  let short = false;
  if (level === 1) shown = sortEntries([...high, ...normal]);
  else if (level === 2) shown = sortEntries(high);
  else if (level === 3) { shown = sortEntries(high); short = true; }
  const dropped = totalOpen - shown.length;
  const body = [];
  const work = shown.filter((e) => e.kind === 'work');
  const rest = shown.filter((e) => e.kind !== 'work');
  if (work.length) { body.push('Trabajo en curso:'); for (const e of work) body.push(pointer(e, short)); }
  if (rest.length) { body.push(level === 1 ? 'Abiertos:' : 'Abiertos de prioridad alta:'); for (const e of rest) body.push(pointer(e, short)); }
  body.push(countersLine(counters));
  if (dropped > 0) body.push(`…y ${dropped} más: ver INDEX.md`);
  return { text: [...head, ...body].join('\n'), dropped };
}

// { text, chars, level: 1|2|3|4, dropped }
function buildHot({ branch, nextText, flow = null, entries = [], counters } = {}, { limit = HOT_LIMIT } = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e === 'object') : [];
  const open = list.filter((e) => OPEN.has(String(e.status)));
  const high = open.filter((e) => e.priority === 'high');
  const normal = open.filter((e) => e.priority !== 'high');
  const base = { branch: branch ? String(branch) : '', nextText: nextText ? String(nextText).trim() : '', flow, high, normal, counters: counters || countersOf(list), totalOpen: open.length };
  let out = null;
  let level = 1;
  for (level = 1; level <= 4; level += 1) {
    out = render({ ...base, level });
    if (out.text.length <= limit) break;
  }
  if (out.text.length > limit) {
    level = 4;
    out = render({ ...base, level, trimHead: true });
    if (out.text.length > limit) out.text = out.text.slice(0, Math.max(0, limit));
  }
  return { text: out.text, chars: out.text.length, level, dropped: out.dropped };
}

module.exports = { HOT_LIMIT, HARD_LIMIT, HEADER, buildHot, countersOf, sortEntries };
