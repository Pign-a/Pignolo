'use strict';
// Registro del plan (R-5): <main>/.pignolo/state/plans/<plan>/plan.json y scope-card.md.
// Solo lo escribe el hilo principal. Toda función devuelve { ok, ... } y nunca lanza por
// un estado esperado; un registro ilegible es `ok: false` sin `missing` (quien lo consulta
// falla cerrado).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateScopeCard, parseScopeCard } = require('./scope-card');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STAGES = ['spec', 'claims', 'spec-review', 'scope-card', 'plan-written', 'audited', 'executing', 'validating', 'final-review', 'closed'];
const CLAIM_STATUS = ['open', 'corroborated', 'refuted', 'inconclusive', 'hypothesis'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fail = (error, extra) => ({ ok: false, error, ...extra });

function plansRoot(main) { return path.join(main, '.pignolo', 'state', 'plans'); }
function planDir(main, plan) { return path.join(plansRoot(main), plan); }
const planFileOf = (main, plan) => path.join(planDir(main, plan), 'plan.json');
const cardFileOf = (main, plan) => path.join(planDir(main, plan), 'scope-card.md');

function listPlans(main) {
  try {
    return fs.readdirSync(plansRoot(main), { withFileTypes: true }).filter((d) => d.isDirectory() && SLUG_RE.test(d.name)).map((d) => d.name).sort();
  } catch (_) { return []; }
}

// Escritura atómica (temp + rename), como writeRun de scripts/run.js.
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

function validatePlan(p, plan) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'plan.json no es un objeto';
  if (p.v !== 1) return 'v debe ser 1';
  if (p.plan !== plan) return 'plan no coincide con la carpeta';
  if (!STAGES.includes(p.stage)) return `stage inválida: ${p.stage}`;
  if (typeof p.request !== 'string') return 'request debe ser un texto';
  if (!Array.isArray(p.claims)) return 'claims debe ser una lista';
  return null;
}

function readPlan({ main, plan }) {
  if (!SLUG_RE.test(String(plan))) return fail(`slug inválido: ${plan}`, { missing: true });
  const file = planFileOf(main, plan);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return fail(`no existe el plan ${plan}`, { missing: true });
    return fail(`no se pudo leer ${file}: ${e.message}`);
  }
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return fail(`${file} está ilegible: ${e.message}`); }
  const bad = validatePlan(obj, plan);
  if (bad) return fail(`${file} no valida: ${bad}`);
  return { ok: true, plan: obj };
}

function writePlan(main, obj) {
  writeAtomic(planFileOf(main, obj.plan), `${JSON.stringify(obj, null, 2)}\n`);
}

// Lee, aplica `fn(plan)` (que puede devolver { error }) y escribe.
function update({ main, plan }, fn) {
  const r = readPlan({ main, plan });
  if (!r.ok) return r;
  const out = fn(r.plan);
  if (out && out.error) return fail(out.error);
  writePlan(main, r.plan);
  return { ok: true, plan: r.plan, ...(out || {}) };
}

function newPlan({ main, plan, request, spec, now }) {
  if (!SLUG_RE.test(String(plan))) return fail(`el slug del plan debe cumplir ${SLUG_RE}`);
  if (typeof request !== 'string' || !request.trim()) return fail('falta el pedido original (request)');
  if (fs.existsSync(planDir(main, plan))) return fail(`el plan ${plan} exists`);
  const obj = {
    v: 1, plan, created: now || new Date().toISOString(), stage: 'spec', request, spec: spec || '',
    claims: [], scopeCard: {}, tasks: [],
  };
  writePlan(main, obj);
  return { ok: true, plan: obj };
}

function setClaims({ main, plan, claims, noneReason }) {
  return update({ main, plan }, (p) => {
    const list = Array.isArray(claims) ? claims : [];
    if (!list.length && !(typeof noneReason === 'string' && noneReason.trim())) {
      return { error: 'sin afirmaciones hace falta el motivo (noneReason)' };
    }
    const ids = new Set();
    for (const c of list) {
      if (!c || typeof c.id !== 'string' || !c.id || typeof c.text !== 'string' || !c.text) return { error: 'cada afirmación necesita id y text' };
      if (ids.has(c.id)) return { error: `id de afirmación repetido: ${c.id}` };
      ids.add(c.id);
    }
    p.claims = list.map((c) => ({ id: c.id, text: c.text, system: c.system || '', status: 'open', source: '', by: '', note: '', superseded: false }));
    if (list.length) delete p.claimsNone;
    else p.claimsNone = noneReason.trim();
    return null;
  });
}

function resolveClaim({ main, plan, id, status, source, by, note, superseded }) {
  return update({ main, plan }, (p) => {
    if (!CLAIM_STATUS.includes(status) || status === 'open') return { error: `status inválido: ${status}` };
    const c = p.claims.find((x) => x.id === id);
    if (!c) return { error: `no existe la afirmación ${id}` };
    c.status = status;
    if (source !== undefined) c.source = source;
    if (by !== undefined) c.by = by;
    if (note !== undefined) c.note = note;
    c.superseded = Boolean(superseded);
    return null;
  });
}

function claimsOpen(planObj) {
  return (planObj.claims || [])
    .filter((c) => c.status === 'open' || (c.status === 'refuted' && !c.superseded))
    .map((c) => ({ id: c.id, status: c.status }));
}

