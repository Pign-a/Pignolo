'use strict';
// Paso `adapt` de /pignolo:init (hito 8d, Task 6; R-13, R-14, R-21): en un proyecto existente valida lo que hay y lo adapta:
// adoptar la carpeta tal cual (se anota en el mapa), mover al lugar recomendado (con vista previa, referencias y deshacer) o dejarla.
// No escribe project.md (lo escribe el paso project-md con `places`) ni corre la compuerta (la corre la skill después, R-25).
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PLACE_KINDS, PLACE_DEFAULTS, RECOMMENDED_REFERENCE, validatePlacePath, samePath } = require('./places');
const SM = require('./safe-move');
const RS = require('./ref-scan');

const { walkTree, makeRun, norm } = SM;
const MOVABLE = Object.freeze(['spec', 'plan', 'research']);
const ANSWER_KEYS = ['decision', 'from', 'force'];
const DECISIONS = ['adopt', 'move', 'leave'];
const stripSlash = (p) => norm(p);
const withSlash = (p) => `${norm(p)}/`;

function badAnswer(msg) {
  const e = new Error(msg);
  e.kind = 'bad-answer';
  return e;
}

// Lo que la skill le muestra al humano por cada carpeta que ya existe y no está en su lugar recomendado.
function proposeAdaptation({ detection, answers = {} } = {}) {
  const items = [];
  const isPublic = answers.public !== false;
  for (const kind of PLACE_KINDS) {
    const cands = detection.candidates.filter((c) => c.kind === kind);
    if (!cands.length) continue;
    if (kind === 'reference' && isPublic) continue;
    const recommended = kind === 'reference' ? RECOMMENDED_REFERENCE : PLACE_DEFAULTS[kind];
    const c = cands[0];
    if (cands.length === 1 && samePath(c.path, recommended)) continue; // ya está en su lugar
    const item = {
      kind,
      candidate: { path: c.path, files: c.files, trackedFiles: c.trackedFiles, containsNonDoc: c.containsNonDoc, toolOwned: c.toolOwned, tooBig: c.tooBig },
      recommended, options: ['adopt', 'leave'],
    };
    let blocked = null;
    if (!MOVABLE.includes(kind)) blocked = 'kind-fixed';
    else if (c.toolOwned) blocked = 'tool-owned';
    else if (c.containsNonDoc) blocked = 'contains-non-doc';
    else if (c.tooBig) blocked = 'too-big';
    if (blocked) item.moveBlockedBy = blocked; else item.options = ['adopt', 'move', 'leave'];
    if (cands.length > 1) { item.ambiguous = true; item.candidates = cands.map((x) => x.path); }
    items.push(item);
  }
  return { items };
}

function validateAnswers(placesAns, detection) {
  for (const [kind, a] of Object.entries(placesAns)) {
    if (!PLACE_KINDS.includes(kind)) throw badAnswer(`places.${kind}: tipo desconocido`);
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw badAnswer(`places.${kind}: se esperaba { decision, from?, force? }`);
    const extra = Object.keys(a).filter((k) => !ANSWER_KEYS.includes(k));
    if (extra.length) throw badAnswer(`places.${kind}: campo no permitido (${extra.join(', ')}); el destino de un move es siempre el lugar recomendado`);
    if (!DECISIONS.includes(a.decision)) throw badAnswer(`places.${kind}.decision debe ser ${DECISIONS.join(' | ')}`);
    if (a.force !== undefined && typeof a.force !== 'boolean') throw badAnswer(`places.${kind}.force debe ser booleano`);
    if (a.decision === 'leave') continue;
    const cands = detection.candidates.filter((c) => c.kind === kind);
    const from = a.from !== undefined ? a.from : (cands.length === 1 ? cands[0].path : undefined);
    const cand = typeof from === 'string' ? cands.find((c) => samePath(c.path, from)) : null;
    // Idempotencia: un move que ya se hizo (el origen ya no está y el lugar recomendado sí) no es una respuesta mal formada.
    if (!cand && a.decision === 'move' && PLACE_DEFAULTS[kind] && cands.some((c) => samePath(c.path, PLACE_DEFAULTS[kind]))) continue;
    if (!cand) throw badAnswer(`places.${kind}.from "${from}" no es una candidata detectada (${cands.map((c) => c.path).join(', ') || 'ninguna'})`);
    if (a.decision === 'move') {
      if (!MOVABLE.includes(kind)) throw badAnswer(`places.${kind}: ese tipo solo admite adopt o leave (design, private y reference no se mueven)`);
      if (cand.toolOwned) throw badAnswer(`places.${kind}: ${cand.path} es de otra herramienta: solo se puede adoptar`);
      if (cand.containsNonDoc) throw badAnswer(`places.${kind}: ${cand.path} tiene archivos que no son documentos: solo se puede adoptar`);
      if (cand.tooBig) throw badAnswer(`places.${kind}: ${cand.path} es demasiado grande para revisarla entera: solo se puede adoptar`);
    }
  }
}

