#!/usr/bin/env node
'use strict';
// El mapa de lugares del proyecto (hito 8d, Task 7; R-16 a R-20): where | report | fix preview|apply | undo.
// Lo opera solo el hilo principal (la regla pignolo-init de la guardia niega a todo subagente ejecutar este script).
// JSON por stdout; exit 0 ok, 1 fallo con `kind` (y `Alternativa:` en stderr), 2 uso incorrecto,
// 3 no se pudo dejar el estado consistente (movimiento a medias). `report` sale siempre 0 con el repo legible.
// Nunca commit, add ni push. Todo movimiento usa lib/safe-move.js (un git mv por ítem, registro write-ahead, deshacer).
// Uso: node places.js where <tipo> [--cwd <dir>] | report [--cwd]
//      | fix preview [--cwd] | fix apply --moves <archivo> --expect <stamp> [--cwd] | undo --record <moves.json> [--cwd]
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { mainRoot } = require('../lib/disabled');
const { isRepo } = require('../lib/git');
const { pignoloHome } = require('../lib/home');
const { readProjectConfig } = require('../lib/project-config');
const { PLACE_KINDS, PLACE_DEFAULTS, resolvePlaces, placeFor } = require('../lib/places');
const { detectPlaces, findStray } = require('../lib/places-detect');
const SM = require('../lib/safe-move');
const RS = require('../lib/ref-scan');

class Usage extends Error {}
class Fail extends Error {
  constructor(kind, message, alt, code = 1, extra = {}) { super(message); this.kind = kind; this.alt = alt; this.code = code; this.extra = extra; }
}

const VERBS = {
  where: { positional: 1, value: ['cwd'] },
  report: { positional: 0, value: ['cwd'] },
  'fix preview': { positional: 0, value: ['cwd'] },
  'fix apply': { positional: 0, value: ['cwd', 'moves', 'expect'] },
  undo: { positional: 0, value: ['cwd', 'record'] },
};

function parse(argv) {
  let verb = argv[0];
  let rest = argv.slice(1);
  if (verb === 'fix') { verb = `fix ${rest[0] || ''}`.trim(); rest = rest.slice(1); }
  const spec = VERBS[verb];
  if (!spec) throw new Usage('uso: places.js where <tipo> | report | fix preview | fix apply --moves <archivo> --expect <stamp> | undo --record <moves.json> [--cwd <dir>]');
  const o = { verb, args: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('--')) { o.args.push(a); continue; }
    const name = a.slice(2);
    if (!spec.value.includes(name)) throw new Usage(`opción desconocida para ${verb}: ${a}`);
    i += 1;
    if (rest[i] === undefined) throw new Usage(`${a} necesita un valor`);
    o[name] = rest[i];
  }
  if (o.args.length !== spec.positional) throw new Usage(spec.positional ? `${verb} necesita <tipo> (${PLACE_KINDS.join(', ')})` : `argumento inesperado: ${o.args[0]}`);
  if (verb === 'fix apply' && !o.moves) throw new Usage('fix apply necesita --moves <archivo>');
  if (verb === 'fix apply' && !o.expect) throw new Usage('fix apply necesita --expect <stamp> (el que dio fix preview)');
  if (verb === 'undo' && !o.record) throw new Usage('undo necesita --record <moves.json>');
  return o;
}

function resolveMain(cwd, deps) {
  const main = mainRoot(cwd);
  let inRepo = false;
  try { inRepo = deps.run ? deps.run(['rev-parse', '--is-inside-work-tree'], main).toString().trim() === 'true' : isRepo(main); } catch (_) { inRepo = false; }
  if (!inRepo) throw new Fail('not-a-repo', `${main} no es un repositorio git`, 'corré el comando dentro de un repo de git (o `git init` primero)');
  return main;
}

function readConfig(main, { strict }) {
  try { return { config: readProjectConfig({ root: main }), error: null }; } catch (e) {
    if (strict) throw new Fail('invalid-config', e.message, 'corregí .pignolo/project.md (o restaurá el respaldo de PIGNOLO_HOME/init-backup) y repetí; no se adivina el lugar por defecto');
    return { config: {}, error: e.message };
  }
}

const exists = (fs, main, rel) => { try { fs.lstatSync(path.join(main, ...SM.norm(rel).split('/'))); return true; } catch (_) { return false; } };

// ---------------------------------------------------------------- where

