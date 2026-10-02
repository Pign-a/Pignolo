// Layout of the canvas page of one run (R-3, R-6): names, coordinates, notes, the fragment that
// canvas-index writes, and the verification of what was written.
//
// pageIdFor(runId) -> 'r-YYYYMMDDHHMM-<6 hex>'           (21 characters, unique per run)
// buildCanvas({ options, platform, pageId, pageName, canvasTitle, first, now, heights }) -> { files, fragment }
// layoutSha256(fragment) -> hex
// verifyCanvas({ dir }) -> { ok, problems: [{ code, file?, detail? }] }
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { toArtboard, sizesFor, artboardName, isInteractive } from './canvas.mjs';
import { CanvasError, scanMarkup } from './canvas-html.mjs';
import { parseFontLinks } from './remote-fonts.mjs';
import { clampHeight } from './page-height.mjs';

export { CanvasError };

export const ROW_GAP = 260;
export const FRAME_GAP = 80;
const NOTE_ABOVE = 223;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.dc\.html$/;
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');

export function pageIdFor(runId) {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{4})-/.exec(String(runId));
  if (!m) throw new CanvasError('bad-run-id', 'the run id must start with YYYY-MM-DD-HHMM-');
  return `r-${m[1]}${m[2]}${m[3]}${m[4]}-${sha(String(runId)).slice(0, 6)}`;
}

function heightOf(heights, option, file, w, fallback) {
  const v = heights?.[`${option}/${file}@${w}`];
  return clampHeight(v) ?? fallback;
}

export function buildCanvas({ options, platform, pageId, pageName, canvasTitle, first = true, heights = null }) {
  const sizes = sizesFor(platform);
  const files = {};
  const boards = {};
  const order = [];
  const notes = {};
  let y = ROW_GAP;
  let mainTaken = false;
  for (const opt of options) {
    if (opt.kind !== 'option') throw new CanvasError('unsupported-kind', `only mockup options go to the canvas, got ${opt.kind}`);
    const letter = String(opt.id).toLowerCase();
    // names first: the links of a screen point to the artboard of the same option and width
    const names = {};
    for (const size of sizes) {
      names[size.w] = {};
      opt.screens.forEach((s, i) => {
        const isMain = first && !mainTaken && opt.id === options[0].id && i === 0 && size.w === sizes[0].w;
        names[size.w][s.file] = artboardName({ prefix: pageId, option: opt.id, screen: s.file, w: size.w, platform, isMain });
      });
    }
    for (const size of sizes) {
      const rowId = `${pageId}-row-${letter}${platform === 'both' ? `-${size.w}` : ''}`;
      const rowSizes = opt.screens.map((s) => ({ ...s, h: heightOf(heights, opt.id, s.file, size.w, size.h) }));
      const rowH = Math.max(...rowSizes.map((s) => s.h));
      let x = 0;
      for (const s of rowSizes) {
        const name = names[size.w][s.file];
        const stem = s.file.replace(/\.html$/, '');
        const links = {};
        for (const other of opt.screens) links[other.file] = names[size.w][other.file];
        try {
          files[name] = toArtboard({ html: s.html, w: size.w, h: s.h, links, allowFonts: true });
        } catch (e) {
          if (e instanceof CanvasError) e.file = `option-${opt.id}/${s.file}`;
          throw e;
        }
        const board = { x, y, w: size.w, h: s.h, title: `${opt.id} · ${stem}${platform === 'both' ? ` · ${size.w}` : ''}`, page: pageId };
        if (isInteractive(s.html)) board.is_interactive = true;
        boards[name] = board;
        order.push(name);
        if (name === 'Main.dc.html') mainTaken = true;
        x += size.w + FRAME_GAP;
      }
      // title1 is for several artboards ("never for one"): a row with a single frame is named by the title of the frame
      if (opt.screens.length > 1) {
        notes[rowId] = {
          x: 0, y: y - ROW_GAP, text: `Opción ${opt.id}${platform === 'both' ? ` · ${size.w}` : ''}`, kind: 'title1',
          maxW: opt.screens.length * size.w + (opt.screens.length - 1) * FRAME_GAP, page: pageId,
        };
      }
      y += rowH + ROW_GAP;
    }
  }
  const fragment = { v: 3, page: { id: pageId, name: pageName }, canvasTitle, boards, order, notes, designSystems: [] };
  return { files, fragment };
}

// Stable serialization with sorted keys.
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function layoutSha256(fragment) {
  const boards = {};
  for (const [k, b] of Object.entries(fragment.boards ?? {})) {
    boards[k] = { x: b.x, y: b.y, w: b.w, h: b.h, title: b.title, page: b.page, is_interactive: b.is_interactive };
  }
  return sha(stable({ page: fragment.page, boards, order: fragment.order, notes: fragment.notes }));
}

