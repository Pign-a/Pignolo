// Line-level edits of DESIGN.md (spec §4.4 "Escritura"): only inserts or replaces lines,
// never re-serializes, so comments and formatting survive byte for byte. Every change comes
// back as hunks and a diff for the user to confirm.
//
// patchDesign(text, ops) -> { ok: true, text, hunks: [{ line, removed, added }], diff } | { ok: false, error, op }
// ops: { op: 'set', path, value }            scalar on its own line; creates missing keys under a block map
//      { op: 'append', path, value }         list item (scalar or map); creates the list when missing
//      { op: 'remove-item', path, value }    removes a scalar item; the last one leaves "key: []"
//                                            (emptying pignolo.extracted also drops the "extraídos, no decididos" lines of the body)
//      { op: 'section-append', heading, text }  appends lines at the end of "## <heading>" (created at the end if missing)
import { parseYaml, locate, stripComment } from './yaml-subset.mjs';

class PatchError extends Error {}

const BOM = '\uFEFF';
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function yamlScalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new PatchError('numbers must be finite');
    return String(v);
  }
  if (typeof v !== 'string') throw new PatchError(`not a scalar: ${JSON.stringify(v)}`);
  if (/[\r\n]/.test(v)) throw new PatchError('strings cannot contain a line break');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) throw new PatchError('strings cannot contain control characters');
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function yamlKey(k) {
  const s = String(k);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(s) ? s : yamlScalar(s);
}

// Block lines for a value placed after "key:" or "- ".
function blockLines(value, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    if (isMap(v)) out.push(`${pad}${yamlKey(k)}:`, ...blockLines(v, indent + 2));
    else if (Array.isArray(v)) out.push(`${pad}${yamlKey(k)}: [${v.map(yamlScalar).join(', ')}]`);
    else out.push(`${pad}${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  return out;
}

function itemLines(value, dashIndent) {
  const pad = ' '.repeat(dashIndent);
  if (!isMap(value)) return [`${pad}- ${yamlScalar(value)}`];
  const inner = blockLines(value, dashIndent + 2);
  return [`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1)];
}

