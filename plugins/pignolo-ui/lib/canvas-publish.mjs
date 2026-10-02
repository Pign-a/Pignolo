// The only way to a publication (R-7, R-8, R-9, R-16), stage 2: ONE canvas per project that grows by pages.
// The state of the canvas lives in project.json (key canvas); <run>/publish.json says what THIS run published.
//
// planNext({ run, project, data, types: { design }, valuesFile, newCanvas }) -> { ok, problems, notes, done, step }
//   Decides the next Artifact step (canvas-create -> canvas-read-live -> canvas-publish) and, before it
//   returns anything, runs in this order and stops at the first failure (every failure is closed: ok
//   false, step null, NO params): opt-out, root, verifyCanvas, state of the canvas, first, limits of the
//   canvas, limits per call, scanBytes over the exact bytes and every string of the params. It writes
//   <run>/plan.json (id of the step, the page, the canvas it was planned for and the sha256 of every file
//   to send); recordStep re-hashes against it.
// diffPublished({ manifest, layoutSha256, pageId, published }) -> { changed, removed, sendIndex }   (R-9; informs, sends nothing)
// mergeIndex({ ours, live, liveFiles, published, title, now, changed, launchPage, first, ownsMain, acceptOverwrite, knownPage })
//   -> { ok, index, problems, kept, warnings }   (live null: from scratch)  Never loses what the user did (R-9).
// mergeLive({ run, live, liveDir, acceptOverwrite, now }) -> { ok, ... }   reads the live index the tool saved, never writes outside <run>
// recordStep({ run, project, data, step, url }) -> { ok, ... }
// noteRefusal({ run, kind, named }) -> { count, stop, reason? }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyCanvas, layoutSha256 } from './canvas-layout.mjs';
import { scanBytes, diffStrings } from './leak-scan.mjs';
import { readValuesFile } from './leak-check.mjs';
import { readOptOut, readConfig, writeConfig, canvasOf, ConfigError } from './project-config.mjs';
import { linkProblem, isLink } from './link-guard.mjs';

export class PublishError extends Error {
  constructor(message, usage = false) { super(message); this.usage = usage; }
}