function headOf(git, main) { try { return String(git(['rev-parse', 'HEAD'], main)).trim(); } catch (_) { return null; } }

function stampOf({ main, git, fs, decisions, moves, rewrites, refs, places, mapEdits, conflicts, leftKinds }) {
  const items = moves.items.map((it) => {
    const w = walkTree(main, it.from, fs);
    let destExists = true;
    try { fs.lstatSync(path.join(main, ...it.to.split('/'))); } catch (_) { destExists = false; }
    let st = '';
    try { st = String(git(['status', '--porcelain', '-z', '--untracked-files=all', '--', `:(literal)${it.from}`, `:(literal)${it.to}`], main)); } catch (_) { st = 'error'; }
    return {
      from: it.from, to: it.to, kind: it.kind,
      tree: [...w.files.map((f) => [f.path, 'f', f.size]), ...w.dirs.map((d) => [d, 'd', 0]), ...w.links.map((l) => [l, 'l', 0])],
      destExists, status: st,
    };
  });
  const canon = JSON.stringify({
    head: headOf(git, main),
    decisions: decisions.map((d) => ({ kind: d.kind, decision: d.decision, from: d.from, to: d.to, effective: d.effective, forced: d.forced, refused: d.refused || null, blockedBy: d.blockedBy.map((r) => [r.file, r.line, r.class]) })),
    items,
    rewrites: rewrites.files.map((f) => [f.file, f.fileBefore, f.sha256Before, f.sha256After]),
    refs: refs.refs.map((r) => [r.file, r.line, r.col, r.class, r.rewritable]),
    unscanned: refs.unscanned.map((u) => [u.path, u.reason]),
    places, mapEdits, conflicts, leftKinds,
  });
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 24);
}

