// The only way to a publication (R-7, R-8), stage 2: ONE canvas per project that grows by one page per run.
// The canvas of the project lives in project.json (key `canvas`, T4b); what THIS run published to it lives in
// <run>/publish.json.
//
// planNext({ run, project, data, types: { design }, valuesFile, newCanvas }) -> { ok, problems, notes, done, step }
//   Decides the next Artifact step (canvas-create -> canvas-read-live -> canvas-publish) and, before it
//   returns anything, runs in this order and stops at the first failure (every failure is closed: ok
//   false, step null, NO params): opt-out, root, canvas record, verifyCanvas, first, limits, scanBytes over
//   the exact bytes (the merged index by difference against the live one) and every string of the params,
//   limits per call. It writes <run>/plan.json; recordStep re-hashes against it.
// mergeLive({ run, live, liveDir, acceptOverwrite, data, project, now }) -> { ok, ... }
// recordStep({ run, project, data, step, url }) -> { ok, ... }
// noteRefusal({ run, kind, named }) -> { count, stop, reason? }        diffRun({ run }) -> { changed, removed, sendIndex }
// publish.json (v2): { v, canvasUrl, pageId, ownsMain, layoutSha256, files: { path: sha256 }, sizes: { path: bytes },
//   boards: { name: { x, y, w, h, title } }, notes: { id: { x, y, text, maxW } }, deleted: [names], refusals,
//   mainTaken? (merge found a Main.dc.html of somebody else in a canvas that was just created: plan then takes first false) }
//   It is ours only when its canvasUrl is the one registered in project.json (and there is no newCanvas):
//   otherwise what it says was published to another canvas and it is ignored (R-16).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyCanvas, layoutSha256 } from './canvas-layout.mjs';
import { scanBytes, indexDiffTexts } from './leak-scan.mjs';
import { readValuesFile } from './leak-check.mjs';
import { readOptOut, readConfig, readCanvas, writeConfig, ConfigError } from './project-config.mjs';
import { linkProblem, isLink, removeOwnDir } from './link-guard.mjs';
import { mergeIndex, diffPublished, planLimits, liveSha256, emptyKept } from './canvas-merge.mjs';

export { mergeIndex, diffPublished, planLimits };

export class PublishError extends Error {
  constructor(message, usage = false) { super(message); this.usage = usage; }
}

const MB = 1024 * 1024;
export const LIMITS = { paths: 254, call: 16 * MB, file: 16 * MB };
export const LIVE_MAX = 8 * MB;
export const REFUSAL_STOP = { canvas: 3 };
const FORBIDDEN_KEYS = new Set(['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities']);
// no scheme other than the one of the host, no query, no fragment: the url that Artifact returned
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]{8,64}$/;
const HEX = /^[0-9a-f]{64}$/;
const INDEX = 'project/canvas.json';

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sortedObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nameOf = (p) => String(p).replace(/^project\//, '');
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return undefined; } };