const MB = 1024 * 1024;
export const LIMITS = { paths: 254, call: 16 * MB, file: 16 * MB, read: 256 };
// R-16, one rule written the same in plan (stored figures) and in merge (figures of the live index)
export const CANVAS_LIMITS = { pages: 38, files: 480, bytes: 200 * MB, notes: 190 };
export const REFUSAL_STOP = { canvas: 3 };
const LIVE_MAX = 8 * MB;
const FORBIDDEN_KEYS = new Set(['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities']);
// no scheme other than the one of the host, no query, no fragment: the url that Artifact returned
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAIN = 'Main.dc.html';

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sortedObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nameOf = (p) => String(p).replace(/^project\//, '');

function writeAtomic(file, text) {
  if (isLink(file)) throw new PublishError(`${path.basename(file)} es un enlace: se rechaza`, true);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export const publishFile = (run) => path.join(run, 'publish.json');

// What <run>/publish.json says. { exists: false } | { exists: true, bad: true } | { exists: true, value }.
// A file that is there and is not ours is "bad", never "nothing published".
function readPublished(run) {
  const file = publishFile(run);
  if (!fs.existsSync(file) && !isLink(file)) return { exists: false };
  const v = readJson(file);
  if (!isObj(v)) return { exists: true, bad: true };
  if (v.canvasUrl !== undefined && !ARTIFACT_URL.test(String(v.canvasUrl))) return { exists: true, bad: true, code: 'bad-url' };
  for (const k of ['files', 'boards', 'notes', 'sizes']) if (v[k] !== undefined && !isObj(v[k])) return { exists: true, bad: true };
  if (v.state !== undefined && v.state !== 'created' && v.state !== 'published') return { exists: true, bad: true };
  return { exists: true, value: v };
}

// A4C2-02: true only when <run>/publish.json says, literally, that this run already published its own
// Main.dc.html. Anything unreadable or not literal counts as false. With canvasUrl (build --data), the Main
// must be the one of THAT canvas: a run whose publish.json is of an older canvas owns nothing in the new one.
export function ownsMainOf(run, canvasUrl) {
  const p = readPublished(run);
  if (!p.value || p.value.ownsMain !== true) return false;
  return canvasUrl === undefined ? true : p.value.canvasUrl === canvasUrl;
}

// ---- limits of the canvas (R-16) -------------------------------------------------------------------------

// Which of the four limits would be passed once `add` is counted on top of `have`. Same rule for plan and merge.
export function canvasFullFields(have, add = {}) {
  const out = [];
  for (const k of ['pages', 'files', 'bytes', 'notes']) if ((have[k] ?? 0) + (add[k] ?? 0) > CANVAS_LIMITS[k]) out.push(k);
  return out;
}

// ---- what changed ---------------------------------------------------------------------------------------

export function diffPublished({ manifest, layoutSha256: layout, pageId, published }) {
  const now = Object.fromEntries((manifest?.files ?? []).map((f) => [f.path, f.sha256]));
  if (!published || published.pageId !== pageId || !isObj(published.files)) return { changed: Object.keys(now).sort(), removed: [], sendIndex: true };
  const changed = Object.keys(now).filter((p) => published.files[p] !== now[p]).sort();
  const removed = Object.keys(published.files).filter((p) => !(p in now)).sort();
  return { changed, removed, sendIndex: published.layoutSha256 !== layout };
}

// ---- the index ---------------------------------------------------------------------------------------

const refusal = (problems) => ({ ok: false, index: null, problems, kept: emptyKept(), warnings: [] });
const emptyKept = () => ({ keptMoved: [], keptEdited: [], userDeleted: [], editedByHand: [], overwritten: [], restored: [] });

function validLive(l) {
  if (!isObj(l) || l.v !== 3 || !isObj(l.boards)) return false;
  if (l.pages !== undefined && !(Array.isArray(l.pages) && l.pages.every((p) => isObj(p) && typeof p.id === 'string'))) return false;
  if (l.notes !== undefined && !isObj(l.notes)) return false;
  if (l.order !== undefined && !Array.isArray(l.order)) return false;
  if (l.designSystems !== undefined && !Array.isArray(l.designSystems)) return false;
  return true;
}

// our field of a frame or note, or the user's when they changed it since we last wrote it
function mergeItem({ id, liveItem, ourItem, pubItem, moved, edited, kept }) {
  const out = clone(liveItem);
  const untouched = (f) => pubItem === undefined || pubItem[f] === undefined || liveItem[f] === pubItem[f];
  let wasMoved = false;
  for (const f of moved) {
    if (ourItem[f] === undefined) continue;
    if (untouched(f)) out[f] = ourItem[f]; else wasMoved = true;
  }
  for (const f of edited) {
    if (ourItem[f] === undefined) continue;
    if (untouched(f)) out[f] = ourItem[f]; else kept.keptEdited.push({ id, field: f });
  }
  // a frame the user dragged to another page stays there
  if (ourItem.page !== undefined) {
    if (liveItem.page !== undefined && liveItem.page !== ourItem.page) wasMoved = true; else out.page = ourItem.page;
  }
  if (wasMoved) kept.keptMoved.push(id);
  return out;
}

export function mergeIndex({
  ours, live: liveIndex = null, liveFiles = null, published = null, title, now, changed = null,
  launchPage = null, first = false, ownsMain = false, acceptOverwrite = [], knownPage = false,
}) {
  const accept = new Set((acceptOverwrite ?? []).map((p) => `project/${nameOf(p)}`));
  if (liveIndex === null) {
    const index = {
      v: 3,
      createdOnFiles: { v: 1, at: now },
      title,
      launch: { view: 'canvas', page: ours.page.id },
      pages: [{ id: ours.page.id, name: ours.page.name }],
      boards: clone(ours.boards),
      order: [...ours.order],
      notes: clone(ours.notes),
      designSystems: clone(ours.designSystems ?? []),
    };
    return { ok: true, index, problems: [], kept: emptyKept(), warnings: [] };
  }
  if (!validLive(liveIndex)) return refusal([{ code: 'bad-live' }]);
  const problems = [];
  const warnings = [];
  const kept = emptyKept();
  const L = liveIndex;
  const livePages = L.pages ?? [];
  const liveNotes = L.notes ?? {};
  const pageId = ours.page.id;
  const pageKnown = livePages.some((p) => p.id === pageId);

  // (1) before writing anything: ids, names, order, limits, page collision
  if (!ID_RE.test(pageId)) problems.push({ code: 'bad-id', file: 'page' });
  for (const id of Object.keys(ours.notes)) if (!ID_RE.test(id)) problems.push({ code: 'bad-id', file: id.slice(0, 20) });
  if (pageKnown && !(published && published.pageId === pageId) && !knownPage) problems.push({ code: 'page-collision', file: pageId });
  const liveNames = Object.keys(L.boards);
  const lower = new Map(liveNames.map((n) => [n.replace(/\.dc\.html$/i, '').toLowerCase(), n]));
  for (const n of ours.order) {
    const other = lower.get(n.replace(/\.dc\.html$/i, '').toLowerCase());
    if (other !== undefined && other !== n) problems.push({ code: 'name-collision', file: n });
  }
  const order = L.order ?? [];
  if (order.length !== liveNames.length || new Set(order).size !== order.length || !order.every((n) => has(L.boards, n))) problems.push({ code: 'bad-order' });
  const ourNewBoards = ours.order.filter((n) => !has(L.boards, n)).length;
  const ourNewNotes = Object.keys(ours.notes).filter((id) => !has(liveNotes, id)).length;
  const full = canvasFullFields({ pages: livePages.length, files: liveNames.length, notes: Object.keys(liveNotes).length }, { pages: pageKnown ? 0 : 1, files: ourNewBoards, notes: ourNewNotes });
  if (full.length) problems.push({ code: 'canvas-full', detail: full.join(',') });
  // Main.dc.html: ours only when the run opens the canvas or already owns it
  const liveHasMain = has(L.boards, MAIN);
  if (first && liveHasMain && !ownsMain) problems.push({ code: 'main-exists-live', file: MAIN });
  if (!first && !liveHasMain) warnings.push({ code: 'no-main-live' });
  if (problems.length) return refusal(problems);

  // (2) our artboards that the user edited by hand: decided on the bytes the tool kept (A4C2-01)
  const pubFiles = isObj(published?.files) ? published.files : {};
  const ourPaths = new Set(ours.order.map((n) => `project/${n}`));
  const comparable = Object.keys(pubFiles).filter((p) => ourPaths.has(p));
  if (comparable.length && liveFiles === null) return refusal([{ code: 'live-incomplete', detail: 'the artboards were not read' }]);
  const sending = (p) => changed === null || changed.includes(p);
  for (const p of comparable) {
    const n = nameOf(p);
    const have = liveFiles[p];
    if (have === undefined) {
      if (has(L.boards, n)) problems.push({ code: 'live-incomplete', file: p });
      else kept.userDeleted.push(n);
    } else if (have !== pubFiles[p]) {
      if (!sending(p)) kept.editedByHand.push(p);
      else if (accept.has(p)) kept.overwritten.push(p);
      else problems.push({ code: 'artboard-edited-by-hand', file: p });
    }
  }
  if (problems.length) return refusal(problems);

  // (3) the index
  const index = clone(L);
  index.v = 3;
  index.boards = index.boards ?? {};
  index.pages = index.pages ?? [];
  index.notes = index.notes ?? {};
  index.order = index.order ?? [];
  index.designSystems = index.designSystems ?? [];
  if (title !== undefined && (typeof index.title !== 'string' || index.title === '')) index.title = title;
  if (index.createdOnFiles === undefined) index.createdOnFiles = { v: 1, at: now };
  if (!pageKnown) index.pages.push({ id: pageId, name: ours.page.name });
  // the page that opens: ours only when nobody chose another one since we last wrote it
  const launch = isObj(index.launch) ? index.launch : null;
  if (!launch) index.launch = { view: 'canvas', page: pageId };
  else if (typeof launch.page !== 'string' || launch.page === '' || launch.page === launchPage) launch.page = pageId;

  for (const n of ours.order) {
    const ourB = ours.boards[n];
    const pubB = published?.boards?.[n];
    const p = `project/${n}`;
    if (has(index.boards, n)) {
      index.boards[n] = mergeItem({ id: n, liveItem: index.boards[n], ourItem: ourB, pubItem: pubB, moved: ['x', 'y'], edited: ['w', 'h', 'title'], kept });
      if (ourB.is_interactive) index.boards[n].is_interactive = true; else delete index.boards[n].is_interactive;
    } else if (pubB !== undefined && !(changed !== null && changed.includes(p))) {
      // the user deleted it: it does not come back (and its entry never lingers without a file)
      if (!kept.userDeleted.includes(n)) kept.userDeleted.push(n);
    } else if (changed !== null && !changed.includes(p) && !has(pubFiles, p)) {
      problems.push({ code: 'entry-without-file', file: n });
    } else {
      if (pubB !== undefined) kept.restored.push(n);
      index.boards[n] = clone(ourB);
      index.order.push(n);
    }
  }
  if (problems.length) return refusal(problems);
  for (const n of ours.order) if (has(index.boards, n) && !index.order.includes(n)) index.order.push(n);

  for (const [id, ourN] of Object.entries(ours.notes)) {
    const pubN = published?.notes?.[id];
    if (has(index.notes, id)) {
      index.notes[id] = mergeItem({ id, liveItem: index.notes[id], ourItem: ourN, pubItem: pubN, moved: ['x', 'y'], edited: ['text', 'maxW'], kept });
      if (ourN.kind !== undefined) index.notes[id].kind = ourN.kind;
    } else if (pubN !== undefined) {
      kept.userDeleted.push(id);
    } else {
      index.notes[id] = clone(ourN);
    }
  }
  // design systems by namespace: the user's stay, ours are added when missing
  for (const ds of ours.designSystems ?? []) {
    if (!index.designSystems.some((d) => isObj(d) && d.namespace === ds.namespace)) index.designSystems.push(clone(ds));
  }
  return { ok: true, index, problems: [], kept, warnings };
}

// ---- the live index and the artboards the tool kept -------------------------------------------------------

// A4C2-01: the sha256 of every published artboard of this run that the tool kept in --live-dir.
// The tool saves what it reads under a folder it names; a file is looked for under its published path and,
// failing that, by its bare name. A link is never followed: it counts as not read.
function readLiveFiles(liveDir, paths) {
  const out = {};
  for (const p of paths) {
    for (const rel of [p, nameOf(p)]) {
      const full = path.join(liveDir, ...rel.split('/'));
      let st;
      try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink() || !st.isFile() || st.size > LIMITS.file) continue;
      try { out[p] = sha(fs.readFileSync(full)); break; } catch { /* not read */ }
    }
  }
  return out;
}

export function mergeLive({ run, live: liveArg, liveDir, acceptOverwrite = [], now }) {
  const none = liveArg === 'none';
  if (none !== (liveDir === 'none')) return { ok: false, usage: true, error: '--live y --live-dir van juntos: los dos "none" o los dos con ruta', problems: [{ code: 'bad-usage' }] };
  const canvas = path.join(run, 'canvas');
  if (linkProblem(canvas)) return { ok: false, problems: [{ code: 'root-is-link' }] };
  const fragment = readJson(path.join(canvas, 'page.json'));
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  if (!isObj(fragment) || !isObj(manifest)) return { ok: false, problems: [{ code: 'no-canvas' }] };
  const mergeDir = path.join(run, 'merge');
  const indexFile = path.join(canvas, 'project', 'canvas.json');
  if (linkProblem(mergeDir) || linkProblem(path.join(canvas, 'project'))) return { ok: false, problems: [{ code: 'root-is-link' }] };

  // a failed merge leaves nothing that could pass for a current one
  const stale = () => {
    for (const f of [path.join(mergeDir, 'merge.json'), path.join(mergeDir, 'live.json'), indexFile]) {
      if (isLink(f)) continue;
      try { fs.rmSync(f, { force: true }); } catch { /* nothing */ }
    }
  };
  const refuse = (problems, extra = {}) => { stale(); return { ok: false, problems, ...extra }; };

  // merge only follows a plan that asked for the read: it says which canvas and what state
  const plan = readJson(path.join(run, 'plan.json'));
  const snap = plan?.canvas;
  if (!isObj(plan) || plan.id !== 'canvas-read-live' || !isObj(snap) || !ARTIFACT_URL.test(String(snap.url)) || plan.pageId !== manifest.pageId) {
    return refuse([{ code: 'no-plan', detail: 'plan.json no corresponde a la lectura del lienzo vivo' }]);
  }
  const pub = readPublished(run);
  if (pub.bad) return refuse([{ code: 'bad-state' }]);
  const published = pub.value && pub.value.canvasUrl === snap.url ? pub.value : null;
  const diff = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId: manifest.pageId, published });

  let liveJson = null;
  let liveText = null;
  let liveFiles = null;
  if (none) {
    // --live none is valid only for a canvas that was just created and has nothing in it yet
    if (snap.state !== 'created') return refuse([{ code: 'not-created' }]);
  } else {
    let st;
    try { st = fs.lstatSync(liveArg); } catch { st = null; }
    if (st && (st.isSymbolicLink() || (st.isFile() && st.size > LIVE_MAX))) return { ok: false, usage: true, error: 'el índice vivo es un enlace o pesa más de 8 MB', problems: [{ code: 'bad-live-file' }] };
    if (st && !st.isFile()) return refuse([{ code: 'bad-live' }]);
    try { liveText = fs.readFileSync(liveArg, 'utf8').replace(/^﻿/, ''); liveJson = JSON.parse(liveText); } catch { return refuse([{ code: 'bad-live' }]); }
    let dirSt = null;
    try { dirSt = fs.lstatSync(liveDir); } catch { /* checked below */ }
    if (!dirSt || dirSt.isSymbolicLink() || !dirSt.isDirectory()) return { ok: false, usage: true, error: '--live-dir no es una carpeta (o es un enlace)', problems: [{ code: 'bad-live-dir' }] };
    const paths = Object.keys(published?.files ?? {}).filter((p) => manifest.files.some((f) => f.path === p));
    liveFiles = readLiveFiles(liveDir, paths);
  }
  const merged = mergeIndex({
    ours: fragment, live: liveJson, liveFiles, published, title: fragment.canvasTitle, now, changed: diff.changed,
    launchPage: typeof snap.launchPage === 'string' ? snap.launchPage : null,
    first: manifest.first === true, ownsMain: published?.ownsMain === true, acceptOverwrite,
    knownPage: plan.pageId === fragment.page?.id,
  });
  if (!merged.ok) return refuse(merged.problems, { warnings: merged.warnings });
  fs.mkdirSync(path.join(canvas, 'project'), { recursive: true });
  fs.mkdirSync(mergeDir, { recursive: true });
  const text = `${JSON.stringify(merged.index, null, 2)}\n`;
  // the copy of what was read goes first: plan compares the combined index against it
  if (liveText !== null) writeAtomic(path.join(mergeDir, 'live.json'), liveText);
  writeAtomic(indexFile, text);
  writeAtomic(path.join(mergeDir, 'merge.json'), `${JSON.stringify({ liveSha256: liveText === null ? null : sha(liveText), canvasSha256: sha(text), ...merged.kept, warnings: merged.warnings.map((w) => w.code) }, null, 2)}\n`);
  return { ok: true, out: indexFile, canvasSha256: sha(text), kept: merged.kept, warnings: merged.warnings, changed: diff.changed };
}