function where({ main, kind, deps }) {
  const fs = deps.fs || nodeFs;
  if (!PLACE_KINDS.includes(kind)) throw new Usage(`tipo desconocido: ${kind} (${PLACE_KINDS.join(', ')})`);
  const { config } = readConfig(main, { strict: true });
  const { warnings } = resolvePlaces(config);
  const p = placeFor(config, kind);
  if (p.path === null) {
    return { body: { ok: true, kind, path: null, source: p.source, declared: false, exists: false, warnings: [...warnings, `${kind} no tiene lugar por defecto: se declara en .pignolo/project.md (places) o se usa local/`] }, code: 0 };
  }
  const g = SM.isLinkOrOutside(main, p.path, fs);
  if (g.bad) throw new Fail(g.reason, `${p.path} ${g.reason === 'link-in-path' ? `pasa por un enlace (${g.at})` : 'cae fuera del proyecto'}`, 'corregí places en .pignolo/project.md o quitá el enlace');
  return { body: { ok: true, kind, path: p.path, source: p.source, declared: p.source === 'declared', exists: exists(fs, main, p.path), warnings }, code: 0 };
}

// ---------------------------------------------------------------- report

function report({ main, deps }) {
  const fs = deps.fs || nodeFs;
  const { config, error } = readConfig(main, { strict: false });
  const { places, warnings } = resolvePlaces(config);
  if (error) warnings.push(`project.md inválido: ${error}`);
  const git = deps.run;
  const detection = detectPlaces({ root: main, run: git, fs });
  const s = findStray({ root: main, run: git, fs, config });
  const list = PLACE_KINDS.filter((k) => places[k].path).map((k) => ({ kind: k, path: places[k].path, source: places[k].source, exists: exists(fs, main, places[k].path) }));
  const missing = list.filter((p) => p.source === 'declared' && !p.exists).map((p) => p.kind);
  const left = [...new Set(detection.candidates.filter((c) => places[c.kind].source !== 'declared' && c.path !== (PLACE_DEFAULTS[c.kind] || '')).map((c) => c.kind))];
  // Solo los sueltos de gravedad alta y los mal ubicados cuentan (un Makefile sin versionar es info y nunca se mueve).
  const n = s.stray.filter((x) => x.severity === 'high').length + s.misplaced.length;
  const summary = n === 0 ? '' : `${n} archivos sueltos o mal ubicados: corré \`places.js report\` para verlos y moverlos`;
  return { body: { ok: true, places: list, missing, left, stray: s.stray, misplaced: s.misplaced, caseCollisions: detection.caseCollisions, warnings, summary, lines: summary ? 1 : 0 }, code: 0 };
}

// ---------------------------------------------------------------- fix

function headOf(git, main) { try { return String(git(['rev-parse', 'HEAD'], main)).trim(); } catch (_) { return null; } }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function buildFix({ main, config, deps }) {
  const fs = deps.fs || nodeFs;
  const git = deps.run || SM.makeRun(main);
  const s = findStray({ root: main, run: git, fs, config });
  const fixable = s.misplaced.filter((m) => m.suggest);
  const wanted = fixable.map((m) => ({ kind: 'file', from: m.suggest.from, to: m.suggest.to }));
  const moves = wanted.length ? SM.planMoves({ main, items: wanted, config, run: git, fs }) : { ok: true, items: [], batch: { ok: true } };
  const okItems = moves.items.filter((i) => i.status === 'ok').map((i) => ({ kind: i.kind, from: i.from, to: i.to }));
  const refs = okItems.length ? RS.scanReferences({ main, moves: okItems, run: git, fs }) : { refs: [], rewritable: [], manual: [], warnings: [], unscanned: [] };
  const rewrites = okItems.length ? RS.planRewrites({ main, moves: okItems, refs: refs.refs, fs }) : { files: [] };
  const items = moves.items.map((i) => {
    const idx = okItems.findIndex((o) => o.from === i.from);
    const blockedBy = idx >= 0 ? refs.manual.filter((r) => r.move === idx).map((r) => ({ file: r.file, line: r.line, class: r.class })) : [];
    return { from: i.from, to: i.to, kind: i.kind, status: i.status === 'ok' && blockedBy.length ? 'blocked' : i.status, ...(i.reason ? { reason: i.reason, detail: i.detail } : {}), ...(blockedBy.length ? { blockedBy } : {}) };
  });
  const hashes = moves.items.map((i) => { try { return [i.from, sha(fs.readFileSync(path.join(main, ...i.from.split('/'))))]; } catch (_) { return [i.from, null]; } });
  const stamp = crypto.createHash('sha256').update(JSON.stringify({
    head: headOf(git, main), items, hashes, tracked: moves.items.map((i) => i.tracked), rewrites: rewrites.files.map((f) => [f.file, f.sha256Before, f.sha256After]), stray: s.stray.map((x) => x.path),
  })).digest('hex').slice(0, 24);
  return { stray: s.stray, misplaced: s.misplaced, items, moves, refs, rewrites, stamp, git, fs };
}