function writeAtomic(file, text) {
  if (isLink(file)) throw new PublishError(`${path.basename(file)} es un enlace: se rechaza`, true);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export const publishFile = (run) => path.join(run, 'publish.json');

// <run>/publish.json -> { data, problem }. None is { data: null }; a file that is there and is not ours is a
// problem, never "nothing published" (a plan on top of it would republish or rename things).
function readPublished(run) {
  const file = publishFile(run);
  let st = null;
  try { st = fs.lstatSync(file); } catch { /* none */ }
  if (!st) return { data: null, problem: null };
  if (st.isSymbolicLink() || !st.isFile()) return { data: null, problem: 'bad-state' };
  const data = readJson(file);
  if (!isObj(data)) return { data: null, problem: 'bad-state' };
  if (data.v !== undefined && data.v !== 1 && data.v !== 2) return { data: null, problem: 'bad-state' };
  if (data.state !== undefined && data.state !== 'created' && data.state !== 'published') return { data: null, problem: 'bad-state' };
  if (data.canvasUrl !== undefined && data.canvasUrl !== null && !ARTIFACT_URL.test(String(data.canvasUrl))) return { data: null, problem: 'bad-url' };
  if (data.files !== undefined && !(isObj(data.files) && Object.values(data.files).every((h) => typeof h === 'string' && HEX.test(h)))) return { data: null, problem: 'bad-state' };
  for (const k of ['boards', 'notes', 'sizes']) if (data[k] !== undefined && !isObj(data[k])) return { data: null, problem: 'bad-state' };
  if (data.deleted !== undefined && !(Array.isArray(data.deleted) && data.deleted.every((n) => typeof n === 'string'))) return { data: null, problem: 'bad-state' };
  if (data.mainTaken !== undefined && typeof data.mainTaken !== 'boolean') return { data: null, problem: 'bad-state' };
  if (data.refusals !== undefined && !(Number.isSafeInteger(data.refusals) && data.refusals >= 0)) return { data: null, problem: 'bad-state' };
  return { data, problem: null };
}

// The canvas record of the project: { canvas, problem }. An unreadable project.json is ConfigError (closed).
function readRecord({ data, project }) {
  return readCanvas(readConfig({ data, project }).config);
}

// What this run published to THIS canvas, or null (publish.json of another canvas is ignored).
const ownPublished = (published, record, ignore) => (!ignore && record && published && published.canvasUrl === record.url ? published : null);

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

const sizeOf = (canvas, p) => fs.statSync(path.join(canvas, ...p.split('/'))).size;

// <run>/merge/merge.json when it is consistent with what is on disk and with the diff of this run, else null:
// a merge that is not current is never published (the live index may have changed, or build ran again).
function currentMerge({ run, canvas, record, diff }) {
  // a merge folder that is a link, or has one inside, is never current
  if (linkProblem(path.join(run, 'merge'))) return null;
  const info = readJson(path.join(run, 'merge', 'merge.json'));
  if (!isObj(info)) return null;
  let indexBytes;
  try { indexBytes = fs.readFileSync(path.join(canvas, ...INDEX.split('/'))); } catch { return null; }
  if (info.canvasSha256 !== sha(indexBytes) || info.canvasUrl !== record.url) return null;
  if (JSON.stringify(info.changed) !== JSON.stringify(diff.changed)) return null;
  if (info.liveSha256 === null) {
    // "none" is only for a canvas that was just created
    if (record.state !== 'created' || fs.existsSync(path.join(run, 'merge', 'live.json'))) return null;
    return { info, live: null };
  }
  let liveText;
  try { liveText = fs.readFileSync(path.join(run, 'merge', 'live.json')); } catch { return null; }
  if (sha(liveText) !== info.liveSha256) return null;
  let live;
  try { live = JSON.parse(liveText.toString('utf8').replace(/^﻿/, '')); } catch { return null; }
  return { info, live };
}

export function planNext({ run, project, data, types = {}, valuesFile, newCanvas: forceNew = false }) {
  // (1) the opt-out comes before anything else, and a refusal carries no params
  const optOut = optOutProblems({ run, project, data });
  if (optOut.length) return fail(optOut);
  // (2) the root
  const canvas = path.join(run, 'canvas');
  if (!fs.existsSync(canvas) && !isLink(canvas)) return fail([{ code: 'no-canvas' }]);
  if (linkProblem(canvas)) return fail([{ code: 'root-is-link' }]);
  // (2b) the canvas of the project and what this run published: unreadable or not ours is closed
  let stored;
  try { stored = readRecord({ data, project }); } catch (e) { if (e instanceof ConfigError) return fail([{ code: 'config-unreadable' }]); throw e; }
  if (stored.problem) return fail([{ code: 'bad-canvas-state', detail: stored.problem }]);
  const record = stored.canvas;
  const read = readPublished(run);
  if (read.problem) return fail([{ code: read.problem }]);
  // (3) what was written is valid (a frame of ours that the user deleted and merge left out is not missing)
  const mergeFile = readJson(path.join(run, 'merge', 'merge.json'));
  const deleted = isObj(mergeFile) && Array.isArray(mergeFile.userDeleted) ? mergeFile.userDeleted.filter((n) => typeof n === 'string') : [];
  const verified = verifyCanvas({ dir: canvas, userDeleted: deleted });
  if (!verified.ok) return fail(verified.problems);
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  const fragment = readJson(path.join(canvas, 'page.json'));

  // (4) which canvas, and is this the run that opens it? The limits count what is new (R-16)
  let trusted = ownPublished(read.data, record, forceNew);
  let newCanvas = forceNew;
  let full = [];
  if (!newCanvas && record) {
    const was = trusted?.files ?? {};
    const pre = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId: manifest.pageId, published: trusted });
    const fresh = pre.changed.filter((p) => !(p in was));
    let grown = 0;
    for (const p of pre.changed) grown += sizeOf(canvas, p) - (trusted?.sizes?.[p] ?? 0);
    const newNotes = Object.keys(fragment.notes ?? {}).filter((id) => !(trusted?.notes && id in trusted.notes)).length;
    full = planLimits({ canvas: record, addPage: !(trusted && trusted.pageId === manifest.pageId), newFiles: fresh.length, newBytes: Math.max(0, grown), newNotes });
    newCanvas = full.length > 0;
  }
  if (newCanvas) trusted = null;
  const stateFirst = !record || record.state === 'created' || record.pages === 0;
  let expectedFirst;
  let reason;
  if (newCanvas) { expectedFirst = true; reason = 'canvas-full'; } else if (stateFirst && trusted?.mainTaken === true) { expectedFirst = false; reason = 'main-taken'; } else if (stateFirst) { expectedFirst = true; reason = 'state'; } else if (trusted?.ownsMain === true) { expectedFirst = true; reason = 'owns-main'; } else { expectedFirst = false; reason = 'state'; }
  if (manifest.first !== expectedFirst) return fail([{ code: 'first-mismatch', expectedFirst, reason }], full.length ? { full } : {});

  // (5) the step that the state asks for
  const diff = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId: manifest.pageId, published: trusted });
  const indexFile = path.join(canvas, ...INDEX.split('/'));
  let step;
  let toSend = null;
  let merged = null;
  if (!record || newCanvas) {
    if (typeof types.design !== 'string' || !types.design) return fail([{ code: 'no-design-type' }]);
    step = { id: 'canvas-create', params: { action: 'publish', type_url: types.design, title: fragment.canvasTitle, auto_open: 'after_first_write' } };
  } else if (record.state === 'published' && trusted && trusted.pageId === manifest.pageId && !diff.changed.length && !diff.sendIndex) {
    return { ok: true, problems: [], notes: noteList(manifest), done: true, step: null, removed: diff.removed };
  } else {
    merged = currentMerge({ run, canvas, record, diff });
    if (!merged) {
      const paths = [INDEX, ...Object.keys(trusted?.files ?? {}).filter((p) => !(trusted.deleted ?? []).includes(nameOf(p))).sort()];
      if (paths.length > LIMITS.paths) return fail([{ code: 'too-many-paths' }]);
      step = { id: 'canvas-read-live', params: { action: 'read', url: record.url, paths } };
    } else {
      toSend = diff.changed;
      const files = Object.fromEntries(toSend.map((p) => [p, p]));
      step = { id: 'canvas-publish', params: { action: 'publish', url: record.url, root: canvas, file_path: indexFile, files } };
    }
  }

  // (6, before the scan: it costs a stat) limits per call
  if (toSend) {
    const sized = [...toSend, INDEX].map((p) => ({ path: p, size: sizeOf(canvas, p) }));
    const over = callLimitProblems({ entries: toSend.length, sizes: sized });
    if (over.length) return fail(over);
  }

  // (7) the leak check, on the exact bytes and on every string that goes into the params
  let values;
  try { values = readValuesFile(valuesFile); } catch { return fail([{ code: 'no-leak-values' }]); }
  const originsFile = path.join(path.dirname(valuesFile), 'leak-origins.json');
  const origins = readJson(originsFile);
  // leak-values always writes this file: missing, unreadable or with git failed means the user name and email are unknown
  if (!origins || typeof origins !== 'object' || Array.isArray(origins) || !['ok', 'unset'].includes(origins.git)) return fail([{ code: 'no-leak-values', detail: 'leak-origins.json is missing, unreadable or says that git failed' }]);
  const localPaths = new Set([step.params.root, step.params.file_path, ...Object.values(step.params.files ?? {})].filter(Boolean));
  const texts = [
    { label: 'canvasTitle', text: fragment.canvasTitle },
    { label: 'pageName', text: fragment.page.name },
    ...Object.entries(fragment.boards).map(([k, b]) => ({ label: `board ${k}`, text: b.title })),
    ...Object.entries(fragment.notes).map(([k, n]) => ({ label: `note ${k}`, text: n.text })),
    ...allStrings(step.params).filter((s) => !localPaths.has(s)).map((s, i) => ({ label: `params[${i}]`, text: s })),
  ];
  // the merged index: what the live one already had is the user's and is not looked at again (R-8 e); the rest, as loose texts
  let skipFiles = [];
  if (merged && merged.live) {
    let mergedIndex;
    try { mergedIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { return fail([{ code: 'unreadable-entry', file: 'canvas/project/canvas.json' }]); }
    skipFiles = [INDEX];
    texts.push(...indexDiffTexts(mergedIndex, merged.live));
  }
  const scan = scanBytes({ roots: [{ dir: canvas, expect: path.join(fs.realpathSync.native(run), 'canvas') }], texts, values, skipFiles });
  if (!scan.ok) return fail(scan.problems);

  try { assertParams(step.params); } catch (e) { return fail([{ code: 'bad-params', detail: e.message }]); }

  const planFiles = {};
  if (toSend) for (const p of [...toSend, INDEX]) planFiles[p] = sha(fs.readFileSync(path.join(canvas, ...p.split('/'))));
  writeAtomic(path.join(run, 'plan.json'), `${JSON.stringify({ id: step.id, files: planFiles, changed: diff.changed, sendIndex: diff.sendIndex, at: new Date().toISOString() }, null, 2)}\n`);
  return { ok: true, problems: [], notes: noteList(manifest), done: false, step, ...(newCanvas ? { newCanvas: true } : {}) };
}

