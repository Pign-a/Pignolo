'use strict';
// Nombres, tags y validadores de §11.1 (hito 7). Solo funciones puras de texto y rutas.
const path = require('node:path');

const PLAN_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID_RE = PLAN_RE;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NN_RE = /^\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REASON_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function bad(what, v) { return new Error(`nombre inválido: ${what} ${JSON.stringify(v)}`); }

function checkPlan(plan) {
  if (typeof plan !== 'string' || !PLAN_RE.test(plan)) throw bad('plan', plan);
  if (plan === 'daily') throw bad('plan (reservado)', plan);
  return plan;
}
function checkSlug(slug) { if (typeof slug !== 'string' || !SLUG_RE.test(slug)) throw bad('slug', slug); return slug; }
function checkNn(nn) { if (typeof nn !== 'string' || !NN_RE.test(nn)) throw bad('nn', nn); return nn; }
function checkN(n) { if (!Number.isInteger(n) || n < 1) throw bad('n', n); return n; }
function checkDate(d) {
  if (typeof d !== 'string' || !DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw bad('fecha', d);
  return d;
}

const intBranch = (plan) => `int/${checkPlan(plan)}`;
const queueBranch = (plan) => `queue/${checkPlan(plan)}`;
const taskBranch = ({ plan, nn, slug }) => `task/${checkPlan(plan)}/${checkNn(nn)}-${checkSlug(slug)}`;
const dailyBranch = ({ date, slug }) => `task/daily/${checkDate(date)}-${checkSlug(slug)}`;
const contractTag = (plan, n) => `contract/${checkPlan(plan)}/v${checkN(n)}`;
const cpTag = (plan, n) => `cp/${checkPlan(plan)}/${checkN(n)}`;
function backupTag({ date, reason }) {
  if (typeof reason !== 'string' || !REASON_RE.test(reason)) throw bad('motivo', reason);
  return `backup/${checkDate(date)}-${reason}`;
}

function parseBranch(name) {
  const s = String(name);
  let m = /^int\/([^/]+)$/.exec(s);
  if (m && PLAN_RE.test(m[1])) return { kind: 'int', plan: m[1] };
  m = /^queue\/([^/]+)$/.exec(s);
  if (m && PLAN_RE.test(m[1])) return { kind: 'queue', plan: m[1] };
  m = /^task\/daily\/(\d{4}-\d{2}-\d{2})-([^/]+)$/.exec(s);
  if (m && SLUG_RE.test(m[2])) return { kind: 'daily', date: m[1], slug: m[2] };
  m = /^task\/([^/]+)\/(\d{2})-([^/]+)$/.exec(s);
  if (m && PLAN_RE.test(m[1]) && m[1] !== 'daily' && SLUG_RE.test(m[3])) return { kind: 'task', plan: m[1], nn: m[2], slug: m[3] };
  return { kind: 'other' };
}

// Máximo existente + 1 (no la cuenta); otro plan no cuenta.
function nextCp({ refs, plan }) {
  const re = new RegExp(`^(?:refs/tags/)?cp/${checkPlan(plan)}/([0-9]+)$`);
  let max = 0;
  for (const r of refs) { const m = re.exec(r); if (m) max = Math.max(max, Number(m[1])); }
  return max + 1;
}

// Numérico, no alfabético (v10 > v2).
function latestContract({ refs, plan }) {
  const re = new RegExp(`^(?:refs/tags/)?(contract/${checkPlan(plan)}/v([0-9]+))$`);
  let best = null;
  for (const r of refs) {
    const m = re.exec(r);
    if (m && (!best || Number(m[2]) > best.n)) best = { tag: m[1], n: Number(m[2]) };
  }
  return best;
}

const taskWorktreePath = (main, plan, nn, slug) => path.join(main, '.pignolo', 'worktrees', `${checkPlan(plan)}-${checkNn(nn)}-${checkSlug(slug)}`);
// Bajo _queue/: el `_` queda fuera de PLAN_RE, así que nunca choca con una worktree de tarea (A7-12).
const queueWorktreePath = (main, plan) => path.join(main, '.pignolo', 'worktrees', '_queue', checkPlan(plan));

module.exports = {
  PLAN_RE, ID_RE, SLUG_RE, NN_RE,
  intBranch, queueBranch, taskBranch, dailyBranch, contractTag, cpTag, backupTag,
  parseBranch, nextCp, latestContract, taskWorktreePath, queueWorktreePath,
};
