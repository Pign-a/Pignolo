// The only way to a publication (R-7, R-8), stage 1: ONE canvas per run, state in <run>/publish.json.
//
// planNext({ run, project, data, types: { design }, valuesFile }) -> { ok, problems, notes, done, step }
//   Decides the next Artifact step (canvas-create -> canvas-read-live -> canvas-publish) and, before it
//   returns anything, runs in this order and stops at the first failure (every failure is closed: ok
//   false, step null, NO params): opt-out, root, verifyCanvas, first, scanBytes over the exact bytes and
//   every string of the params, limits per call. It writes <run>/plan.json (id of the step and the
//   sha256 of every file to send); recordStep re-hashes against it.
// mergeIndex({ ours, live, title, now }) -> { ok, index, problems }   (live null: from scratch)
// mergeLive({ run, live, liveDir, now }) -> { ok, ... }                (stage 1: only --live none)
// recordStep({ run, project, data, step, url }) -> { ok, ... }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyCanvas, layoutSha256 } from './canvas-layout.mjs';
import { scanBytes } from './leak-scan.mjs';
import { readValuesFile } from './leak-check.mjs';
import { readConfig, ConfigError } from './project-config.mjs';
import { linkProblem, isLink } from './link-guard.mjs';

export class PublishError extends Error {
  constructor(message, usage = false) { super(message); this.usage = usage; }
}

const MB = 1024 * 1024;
export const LIMITS = { paths: 254, call: 16 * MB, file: 16 * MB };
const FORBIDDEN_KEYS = new Set(['force', 'overwrite_unread', 'from_url', 'share', 'public', 'capabilities']);
// no scheme other than the one of the host, no query, no fragment: the url that Artifact returned
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]{8,64}$/;

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sortedObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; } };

function writeAtomic(file, text) {
  if (isLink(file)) throw new PublishError(`${path.basename(file)} es un enlace: se rechaza`, true);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export const publishFile = (run) => path.join(run, 'publish.json');

// ---- the index ---------------------------------------------------------------------------------------

export function mergeIndex({ ours, live = null, title, now }) {
  if (live !== null) return { ok: false, index: null, problems: [{ code: 'unsupported-live' }] };
  const index = {
    v: 3,
    createdOnFiles: { v: 1, at: now },
    title,
    launch: { view: 'canvas', page: ours.page.id },
    pages: [{ id: ours.page.id, name: ours.page.name }],
    boards: JSON.parse(JSON.stringify(ours.boards)),
    order: [...ours.order],
    notes: JSON.parse(JSON.stringify(ours.notes)),
    designSystems: [],
  };
  return { ok: true, index, problems: [] };
}

export function mergeLive({ run, live, liveDir, now }) {
  if (live !== 'none' || liveDir !== 'none') return { ok: false, usage: true, error: 'unsupported-live', problems: [{ code: 'unsupported-live' }] };
  const canvas = path.join(run, 'canvas');
  if (linkProblem(canvas)) return { ok: false, problems: [{ code: 'root-is-link' }] };
  const fragment = readJson(path.join(canvas, 'page.json'));
  if (!fragment) return { ok: false, problems: [{ code: 'no-canvas' }] };
  const published = readJson(publishFile(run));
  // --live none is valid only for a canvas that was just created and has nothing in it yet
  if (!published || published.state !== 'created') return { ok: false, problems: [{ code: 'not-created' }] };
  const merged = mergeIndex({ ours: fragment, live: null, title: fragment.canvasTitle, now });
  if (!merged.ok) return { ok: false, problems: merged.problems };
  const mergeDir = path.join(run, 'merge');
  if (linkProblem(mergeDir) || linkProblem(path.join(canvas, 'project'))) return { ok: false, problems: [{ code: 'root-is-link' }] };
  const text = `${JSON.stringify(merged.index, null, 2)}\n`;
  fs.mkdirSync(path.join(canvas, 'project'), { recursive: true });
  fs.mkdirSync(mergeDir, { recursive: true });
  const indexFile = path.join(canvas, 'project', 'canvas.json');
  writeAtomic(indexFile, text);
  writeAtomic(path.join(mergeDir, 'merge.json'), `${JSON.stringify({ canvasSha256: sha(text), kept: [] }, null, 2)}\n`);
  return { ok: true, out: indexFile, canvasSha256: sha(text) };
}

// ---- the plan ----------------------------------------------------------------------------------------

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); allStrings(v, out); }
  return out;
}

function assertParams(params) {
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
    const { optOut } = readConfig({ data, project });
    if (optOut) out.push({ code: optOut });
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    out.push({ code: 'config-unreadable' });
  }
  return out;
}