// ---- the plan ----------------------------------------------------------------------------------------

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); allStrings(v, out); }
  return out;
}

export function assertParams(params) {
  const walk = (v, where) => {
    if (typeof v === 'string') { if (/[<>]/.test(v)) throw new PublishError(`marcador sin resolver en params (${where})`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k)) throw new PublishError(`params no admite ${k}`);
        walk(x, `${where}.${k}`);
      }
    }
  };
  walk(params, 'params');
}

// Limits of one Artifact call (R-16, A4C2-18): 254 entries in files, 16 MB per file and 16 MB per call.
export function callLimitProblems({ entries, sizes }) {
  const out = [];
  if (entries > LIMITS.paths) out.push({ code: 'too-many-paths' });
  if (sizes.some((f) => f.size > LIMITS.file)) out.push({ code: 'file-too-big' });
  if (sizes.reduce((a, f) => a + f.size, 0) > LIMITS.call) out.push({ code: 'call-too-big' });
  return out;
}

const fail = (problems, extra = {}) => ({ ok: false, problems, notes: [], done: false, step: null, ...extra });

function optOutProblems({ run, project, data }) {
  const out = [];
  if (fs.existsSync(path.join(run, 'no-publish'))) out.push({ code: 'run-opt-out' });
  try {
    const { optOut, dataProblem } = readOptOut({ data, project });
    // the opt-out lives under --data: a data folder that is not the real one cannot say there is none
    if (dataProblem) out.push({ code: dataProblem });
    if (optOut) out.push({ code: optOut });
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    out.push({ code: 'config-unreadable' });
  }
  return out;
}