// ---- verification of what was written -------------------------------------------------------------

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; } };

function listArtboards(projectDir) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(projectDir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) if (e.isFile() && e.name.endsWith('.dc.html')) out.push(e.name);
  return out.sort();
}

function checkArtboard(name, html, problems) {
  const bad = (detail) => problems.push({ code: 'bad-skeleton', file: name, detail });
  if (!html.includes('<script src="./support.js"></script>')) bad('missing the support.js line');
  if (!html.includes('<x-dc>') || !html.includes('</x-dc>')) bad('missing <x-dc>');
  if (!html.includes('<helmet>') || !html.includes('</helmet>')) bad('missing <helmet>');
  if (!html.includes('data-dc-script')) bad('missing the data-dc-script block');
  if (!html.includes('class Component extends DCLogic')) bad('missing the Component class');
  if (html.split('<script').length - 1 > 2) bad('more than two <script>');
  if (html.includes('innerHTML')) bad('innerHTML');
  if (html.includes('{{')) bad('an opening brace pair');
  // the skeleton uses the reserved tags on purpose; anything else the scan finds is a converter bug
  const other = scanMarkup(html).problems.find((p) => p.code !== 'braces' && p.code !== 'reserved-tag');
  if (other) bad(`markup: ${other.code}`);
  // fonts: only inside <helmet>, only in the allowed form
  const h0 = html.indexOf('<helmet>');
  const h1 = html.indexOf('</helmet>');
  const helmet = h0 >= 0 && h1 > h0 ? html.slice(h0, h1) : '';
  const outside = h0 >= 0 && h1 > h0 ? html.slice(0, h0) + html.slice(h1) : html;
  if (/<link\b/i.test(outside) || !parseFontLinks(helmet).ok) problems.push({ code: 'bad-font', file: name });
}

