'use strict';
// Subconjunto propio de YAML (spec §2): claves de nivel superior con escalar,
// lista en bloque o un mapa de un nivel. Sin dependencias.

class YamlLiteError extends Error {
  constructor(line, reason) {
    super(`yaml-lite: línea ${line}: ${reason}`);
    this.name = 'YamlLiteError';
    this.line = line;
  }
}

const KEY_RE = /^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?:\s+(.*))?$/;

// Una lista o un mapa en línea (`[a, b]`, `{k: v}`) no es parte del subconjunto: tomarlo como
// texto apagaría en silencio lo que declara (p. ej. test-paths).
function scalar(raw, n) {
  const s = raw.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) return s.slice(1, -1);
  if (s[0] === '[' || s[0] === '{') throw new YamlLiteError(n, `"${s}" es una lista o un mapa en línea; usá la lista en bloque ("  - item") o el mapa en bloque ("  clave: valor"), o ponelo entre comillas si es texto`);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

function splitFrontmatter(text) {
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = src.split('\n');
  if (lines[0].replace(/\r$/, '') !== '---') return null;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, '') === '---') {
      return { yamlLines: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  throw new YamlLiteError(lines.length, 'falta el cierre "---" del bloque');
}

function parseFrontmatter(text) {
  const parts = splitFrontmatter(text);
  if (!parts) return { data: {}, body: text };
  const data = {};
  let current = null; // { key, kind: null|'list'|'map', indent, empty }
  parts.yamlLines.forEach((rawLine, idx) => {
    const n = idx + 2; // la línea 1 es el "---" de apertura
    const line = rawLine.replace(/\r$/, '');
    if (/^[ ]*\t/.test(line) || /^\t/.test(line)) throw new YamlLiteError(n, 'tab al comienzo de línea (usá espacios)');
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    if (indent === 0) {
      const m = KEY_RE.exec(content);
      if (!m) throw new YamlLiteError(n, `se esperaba "clave: valor" y hay "${content}"`);
      const key = m[1];
      if (Object.prototype.hasOwnProperty.call(data, key)) throw new YamlLiteError(n, `clave repetida "${key}"`);
      if (m[2] === undefined || m[2].trim() === '') {
        data[key] = null;
        current = { key, kind: null, indent: null };
      } else {
        data[key] = scalar(m[2], n);
        current = null;
      }
      return;
    }
    if (!current) throw new YamlLiteError(n, 'línea con sangría sin una clave que la abra');
    if (current.indent === null) current.indent = indent;
    else if (indent > current.indent) throw new YamlLiteError(n, 'más de un nivel de anidación');
    else if (indent < current.indent) throw new YamlLiteError(n, 'sangría inconsistente');
    if (content === '-' || content.startsWith('- ')) {
      if (current.kind === 'map') throw new YamlLiteError(n, 'mezcla de lista y mapa bajo la misma clave');
      if (current.kind === null) { current.kind = 'list'; data[current.key] = []; }
      data[current.key].push(scalar(content.slice(1), n));
      return;
    }
    const m = KEY_RE.exec(content);
    if (!m) throw new YamlLiteError(n, `se esperaba "- item" o "clave: valor" y hay "${content}"`);
    if (current.kind === 'list') throw new YamlLiteError(n, 'mezcla de lista y mapa bajo la misma clave');
    if (current.kind === null) { current.kind = 'map'; data[current.key] = {}; }
    if (m[2] === undefined || m[2].trim() === '') throw new YamlLiteError(n, 'más de un nivel de anidación');
    if (Object.prototype.hasOwnProperty.call(data[current.key], m[1])) throw new YamlLiteError(n, `clave repetida "${m[1]}"`);
    data[current.key][m[1]] = scalar(m[2], n);
  });
  return { data, body: parts.body };
}

module.exports = { parseFrontmatter, YamlLiteError };