export function planNext({ run, project, data, types = {}, valuesFile }) {
  // (1) the opt-out comes before anything else, and a refusal carries no params
  const optOut = optOutProblems({ run, project, data });
  if (optOut.length) return fail(optOut);
  // (2) the root
  const canvas = path.join(run, 'canvas');
  if (!fs.existsSync(canvas) && !isLink(canvas)) return fail([{ code: 'no-canvas' }]);
  if (linkProblem(canvas)) return fail([{ code: 'root-is-link' }]);
  // (3) what was written is valid
  const verified = verifyCanvas({ dir: canvas });
  if (!verified.ok) return fail(verified.problems);
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  const fragment = readJson(path.join(canvas, 'page.json'));
  // (4) stage 1: every run opens its own canvas, so its first screen is Main.dc.html
  if (manifest.first !== true) return fail([{ code: 'first-mismatch', expectedFirst: true }]);

  // the step that the state asks for
  const published = readJson(publishFile(run)) ?? null;
  const manifestFiles = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
  const sameAsPublished = published && published.state === 'published' && published.layoutSha256 === manifest.layoutSha256
    && JSON.stringify(sortedObj(published.files ?? {})) === JSON.stringify(sortedObj(manifestFiles));
  const indexFile = path.join(canvas, 'project', 'canvas.json');
  const mergeInfo = readJson(path.join(run, 'merge', 'merge.json'));
  const mergeCurrent = fs.existsSync(indexFile) && mergeInfo && mergeInfo.canvasSha256 === sha(fs.readFileSync(indexFile));

  let step;
  let toSend = null;
  if (!published || !published.canvasUrl || (published.state === 'published' && !sameAsPublished)) {
    // (a) no canvas for this run, or (e) an option was regenerated after publishing: a NEW canvas for the run
    if (typeof types.design !== 'string' || !types.design) return fail([{ code: 'no-design-type' }]);
    step = { id: 'canvas-create', params: { action: 'publish', type_url: types.design, title: fragment.canvasTitle, auto_open: 'after_first_write' } };
  } else if (published.state === 'created' && !mergeCurrent) {
    step = { id: 'canvas-read-live', params: { action: 'read', url: published.canvasUrl, paths: ['project/canvas.json'] } };
  } else if (published.state === 'created') {
    toSend = Object.keys(manifestFiles).sort();
    const files = Object.fromEntries(toSend.map((p) => [p, p]));
    step = { id: 'canvas-publish', params: { action: 'publish', url: published.canvasUrl, root: canvas, file_path: indexFile, files } };
  } else {
    return { ok: true, problems: [], notes: noteList(manifest), done: true, step: null };
  }

  // (6, before the scan: it costs a stat) limits per call
  if (toSend) {
    const sized = [...toSend, 'project/canvas.json'].map((p) => ({ path: p, size: fs.statSync(path.join(canvas, ...p.split('/'))).size }));
    const over = callLimitProblems({ entries: toSend.length, sizes: sized });
    if (over.length) return fail(over);
  }

  // (5) the leak check, on the exact bytes and on every string that goes into the params
  let values;
  try { values = readValuesFile(valuesFile); } catch { return fail([{ code: 'no-leak-values' }]); }
  const originsFile = path.join(path.dirname(valuesFile), 'leak-origins.json');
  const origins = readJson(originsFile);
  if (origins && origins.git === 'failed') return fail([{ code: 'no-leak-values', detail: 'git failed: the user name and email are unknown' }]);
  const localPaths = new Set([step.params.root, step.params.file_path, ...Object.values(step.params.files ?? {})].filter(Boolean));
  const texts = [
    { label: 'canvasTitle', text: fragment.canvasTitle },
    { label: 'pageName', text: fragment.page.name },
    ...Object.entries(fragment.boards).map(([k, b]) => ({ label: `board ${k}`, text: b.title })),
    ...Object.entries(fragment.notes).map(([k, n]) => ({ label: `note ${k}`, text: n.text })),
    ...allStrings(step.params).filter((s) => !localPaths.has(s)).map((s, i) => ({ label: `params[${i}]`, text: s })),
  ];
  const scan = scanBytes({ roots: [{ dir: canvas, expect: path.join(fs.realpathSync.native(run), 'canvas') }], texts, values });
  if (!scan.ok) return fail(scan.problems);

  try { assertParams(step.params); } catch (e) { return fail([{ code: 'bad-params', detail: e.message }]); }

  const planFiles = {};
  if (toSend) for (const p of [...toSend, 'project/canvas.json']) planFiles[p] = sha(fs.readFileSync(path.join(canvas, ...p.split('/'))));
  writeAtomic(path.join(run, 'plan.json'), `${JSON.stringify({ id: step.id, files: planFiles, at: new Date().toISOString() }, null, 2)}\n`);
  return { ok: true, problems: [], notes: noteList(manifest), done: false, step };
}

const noteList = (manifest) => (Array.isArray(manifest.warnings) ? manifest.warnings.map((w) => `${w.file}: ${w.code}`) : []);

// ---- recording ---------------------------------------------------------------------------------------

export function recordStep({ run, step, url }) {
  if (!ARTIFACT_URL.test(String(url))) throw new PublishError('la url no es la de un artifact de claude.ai (sin parámetros ni fragmento)', true);
  const canvas = path.join(run, 'canvas');
  const plan = readJson(path.join(run, 'plan.json'));
  if (!plan || plan.id !== step) return { ok: false, problems: [{ code: 'no-plan', detail: `plan.json no corresponde al paso ${step}` }] };
  const current = readJson(publishFile(run)) ?? null;
  const manifest = readJson(path.join(canvas, 'manifest.json'));
  if (!manifest) return { ok: false, problems: [{ code: 'no-canvas' }] };
  if (step === 'canvas-create') {
    writeAtomic(publishFile(run), `${JSON.stringify({ v: 1, canvasUrl: url, state: 'created', files: {}, layoutSha256: null }, null, 2)}\n`);
    return { ok: true, state: 'created' };
  }
  if (!current || current.state !== 'created' || current.canvasUrl !== url) return { ok: false, problems: [{ code: 'url-mismatch' }] };
  // the bytes that were planned must still be the bytes on disk
  for (const [rel, want] of Object.entries(plan.files)) {
    let have = null;
    try { have = sha(fs.readFileSync(path.join(canvas, ...rel.split('/')))); } catch { /* missing counts as changed */ }
    if (have !== want) return { ok: false, problems: [{ code: 'published-unplanned-bytes', file: rel }] };
  }
  const files = sortedObj(Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256])));
  writeAtomic(publishFile(run), `${JSON.stringify({ v: 1, canvasUrl: url, state: 'published', files, layoutSha256: manifest.layoutSha256, ownsMain: true }, null, 2)}\n`);
  return { ok: true, state: 'published' };
}

export { layoutSha256 };