export function verifyCanvas({ dir }) {
  const problems = [];
  const add = (code, file, detail) => problems.push({ code, ...(file ? { file } : {}), ...(detail ? { detail } : {}) });
  const fragment = readJson(path.join(dir, 'page.json'));
  const manifest = readJson(path.join(dir, 'manifest.json'));
  if (!fragment || typeof fragment !== 'object') { add('manifest-mismatch', 'page.json', 'page.json is missing or unreadable'); return { ok: false, problems }; }
  if (!manifest || typeof manifest !== 'object') { add('manifest-mismatch', 'manifest.json', 'manifest.json is missing or unreadable'); return { ok: false, problems }; }
  const projectDir = path.join(dir, 'project');
  const boards = fragment.boards && typeof fragment.boards === 'object' ? fragment.boards : {};
  const notes = fragment.notes && typeof fragment.notes === 'object' ? fragment.notes : {};
  const order = Array.isArray(fragment.order) ? fragment.order : [];
  const pageId = fragment.page?.id;
  const onDisk = listArtboards(projectDir);
  const names = [...new Set([...Object.keys(boards), ...onDisk])];

  // names
  for (const n of names) if (!NAME_RE.test(n) || `project/${n}`.length > 80) add('bad-name', n);
  const roots = new Map();
  for (const n of names) {
    const r = n.replace(/\.dc\.html$/, '').toLowerCase();
    if (roots.has(r) && roots.get(r) !== n) add('name-collision', n);
    roots.set(r, n);
  }
  for (const n of Object.keys(boards)) if (!onDisk.includes(n)) add('missing-file', n);
  for (const n of onDisk) if (!(n in boards)) add('unlisted-file', n);

  // page, ids, titles
  if (typeof pageId !== 'string' || !ID_RE.test(pageId)) add('bad-id', 'page.json', 'the page id');
  const titleOk = (t) => typeof t === 'string' && t.trim() !== '' && t.length <= 120;
  if (!titleOk(fragment.canvasTitle)) add('bad-title', 'page.json', 'canvasTitle');
  if (!titleOk(fragment.page?.name)) add('bad-title', 'page.json', 'page name');
  for (const id of Object.keys(notes)) if (!ID_RE.test(id)) add('bad-id', 'page.json', `note ${id.slice(0, 20)}`);
  for (const [n, b] of Object.entries(boards)) {
    if (!b || b.page !== pageId) add('bad-page', n);
    if (!(Number.isFinite(b?.w) && b.w >= 40 && b.w <= 8000 && Number.isFinite(b?.h) && b.h >= 40 && b.h <= 8000)) add('bad-size', n);
    if (typeof pageId === 'string' && n !== 'Main.dc.html' && !n.startsWith(`${pageId}-`)) add('bad-prefix', n);
  }
  for (const [id, note] of Object.entries(notes)) if (!note || note.page !== pageId) add('bad-page', id);

  // order and Main
  const keys = Object.keys(boards);
  if (order.length !== keys.length || new Set(order).size !== order.length || !order.every((n) => n in boards)) add('bad-order', 'page.json');
  if (manifest.first === true) { if (order[0] !== 'Main.dc.html') add('no-main', 'page.json', 'the first artboard must be Main.dc.html'); }
  else if (names.includes('Main.dc.html')) add('no-main', 'Main.dc.html', 'a run that does not open the canvas must not write Main.dc.html');

  // skeleton and fonts of each artboard
  for (const n of onDisk) {
    let html = '';
    try { html = fs.readFileSync(path.join(projectDir, n), 'utf8'); } catch { add('missing-file', n); continue; }
    checkArtboard(n, html, problems);
  }

  // geometry: 80 px between the frames of a row, 120 between rows, notes at least 223 px above their row
  const frames = Object.values(boards).filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h));
  const rows = new Map();
  for (const b of frames) rows.set(b.y, [...(rows.get(b.y) ?? []), b]);
  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, row] of sortedRows) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) if (row[i].x - (row[i - 1].x + row[i - 1].w) !== FRAME_GAP) add('bad-gap', row[i].title ?? '', 'horizontal gap');
  }
  for (let i = 1; i < sortedRows.length; i++) {
    const prevBottom = sortedRows[i - 1][0] + Math.max(...sortedRows[i - 1][1].map((b) => b.h));
    if (sortedRows[i][0] - prevBottom < 120) add('bad-gap', '', 'vertical gap');
  }
  for (const [id, note] of Object.entries(notes)) {
    if (!note || !Number.isFinite(note.y) || !Number.isFinite(note.x)) continue;
    const below = frames.filter((b) => b.y > note.y && b.x < note.x + (note.maxW ?? 0) && b.x + b.w > note.x).map((b) => b.y);
    if (below.length && Math.min(...below) - note.y < NOTE_ABOVE) add('note-too-close', id);
  }

  // manifest
  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  const byPath = new Map(listed.map((f) => [f.path, f.sha256]));
  for (const n of onDisk) {
    const want = byPath.get(`project/${n}`);
    let have = null;
    try { have = sha(fs.readFileSync(path.join(projectDir, n))); } catch { /* reported above */ }
    if (want !== have) add('manifest-mismatch', n);
  }
  for (const f of listed) if (!onDisk.includes(String(f.path).replace(/^project\//, ''))) add('manifest-mismatch', f.path);
  if (manifest.layoutSha256 !== layoutSha256(fragment)) add('manifest-mismatch', 'manifest.json', 'layoutSha256');
  if (manifest.pageId !== pageId) add('manifest-mismatch', 'manifest.json', 'pageId');

  // the merged index, when merge already wrote it
  const merged = readJson(path.join(projectDir, 'canvas.json'));
  if (merged && typeof merged === 'object') {
    const mb = merged.boards ?? {};
    const mn = merged.notes ?? {};
    // what the user deleted from the live canvas is not put back: merge says which (R-9), and only it can excuse an entry
    const info = readJson(path.join(path.dirname(dir), 'merge', 'merge.json'));
    const deleted = new Set(Array.isArray(info?.userDeleted) ? info.userDeleted.map(String) : []);
    for (const n of Object.keys(boards)) if (!(n in mb) && !deleted.has(n)) add('missing-own-entry', n);
    for (const id of Object.keys(notes)) if (!(id in mn) && !deleted.has(id)) add('missing-own-entry', id);
    if (!Array.isArray(merged.pages) || !merged.pages.some((p) => p && p.id === pageId)) add('missing-own-entry', pageId ?? 'page');
    // a live canvas also holds the artboards of other runs and the user's own: only an entry of OUR page needs its file here
    const ours = (n) => (typeof pageId === 'string' && n.startsWith(`${pageId}-`)) || (n === 'Main.dc.html' && manifest.first === true);
    for (const n of Object.keys(mb)) if (ours(n) && !onDisk.includes(n)) add('entry-without-file', n);
  }
  const seen = new Set();
  const unique = problems.filter((p) => { const k = `${p.code}|${p.file ?? ''}|${p.detail ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ok: unique.length === 0, problems: unique };
}

// For tests and for canvas-index: the same name rule as the type.
export const isArtboardName = (n) => NAME_RE.test(n);
