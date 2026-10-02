'use strict';
// Limpieza de ramas y worktrees (spec §11.5, hito 7a; D-7-5, D-7-7). `findCandidates` y `report` son SOLO LECTURA: proponen
// de inmediato las ramas ya unidas a su destino y solo INFORMAN lo demás. `apply` borra la lista que el humano aprobó con un solo
// sí: respaldo de refs una vez, `worktree remove` sin --force y `branch -d`. Nunca `--force`, nunca `-D`, nunca `push`; un `-d`
// rechazado se informa con su motivo y nunca escala. Todo git entra por `opts.run` (ejecutor inyectable, A7-18).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const B = require('./branches');
const { realNorm } = require('./real-path');
const { readRun, taskList } = require('./project');
const { listPlans, readPlan } = require('./plan-state');

const GIT_MS = 60 * 1000;
const LONG_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_PARENT_WINDOW = 20000;

class CleanupError extends Error {
  constructor(kind, message, extra) {
    super(message);
    this.kind = kind;
    Object.assign(this, extra || {});
  }
}

// Ejecutor por defecto (el mismo contrato que el de lib/queue.js: devuelve stdout recortado y LANZA si git sale distinto de 0).
function defaultRun(cwd) {
  return (args, o = {}) => execFileSync('git', args, {
    cwd: o.cwd || cwd, env: o.env || process.env, timeout: o.timeout || GIT_MS, input: o.input, maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8', windowsHide: true, stdio: [o.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  }).trim();
}
const runnerOf = (main, opts) => (opts && opts.run) || defaultRun(main);
const tryRun = (git, args, o) => { try { return git(args, o); } catch (_) { return null; } };
const errText = (e) => `${e.stderr || ''}${e.stdout || ''}`.trim() || e.message;
const norm = realNorm; // real y sin mayúsculas en Windows: git informa rutas reales (I7)
const realOrNull = (p) => { try { return fs.realpathSync(p); } catch (_) { return null; } };
const inside = (p, root) => {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function listWorktrees(git) {
  const out = tryRun(git, ['worktree', 'list', '--porcelain']) || '';
  const items = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const rec = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^(\w+)(?: (.*))?$/.exec(line);
      if (m) rec[m[1]] = m[2] === undefined ? true : m[2];
    }
    if (rec.worktree) items.push(rec);
  }
  return items;
}

// La rama por defecto: refs/remotes/origin/HEAD, si no main, si no master (la que exista como rama local).
function defaultBranchOf(git) {
  const head = tryRun(git, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const cands = [];
  if (head) cands.push(head.replace(/^origin\//, ''));
  cands.push('main', 'master');
  for (const c of cands) if (tryRun(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${c}^{commit}`])) return c;
  return null;
}

// El destino de cada rama (R-14): task/<p>/… y queue/<p> -> int/<p>; int/<p> -> `origin` de plan.json o la rama por defecto;
// task/daily/* -> la rama por defecto. Sin destino conocido, la rama no es candidata.
function makeTargetOf({ main, git, light = false }) {
  const dflt = defaultBranchOf(git);
  const plans = new Map();
  const planOf = (p) => {
    if (!plans.has(p)) {
      let r;
      try { r = readPlan({ main, plan: p, git: !light }); } catch (e) { r = { ok: false, error: e.message }; }
      plans.set(p, r);
    }
    return plans.get(p);
  };
  const targetOf = (name) => {
    const p = B.parseBranch(name);
    if (p.kind === 'task' || p.kind === 'queue') return B.intBranch(p.plan);
    if (p.kind === 'daily') return dflt;
    if (p.kind === 'int') { const r = planOf(p.plan); return (r.ok && r.plan.origin) || dflt; }
    return null;
  };
  return { targetOf, planOf, defaultBranch: dflt };
}
function targetOf(name, { main, opts } = {}) {
  return makeTargetOf({ main, git: runnerOf(main, opts) }).targetOf(name);
}

// Estado de una worktree: archivos con cambios y archivos ignorados (salvo node_modules/, que `worktree remove` borra sin riesgo).
function statusOf(git, wt) {
  const out = tryRun(git, ['status', '--porcelain', '--ignored'], { cwd: wt });
  if (out === null) return { ok: false, dirty: [], ignored: [] };
  const dirty = [];
  const ignored = [];
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const file = line.slice(3).replace(/^"|"$/g, '');
    if (line.startsWith('!! ')) { if (!/^node_modules\/?$/.test(file)) ignored.push(file); } else dirty.push(file);
  }
  return { ok: true, dirty, ignored };
}

// `opts.light` (el aviso de SessionStart, I8): sin git propio fuera del ejecutor con presupuesto (los planes se leen del disco)
// y sin el estado de las worktrees de ramas ya unidas (se cuentan como candidatas; el reporte completo las revisa).
function findCandidates({ main, now = Date.now(), days = 7, opts } = {}) {
  const git = runnerOf(main, opts);
  const light = Boolean(opts && opts.light);
  const wtRoot = path.join(main, '.pignolo', 'worktrees');
  const res = { merged: [], informed: [], unmerged: [], dirtyWorktrees: [] };

  const current = tryRun(git, ['symbolic-ref', '--short', 'HEAD']);
  const rows = (tryRun(git, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(committerdate:unix)', 'refs/heads']) || '')
    .split(/\r?\n/).filter(Boolean).map((l) => {
      const [ref, sha, date] = l.split('\t');
      return { name: ref.replace(/^refs\/heads\//, ''), sha, last: Number(date) * 1000 };
    });
  // Sin ramas candidatas ni worktrees de pignolo no hay nada que mirar (SessionStart paga esto en cada sesión).
  if (!rows.some((r) => B.parseBranch(r.name).kind !== 'other') && !fs.existsSync(wtRoot)) return res;
  const byLower = new Map();
  for (const r of rows) byLower.set(r.name.toLowerCase(), (byLower.get(r.name.toLowerCase()) || 0) + 1);

  const { targetOf: tgt, planOf } = makeTargetOf({ main, git, light });
  const origins = new Set();
  for (const p of listPlans(main, { git: !light })) { const r = planOf(p); if (r.ok && r.plan.origin) origins.add(r.plan.origin); }

  const wts = listWorktrees(git);
  const wtByBranch = new Map();
  for (const w of wts) if (typeof w.branch === 'string') wtByBranch.set(w.branch.replace(/^refs\/heads\//, ''), w);

  const run = readRun(main);
  const live = { branches: new Set(), paths: new Set() };
  if (run.run) for (const t of taskList(run.run)) { if (t.branch) live.branches.add(t.branch); live.paths.add(norm(t.worktree)); }
  const lockOf = (plan) => fs.existsSync(path.join(main, '.pignolo', 'tmp', 'queue', `${plan}.lock`));

  const mergedCache = new Map();
  const mergedInto = (target) => {
    if (!mergedCache.has(target)) {
      const out = tryRun(git, ['for-each-ref', '--merged', `refs/heads/${target}`, '--format=%(refname)', 'refs/heads']);
      mergedCache.set(target, new Set((out || '').split(/\r?\n/).filter(Boolean).map((r) => r.replace(/^refs\/heads\//, ''))));
    }
    return mergedCache.get(target);
  };
  // Las ramas contenidas en HEAD, con UN for-each-ref (no un merge-base --is-ancestor por rama, I8).
  let headMerged = null;
  const inHead = (name) => {
    if (headMerged === null) {
      const out = tryRun(git, ['for-each-ref', '--merged', 'HEAD', '--format=%(refname)', 'refs/heads']);
      headMerged = new Set((out || '').split(String.fromCharCode(10)).map((r) => r.trim().replace('refs/heads/', '')).filter(Boolean));
    }
    return headMerged.has(name);
  };
  const secondCache = new Map();
  const secondParents = (target) => {
    if (!secondCache.has(target)) {
      const out = tryRun(git, ['rev-list', '--first-parent', '--merges', '--parents', '-n', String(SECOND_PARENT_WINDOW), `refs/heads/${target}`]) || '';
      const set = new Set();
      for (const l of out.split(/\r?\n/).filter(Boolean)) for (const p of l.split(' ').slice(2)) set.add(p);
      secondCache.set(target, set);
    }
    return secondCache.get(target);
  };
  const tipOf = (name) => (rows.find((r) => r.name === name) || {}).sha;
  const statusCache = new Map();
  const wtStatus = (w) => {
    const k = norm(w.worktree);
    if (!statusCache.has(k)) statusCache.set(k, statusOf(git, w.worktree));
    return statusCache.get(k);
  };

  // Worktrees de .pignolo/worktrees/ con cambios o sin poder tocarse (informadas aunque su rama no sea candidata).
  const rootReal = realOrNull(wtRoot);
  for (const w of wts) {
    const rel = path.relative(norm(wtRoot), norm(w.worktree));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (w.prunable !== undefined || w.locked !== undefined) {
      res.informed.push({ name: w.branch ? String(w.branch).replace(/^refs\/heads\//, '') : null, kind: 'worktree', why: w.prunable !== undefined ? 'prunable' : 'locked', path: path.resolve(w.worktree) });
      continue;
    }
    if (light && w.branch) {
      const bn = String(w.branch).replace('refs/heads/', '');
      const tg = B.parseBranch(bn).kind !== 'other' ? tgt(bn) : null;
      if (tg && mergedInto(tg).has(bn)) continue; // candidata ya unida: no se mira su estado aquí
    }
    const s = wtStatus(w);
    if (s.ok && s.dirty.length) res.dirtyWorktrees.push({ path: path.resolve(w.worktree), dirty: true, ignored: s.ignored });
  }

  // Nombres que difieren solo en mayúsculas (D-7-7, T5b): en Windows, con refs empaquetadas, `branch -d` de uno borra los commits
  // del otro. Ninguno del grupo se propone, aunque solo uno sea candidato: se informan todos.
  const groupHasCandidate = new Map();
  for (const r of rows) {
    const k = r.name.toLowerCase();
    groupHasCandidate.set(k, groupHasCandidate.get(k) || B.parseBranch(r.name).kind !== 'other');
  }
  for (const r of rows) {
    const parsed = B.parseBranch(r.name);
    if (byLower.get(r.name.toLowerCase()) > 1) {
      if (groupHasCandidate.get(r.name.toLowerCase())) res.informed.push({ name: r.name, kind: parsed.kind, why: 'case-collision' });
      continue;
    }
    if (parsed.kind === 'other') continue;
    if (r.name === current || origins.has(r.name)) continue;
    const target = tgt(r.name);
    if (!target || !tipOf(target)) continue;
    const w = wtByBranch.get(r.name) || null;
    // Lo vivo no se propone (A7-15).
    if (live.branches.has(r.name) || (w && live.paths.has(norm(w.worktree)))) continue;
    if (mergedInto(target).has(r.name)) {
      if (parsed.plan) {
        const pr = planOf(parsed.plan);
        if (!(pr.ok && pr.plan.stage === 'closed')) continue; // plan abierto, ilegible o ausente: falla cerrado
        if (parsed.kind === 'queue' && lockOf(parsed.plan)) continue;
      }
      if ((parsed.kind === 'task' || parsed.kind === 'daily') && !secondParents(target).has(r.sha)) continue; // recién creada: "ya unida" por no tener commits
      if (parsed.kind === 'daily' && r.sha === tipOf(target)) continue;
      if (w) {
        if (w.locked !== undefined) { res.informed.push({ name: r.name, kind: parsed.kind, why: 'locked', path: path.resolve(w.worktree) }); continue; }
        if (w.prunable !== undefined) { res.informed.push({ name: r.name, kind: parsed.kind, why: 'prunable', path: path.resolve(w.worktree) }); continue; }
        const real = realOrNull(w.worktree);
        if (!real || !rootReal || !inside(real, rootReal)) { res.informed.push({ name: r.name, kind: parsed.kind, why: 'worktree-outside', path: path.resolve(w.worktree) }); continue; }
        const s = light ? { ok: true, dirty: [], ignored: [] } : wtStatus(w);
        if (!s.ok || s.dirty.length) continue; // ya figura en dirtyWorktrees
        if (s.ignored.length) { res.informed.push({ name: r.name, kind: parsed.kind, why: 'ignored-files', ignored: s.ignored, path: path.resolve(w.worktree) }); continue; }
      }
      if (!inHead(r.name)) {
        res.informed.push({ name: r.name, kind: parsed.kind, why: 'not-in-head', target });
        continue;
      }
      const item = { name: r.name, kind: parsed.kind, target, sha: r.sha, lastCommit: new Date(r.last).toISOString() };
      if (w) item.worktree = path.resolve(w.worktree);
      res.merged.push(item);
    } else if (parsed.kind !== 'int') {
      let activity = r.last;
      if (w) {
        const s = wtStatus(w);
        for (const f of s.dirty) { try { activity = Math.max(activity, fs.statSync(path.join(w.worktree, f)).mtimeMs); } catch (_) { /* ya no está */ } }
      }
      const ageDays = Math.floor((now - activity) / DAY_MS);
      if (now - activity > days * DAY_MS) res.unmerged.push({ name: r.name, kind: parsed.kind, lastCommit: new Date(r.last).toISOString(), ageDays });
    }
  }
  return res;
}

const lineOf = (m) => `${m.name} ${m.sha} ${m.target}`;
const proposalIdOf = (items) => crypto.createHash('sha1').update(items.map(lineOf).sort().join('\n')).digest('hex').slice(0, 16);

function report({ main, now, days, opts } = {}) {
  const c = findCandidates({ main, now, days, opts });
  const items = c.merged;
  const lines = [];
  if (items.length) {
    lines.push(`Ramas ya unidas a su destino (se quitarían con un solo sí; id ${proposalIdOf(items)}):`);
    for (const m of items) lines.push(`  - ${m.name}${m.worktree ? ` (y su worktree ${m.worktree})` : ''}: unida a ${m.target}`);
  } else lines.push('No hay ramas ya unidas para limpiar.');
  const info = [...c.informed.map((i) => `  - ${i.name || i.path}: ${i.why}${i.ignored ? ` (${i.ignored.join(', ')})` : ''}`),
    ...c.unmerged.map((u) => `  - ${u.name}: sin unir, ${u.ageDays} días sin actividad`),
    ...c.dirtyWorktrees.map((d) => `  - ${d.path}: worktree con cambios sin commitear`)];
  if (info.length) lines.push('Solo informadas (no se proponen ni se tocan):', ...info);
  return { ...c, proposal: { id: proposalIdOf(items), items }, text: lines.join('\n') };
}

// Aplica una lista de ítems. Cada uno se recomprueba contra una lectura FRESCA (un ítem forjado o ya cambiado no pasa);
// respaldo de refs una vez antes del primero; por rama: worktree remove sin --force y branch -d.
function applyItems({ main, items, env = process.env, now, opts = {} }) {
  const git = runnerOf(main, opts);
  const fresh = findCandidates({ main, now, opts });
  const okByName = new Map(fresh.merged.map((m) => [m.name, m]));
  const why = (it) => {
    const i = fresh.informed.find((x) => x.name === it.name);
    if (i) return i.why;
    return it.worktree && fresh.dirtyWorktrees.some((d) => norm(d.path) === norm(it.worktree)) ? 'dirty-worktree' : 'not-proposed';
  };
  const result = { removed: [], refused: [], notAttempted: [] };
  const todo = [];
  for (const it of items) {
    const f = okByName.get(it.name);
    if (!f || f.sha !== it.sha) result.refused.push({ branch: it.name, why: f ? 'moved' : why(it) });
    else todo.push(f);
  }
  if (!todo.length) return result;

  let backup;
  try { backup = (opts.backupRefs || require('./git-backup').backupRefs)({ cwd: main, env }); } catch (e) {
    throw new CleanupError('backup-failed', `no se pudo respaldar las refs antes de borrar (${e.message}); no se tocó nada. Alternativa: revisá el repo y repetí`);
  }
  if (backup === null || backup === undefined) throw new CleanupError('backup-failed', 'el respaldo de refs no se hizo (fuera de un repo o git no disponible); no se tocó nada. Alternativa: revisá el repo y repetí');

  const rootReal = realOrNull(path.join(main, '.pignolo', 'worktrees'));
  for (let i = 0; i < todo.length; i += 1) {
    const f = todo[i];
    if (typeof opts.beforeDelete === 'function') opts.beforeDelete(f);
    if (tryRun(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${f.name}^{commit}`]) !== f.sha) { result.refused.push({ branch: f.name, why: 'moved' }); continue; }
    if (f.worktree) {
      const real = realOrNull(f.worktree);
      if (!real || !rootReal || !inside(real, rootReal)) { result.refused.push({ branch: f.name, why: 'worktree-outside' }); continue; }
      // `worktree remove` sin --force no se niega por un ignorado: se recomprueba aquí, por rama, justo antes (I4, A7-14).
      // Lo sucio (sin seguimiento o modificado) lo sigue rechazando git mismo.
      const again = statusOf(git, f.worktree);
      if (!again.ok || again.ignored.length) { result.refused.push({ branch: f.name, why: again.ok ? 'ignored-files' : 'worktree-status-failed' }); continue; }
      try {
        git(['worktree', 'remove', f.worktree], { timeout: LONG_MS });
      } catch (e) {
        if (e.status === 128) { result.refused.push({ branch: f.name, why: errText(e) }); continue; } // git se negó sin tocar nada
        // Cualquier otra salida (255 en Windows con un proceso vivo adentro) pudo borrar los archivos y desregistrar la worktree.
        const state = (tryRun(git, ['worktree', 'list', '--porcelain']) || '').split(/\r?\n\r?\n/).find((b) => norm((/^worktree (.*)$/m.exec(b) || [])[1] || '.') === norm(f.worktree)) || null;
        throw new CleanupError('partial-remove', `worktree remove salió ${e.status} en ${f.worktree}: pudo haber borrado archivos y desregistrado la worktree (estado: ${state ? state.replace(/\r?\n/g, ' | ') : 'ya no figura en git worktree list'}). No se borra su rama y se corta el lote. Alternativa: revisá la ruta a mano`, {
          exit: 3, path: f.worktree, worktreeState: state, branch: f.name, removed: result.removed, refused: result.refused, notAttempted: todo.slice(i + 1).map((x) => x.name),
        });
      }
    }
    try {
      git(['branch', '-d', f.name], { timeout: LONG_MS });
      result.removed.push(f.worktree ? { branch: f.name, worktree: f.worktree } : { branch: f.name });
    } catch (e) {
      result.refused.push({ branch: f.name, why: errText(e) }); // nunca -D ni otro flag
    }
  }
  return result;
}

function apply({ main, proposalId, env = process.env, now, opts = {} } = {}) {
  if (!proposalId) throw new CleanupError('usage', 'apply necesita --proposal <id> (el que dio `cleanup.js report`)', { exit: 2 });
  const cur = report({ main, now, opts });
  if (cur.proposal.id !== proposalId) return { removed: [], refused: [{ branch: null, why: 'stale-proposal' }], notAttempted: [], stale: true };
  return applyItems({ main, items: cur.proposal.items, env, now, opts });
}

// Aviso de SessionStart: una línea solo si hay algo; presupuesto propio y, al vencer o ante cualquier error, silencio
// (nunca un aviso a medias).
function noticeLine({ main, now, budgetMs = 1500, opts = {} } = {}) {
  const started = Date.now();
  const inner = runnerOf(main, opts);
  const guarded = (args, o = {}) => {
    const left = budgetMs - (Date.now() - started);
    if (left <= 0) throw new Error('presupuesto agotado');
    return inner(args, { ...o, timeout: Math.min(o.timeout || GIT_MS, left) });
  };
  try {
    const c = findCandidates({ main, now, opts: { ...opts, run: guarded, light: true } });
    if (Date.now() - started > budgetMs) return '';
    const n = c.merged.length;
    const m = c.unmerged.length;
    const k = c.dirtyWorktrees.length;
    if (n + m + k === 0) return '';
    return `${n} ramas ya unidas para limpiar, ${m} sin unir de más de 7 días (solo informadas) y ${k} worktrees con cambios; /pignolo:cleanup las lista`;
  } catch (_) { return ''; }
}

module.exports = { CleanupError, defaultRun, runnerOf, targetOf, findCandidates, report, proposalIdOf, apply, applyItems, noticeLine };