function fixPreview({ main, deps }) {
  const { config } = readConfig(main, { strict: false });
  const b = buildFix({ main, config, deps });
  return { body: { ok: true, items: b.items, moves: { ok: b.moves.ok, batch: b.moves.batch }, refs: { rewritable: b.refs.rewritable.length, manual: b.refs.manual.map((r) => ({ file: r.file, line: r.line, class: r.class })), unscanned: b.refs.unscanned.length }, rewrites: b.rewrites.files.map((f) => ({ file: f.file, edits: f.edits })), stamp: b.stamp }, code: 0 };
}

function fixApply({ main, o, deps }) {
  const fs = deps.fs || nodeFs;
  let approval;
  try { approval = JSON.parse(fs.readFileSync(o.moves, 'utf8')); } catch (e) { throw new Usage(`no se pudo leer ${o.moves}: ${e.message}`); }
  if (!approval || approval.v !== 1 || !Array.isArray(approval.approved) || !approval.approved.every((x) => typeof x === 'string')) throw new Usage('--moves debe ser { v: 1, approved: [<ruta>...] }');
  const { config } = readConfig(main, { strict: false });
  const b = buildFix({ main, config, deps });
  if (b.stamp !== o.expect) throw new Fail('stale-preview', 'el repo cambió desde la vista previa: no se movió nada', 'volvé a correr `places.js fix preview`, mostrale el resultado nuevo al humano y repetí apply con el stamp nuevo');
  const known = new Map(b.items.map((i) => [i.from, i]));
  const refusedOnes = [];
  const chosen = [];
  for (const rel of approval.approved.map(SM.norm)) {
    const it = known.get(rel);
    if (it) { if (it.status === 'ok') chosen.push({ kind: it.kind, from: it.from, to: it.to }); else refusedOnes.push({ from: rel, status: 'refused', reason: it.reason || it.status, ...(it.blockedBy ? { blockedBy: it.blockedBy } : {}) }); continue; }
    const taken = b.misplaced.find((x) => x.path === rel && x.reason);
    if (taken) { refusedOnes.push({ from: rel, status: 'refused', reason: taken.reason }); continue; }
    if (b.stray.some((x) => x.path === rel)) { refusedOnes.push({ from: rel, status: 'refused', reason: 'stray-never-moves' }); continue; }
    if (SM.nonDocFile(rel)) { refusedOnes.push({ from: rel, status: 'refused', reason: 'contains-non-doc' }); continue; }
    throw new Usage(`${rel} no está en la vista previa: no se puede aprobar un movimiento que no se mostró`);
  }
  if (!chosen.length) return { body: { ok: true, items: refusedOnes, rewrites: [], notes: ['no había ítems aprobados que mover'] }, code: 0 };
  const plan = SM.planMoves({ main, items: chosen, config, run: b.git, fs });
  const okItems = plan.items.filter((i) => i.status === 'ok');
  const refs = RS.scanReferences({ main, moves: okItems, run: b.git, fs });
  const rewrites = RS.planRewrites({ main, moves: okItems, refs: refs.refs, fs });
  const finalPlan = okItems.length === plan.items.length ? plan : SM.planMoves({ main, items: okItems, config, run: b.git, fs });
  for (const i of plan.items.filter((x) => x.status !== 'ok')) refusedOnes.push({ from: i.from, status: 'refused', reason: i.reason, detail: i.detail });
  if (!okItems.length) return { body: { ok: true, items: refusedOnes, rewrites: [], notes: ['ningún ítem pasó las guardas'] }, code: 0 };
  const m = SM.applyMoves({ main, plan: finalPlan, config, rewrites: rewrites.files, mapEdits: [], run: b.git, fs });
  if (!m.ok) {
    if (m.kind) throw new Fail(m.kind, `movimiento ${m.kind === 'partial' ? 'a medias' : 'fallido'}: ${m.failed.error}`, `places.js undo --record "${m.record}"`, m.kind === 'partial' ? 3 : 1, { failed: m.failed, done: m.done, pending: m.pending, record: m.record });
    throw new Fail('refused', `${m.refused}${m.detail ? `: ${m.detail}` : ''}`, 'revisá la causa y repetí `places.js fix preview`');
  }
  const r = RS.applyRewrites({ main, rewrites: rewrites, record: m.record, fs });
  if (!r.ok) throw new Fail('partial', `reescritura fallida: ${r.failed.error}`, `places.js undo --record "${m.record}"`, 3, { failed: r.failed, record: m.record });
  const done = m.items.map((i) => ({ from: i.from, to: i.to, status: 'done' }));
  return { body: { ok: true, record: m.record, items: [...done, ...refusedOnes], rewrites: r.files.map((f) => ({ file: f.file, backup: f.backup })), notes: [`para deshacer: places.js undo --record "${m.record}"`] }, code: 0 };
}

