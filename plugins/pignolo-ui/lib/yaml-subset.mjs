// Own YAML subset parser (spec §4.4). Supports block maps and lists, single-line flow
// maps and lists, quoted keys, comments, typed scalars and up to 4 nested levels below
// the root. Anchors, aliases, tags, block scalars (| >), several documents, complex keys,
// tab indentation and flow collections spanning several lines make the whole text
// unsupported ("YAML no soportado: no validado"), because reading them wrong in silence
// would give false greens. An error in one key is reported for that key and parsing goes on.
//
// parseYaml(text) -> { supported, reason, line, value, errors: [{ line, path, message }], index }
// locate(result, pathArray) -> { line, endLine, indent, style: 'block'|'flow'|'scalar' } | null

export const MAX_DEPTH = 4;

class Unsupported extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

class KeyError extends Error {}

const keyOf = (path) => JSON.stringify(path);

export function locate(result, path) {
  return (result && result.index && result.index.get(keyOf(path))) || null;
}

// Cuts a trailing comment: '#' at the start or after whitespace, outside quotes.
// A quote only opens a quoted scalar at a token start, so "it's" stays plain.
export function stripComment(content) {
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const prev = i === 0 ? ' ' : content[i - 1];
    if (quote === '"') {
      if (c === '\\') i++;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'" && content[i + 1] === "'") i++;
      else if (c === "'") quote = null;
    } else if ((c === '"' || c === "'") && /[\s[{,:]/.test(prev)) {
      quote = c;
    } else if (c === '#' && /\s/.test(prev)) {
      return content.slice(0, i).trimEnd();
    }
  }
  return content.trimEnd();
}

function resolvePlain(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?[0-9]+$/.test(s)) return Number.parseInt(s, 10);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s);
  return s;
}

const ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0', ' ': ' ' };

// Reads a quoted scalar starting at s[i]; returns { value, end } (end = index after the quote).
function readQuoted(s, i) {
  const q = s[i];
  let out = '';
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q === "'") {
      if (c === "'" && s[j + 1] === "'") { out += "'"; j++; continue; }
      if (c === "'") return { value: out, end: j + 1 };
      out += c;
      continue;
    }
    if (c === '"') return { value: out, end: j + 1 };
    if (c === '\\') {
      const e = s[j + 1];
      if (e === 'u' || e === 'x') {
        const len = e === 'u' ? 4 : 2;
        const hex = s.slice(j + 2, j + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new KeyError(`invalid escape \\${e}${hex}`);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        j += 1 + len;
        continue;
      }
      if (!(e in ESCAPES)) throw new KeyError(`invalid escape \\${e ?? ''}`);
      out += ESCAPES[e];
      j++;
      continue;
    }
    out += c;
  }
  throw new KeyError('unterminated quoted string');
}

function checkDepth(depth, line) {
  if (depth > MAX_DEPTH) throw new Unsupported(`more than ${MAX_DEPTH} levels of nesting`, line);
}

export function parseYaml(text) {
  const raw = String(text).replace(/^\uFEFF/, '').split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const errors = [];
  const index = new Map();
  try {
    const lines = [];
    raw.forEach((s, i) => {
      const no = i + 1;
      if (/^(---|\.\.\.)(\s|$)/.test(s)) throw new Unsupported('several documents in one text', no);
      if (s.startsWith('%')) throw new Unsupported('YAML directive', no);
      const lead = /^[ \t]*/.exec(s)[0];
      const content = stripComment(s.slice(lead.length));
      if (content === '') return;
      if (lead.includes('\t')) throw new Unsupported('tab indentation', no);
      lines.push({ no, indent: lead.length, content });
    });
    const p = new Parser(lines, errors, index);
    const value = lines.length ? p.node(lines[0].indent, [], 0) : {};
    while (p.pos < lines.length) {
      errors.push({ line: lines[p.pos].no, path: [], message: 'unexpected indentation' });
      p.pos++;
    }
    return { supported: true, reason: null, line: null, value, errors, index };
  } catch (e) {
    if (e instanceof Unsupported) {
      return { supported: false, reason: e.reason, line: e.line, value: null, errors: [], index: new Map() };
    }
    throw e;
  }
}

const isFlowStart = (content) => content[0] === '[' || content[0] === '{';
const isItem = (content) => content === '-' || content.startsWith('- ');

class Parser {
  constructor(lines, errors, index) {
    this.lines = lines;
    this.errors = errors;
    this.index = index;
    this.pos = 0;
  }

  error(line, path, message) {
    this.errors.push({ line, path, message });
  }

  // Skips every following line indented more than `indent`.
  skipDeeper(indent) {
    while (this.pos < this.lines.length && this.lines[this.pos].indent > indent) this.pos++;
  }

  lastNo() {
    return this.lines[this.pos - 1].no;
  }

  node(indent, path, depth) {
    return isItem(this.lines[this.pos].content) ? this.list(indent, path, depth) : this.map(indent, path, depth);
  }

