// Leak check on the EXACT bytes that will leave the machine (R-8). It fails closed: no values (or
// fewer than two), a folder without files, a link, an unreadable entry: all of them are problems,
// never "no leaks". There is no option to accept fewer values (D-4c-16).
//
// diffStrings(next, base) -> string[]   what of the combined canvas.json is new (R-8 e)
// scanBytes({ roots: [{ dir, expect }], texts: [{ label, text }], values, skipFiles, readFile }) -> { ok, problems, notes }   (readFile: injectable, for the test of unreadable entries)
//   problems: { code, file?, kind?, view? }   code: no-leak-values | no-files | root-missing | root-is-link |
//   link-in-output | unreadable-entry | leak. A leak says the file and the kind, NEVER the value.
//   Every file (and every loose text) is looked at in several views: raw, with HTML entities decoded
//   (twice), with %XX and + decoded, with whitespace collapsed and tags stripped; a .json also through
//   JSON.parse (keys and values). Values and views are compared in NFC.
import fs from 'node:fs';
import path from 'node:path';
import { findLeaks, MIN_VALUE_LENGTH } from './leak-check.mjs';
import { linkProblem, isLink } from './link-guard.mjs';
import { decodeEntities, cssUnescape } from './entities.mjs';

export { decodeEntities };

function urlDecode(text) {
  const spaced = String(text).replace(/\+/g, ' ');
  return spaced.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => { try { return decodeURIComponent(run); } catch { return run; } });
}

const NBSP = String.fromCharCode(160);
const SPACES = new RegExp(`[\\s${NBSP}]+`, 'g');
const collapse = (text) => String(text).replace(/<[^>]*>/g, '').replace(SPACES, ' ');
// every tag becomes a space (cells and blocks next to each other): the text of the page as a reader sees it
const spaced = (text) => String(text).replace(/<[^>]*>/g, ' ').replace(SPACES, ' ');
// characters that are not seen: zero width (200b-200f), word joiner (2060-2064), soft hyphen (ad), byte order mark (feff)
const INVISIBLE = new RegExp(`[${[[0x200b, 0x200f], [0x2060, 0x2064], [0xad, 0xad], [0xfeff, 0xfeff]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`, 'g');
const visible = (text) => String(text).replace(INVISIBLE, '');

function jsonStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.push(k); jsonStrings(v, out); }
  return out;
}

// Every view of a text, as [name, text] pairs without repeats.
function viewsOf(raw, { json = false } = {}) {
  const sources = [['raw', raw]];
  if (json) {
    try { sources.push(['json', jsonStrings(JSON.parse(raw)).join('\n')]); } catch { /* not JSON: raw only */ }
  }
  const out = [];
  const seen = new Set();
  const add = (name, text) => { const t = String(text).normalize('NFC'); if (!seen.has(t)) { seen.add(t); out.push([name, t]); } };
  for (const [name, text] of sources) {
    add(name, text);
    const once = decodeEntities(text);
    const twice = decodeEntities(once);
    add(`${name}+entities`, once);
    add(`${name}+entities2`, twice);
    const url = urlDecode(twice);
    add(`${name}+url`, url);
    add(`${name}+collapsed`, collapse(twice));
    add(`${name}+url+collapsed`, collapse(url));
    // the page as read: tags as spaces, invisible characters out, CSS escapes undone
    const read = visible(cssUnescape(twice));
    add(`${name}+text`, spaced(read));
    add(`${name}+text+url`, spaced(visible(cssUnescape(url))));
    add(`${name}+invisible`, collapse(read));
    add(`${name}+unescaped`, read);
  }
  return out;
}

function valueVariants(values) {
  const out = [];
  for (const v of values) {
    const s = String(v ?? '').normalize('NFC').trim();
    if (s.length < MIN_VALUE_LENGTH) continue;
    out.push(s);
    const c = s.replace(/[\s ]+/g, ' ');
    if (c !== s) out.push(c);
  }
  return [...new Set(out)];
}