const noteList = (manifest) => (Array.isArray(manifest.warnings) ? manifest.warnings.map((w) => `${w.file}: ${w.code}`) : []);

// ---- diff (informative) ------------------------------------------------------------------------------

export function diffRun({ run }) {
  const canvas = path.join(run, 'canvas');
  if (linkProblem(canvas)) return { ok: false, problems: [{ code: 'root-is-link' }] };
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  if (!isObj(manifest) || !Array.isArray(manifest.files)) return { ok: false, problems: [{ code: 'no-canvas' }] };
  const read = readPublished(run);
  if (read.problem) return { ok: false, problems: [{ code: read.problem }] };
  return { ok: true, ...diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId: manifest.pageId, published: read.data }) };
}

// ---- merge with the live index -----------------------------------------------------------------------

// The artboards that read-live saved: <liveDir>/<path> or <liveDir>/<name>, found with the exact name first and
// then without regard to case. { 'project/<n>': sha256 | null (not there) }; a link is a usage error (exit 2).
function readLiveFiles({ liveDir, paths }) {
  const out = {};
  let names = null;
  const find = (rel) => {
    for (const cand of [path.join(liveDir, ...rel.split('/')), path.join(liveDir, nameOf(rel))]) {
      let st = null;
      try { st = fs.lstatSync(cand); } catch { /* next */ }
      if (st) return { cand, st };
    }
    names ??= fs.readdirSync(liveDir);
    const low = nameOf(rel).toLowerCase();
    const hit = names.filter((n) => n.toLowerCase() === low);
    if (hit.length === 1) { const cand = path.join(liveDir, hit[0]); return { cand, st: fs.lstatSync(cand) }; }
    return null;
  };
  for (const p of paths) {
    const f = find(p);
    if (!f) { out[p] = null; continue; }
    if (f.st.isSymbolicLink() || !f.st.isFile()) throw new PublishError(`${nameOf(p)} en --live-dir es un enlace o no es un archivo: se rechaza`, true);
    if (f.st.size > 16 * MB) throw new PublishError(`${nameOf(p)} en --live-dir pesa más de 16 MB`, true);
    out[p] = liveSha256(fs.readFileSync(f.cand));
  }
  return out;
}