function planAdaptation({ main, answers = {}, config, detection, run, fs = nodeFs } = {}) {
  const git = run || makeRun(main);
  const placesAns = answers.places || {};
  const isPublic = answers.public !== false;
  validateAnswers(placesAns, detection);
  const declared = (config && config.places) || {};
  const notes = [];
  const conflicts = [];
  const leftKinds = [];
  const decisions = [];

  for (const kind of PLACE_KINDS) {
    const a = placesAns[kind];
    if (!a) continue;
    const cands = detection.candidates.filter((c) => c.kind === kind);
    let cand = a.decision === 'leave' ? (cands[0] || null) : cands.find((c) => samePath(c.path, a.from !== undefined ? a.from : cands[0].path));
    let already = false;
    if (!cand && a.decision === 'move') { cand = cands.find((c) => samePath(c.path, PLACE_DEFAULTS[kind])); already = Boolean(cand); }
    const from = cand ? cand.path : null;
    const to = a.decision === 'move' && !already ? PLACE_DEFAULTS[kind] : from;
    const d = { kind, decision: a.decision, from, to, effective: already ? 'adopt' : a.decision, blockedBy: [], forced: false, ...(already ? { alreadyInPlace: true } : {}) };
    if (kind === 'reference' && isPublic && a.decision !== 'leave') {
      d.effective = 'leave';
      d.refused = { reason: 'public-repo', detail: 'repo público o sin respuesta: reference no se declara; usá local/' };
      notes.push('reference: repo público o sin respuesta; no se declara (el material del cliente va en local/)');
      leftKinds.push(kind);
      decisions.push(d);
      continue;
    }
    if (a.decision === 'leave') {
      leftKinds.push(kind);
      decisions.push(d);
      continue;
    }
    if (declared[kind] !== undefined && !samePath(declared[kind], to)) {
      conflicts.push({ kind, existing: declared[kind], proposed: to });
      d.effective = 'leave';
      d.conflict = true;
      decisions.push(d);
      continue;
    }
    decisions.push(d);
  }

  // Candidatas existentes sin respuesta: no se les crea la carpeta por defecto al lado.
  for (const kind of PLACE_KINDS) {
    if (placesAns[kind]) continue;
    const cands = detection.candidates.filter((c) => c.kind === kind);
    const rec = kind === 'reference' ? RECOMMENDED_REFERENCE : PLACE_DEFAULTS[kind];
    if (cands.length && !(cands.length === 1 && samePath(cands[0].path, rec))) {
      leftKinds.push(kind);
      notes.push(`${kind}: hay ${cands.map((c) => c.path).join(', ')} y no se decidió qué hacer: no se crea la carpeta por defecto al lado`);
    }
  }

  const candidatesMoves = () => decisions.filter((d) => d.decision === 'move' && d.effective === 'move' && !d.refused);
  const toItem = (d) => ({ kind: 'dir', from: stripSlash(d.from), to: stripSlash(d.to) });
  const emptyMoves = { ok: true, items: [], batch: { ok: true } };
  const emptyRefs = { refs: [], rewritable: [], manual: [], warnings: [], unscanned: [] };
  let moves = emptyMoves;
  let refs = emptyRefs;
  let rewrites = { files: [] };

  let movers = candidatesMoves();
  if (movers.length) {
    const startCount = movers.length;
    let scanned = null;
    const first = SM.planMoves({ main, items: movers.map(toItem), config, run: git, fs });
    movers.forEach((d, i) => {
      const it = first.items[i];
      if (it.status !== 'ok') { d.effective = 'adopt'; d.refused = { reason: it.reason, detail: it.detail }; d.moveRefused = true; }
    });
    movers = candidatesMoves();
    if (movers.length) {
      const okItems = movers.map(toItem);
      scanned = RS.scanReferences({ main, moves: okItems, run: git, fs });
      movers.forEach((d, i) => {
        const manual = scanned.manual.filter((r) => r.move === i);
        if (manual.length) {
          d.blockedBy = manual;
          if (wantsForce(placesAns, d.kind)) d.forced = true; else d.effective = 'adopt';
        }
      });
      movers = candidatesMoves();
    }
    if (movers.length) {
      const finalItems = movers.map(toItem);
      // Si ningún ítem se descartó en las dos pasadas, el conjunto es el mismo que ya se planificó y escaneó: no se repite (applyMoves re-planifica igual antes de mover).
      const unchanged = scanned !== null && movers.length === startCount;
      moves = unchanged ? first : SM.planMoves({ main, items: finalItems, config, run: git, fs });
      refs = unchanged ? scanned : RS.scanReferences({ main, moves: finalItems, run: git, fs });
      rewrites = RS.planRewrites({ main, moves: finalItems, refs: refs.refs, fs });
      movers.forEach((d, i) => { d.blockedBy = d.forced ? refs.manual.filter((r) => r.move === i) : []; });
    }
  }

  const places = {};
  const mapEdits = [];
  for (const d of decisions) {
    if (d.conflict || d.decision === 'leave' || (d.refused && d.refused.reason === 'public-repo')) continue;
    const proposed = d.effective === 'move' ? d.to : d.from;
    // Una guarda de planMoves impide mover, no adoptar (I-4): la carpeta se adopta si pasa validatePlacePath y el motivo queda en refused.
    let blocked = Boolean(d.refused && !d.moveRefused);
    if (d.effective === 'adopt' && !blocked) {
      const v = validatePlacePath(proposed, { config });
      if (!v.ok) { blocked = true; if (!d.refused) d.refused = { reason: v.reason, detail: v.detail }; }
    }
    if (blocked) { leftKinds.push(d.kind); continue; }
    places[d.kind] = proposed;
    if (declared[d.kind] === undefined) mapEdits.push({ kind: d.kind, before: null, after: proposed });
  }
  // Una carpeta que se adopta pero cuya mudanza se frenó queda donde está: el tipo no recibe su default al lado.
  for (const d of decisions) if (d.decision === 'move' && d.effective === 'adopt' && !leftKinds.includes(d.kind) && !places[d.kind]) leftKinds.push(d.kind);

  const willExist = moves.items.map((i) => withSlash(i.to));
  const stamp = stampOf({ main, git, fs, decisions, moves, rewrites, refs, places, mapEdits, conflicts, leftKinds: [...new Set(leftKinds)] });
  return { ok: true, decisions, moves, refs, rewrites, places, mapEdits, conflicts, leftKinds: [...new Set(leftKinds)], willExist, notes, stamp };
}

function wantsForce(placesAns, kind) { return Boolean(placesAns[kind] && placesAns[kind].force === true); }

