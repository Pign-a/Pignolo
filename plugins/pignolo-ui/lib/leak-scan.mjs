// Leak check on the EXACT bytes that will leave the machine (R-8). It fails closed: no values (or
// fewer than two), a folder without files, a link, an unreadable entry: all of them are problems,
// never "no leaks". There is no option to accept fewer values (D-4c-16).
//
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

const LATIN1 = ('nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil '
  + 'sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml '
  + 'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig '
  + 'ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml').split(' ');
const NAMED = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]]);
LATIN1.forEach((n, i) => NAMED.set(n, String.fromCharCode(160 + i)));

const codePoint = (n) => { try { return String.fromCodePoint(n); } catch { return ''; } };

export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (m, name) => (NAMED.has(name) ? NAMED.get(name) : m));
}

function urlDecode(text) {
  const spaced = String(text).replace(/\+/g, ' ');
  return spaced.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => { try { return decodeURIComponent(run); } catch { return run; } });
}

const collapse = (text) => String(text).replace(/<[^>]*>/g, '').replace(/[\s ]+/g, ' ');

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