export function mergeLive({ run, live, liveDir, acceptOverwrite = [], data, project, now }) {
  const canvas = path.join(run, 'canvas');
  // whatever this merge ends in, the merge of before is no longer current: a merge that stops leaves none behind (RL2-01)
  try { removeOwnDir(path.join(run, 'merge')); } catch { return { ok: false, problems: [{ code: 'root-is-link' }] }; }
  if (linkProblem(canvas)) return { ok: false, problems: [{ code: 'root-is-link' }] };
  const fragment = readJson(path.join(canvas, 'page.json'));
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  if (!isObj(fragment) || !isObj(manifest) || !Array.isArray(manifest.files)) return { ok: false, problems: [{ code: 'no-canvas' }] };
  let stored;
  try { stored = readRecord({ data, project }); } catch (e) { if (e instanceof ConfigError) return { ok: false, problems: [{ code: 'config-unreadable' }] }; throw e; }
  if (stored.problem) return { ok: false, problems: [{ code: 'bad-canvas-state', detail: stored.problem }] };
  const record = stored.canvas;
  if (!record) return { ok: false, problems: [{ code: 'no-canvas-state' }] };
  const read = readPublished(run);
  if (read.problem) return { ok: false, problems: [{ code: read.problem }] };
  const trusted = ownPublished(read.data, record, false);
  const deleted = trusted?.deleted ?? [];
  const wasFiles = trusted?.files ?? {};
  const checked = Object.keys(wasFiles).filter((p) => !deleted.includes(nameOf(p))).sort();

  let liveIndex = null;
  let liveText = null;
  let liveFiles = null;
  if (live === 'none') {
    if (liveDir !== 'none') return { ok: false, usage: true, error: 'live-dir-with-none', problems: [{ code: 'live-dir-with-none' }] };
    // --live none is valid only for a canvas that was just created and has nothing in it yet
    if (record.state !== 'created') return { ok: false, problems: [{ code: 'not-created' }] };
  } else {
    let st;
    try { st = fs.lstatSync(live); } catch { throw new PublishError('--live no existe', true); }
    if (st.isSymbolicLink() || !st.isFile()) throw new PublishError('--live es un enlace o no es un archivo: se rechaza', true);
    if (st.size > LIVE_MAX) throw new PublishError('--live pesa más de 8 MB', true);
    liveText = fs.readFileSync(live);
    try { liveIndex = JSON.parse(liveText.toString('utf8').replace(/^﻿/, '')); } catch { return { ok: false, problems: [{ code: 'bad-live' }] }; }
    // a frame that was deleted and is back in the live index is not exempt any more: it leaves publish.json.deleted, the next
    // read-live asks for it and the next merge compares its hash (RL2-02). Nothing of this merge is kept.
    const liveNames = isObj(liveIndex) && isObj(liveIndex.boards) ? Object.keys(liveIndex.boards).map((n) => n.toLowerCase()) : [];
    const back = deleted.filter((n) => liveNames.includes(n.toLowerCase()));
    if (back.length && trusted) {
      writeAtomic(publishFile(run), `${JSON.stringify({ ...trusted, deleted: deleted.filter((n) => !back.includes(n)) }, null, 2)}
`);
      return { ok: false, problems: back.map((file) => ({ code: 'live-incomplete', file })), kept: emptyKept() };
    }
    if (liveDir === 'none') {
      if (checked.length) throw new PublishError('falta --live-dir: la corrida ya publicó artboards y hay que compararlos con los que se leyeron', true);
    } else {
      let dst;
      try { dst = fs.lstatSync(liveDir); } catch { throw new PublishError('--live-dir no existe', true); }
      if (dst.isSymbolicLink() || !dst.isDirectory()) throw new PublishError('--live-dir es un enlace o no es una carpeta: se rechaza', true);
      liveFiles = readLiveFiles({ liveDir, paths: checked });
    }
  }

  const diff = diffPublished({ manifest, layoutSha256: manifest.layoutSha256, pageId: manifest.pageId, published: trusted });
  const plan = readJson(path.join(run, 'plan.json'));
  const owned = isObj(plan) && plan.id === 'canvas-publish' && isObj(plan.files) ? Object.keys(plan.files).filter((p) => p !== INDEX) : [];
  const publishedForMerge = trusted ? { ...trusted, files: Object.fromEntries(checked.map((p) => [p, wasFiles[p]])) } : null;
  const result = mergeIndex({
    ours: fragment, live: liveIndex, liveFiles, published: publishedForMerge, owned, title: fragment.canvasTitle, now,
    changed: diff.changed, launchPage: record.launchPage ?? null, first: manifest.first === true, ownsMain: trusted?.ownsMain === true,
    acceptOverwrite,
  });
  if (!result.ok) {
    // the canvas that was just created already has a Main.dc.html that is not ours: plan must accept first false (RL2-03)
    if (trusted && result.problems.some((p) => p.code === 'main-exists-live') && trusted.mainTaken !== true) {
      writeAtomic(publishFile(run), `${JSON.stringify({ ...trusted, mainTaken: true }, null, 2)}
`);
    }
    return { ok: false, problems: result.problems, kept: result.kept };
  }

  const mergeDir = path.join(run, 'merge');
  if (linkProblem(path.join(canvas, 'project'))) return { ok: false, problems: [{ code: 'root-is-link' }] };
  fs.mkdirSync(path.join(canvas, 'project'), { recursive: true });
  fs.mkdirSync(mergeDir, { recursive: true });
  const text = `${JSON.stringify(result.index, null, 2)}\n`;
  const indexFile = path.join(canvas, ...INDEX.split('/'));
  writeAtomic(indexFile, text);
  if (liveText) writeAtomic(path.join(mergeDir, 'live.json'), liveText);
  const k = result.kept;
  const info = {
    canvasUrl: record.url, canvasSha256: sha(text), liveSha256: liveText ? sha(liveText) : null, changed: diff.changed,
    keptMoved: k.keptMoved, keptEdited: k.keptEdited, userDeleted: k.userDeleted, editedByHand: k.editedByHand,
    overwritten: k.overwritten, restored: k.restored, warnings: k.warnings, launchWritten: k.launchWritten, pageAdded: k.pageAdded,
  };
  writeAtomic(path.join(mergeDir, 'merge.json'), `${JSON.stringify(info, null, 2)}\n`);
  return { ok: true, out: indexFile, canvasSha256: sha(text), kept: k, warnings: k.warnings };
}