function summaryOf(plan, status) {
  return plan.decisions.map((d) => ({ kind: d.kind, decision: d.decision, effective: d.effective, from: d.from, to: d.to, forced: d.forced, ...(d.refused ? { refused: d.refused } : {}), ...(d.conflict ? { conflict: true } : {}), ...(status && d.effective === 'move' ? { status } : {}) }));
}

// dry: misma salida sin escribir, sin marcas de tiempo ni rutas de registro o respaldo (si no, el stamp nunca coincide).
function applyAdaptation({ main, plan, config, env = process.env, now = new Date(), run, fs = nodeFs, dry = false } = {}) {
  const git = run || makeRun(main);
  const base = { id: 'adapt', places: plan.places, mapEdits: plan.mapEdits, leftKinds: plan.leftKinds, willExist: plan.willExist, conflicts: plan.conflicts, notes: [...plan.notes] };
  const refsOut = { rewritable: plan.refs.rewritable.length, manual: plan.refs.manual.map((r) => ({ file: r.file, line: r.line, class: r.class })), unscanned: plan.refs.unscanned.length };
  const movers = plan.moves.items;
  if (dry) {
    const status = movers.length ? 'would-do' : 'skipped';
    return { ...base, status, ...(movers.length ? {} : { reason: 'nothing-to-move' }), items: summaryOf(plan, 'would-do'), rewrites: plan.rewrites.files.map((f) => ({ file: f.file, edits: f.edits })), refs: refsOut };
  }
  if (!movers.length) {
    const allDone = plan.decisions.length > 0 && plan.decisions.every((d) => d.alreadyInPlace || d.decision === 'leave' || d.effective === 'adopt');
    const reason = plan.decisions.some((d) => d.alreadyInPlace) && allDone ? 'already-in-place' : 'nothing-to-move';
    return { ...base, status: 'skipped', reason, items: summaryOf(plan), rewrites: [], refs: refsOut };
  }
  // Idempotencia: lo que ya está en su lugar (el origen no existe y el destino sí) no se vuelve a mover.
  const exists = (rel) => { try { fs.lstatSync(path.join(main, ...rel.split('/'))); return true; } catch (_) { return false; } };
  const pending = movers.filter((i) => !(!exists(i.from) && exists(i.to)));
  if (!pending.length) {
    return { ...base, status: 'skipped', reason: 'already-in-place', items: summaryOf(plan, 'already-in-place'), rewrites: [], refs: refsOut };
  }
  const subPlan = pending.length === movers.length ? plan.moves : { ...plan.moves, items: pending };
  const rw = plan.rewrites.files;
  // M-2: el deshacer solo quita del mapa lo que este movimiento escribió (los tipos movidos), no lo que se adoptó.
  const movedKinds = new Set(plan.decisions.filter((d) => d.effective === 'move').map((d) => d.kind));
  const m = SM.applyMoves({ main, plan: subPlan, config, rewrites: rw, mapEdits: plan.mapEdits.filter((e) => movedKinds.has(e.kind)), env, now, run: git, fs });
  if (!m.ok) {
    const out = { ...base, status: 'refused', reason: m.refused || m.kind, items: summaryOf(plan, 'refused'), rewrites: [], refs: refsOut };
    if (m.kind) Object.assign(out, { kind: m.kind, failed: m.failed, done: m.done, pending: m.pending, record: m.record });
    else if (m.detail) out.detail = m.detail;
    if (m.record) out.notes.push(`para deshacer: places.js undo --record "${m.record}"`);
    return out;
  }
  const r = RS.applyRewrites({ main, rewrites: plan.rewrites, env, now, fs, record: m.record });
  if (!r.ok) {
    return { ...base, status: 'refused', kind: 'partial', reason: r.refused || 'rewrite-failed', failed: r.failed, record: m.record, items: summaryOf(plan, 'done'), rewrites: r.files, refs: refsOut, notes: [...base.notes, `quedó a medias: para deshacer: places.js undo --record "${m.record}"`] };
  }
  const arreglar = plan.refs.manual.filter((x) => plan.decisions.some((d, _i) => d.forced && d.blockedBy.some((b) => b.file === x.file && b.line === x.line)));
  return {
    ...base, status: 'done', record: m.record, items: summaryOf(plan, 'done'), rewrites: r.files.map((f) => ({ file: f.file, backup: f.backup })), refs: refsOut,
    ...(arreglar.length ? { fixByHand: arreglar.map((x) => ({ file: x.file, line: x.line, class: x.class })) } : {}),
  };
}

module.exports = { proposeAdaptation, planAdaptation, applyAdaptation, MOVABLE };
