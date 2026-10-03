// Adding our page to the live index of the canvas without touching what the user did (R-9, R-16).
// Pure functions: no file is written here.
//
// diffPublished({ manifest, layoutSha256, pageId, published }) -> { changed, removed, sendIndex }
//   paths are the manifest ones ('project/<name>.dc.html'); only informative for `removed`.
// mergeIndex({ ours, live, liveFiles, published, owned, title, now, changed, launchPage, first, ownsMain, acceptOverwrite })
//     -> { ok, index, problems, kept }
//   ours: the fragment of page.json. live: the index the tool saved, or null for a canvas with nothing in it.
//   liveFiles: { 'project/<name>.dc.html': sha256 | null } of the artboards that read-live got (null: not read);
//   published: what publish.json says we last published to THIS canvas ({ files, boards, notes, pageId }) or null;
//   owned: paths that belong to this run although publish.json does not list them (a plan that was never recorded).
//   removed: paths ('project/<name>.dc.html') of artboards THIS run published (published.files) and no longer builds. They leave boards and
//     order of the live index together with the row notes the run published for them (4i). A moved one goes too; one edited by hand stops
//     (artboard-edited-by-hand) unless it is in acceptOverwrite; a note whose text the user changed stays. Names are compared exactly.
//   kept: { keptMoved, keptEdited, userDeleted, editedByHand, overwritten, restored, dropped, dropKept, droppedNotes, warnings, launchWritten, pageAdded }
//   Problems (all or none, nothing is written on a problem): bad-live, bad-order, bad-id, page-collision,
//   name-collision, canvas-full, main-exists-live, live-incomplete, artboard-edited-by-hand.
// planLimits({ canvas, addPage, newFiles, newBytes, newNotes }) -> string[]     the reasons for opening a new canvas
import crypto from 'node:crypto';

export const MB = 1024 * 1024;
// What the type allows (R-16) and what we stop short of. merge counts the live index: 40 pages, 200 notes and
// 496 artboards (511 files per version minus the 15 fixed ones of the type, the pessimistic reading of C-24).
export const MERGE_LIMITS = { pages: 40, notes: 200, boards: 496 };
// plan counts what project.json says and opens a new canvas BEFORE the end: more than 38 pages, 480 files, 200 MB or 190 notes.
export const PLAN_LIMITS = { pages: 38, files: 480, bytes: 200 * MB, notes: 190 };

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const BOARD_FIELDS = ['x', 'y', 'w', 'h', 'title'];
const NOTE_FIELDS = ['x', 'y', 'text', 'maxW'];
const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (p) => String(p).replace(/^project\//, '');
const rootOf = (n) => String(n).replace(/\.dc\.html$/, '').toLowerCase();

export const emptyKept = () => ({ keptOnRequest: [], keptMoved: [], keptEdited: [], userDeleted: [], editedByHand: [], overwritten: [], restored: [], dropped: [], dropKept: [], droppedNotes: [], warnings: [], launchWritten: null, pageAdded: false });
const push = (list, v) => { if (!list.some((x) => same(x, v))) list.push(v); };

export function diffPublished({ manifest, layoutSha256, pageId, published }) {
  const ours = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
  const paths = Object.keys(ours).sort();
  const was = published && isObj(published.files) ? published.files : null;
  if (!published || published.pageId !== pageId || !was) return { changed: paths, removed: [], sendIndex: true };
  const changed = paths.filter((p) => was[p] !== ours[p]);
  const removed = Object.keys(was).filter((p) => !(p in ours)).sort();
  // a file that was never published needs its entry in the index
  const sendIndex = published.layoutSha256 !== layoutSha256 || changed.some((p) => !(p in was));
  return { changed, removed, sendIndex };
}

// The reasons (empty: the canvas goes on) for opening a new canvas, counting what is new (R-16).
export function planLimits({ canvas, addPage, newFiles, newBytes, newNotes }) {
  const out = [];
  if (canvas.pages + (addPage ? 1 : 0) > PLAN_LIMITS.pages) out.push('pages');
  if (canvas.files + newFiles > PLAN_LIMITS.files) out.push('files');
  if (canvas.bytes + newBytes > PLAN_LIMITS.bytes) out.push('bytes');
  if (canvas.notes + newNotes > PLAN_LIMITS.notes) out.push('notes');
  return out;
}

function uniqueName(name, taken) {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) if (!taken.includes(`${name} (${n})`)) return `${name} (${n})`;
}