  map(indent, path, depth) {
    checkDepth(depth, this.lines[this.pos].no);
    const obj = {};
    let lastKey = null;
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break;
      const where = lastKey === null ? path : [...path, lastKey];
      if (ln.indent > indent) {
        this.error(ln.no, where, 'unexpected indentation');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      if (isItem(ln.content)) {
        this.error(ln.no, where, 'list item where a "key: value" was expected');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      let key;
      let rest;
      try {
        ({ key, rest } = splitKey(ln.content, ln.no));
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        this.error(ln.no, [...path, guessKey(ln.content)], e.message);
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      const childPath = [...path, key];
      this.pos++;
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        this.error(ln.no, childPath, `duplicate key "${key}"`);
        this.skipDeeper(indent);
        continue;
      }
      lastKey = key;
      if (rest === '') {
        const next = this.lines[this.pos];
        if (next && next.indent > indent && isFlowStart(next.content)) {
          this.pos++;
          try {
            obj[key] = this.inline(next.content, next, indent, childPath, depth + 1);
            this.index.set(keyOf(childPath), { line: ln.no, endLine: next.no, indent, style: 'flow' });
          } catch (e) {
            if (!(e instanceof KeyError)) throw e;
            delete obj[key];
            this.error(next.no, childPath, e.message);
            this.skipDeeper(indent);
          }
        } else if (next && next.indent > indent) {
          obj[key] = this.node(next.indent, childPath, depth + 1);
          this.index.set(keyOf(childPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else if (next && next.indent === indent && isItem(next.content)) {
          obj[key] = this.list(indent, childPath, depth + 1);
          this.index.set(keyOf(childPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else {
          obj[key] = null;
          this.index.set(keyOf(childPath), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
        }
        continue;
      }
      try {
        obj[key] = this.inline(rest, ln, indent, childPath, depth + 1);
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        delete obj[key];
        this.error(ln.no, childPath, e.message);
        this.skipDeeper(indent);
      }
    }
    return obj;
  }

  list(indent, path, depth) {
    checkDepth(depth, this.lines[this.pos].no);
    const arr = [];
    while (this.pos < this.lines.length) {
      const ln = this.lines[this.pos];
      if (ln.indent < indent) break;
      if (ln.indent > indent) {
        this.error(ln.no, arr.length ? [...path, arr.length - 1] : path, 'unexpected indentation');
        this.pos++;
        this.skipDeeper(indent);
        continue;
      }
      if (!isItem(ln.content)) break;
      const itemPath = [...path, arr.length];
      const rest = ln.content === '-' ? '' : ln.content.slice(2).trimStart();
      const offset = ln.content.length - rest.length;
      if (rest === '') {
        this.pos++;
        const next = this.lines[this.pos];
        if (next && next.indent > indent && isFlowStart(next.content)) {
          this.pos++;
          try {
            arr.push(this.inline(next.content, next, indent, itemPath, depth + 1));
            this.index.set(keyOf(itemPath), { line: ln.no, endLine: next.no, indent, style: 'flow' });
          } catch (e) {
            if (!(e instanceof KeyError)) throw e;
            this.error(next.no, itemPath, e.message);
            this.skipDeeper(indent);
          }
        } else if (next && next.indent > indent) {
          arr.push(this.node(next.indent, itemPath, depth + 1));
          this.index.set(keyOf(itemPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        } else {
          arr.push(null);
          this.index.set(keyOf(itemPath), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
        }
        continue;
      }
      if (isItem(rest) || looksLikeEntry(rest)) {
        // "- key: v" or "- - x": the rest of the line is the first line of a nested block.
        this.lines[this.pos] = { no: ln.no, indent: indent + offset, content: rest };
        arr.push(this.node(indent + offset, itemPath, depth + 1));
        this.index.set(keyOf(itemPath), { line: ln.no, endLine: this.lastNo(), indent, style: 'block' });
        continue;
      }
      this.pos++;
      try {
        arr.push(this.inline(rest, ln, indent, itemPath, depth + 1));
      } catch (e) {
        if (!(e instanceof KeyError)) throw e;
        this.error(ln.no, itemPath, e.message);
        this.skipDeeper(indent);
      }
    }
    return arr;
  }

  // Value written on the same line as its key or dash.
  inline(rest, ln, indent, path, depth) {
    const c = rest[0];
    if (c === '&') throw new Unsupported('anchor', ln.no);
    if (c === '*') throw new Unsupported('alias', ln.no);
    if (c === '!') throw new Unsupported('tag', ln.no);
    if ((c === '|' || c === '>') && /^[|>][-+0-9]*$/.test(rest)) throw new Unsupported('block scalar (| or >)', ln.no);
    if (c === '{' || c === '[') {
      const flow = new FlowReader(rest, ln.no, this.index, path, indent);
      const value = flow.value(depth);
      flow.ws();
      if (flow.i !== rest.length) throw new KeyError('unexpected text after a flow collection');
      return value;
    }
    this.index.set(keyOf(path), { line: ln.no, endLine: ln.no, indent, style: 'scalar' });
    if (c === '"' || c === "'") {
      const q = readQuoted(rest, 0);
      if (rest.slice(q.end).trim() !== '') throw new KeyError('unexpected text after a quoted string');
      return q.value;
    }
    if (isItem(rest)) throw new KeyError('a list item is not allowed here');
    if (/^[\]},@`]/.test(rest)) throw new KeyError(`a plain value cannot start with "${c}"`);
    if (/:(\s|$)/.test(rest)) throw new KeyError('a plain value cannot contain ": " (quote it)');
    return resolvePlain(rest);
  }
}

class FlowReader {
  constructor(s, line, index, path, indent) {
    Object.assign(this, { s, line, index, i: 0, basePath: path, indent });
  }

  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  eos() {
    throw new Unsupported('flow collection spanning several lines', this.line);
  }

  mark(path) {
    this.index.set(keyOf(path), { line: this.line, endLine: this.line, indent: this.indent, style: 'flow' });
  }

  value(depth, path = this.basePath) {
    this.ws();
    if (this.i >= this.s.length) this.eos();
    const c = this.s[this.i];
    this.mark(path);
    if (c === '{') return this.map(depth, path);
    if (c === '[') return this.seq(depth, path);
    if (c === '"' || c === "'") {
      const q = readQuoted(this.s, this.i);
      this.i = q.end;
      return q.value;
    }
    if (c === '&') throw new Unsupported('anchor', this.line);
    if (c === '*') throw new Unsupported('alias', this.line);
    if (c === '!') throw new Unsupported('tag', this.line);
    const start = this.i;
    while (this.i < this.s.length && !/[,\]}]/.test(this.s[this.i])) this.i++;
    const plain = this.s.slice(start, this.i).trim();
    if (/:(\s|$)/.test(plain)) throw new KeyError('a plain value cannot contain ": " (quote it)');
    return resolvePlain(plain);
  }

  map(depth, path) {
    checkDepth(depth, this.line);
    this.i++;
    const obj = {};
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === '}') { this.i++; return obj; }
      let key;
      if (this.s[this.i] === '"' || this.s[this.i] === "'") {
        const q = readQuoted(this.s, this.i);
        key = q.value;
        this.i = q.end;
      } else {
        const start = this.i;
        while (this.i < this.s.length && !/[,}]/.test(this.s[this.i]) && !(this.s[this.i] === ':' && /[\s,}]|^$/.test(this.s[this.i + 1] ?? ''))) this.i++;
        key = this.s.slice(start, this.i).trim();
      }
      if (key === '__proto__') throw new KeyError('key "__proto__" is not allowed');
      if (Object.prototype.hasOwnProperty.call(obj, key)) throw new KeyError(`duplicate key "${key}"`);
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ':') {
        this.i++;
        this.ws();
        if (this.i >= this.s.length) this.eos();
        obj[key] = /[,}]/.test(this.s[this.i]) ? null : this.value(depth + 1, [...path, key]);
        if (obj[key] === null) this.mark([...path, key]);
      } else {
        obj[key] = null;
        this.mark([...path, key]);
      }
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') { this.i++; return obj; }
      throw new KeyError(`unexpected "${this.s[this.i]}" in a flow map`);
    }
  }

  seq(depth, path) {
    checkDepth(depth, this.line);
    this.i++;
    const arr = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ']') { this.i++; return arr; }
      arr.push(this.value(depth + 1, [...path, arr.length]));
      this.ws();
      if (this.i >= this.s.length) this.eos();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') { this.i++; return arr; }
      throw new KeyError(`unexpected "${this.s[this.i]}" in a flow list`);
    }
  }
}

// "key: rest" -> { key, rest }; throws KeyError when the line is not an entry.
function splitKey(content, line) {
  if (content.startsWith('? ') || content === '?') throw new Unsupported('complex key (?)', line);
  const c = content[0];
  if (c === '&') throw new Unsupported('anchor', line);
  if (c === '*') throw new Unsupported('alias', line);
  if (c === '!') throw new Unsupported('tag', line);
  let key;
  let after;
  if (c === '"' || c === "'") {
    const q = readQuoted(content, 0);
    key = q.value;
    after = content.slice(q.end).trimStart();
    if (!after.startsWith(':') || !(after.length === 1 || /\s/.test(after[1]))) throw new KeyError('expected ":" after a quoted key');
    after = after.slice(1);
  } else {
    const m = /:(\s|$)/.exec(content);
    if (!m) throw new KeyError('expected "key: value"');
    key = content.slice(0, m.index).trimEnd();
    if (/^[[\]{},|>%@`]/.test(key)) throw new KeyError(`a key cannot start with "${key[0]}"`);
    after = content.slice(m.index + 1);
  }
  if (key === '__proto__') throw new KeyError('key "__proto__" is not allowed');
  return { key, rest: after.trim() };
}

function looksLikeEntry(rest) {
  try {
    splitKey(rest, 0);
    return true;
  } catch (e) {
    if (e instanceof Unsupported) throw e;
    return false;
  }
}

function guessKey(content) {
  const m = /^\s*("([^"]*)"|'([^']*)'|[^:]+?)\s*:/.exec(content);
  if (!m) return content.trim();
  return m[2] ?? m[3] ?? m[1];
}