// ---- recording ---------------------------------------------------------------------------------------

const subset = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

export function recordStep({ run, project, data, step, url }) {
  if (!ARTIFACT_URL.test(String(url))) throw new PublishError('la url no es la de un artifact de claude.ai (sin parámetros ni fragmento)', true);
  const canvas = path.join(run, 'canvas');
  const plan = readJson(path.join(run, 'plan.json'));
  if (!plan || plan.id !== step) return { ok: false, problems: [{ code: 'no-plan', detail: `plan.json no corresponde al paso ${step}` }] };
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  if (!manifest) return { ok: false, problems: [{ code: 'no-canvas' }] };
  const mergeDir = path.join(run, 'merge');
  if (step === 'canvas-create') {
    // a creation always means a canvas of its own: the record and the figures start over (R-16)
    writeConfig({ data, project, key: 'canvas', value: { url, state: 'created', pages: 0, files: 0, bytes: 0, notes: 0 } });
    writeAtomic(publishFile(run), `${JSON.stringify({ v: 2, canvasUrl: url, pageId: null, ownsMain: false, layoutSha256: null, files: {}, sizes: {}, boards: {}, notes: {}, deleted: [], refusals: 0 }, null, 2)}\n`);
    try { removeOwnDir(mergeDir); } catch { /* a link there: plan does not take it as current */ }
    return { ok: true, state: 'created' };
  }
  const stored = readRecord({ data, project });
  if (stored.problem || !stored.canvas || stored.canvas.url !== url) return { ok: false, problems: [{ code: 'url-mismatch' }] };
  const record = stored.canvas;
  const read = readPublished(run);
  if (read.problem) return { ok: false, problems: [{ code: read.problem }] };
  const trusted = ownPublished(read.data, record, false);
  // the bytes that were planned must still be the bytes on disk
  for (const [rel, want] of Object.entries(plan.files)) {
    let have = null;
    try { have = sha(fs.readFileSync(path.join(canvas, ...rel.split('/')))); } catch { /* missing counts as changed */ }
    if (have !== want) return { ok: false, problems: [{ code: 'published-unplanned-bytes', file: rel }] };
  }
  const fragment = readJson(path.join(canvas, 'page.json'));
  const info = readJson(path.join(mergeDir, 'merge.json'));
  const was = trusted?.files ?? {};
  const sent = Object.keys(plan.files).filter((p) => p !== INDEX);
  const files = sortedObj({ ...was, ...Object.fromEntries(sent.map((p) => [p, manifest.files.find((f) => f.path === p)?.sha256])) });
  const sizes = { ...(trusted?.sizes ?? {}) };
  let grown = 0;
  for (const p of sent) { const size = sizeOf(canvas, p); grown += size - (sizes[p] ?? 0); sizes[p] = size; }
  const newNotes = Object.keys(fragment.notes ?? {}).filter((id) => !(trusted?.notes && id in trusted.notes)).length;
  const pageIsNew = !(trusted && trusted.pageId === manifest.pageId);
  const deleted = [...new Set([...(trusted?.deleted ?? []), ...(isObj(info) && Array.isArray(info.userDeleted) ? info.userDeleted : []).filter((n) => String(n).endsWith('.dc.html'))])]
    .filter((n) => !sent.includes(`project/${n}`)).sort();
  const next = {
    url, state: 'published', pages: record.pages + (pageIsNew ? 1 : 0), files: record.files + sent.filter((p) => !(p in was)).length,
    bytes: record.bytes + Math.max(0, grown), notes: record.notes + newNotes,
    ...(record.dsInstalledSha256 ? { dsInstalledSha256: record.dsInstalledSha256 } : {}),
    ...(isObj(info) && typeof info.launchWritten === 'string' ? { launchPage: info.launchWritten } : (record.launchPage ? { launchPage: record.launchPage } : {})),
  };
  // project.json first: if the run stops between the two, the next plan only republishes (the figures round up)
  writeConfig({ data, project, key: 'canvas', value: next });
  writeAtomic(publishFile(run), `${JSON.stringify({
    v: 2, canvasUrl: url, pageId: manifest.pageId, pageName: fragment.page.name, ownsMain: trusted?.ownsMain === true || manifest.first === true,
    layoutSha256: manifest.layoutSha256, files, sizes: sortedObj(sizes),
    boards: Object.fromEntries(Object.entries(fragment.boards).map(([n, b]) => [n, subset(b, ['x', 'y', 'w', 'h', 'title'])])),
    notes: Object.fromEntries(Object.entries(fragment.notes ?? {}).map(([id, n]) => [id, subset(n, ['x', 'y', 'text', 'maxW'])])),
    deleted, refusals: 0,
  }, null, 2)}\n`);
  try { removeOwnDir(mergeDir); } catch { /* a link there: plan does not take it as current */ }
  return { ok: true, state: 'published' };
}