function fresh(ours, title, now, kept) {
  return {
    ok: true,
    index: {
      v: 3,
      createdOnFiles: { v: 1, at: now },
      title,
      launch: { view: 'canvas', page: ours.page.id },
      pages: [{ id: ours.page.id, name: ours.page.name }],
      boards: clone(ours.boards),
      order: [...ours.order],
      notes: clone(ours.notes),
      designSystems: clone(ours.designSystems ?? []),
    },
    problems: [],
    kept: { ...kept, launchWritten: ours.page.id, pageAdded: true },
  };
}

export function mergeIndex({ ours, live = null, liveFiles = null, published = null, owned = [], title, now, changed = [], launchPage = null, first = false, ownsMain = false, acceptOverwrite = [], removed = [], keep = [] }) {
  const kept = emptyKept();
  const failed = (problems) => ({ ok: false, index: null, problems, kept });
  const pageId = ours.page.id;
  const idProblems = [];
  if (typeof pageId !== 'string' || !ID_RE.test(pageId)) idProblems.push({ code: 'bad-id', detail: 'page' });
  for (const id of Object.keys(ours.notes ?? {})) if (!ID_RE.test(id)) idProblems.push({ code: 'bad-id', detail: 'note' });
  if (idProblems.length) return failed(idProblems);
  if (live === null) return fresh(ours, title, now, kept);

  // ---- the live index must be one we understand: never touched, never invented ----
  const pagesLive = live && live.pages !== undefined ? live.pages : [];
  const notesLive = live && live.notes !== undefined ? live.notes : {};
  if (!isObj(live) || live.v !== 3 || !isObj(live.boards) || !Array.isArray(pagesLive) || !isObj(notesLive)
    || (live.designSystems !== undefined && !Array.isArray(live.designSystems))
    || (live.launch !== undefined && !isObj(live.launch))
    || pagesLive.some((p) => !isObj(p) || typeof p.id !== 'string')
    || Object.values(live.boards).some((b) => !isObj(b))
    || Object.values(notesLive).some((n) => !isObj(n))) return failed([{ code: 'bad-live' }]);
  const boardNames = Object.keys(live.boards);
  const order = live.order === undefined ? [] : live.order;
  if (!Array.isArray(order) || new Set(order).size !== order.length || order.length !== boardNames.length || !order.every((n) => n in live.boards)) return failed([{ code: 'bad-order' }]);

  const ownedNames = new Set([...owned, ...Object.keys(published?.files ?? {}), ...Object.keys(published?.boards ?? {})].map(nameOf));
  const ownsPage = (published && published.pageId === pageId) || owned.length > 0;
  const pageInLive = pagesLive.some((p) => p.id === pageId);
  const problems = [];
  if (pageInLive && !ownsPage) problems.push({ code: 'page-collision', detail: pageId });
  // names: unique without regard to case, also against the artboards of others
  const main = 'Main.dc.html';
  const mainIsOurs = ownsMain || ownedNames.has(main);
  const roots = new Map(boardNames.map((n) => [rootOf(n), n]));
  for (const n of Object.keys(ours.boards)) {
    // Main.dc.html: the exact name has its own check below (only one run holds it); another capitalisation of it is somebody else's (RL2-06)
    if (n === main) {
      const other = roots.get(rootOf(n));
      if (other !== undefined && other !== main) problems.push({ code: mainIsOurs ? 'name-collision' : 'main-exists-live', file: n });
      continue;
    }
    const other = roots.get(rootOf(n));
    if (other !== undefined && !(other === n && ownedNames.has(n))) problems.push({ code: 'name-collision', file: n });
  }
  if (first && main in live.boards && !mainIsOurs) problems.push({ code: 'main-exists-live', file: main });
  if (!first && !(main in live.boards)) kept.warnings.push('no-main-live');

  // ---- artboards of ours that were published before: edited by hand? deleted? (A4C2-01) ----
  const wasFiles = published && isObj(published.files) ? published.files : {};
  // the removed ones are only what publish.json lists, by the exact name and never a path that leaves project/ (4i)
  const keepNames = new Set(keep.map(nameOf));
  const removedNames = new Set(removed.filter((p) => typeof p === 'string' && p in wasFiles && !keepNames.has(nameOf(p))).map(nameOf).filter((n) => n !== '' && !/[\\/]/.test(n)));
  for (const p of removed) if (typeof p === 'string' && p in wasFiles && keepNames.has(nameOf(p))) push(kept.keptOnRequest, nameOf(p));
  const edited = [];
  if (liveFiles) {
    for (const p of Object.keys(wasFiles)) {
      const n = nameOf(p);
      if (!(p in liveFiles)) continue;
      const got = liveFiles[p];
      if (got === null) {
        if (n in live.boards) problems.push({ code: 'live-incomplete', file: n });
        else push(kept.userDeleted, n);
      } else if (got !== wasFiles[p]) {
        if (changed.includes(p) || removedNames.has(n)) {
          if (acceptOverwrite.map(nameOf).includes(n)) kept.overwritten.push(n); else edited.push(n);
        } else kept.editedByHand.push(n);
      }
    }
    if (edited.length) problems.push({ code: 'artboard-edited-by-hand', files: edited.sort() });
  }
  if (problems.length) return failed(problems);

  // ---- boards and notes: our fields follow the rule per field (A4C2-13) ----
  const boards = clone(live.boards);
  const orderOut = [...order];
  for (const [n, b] of Object.entries(ours.boards)) {
    const pub = published?.boards?.[n];
    const liveB = live.boards[n];
    if (liveB) {
      const out = clone(liveB);
      for (const f of BOARD_FIELDS) {
        if (!(f in b)) continue;
        if (pub === undefined) { if (out[f] === undefined) out[f] = b[f]; continue; }
        if (same(liveB[f], pub[f])) out[f] = b[f];
        else if (!same(liveB[f], b[f])) { if (f === 'x' || f === 'y') push(kept.keptMoved, n); else push(kept.keptEdited, { name: n, field: f }); }
      }
      if (out.page === undefined) out.page = b.page;
      if (b.is_interactive === true) out.is_interactive = true; else delete out.is_interactive;
      boards[n] = out;
    } else if (pub !== undefined && !changed.includes(`project/${n}`)) {
      push(kept.userDeleted, n);
    } else {
      boards[n] = clone(b);
      orderOut.push(n);
      if (pub !== undefined) kept.restored.push(n);
    }
  }
  const notes = clone(notesLive);
  for (const [id, note] of Object.entries(ours.notes ?? {})) {
    const pub = published?.notes?.[id];
    const liveN = notesLive[id];
    if (liveN) {
      const out = clone(liveN);
      for (const f of NOTE_FIELDS) {
        if (!(f in note)) continue;
        if (pub === undefined) { if (out[f] === undefined) out[f] = note[f]; continue; }
        if (same(liveN[f], pub[f])) out[f] = note[f];
        else if (!same(liveN[f], note[f])) { if (f === 'x' || f === 'y') push(kept.keptMoved, id); else push(kept.keptEdited, { name: id, field: f }); }
      }
      for (const f of ['kind', 'page']) if (out[f] === undefined && f in note) out[f] = note[f];
      notes[id] = out;
    } else if (pub !== undefined) {
      push(kept.userDeleted, id);
    } else {
      notes[id] = clone(note);
    }
  }

  // ---- what the run no longer builds leaves the canvas: its artboards, and its row notes if the user did not rewrite them (4i) ----
  // The chosen first screen: Main.dc.html is the first screen of the first option, so the chosen option's first frame is now built under that
  // name and its old name looks removed. It is not: Main takes the place where the user left it (R4i-01). Only when one removed frame has its title.
  const mainOurs = ours.boards[main];
  const heirs = mainOurs ? [...removedNames].filter((n) => n !== main && n in boards && published?.boards?.[n]?.title === mainOurs.title && published.boards[n].w === mainOurs.w) : [];
  if (heirs.length === 1 && main in boards) {
    const from = boards[heirs[0]];
    if (boards[main].x !== from.x || boards[main].y !== from.y) { boards[main].x = from.x; boards[main].y = from.y; push(kept.keptMoved, main); }
  }
  for (const n of [...removedNames].sort()) {
    if (!(n in boards) || n in ours.boards) continue;
    delete boards[n];
    const at = orderOut.indexOf(n);
    if (at >= 0) orderOut.splice(at, 1);
    kept.dropped.push(n);
  }
  if (removedNames.size) {
    for (const [id, pub] of Object.entries(published?.notes ?? {})) {
      if (id in (ours.notes ?? {}) || !(id in notes)) continue;
      if (same(notes[id].text, pub.text)) { delete notes[id]; kept.droppedNotes.push(id); } else push(kept.dropKept, id);
    }
  }

  // ---- page, launch, title ----
  const pages = clone(pagesLive);
  const designSystems = clone(live.designSystems ?? []);
  for (const ds of ours.designSystems ?? []) {
    const at = designSystems.findIndex((d) => isObj(d) && d.namespace === ds.namespace);
    if (at >= 0) designSystems[at] = clone(ds); else designSystems.push(clone(ds));
  }
  let launch = live.launch === undefined ? undefined : clone(live.launch);
  if (!pageInLive) {
    pages.push({ id: pageId, name: uniqueName(ours.page.name, pages.map((p) => p.name)) });
    kept.pageAdded = true;
    if (launch === undefined) { launch = { view: 'canvas', page: pageId }; kept.launchWritten = pageId; }
    else if (launch.page === undefined || (launchPage !== null && launch.page === launchPage)) { launch.page = pageId; kept.launchWritten = pageId; }
  }
  const limit = [];
  if (pages.length > MERGE_LIMITS.pages) limit.push('pages');
  if (Object.keys(notes).length > MERGE_LIMITS.notes) limit.push('notes');
  if (Object.keys(boards).length > MERGE_LIMITS.boards) limit.push('boards');
  if (limit.length) return failed(limit.map((detail) => ({ code: 'canvas-full', detail })));

  // keys of the live index stay in their order and keep their values; only ours are added
  const index = { ...clone(live) };
  index.v = 3;
  if (index.createdOnFiles === undefined) index.createdOnFiles = { v: 1, at: now };
  if (typeof index.title !== 'string' || index.title.trim() === '') index.title = title;
  if (launch !== undefined) index.launch = launch;
  index.pages = pages;
  index.boards = boards;
  index.order = orderOut;
  index.notes = notes;
  index.designSystems = designSystems;
  return { ok: true, index, problems: [], kept };
}

// ---- reading what the tool saved ------------------------------------------------------------------------

// The sha256 of an artboard that was read back, tolerant of what a save may change without the user editing
// anything: a byte order mark and CRLF line ends (our files have neither). Anything else counts as an edit.
export function liveSha256(buf) {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  const out = [];
  for (let i = 0; i < b.length; i++) { if (b[i] === 0x0d && b[i + 1] === 0x0a) continue; out.push(b[i]); }
  return crypto.createHash('sha256').update(Buffer.from(out)).digest('hex');
}