// ---------------------------------------------------------------- undo

function undo({ main, o, deps }) {
  const fs = deps.fs || nodeFs;
  let rec;
  let root;
  try { rec = fs.realpathSync(o.record); root = fs.realpathSync(path.join(pignoloHome(deps.env), 'init-backup')); } catch (e) { throw new Usage(`--record no se puede leer o PIGNOLO_HOME/init-backup no existe: ${e.message}`); }
  const fold = (s) => (process.platform === 'linux' ? s : s.toLowerCase());
  if (!fold(rec).startsWith(fold(root) + path.sep)) throw new Usage(`--record debe estar dentro de ${root}`);
  const r = SM.undoMoves({ record: rec, main, env: deps.env, run: deps.run, fs });
  if (r.ok) return { body: { ok: true, ...(r.already ? { already: r.already } : {}), items: r.items, restored: r.restored, ...(r.notEmpty && r.notEmpty.length ? { notEmpty: r.notEmpty } : {}), ...(r.mapLeft && r.mapLeft.length ? { mapLeft: r.mapLeft } : {}) }, code: 0 };
  if (r.refused === 'wrong-repo') throw new Usage(`wrong-repo: ${r.detail || 'el registro es de otro repo'}`);
  if (r.kind === 'partial') throw new Fail('partial', `el deshacer quedó a medias: ${r.failed.error}`, 'cerrá lo que tenga archivos abiertos y repetí `places.js undo` (es retomable)', 3, { failed: r.failed, pending: r.pending, items: r.items, restored: r.restored });
  throw new Fail(r.refused || 'refused', `no se deshizo nada: ${r.refused}${r.files ? ` (${r.files.join(', ')})` : ''}${r.detail ? ` ${r.detail}` : ''}`, 'revisá lo que indica el motivo; no se movió ningún archivo', 1, { refused: r.refused, ...(r.files ? { files: r.files } : {}) });
}

// ---------------------------------------------------------------- main

function main(argv, env = process.env, deps = {}) {
  const o = parse(argv);
  const d = { ...deps, env };
  const cwd = o.cwd || process.cwd();
  const m = resolveMain(cwd, d);
  if (o.verb === 'where') return where({ main: m, kind: o.args[0], deps: d });
  if (o.verb === 'report') return report({ main: m, deps: d });
  if (o.verb === 'fix preview') return fixPreview({ main: m, deps: d });
  if (o.verb === 'fix apply') return fixApply({ main: m, o, deps: d });
  return undo({ main: m, o, deps: d });
}

module.exports = { main, Usage, Fail };

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(r.body)}\n`);
    process.exitCode = r.code;
  } catch (e) {
    if (e instanceof Usage) {
      process.stderr.write(`pignolo places: ${e.message}\n`);
      process.exitCode = 2;
    } else if (e instanceof Fail) {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: e.kind, refused: e.kind, reason: e.message, ...e.extra })}\n`);
      process.stderr.write(`pignolo places: ${e.message}\nAlternativa: ${e.alt}\n`);
      process.exitCode = e.code;
    } else if (e && e.kind === 'scan-failed') {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: 'scan-failed', refused: 'scan-failed', reason: e.message })}\n`);
      process.stderr.write(`pignolo places: ${e.message}\nAlternativa: repetí el comando; si sigue fallando, revisá que git funcione en este repo\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: 'inconsistent', reason: e.message })}\n`);
      process.stderr.write(`pignolo places: ${e.message}\nAlternativa: revisá el estado del repo con git status antes de repetir\n`);
      process.exitCode = 3;
    }
  }
}