const distinctValues = (values) => new Set((values ?? []).map((v) => String(v ?? '').normalize('NFC').trim().replace(/[\s ]+/g, ' ').toLowerCase()).filter((v) => v.length >= MIN_VALUE_LENGTH)).size;

function leaksIn(raw, variants, { json = false } = {}) {
  const found = new Map();
  for (const [view, text] of viewsOf(raw, { json })) {
    for (const l of findLeaks(text, variants)) {
      const key = l.kind;
      if (!found.has(key)) found.set(key, view);
    }
  }
  return [...found.entries()].map(([kind, view]) => ({ kind, view }));
}

function walk(dir, base, skip, out, problems) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch {
    problems.push({ code: 'unreadable-entry', file: path.relative(base, dir).split(path.sep).join('/') || '.' });
    return;
  }
  for (const ent of ents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (isLink(full)) { problems.push({ code: 'link-in-output', file: rel }); continue; }
    if (ent.isDirectory()) { walk(full, base, skip, out, problems); continue; }
    if (!ent.isFile()) { problems.push({ code: 'unreadable-entry', file: rel }); continue; }
    if (skip.has(rel)) continue;
    out.push({ full, rel });
  }
}

export function scanBytes({ roots = [], texts = [], values = [], skipFiles = [], readFile = fs.readFileSync } = {}) {
  const problems = [];
  const notes = [];
  if (distinctValues(values) < 2) {
    problems.push({ code: 'no-leak-values' });
    return { ok: false, problems, notes };
  }
  const variants = valueVariants(values);
  const skip = new Set(skipFiles);
  for (const root of roots) {
    const label = path.basename(root.dir);
    let st;
    try { st = fs.lstatSync(root.dir); } catch { problems.push({ code: 'root-missing', file: label }); continue; }
    let bad = st.isSymbolicLink() || !st.isDirectory() ? 'root-is-link' : linkProblem(root.dir);
    if (!bad && root.expect) {
      try { if (fs.realpathSync.native(root.dir) !== fs.realpathSync.native(root.expect)) bad = 'root-is-link'; } catch { bad = 'root-is-link'; }
    }
    if (bad) { problems.push({ code: 'root-is-link', file: label }); continue; }
    const files = [];
    walk(root.dir, root.dir, skip, files, problems);
    if (!files.length && !problems.some((p) => p.code === 'link-in-output' || p.code === 'unreadable-entry')) problems.push({ code: 'no-files', file: label });
    for (const f of files) {
      let raw;
      try { raw = readFile(f.full, 'utf8'); } catch { problems.push({ code: 'unreadable-entry', file: `${label}/${f.rel}` }); continue; }
      for (const l of leaksIn(raw, variants, { json: f.rel.toLowerCase().endsWith('.json') })) problems.push({ code: 'leak', file: `${label}/${f.rel}`, kind: l.kind, view: l.view });
    }
    notes.push(`${label}: ${files.length} archivos`);
  }
  for (const t of texts) {
    for (const l of leaksIn(String(t.text ?? ''), variants)) problems.push({ code: 'leak', file: t.label, kind: l.kind, view: l.view });
  }
  return { ok: problems.length === 0, problems, notes };
}

// R-8 e: the strings of `next` (keys of new objects included) that `base` does not already have at the
// same place. What the live canvas already held lives in the user's account and is not checked again;
// whatever we add or change is. Arrays are compared by position (we only ever append), so a reordered
// array is scanned whole: conservative, never lenient.
export function diffStrings(next, base) {
  const out = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const walk = (n, b) => {
    if (same(n, b)) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach((x, i) => walk(x, Array.isArray(b) ? b[i] : undefined)); return; }
    if (n && typeof n === 'object') {
      const bb = b && typeof b === 'object' && !Array.isArray(b) ? b : null;
      for (const [k, v] of Object.entries(n)) {
        if (!bb || !Object.prototype.hasOwnProperty.call(bb, k)) out.push(k);
        walk(v, bb ? bb[k] : undefined);
      }
    }
  };
  walk(next, base);
  return out;
}