export function planNext({ run, project, data, types = {}, valuesFile, newCanvas: forceNew = false }) {
  // (1) the opt-out comes before anything else, and a refusal carries no params
  const optOut = optOutProblems({ run, project, data });
  if (optOut.length) return fail(optOut);
  // (2) the root
  const canvasDir = path.join(run, 'canvas');
  if (!fs.existsSync(canvasDir) && !isLink(canvasDir)) return fail([{ code: 'no-canvas' }]);
  if (linkProblem(canvasDir)) return fail([{ code: 'root-is-link' }]);
  // (3) what was written is valid
  const verified = verifyCanvas({ dir: canvasDir });
  if (!verified.ok) return fail(verified.problems);
  const manifest = readJson(path.join(canvasDir, 'manifest.json'));
  const fragment = readJson(path.join(canvasDir, 'page.json'));
  const pageId = fragment.page.id;

  // (4) the canvas of the project and what this run published into it
  let stored;
  try { stored = canvasOf(readConfig({ data, project }).config); } catch { return fail([{ code: 'config-unreadable' }]); }
  if (stored.problem) return fail([{ code: stored.problem }]);
  const canvas = stored.canvas;
  const pub = readPublished(run);
  if (pub.bad) return fail([{ code: pub.code ?? 'bad-state' }]);
  const mine = pub.value && canvas && pub.value.canvasUrl === canvas.url ? pub.value : null;

  // the limits of the canvas, with the figures that project.json kept (R-16, A4C-15)
  const manifestFiles = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
  const sizeOf = (p) => { try { return fs.statSync(path.join(canvasDir, ...p.split('/'))).size; } catch { return 0; } };
  const diffNow = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId, published: mine });
  let canvasFull = false;
  if (canvas && !forceNew) {
    const addsPage = !(mine && mine.pageId === pageId);
    const published = mine?.files ?? {};
    const newFiles = diffNow.changed.filter((p) => !(p in published));
    const newNotes = Object.keys(fragment.notes).filter((id) => !(mine?.notes && id in mine.notes));
    canvasFull = canvasFullFields(canvas, {
      pages: addsPage ? 1 : 0, files: newFiles.length, bytes: diffNow.changed.reduce((a, p) => a + sizeOf(p), 0), notes: newNotes.length,
    }).length > 0;
  }
  const newCanvas = forceNew || canvasFull;
  // a different canvas than the one this run published into: what was published is not this canvas's
  const live = canvas && !newCanvas ? mine : null;
  const ownsMain = live?.ownsMain === true;
  const byState = !canvas || canvas.state === 'created' || canvas.pages === 0 || newCanvas;

  // (5) first is of the page of this run (A4C2-02)
  const expectedFirst = byState || ownsMain;
  if ((manifest.first === true) !== expectedFirst) {
    const reason = canvasFull && !forceNew ? 'canvas-full' : ownsMain && !byState ? 'owns-main' : 'state';
    return fail([{ code: 'first-mismatch', expectedFirst, reason }], canvasFull && !forceNew ? { notes: ['canvas-full'] } : {});
  }

  const diff = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId, published: live });
  const indexFile = path.join(canvasDir, 'project', 'canvas.json');
  const mergeInfo = readJson(path.join(run, 'merge', 'merge.json'));
  const mergeCurrent = fs.existsSync(indexFile) && isObj(mergeInfo) && mergeInfo.canvasSha256 === sha(fs.readFileSync(indexFile));

  let step;
  let toSend = null;
  if (!canvas || newCanvas) {
    if (typeof types.design !== 'string' || !types.design) return fail([{ code: 'no-design-type' }]);
    step = { id: 'canvas-create', params: { action: 'publish', type_url: types.design, title: fragment.canvasTitle, auto_open: 'after_first_write' } };
  } else if (canvas.state === 'published' && live && diff.changed.length === 0 && !diff.sendIndex) {
    return { ok: true, problems: [], notes: noteList(manifest), done: true, step: null };
  } else if (!mergeCurrent) {
    const already = Object.keys(live?.files ?? {}).filter((p) => p in manifestFiles).sort();
    step = { id: 'canvas-read-live', params: { action: 'read', url: canvas.url, paths: ['project/canvas.json', ...already] } };
    if (step.params.paths.length > LIMITS.read) return fail([{ code: 'too-many-paths' }]);
  } else {
    toSend = diff.changed;
    const files = Object.fromEntries(toSend.map((p) => [p, p]));
    step = { id: 'canvas-publish', params: { action: 'publish', url: canvas.url, root: canvasDir, file_path: indexFile, files } };
  }

  // (6, before the scan: it costs a stat) limits per call
  if (toSend) {
    const sized = [...toSend, 'project/canvas.json'].map((p) => ({ path: p, size: sizeOf(p) }));
    const over = callLimitProblems({ entries: toSend.length, sizes: sized });
    if (over.length) return fail(over);
  }

  // (7) the leak check, on the exact bytes and on every string that goes into the params
  let values;
  try { values = readValuesFile(valuesFile); } catch { return fail([{ code: 'no-leak-values' }]); }
  const originsFile = path.join(path.dirname(valuesFile), 'leak-origins.json');
  const origins = readJson(originsFile);
  // leak-values always writes this file: missing, unreadable or with git failed means the user name and email are unknown
  if (!isObj(origins) || !['ok', 'unset'].includes(origins.git)) return fail([{ code: 'no-leak-values', detail: 'leak-origins.json is missing, unreadable or says that git failed' }]);
  const localPaths = new Set([step.params.root, step.params.file_path, ...Object.values(step.params.files ?? {})].filter(Boolean));
  const texts = [
    { label: 'canvasTitle', text: fragment.canvasTitle },
    { label: 'pageName', text: fragment.page.name },
    ...Object.entries(fragment.boards).map(([k, b]) => ({ label: `board ${k}`, text: b.title })),
    ...Object.entries(fragment.notes).map(([k, n]) => ({ label: `note ${k}`, text: n.text })),
    ...allStrings(step.params).filter((s) => !localPaths.has(s)).map((s, i) => ({ label: `params[${i}]`, text: s })),
  ];
  // R-8 e: what the live index already had (notes, names and frames of the user) lives in their account and is not checked;
  // everything of the combined index that differs from it is. live.json sits OUTSIDE canvas/, so a second plan does not scan it.
  const skipFiles = [];
  if (step.id === 'canvas-publish' && fs.existsSync(indexFile)) {
    const combined = readJson(indexFile);
    if (!isObj(combined)) return fail([{ code: 'bad-index' }]);
    const liveFile = path.join(run, 'merge', 'live.json');
    let against = null;
    if (isObj(mergeInfo) && mergeInfo.liveSha256 !== null && mergeInfo.liveSha256 !== undefined) {
      let liveText = null;
      try { liveText = isLink(liveFile) ? null : fs.readFileSync(liveFile, 'utf8'); } catch { /* checked below */ }
      if (liveText === null || sha(liveText) !== mergeInfo.liveSha256) return fail([{ code: 'merge-stale', detail: 'live.json is missing or changed since merge' }]);
      against = JSON.parse(liveText);
    }
    if (against !== null) {
      skipFiles.push('project/canvas.json');
      for (const t of diffStrings(combined, against)) texts.push({ label: 'canvas.json', text: t });
    }
  }
  const scan = scanBytes({ roots: [{ dir: canvasDir, expect: path.join(fs.realpathSync.native(run), 'canvas') }], texts, values, skipFiles });
  if (!scan.ok) return fail(scan.problems);

  try { assertParams(step.params); } catch (e) { return fail([{ code: 'bad-params', detail: e.message }]); }

  const planFiles = {};
  if (toSend) for (const p of [...toSend, 'project/canvas.json']) planFiles[p] = sha(fs.readFileSync(path.join(canvasDir, ...p.split('/'))));
  const snapshot = canvas && !newCanvas ? { url: canvas.url, state: canvas.state, ...(canvas.launchPage ? { launchPage: canvas.launchPage } : {}) } : null;
  writeAtomic(path.join(run, 'plan.json'), `${JSON.stringify({ id: step.id, pageId, layoutSha256: manifest.layoutSha256, canvas: snapshot, files: planFiles, at: new Date().toISOString() }, null, 2)}\n`);
  const notes = noteList(manifest);
  if (newCanvas && canvasFull) notes.push('canvas-full');
  if (diff.removed.length) notes.push(`removed: ${diff.removed.join(', ')}`);
  return { ok: true, problems: [], notes, done: false, step };
}