function getAt(root, p) {
  let v = root;
  for (const k of p) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Splits "key: value  # c" at the given column into { head: 'key:', tail: '  # c' }.
function entryHead(rest) {
  let end;
  if (rest[0] === '"' || rest[0] === "'") {
    const q = rest[0];
    let j = 1;
    while (j < rest.length && !(rest[j] === q && rest[j - 1] !== '\\')) j++;
    end = rest.indexOf(':', j);
  } else {
    const m = /:(\s|$)/.exec(rest);
    end = m ? m.index : -1;
  }
  if (end < 0) throw new PatchError('not-a-scalar');
  return rest.slice(0, end + 1);
}

class Doc {
  constructor(text) {
    this.bom = text.startsWith(BOM);
    const src = this.bom ? text.slice(1) : text;
    this.eol = src.includes('\r\n') ? '\r\n' : '\n';
    this.lines = src.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    this.hunks = [];
  }

  text() {
    return (this.bom ? BOM : '') + this.lines.join(this.eol);
  }

  splice(index, remove, add) {
    const removed = this.lines.splice(index, remove, ...add);
    this.hunks.push({ line: index + 1, removed, added: add });
  }

  // Frontmatter bounds and a fresh parse of the YAML.
  yaml() {
    if (this.lines[0].trimEnd() !== '---') throw new PatchError('no-frontmatter');
    const end = this.lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
    if (end < 0) throw new PatchError('no-frontmatter');
    const parsed = parseYaml(this.lines.slice(1, end).join('\n'));
    if (!parsed.supported) throw new PatchError('unsupported-yaml');
    return { parsed, end };
  }
}

// Deepest existing ancestor of `p` that can take new block children.
function anchorFor(parsed, end, p) {
  for (let i = p.length - 1; i >= 0; i--) {
    const anc = p.slice(0, i);
    const value = i === 0 ? parsed.value : getAt(parsed.value, anc);
    if (value === undefined) continue;
    if (typeof p[i] === 'number') throw new PatchError('missing-list-item');
    const loc = i === 0 ? { line: 0, endLine: end - 1, indent: -2, style: 'block' } : locate(parsed, anc);
    if (loc.style === 'flow') throw new PatchError('in-flow');
    if (Array.isArray(value)) throw new PatchError('not-a-map');
    if (value !== null && !isMap(value)) throw new PatchError('not-a-map');
    let childIndent = loc.indent + 2;
    const first = isMap(value) ? Object.keys(value)[0] : undefined;
    if (first !== undefined) childIndent = locate(parsed, [...anc, first]).indent;
    const at = value === null ? loc.line : loc.endLine;
    return { depth: i, childIndent, at };
  }
  throw new PatchError('no-root');
}

// Lines that create p[depth..] under the anchor; the last key gets `lastSuffix`.
function creationLines(p, depth, indent, lastLines) {
  const out = [];
  let pad = indent;
  for (let i = depth; i < p.length - 1; i++) {
    out.push(`${' '.repeat(pad)}${yamlKey(p[i])}:`);
    pad += 2;
  }
  return [...out, ...lastLines(pad, p[p.length - 1])];
}

function opSet(doc, { path: p, value }) {
  const { parsed, end } = doc.yaml();
  const loc = locate(parsed, p);
  const ser = yamlScalar(value);
  if (loc) {
    if (loc.style === 'flow') throw new PatchError('in-flow');
    if (loc.style === 'block') throw new PatchError('not-a-scalar');
    const line = doc.lines[loc.line];
    const prefix = line.slice(0, loc.indent);
    const rest = line.slice(loc.indent);
    const kept = stripComment(rest);
    const tail = rest.slice(kept.length);
    const head = typeof p[p.length - 1] === 'number' ? '-' : entryHead(kept);
    doc.splice(loc.line, 1, [`${prefix}${head} ${ser}${tail}`]);
    return;
  }
  const a = anchorFor(parsed, end, p);
  const lines = creationLines(p, a.depth, a.childIndent, (pad, key) => [`${' '.repeat(pad)}${yamlKey(key)}: ${ser}`]);
  doc.splice(a.at + 1, 0, lines);
}

function opAppend(doc, { path: p, value }) {
  const { parsed, end } = doc.yaml();
  const loc = locate(parsed, p);
  const current = getAt(parsed.value, p);
  if (loc && current !== undefined && current !== null) {
    if (!Array.isArray(current)) throw new PatchError('not-a-list');
    if (loc.style === 'flow') {
      if (current.length) throw new PatchError('in-flow');
      const line = doc.lines[loc.line];
      const rest = line.slice(loc.indent);
      const tail = rest.slice(stripComment(rest).length);
      doc.splice(loc.line, 1, [`${line.slice(0, loc.indent)}${entryHead(stripComment(rest))}${tail}`, ...itemLines(value, loc.indent + 2)]);
      return;
    }
    const indent = current.length ? locate(parsed, [...p, 0]).indent : loc.indent + 2;
    doc.splice(loc.endLine + 1, 0, itemLines(value, indent));
    return;
  }
  if (loc && current === null) {
    doc.splice(loc.line + 1, 0, itemLines(value, loc.indent + 2));
    return;
  }
  const a = anchorFor(parsed, end, p);
  const lines = creationLines(p, a.depth, a.childIndent, (pad, key) => [`${' '.repeat(pad)}${yamlKey(key)}:`, ...itemLines(value, pad + 2)]);
  doc.splice(a.at + 1, 0, lines);
}

function opRemoveItem(doc, { path: p, value }) {
  const { parsed } = doc.yaml();
  const list = getAt(parsed.value, p);
  if (!Array.isArray(list)) throw new PatchError('not-a-list');
  const index = list.findIndex((item) => same(item, value));
  if (index < 0) throw new PatchError('item-not-found');
  const item = locate(parsed, [...p, index]);
  if (item.style === 'flow') throw new PatchError('in-flow');
  if (list.length > 1) {
    doc.splice(item.line, item.endLine - item.line + 1, []);
    return;
  }
  const key = locate(parsed, p);
  const line = doc.lines[key.line];
  const rest = line.slice(key.indent);
  const tail = rest.slice(stripComment(rest).length);
  doc.splice(key.line, item.endLine - key.line + 1, [`${line.slice(0, key.indent)}${entryHead(stripComment(rest))} []${tail}`]);
}

function opSectionAppend(doc, { heading, text }) {
  const { end } = doc.yaml();
  const add = String(text).replace(/\r\n/g, '\n').split('\n');
  const isHeading = (l) => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(l);
  const h = doc.lines.findIndex((l, i) => i > end && isHeading(l));
  if (h < 0) {
    let at = doc.lines.length;
    if (doc.lines[at - 1] === '') at--;
    doc.splice(at, 0, ['', `## ${heading}`, '', ...add]);
    return;
  }
  let stop = doc.lines.findIndex((l, i) => i > h && /^#{1,2}\s/.test(l));
  if (stop < 0) stop = doc.lines.length;
  let last = stop - 1;
  while (last > h && doc.lines[last].trim() === '') last--;
  if (last === h) {
    doc.splice(h + 1, 0, ['', ...add]);
    return;
  }
  doc.splice(last + 1, 0, add);
}

// The only removal in the body: once pignolo.extracted is empty, every token was decided, so the
// lines of the mark that the foundation gate reads ("extraídos, no decididos") go away with it.
function dropUndecidedMark(doc) {
  const { parsed, end } = doc.yaml();
  const left = getAt(parsed.value, ['pignolo', 'extracted']);
  if (Array.isArray(left) && left.length) return;
  for (let i = doc.lines.length - 1; i > end; i--) {
    if (/extraídos, no decididos|extracted, not decided/.test(doc.lines[i])) doc.splice(i, 1, []);
  }
}

const OPS = { set: opSet, append: opAppend, 'remove-item': opRemoveItem, 'section-append': opSectionAppend };

export function formatDiff(hunks, file = 'DESIGN.md') {
  const out = [`--- ${file}`, `+++ ${file} (propuesto)`];
  for (const h of hunks) {
    out.push(`@@ línea ${h.line} @@`, ...h.removed.map((l) => `-${l}`), ...h.added.map((l) => `+${l}`));
  }
  return `${out.join('\n')}\n`;
}

export function patchDesign(text, ops) {
  const doc = new Doc(String(text));
  for (const op of ops) {
    try {
      const run = OPS[op && op.op];
      if (!run) throw new PatchError('unknown-op');
      const errorsBefore = op.op === 'section-append' ? 0 : doc.yaml().parsed.errors.length;
      run(doc, op);
      if (op.op === 'remove-item' && same(op.path, ['pignolo', 'extracted'])) dropUndecidedMark(doc);
      if (op.op === 'set' || op.op === 'append') {
        // evidence of effect: the new text parses to the requested value, with no new YAML errors
        const { parsed } = doc.yaml();
        const got = getAt(parsed.value, op.path);
        const ok = op.op === 'set' ? same(got, op.value) : Array.isArray(got) && same(got[got.length - 1], op.value);
        if (!ok || parsed.errors.length > errorsBefore) throw new PatchError('patch-not-effective');
      }
    } catch (e) {
      if (e instanceof PatchError) return { ok: false, error: e.message, op };
      throw e;
    }
  }
  return { ok: true, text: doc.text(), hunks: doc.hunks, diff: formatDiff(doc.hunks) };
}