// ---- refusals ----------------------------------------------------------------------------------------

// The tool refused a publication because somebody edited the canvas after we read it (the second line of
// defense: the first is the hash comparison of merge). Counts them: the third one stops (R-9).
export function noteRefusal({ run, kind, named }) {
  if (kind !== 'canvas') throw new PublishError('--kind solo admite canvas en esta versión', true);
  // every exit leaves no merge as current: the next merge reads the live canvas again (RL2-01)
  try { removeOwnDir(path.join(run, 'merge')); } catch { /* a link there: plan does not take it as current */ }
  const file = publishFile(run);
  const read = readPublished(run);
  if (read.problem) return { count: 0, stop: true, reason: read.problem };
  if (!read.data) throw new PublishError('la corrida no tiene publish.json: no hay una publicación que se haya rechazado', true);
  const count = (read.data.refusals ?? 0) + 1;
  const manifest = readJson(path.join(run, 'canvas', 'manifest.json'));
  const ours = new Set((Array.isArray(manifest?.files) ? manifest.files : []).map((f) => nameOf(f.path).toLowerCase()));
  // a refusal that names one of OUR artboards: somebody edited it by hand, and trying again would overwrite that
  if (typeof named === 'string' && named !== '' && ours.has(nameOf(named).toLowerCase())) return { count: read.data.refusals ?? 0, stop: true, reason: 'artboard-edited-by-hand' };
  writeAtomic(file, `${JSON.stringify({ ...read.data, v: 2, refusals: count }, null, 2)}\n`);
  const stop = count >= REFUSAL_STOP.canvas;
  return stop ? { count, stop, reason: 'too-many-refusals' } : { count, stop };
}

export { layoutSha256, emptyKept };