const noteList = (manifest) => (Array.isArray(manifest.warnings) ? manifest.warnings.map((w) => `${w.file}: ${w.code}`) : []);

// ---- refusals (R-9) -----------------------------------------------------------------------------------

const refusalFile = (run) => path.join(run, 'refusals.json');

// The tool rejected a publication because someone edited the canvas in between. The first ones are retried
// (read again, merge again); at the third the run stops. A rejection that names an artboard of ours means
// somebody edited it by hand: retrying would overwrite it, so it stops and the user is asked.
export function noteRefusal({ run, kind, named = null }) {
  if (!Object.prototype.hasOwnProperty.call(REFUSAL_STOP, kind)) throw new PublishError(`--kind debe ser ${Object.keys(REFUSAL_STOP).join(' o ')}`, true);
  const counts = readJson(refusalFile(run));
  const count = (isObj(counts) && Number.isInteger(counts[kind]) && counts[kind] >= 0 ? counts[kind] : 0) + 1;
  writeAtomic(refusalFile(run), `${JSON.stringify({ ...(isObj(counts) ? counts : {}), [kind]: count }, null, 2)}\n`);
  const manifest = readJson(path.join(run, 'canvas', 'manifest.json'));
  const ours = named !== null && Array.isArray(manifest?.files) && manifest.files.some((f) => f.path === `project/${nameOf(named)}`);
  if (ours) return { count, stop: true, reason: 'artboard-edited-by-hand' };
  if (count >= REFUSAL_STOP[kind]) return { count, stop: true, reason: 'too-many-refusals' };
  const mergeDir = path.join(run, 'merge');
  if (!linkProblem(mergeDir) && fs.existsSync(mergeDir)) fs.rmSync(mergeDir, { recursive: true, force: true });
  return { count, stop: false };
}