function saveScopeCard({ main, plan, text }) {
  return update({ main, plan }, (p) => {
    const errs = validateScopeCard(text, { request: p.request });
    if (errs.length) return { error: `la tarjeta no valida: ${errs.join('; ')}`, errors: errs };
    const body = String(text).replace(/\r\n/g, '\n');
    writeAtomic(cardFileOf(main, plan), body);
    p.scopeCard = { sha256: sha256(body), added: parseScopeCard(body).added };
    return null;
  });
}

function scopeCardState({ main, plan }) {
  const r = readPlan({ main, plan });
  if (!r.ok) return 'none';
  const sc = r.plan.scopeCard || {};
  if (!sc.sha256) return 'none';
  let cur;
  try { cur = sha256(fs.readFileSync(cardFileOf(main, plan))); } catch (_) { return 'changed'; }
  if (!sc.approved) return 'draft';
  return sc.approved.sha256 === cur && sc.sha256 === cur ? 'approved' : 'changed';
}

function approveScopeCard({ main, plan, quote, now }) {
  return update({ main, plan }, (p) => {
    if (typeof quote !== 'string' || !quote.trim()) return { error: 'falta la cita literal del humano (quote)' };
    const sc = p.scopeCard || {};
    if (!sc.sha256) return { error: 'no hay tarjeta guardada para aprobar' };
    let body;
    try { body = fs.readFileSync(cardFileOf(main, plan), 'utf8'); } catch (_) { return { error: 'falta scope-card.md; guardala de nuevo' }; }
    const errs = validateScopeCard(body, { request: p.request });
    if (errs.length) return { error: `la tarjeta no valida: ${errs.join('; ')}` };
    const h = sha256(body);
    p.scopeCard = { sha256: h, added: parseScopeCard(body).added, approved: { at: now || new Date().toISOString(), quote: quote.trim(), sha256: h } };
    return null;
  });
}

function recordAudit({ main, plan, audit }) {
  return update({ main, plan }, (p) => { p.audit = audit; return null; });
}

// 'ok' exige veredicto APPROVE, sin incomplete, y el sha256 vigente del plan. Un veredicto
// que no es APPROVE (REQUEST_CHANGES, ESCALATE) cuenta como 'incomplete' (R-5 del informe).
function auditState({ main, plan, planFile }) {
  const r = readPlan({ main, plan });
  if (!r.ok || !r.plan.audit) return 'none';
  const a = r.plan.audit;
  let cur = null;
  try { cur = sha256(fs.readFileSync(planFile)); } catch (_) { /* sin archivo */ }
  if (cur !== a.planSha256) return 'stale';
  if (a.incomplete || a.verdict !== 'APPROVE') return 'incomplete';
  return 'ok';
}

function advance({ main, plan, to, reopen, planFile }) {
  return update({ main, plan }, (p) => {
    const from = STAGES.indexOf(p.stage);
    const target = STAGES.indexOf(to);
    if (target < 0) return { error: `etapa desconocida: ${to}` };
    if (reopen) {
      if (target >= from) return { error: `reopen solo vuelve atrás (la etapa actual es ${p.stage})` };
      p.stage = to;
      if (p.scopeCard) delete p.scopeCard.approved;
      delete p.audit;
      return null;
    }
    if (target <= from) return { error: `la etapa actual es ${p.stage}; volver a ${to} exige --reopen` };
    if (target > from + 1) return { error: `no se puede saltar de ${p.stage} a ${to}; la siguiente es ${STAGES[from + 1]}` };
    if (to === 'claims' && !p.spec) return { error: 'falta la spec registrada' };
    if (to === 'spec-review') {
      if (!p.claims.length && !p.claimsNone) return { error: 'faltan las afirmaciones clave (o el motivo de que no haya)' };
      const open = claimsOpen(p);
      if (open.length) return { error: `afirmaciones sin cerrar: ${open.map((c) => `${c.id} (${c.status})`).join(', ')}` };
    }
    if (to === 'scope-card' && !(p.scopeCard && p.scopeCard.sha256)) return { error: 'no hay tarjeta de alcance guardada' };
    if (to === 'plan-written' && !(planFile && fs.existsSync(planFile))) return { error: 'falta el archivo del plan (--plan-file)' };
    if (to === 'audited') {
      const st = auditState({ main, plan, planFile });
      if (st !== 'ok') return { error: `la auditoría no está vigente y aprobada (estado: ${st})` };
    }
    if (to === 'executing') {
      const st = scopeCardState({ main, plan });
      if (st !== 'approved') return { error: `la tarjeta de alcance no está aprobada (estado: ${st})` };
    }
    p.stage = to;
    return null;
  });
}

// Tareas que no dependen de ninguna A<n> de la tarjeta, en orden, hasta `limit`.
function runnableBeforeApproval(planObj, { limit = 0 } = {}) {
  const card = planObj.scopeCard && planObj.scopeCard.added;
  const ids = new Set((card || []).map((a) => a.id));
  const out = [];
  for (const t of planObj.tasks || []) {
    if (out.length >= limit) break;
    const deps = (t.added || []).some((a) => !card || ids.has(a));
    if (!deps) out.push(t);
  }
  return out;
}

module.exports = {
  STAGES, SLUG_RE, planDir, listPlans, readPlan, newPlan, setClaims, resolveClaim, claimsOpen,
  saveScopeCard, approveScopeCard, scopeCardState, recordAudit, auditState, advance, runnableBeforeApproval,
  writePlan, update, sha256,
};