// ---- recording ---------------------------------------------------------------------------------------

const problem = (code, extra = {}) => ({ ok: false, problems: [{ code, ...extra }] });

export function recordStep({ run, project, data, step, url }) {
  if (!ARTIFACT_URL.test(String(url))) throw new PublishError('la url no es la de un artifact de claude.ai (sin parámetros ni fragmento)', true);
  const canvasDir = path.join(run, 'canvas');
  const plan = readJson(path.join(run, 'plan.json'));
  if (!plan || plan.id !== step) return { ok: false, problems: [{ code: 'no-plan', detail: `plan.json no corresponde al paso ${step}` }] };
  const manifest = readJson(path.join(canvasDir, 'manifest.json'));
  const fragment = readJson(path.join(canvasDir, 'page.json'));
  if (!manifest || !fragment) return { ok: false, problems: [{ code: 'no-canvas' }] };
  let config;
  try { config = readConfig({ data, project }); } catch { return problem('config-unreadable'); }
  const stored = canvasOf(config.config);
  if (stored.problem) return problem(stored.problem);
  const save = (value) => {
    try { writeConfig({ data, project, key: 'canvas', value }); return null; } catch (e) { if (e instanceof ConfigError) return problem('config-unwritable', { detail: e.message }); throw e; }
  };
  const clearRefusals = () => { try { fs.rmSync(refusalFile(run), { force: true }); } catch { /* nothing */ } };

  if (step === 'canvas-create') {
    // a new canvas: the figures start again and nothing that was published before belongs to it
    const bad = save({ url, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 });
    if (bad) return bad;
    writeAtomic(publishFile(run), `${JSON.stringify({ v: 2, canvasUrl: url, state: 'created', ownsMain: false, files: {} }, null, 2)}\n`);
    clearRefusals();
    return { ok: true, state: 'created' };
  }
  const canvas = stored.canvas;
  if (!canvas || canvas.url !== url) return problem('url-mismatch');
  // the bytes that were planned must still be the bytes on disk, and so must the layout
  for (const [rel, want] of Object.entries(plan.files ?? {})) {
    let have = null;
    try { have = sha(fs.readFileSync(path.join(canvasDir, ...rel.split('/')))); } catch { /* missing counts as changed */ }
    if (have !== want) return problem('published-unplanned-bytes', { file: rel });
  }
  if (plan.layoutSha256 !== layoutSha256(fragment) || plan.layoutSha256 !== manifest.layoutSha256) return problem('published-unplanned-bytes', { file: 'page.json' });

  const pub = readPublished(run);
  const before = pub.value && pub.value.canvasUrl === url ? pub.value : null;
  const sent = Object.keys(plan.files ?? {}).filter((p) => p !== 'project/canvas.json');
  const manifestFiles = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
  const sizeOf = (p) => { try { return fs.statSync(path.join(canvasDir, ...p.split('/'))).size; } catch { return 0; } };
  const files = {};
  const sizes = {};
  for (const p of Object.keys(manifestFiles)) {
    if (sent.includes(p)) { files[p] = manifestFiles[p]; sizes[p] = sizeOf(p); } else if (before?.files?.[p] !== undefined) { files[p] = before.files[p]; if (before.sizes?.[p] !== undefined) sizes[p] = before.sizes[p]; }
  }
  const pageWasThere = !!before && before.pageId === fragment.page.id;
  const oldFiles = before?.files ?? {};
  const oldSizes = before?.sizes ?? {};
  const addedFiles = sent.filter((p) => !(p in oldFiles)).length;
  const bytes = sent.reduce((a, p) => a + sizeOf(p), 0) - sent.reduce((a, p) => a + (oldSizes[p] ?? 0), 0);
  const noteIds = Object.keys(fragment.notes);
  const addedNotes = noteIds.filter((id) => !(before?.notes && id in before.notes)).length;
  const merged = readJson(path.join(canvasDir, 'project', 'canvas.json'));
  const launch = isObj(merged?.launch) && typeof merged.launch.page === 'string' && ID_RE.test(merged.launch.page) ? merged.launch.page : canvas.launchPage;
  const next = {
    url, state: 'published',
    pages: canvas.pages + (pageWasThere ? 0 : 1),
    files: canvas.files + addedFiles,
    bytes: Math.max(0, canvas.bytes + bytes),
    notes: canvas.notes + addedNotes,
    ...(canvas.dsInstalledSha256 ? { dsInstalledSha256: canvas.dsInstalledSha256 } : {}),
    ...(launch ? { launchPage: launch } : {}),
  };
  const bad = save(next);
  if (bad) return bad;
  // what WE wrote, never what the user kept: the next merge tells their changes from ours by comparing with this
  const boards = {};
  for (const [n, b] of Object.entries(fragment.boards)) boards[n] = { x: b.x, y: b.y, w: b.w, h: b.h, title: b.title };
  const notes = {};
  for (const [id, n] of Object.entries(fragment.notes)) notes[id] = { x: n.x, y: n.y, text: n.text, maxW: n.maxW };
  const record = {
    v: 2, canvasUrl: url, state: 'published', pageId: fragment.page.id, pageName: fragment.page.name,
    ownsMain: before?.ownsMain === true || manifest.first === true,
    layoutSha256: manifest.layoutSha256, files: sortedObj(files), sizes: sortedObj(sizes), boards, notes,
  };
  writeAtomic(publishFile(run), `${JSON.stringify(record, null, 2)}\n`);
  clearRefusals();
  return { ok: true, state: 'published', canvas: next };
}

export { layoutSha256 };
