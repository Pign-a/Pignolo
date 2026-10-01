'use strict';
// project.md desde una propuesta (spec §3.2) y fusión que no pisa lo declarado (R-4, R-15).
const { parseFrontmatter, YamlLiteError } = require('./yaml-lite');

// Clave de project.md -> propiedad de la propuesta, en el orden fijo de escritura.
const KEYS = [
  ['type', 'type', 'scalar'],
  ['gates', 'gates', 'map'],
  ['test-paths', 'testPaths', 'list'],
  ['protected-test-config', 'protectedTestConfig', 'list'],
  ['high-risk-paths', 'highRiskPaths', 'list'],
  ['contracts', 'contracts', 'list'],
  ['serial-paths', 'serialPaths', 'list'],
  ['cost-paths', 'costPaths', 'list'],
  ['visible-paths', 'visiblePaths', 'list'],
  ['pii-patterns', 'piiPatterns', 'list'],
  ['deps-install', 'depsInstall', 'scalar'],
  ['domain-rules', 'domainRules', 'list'],
  ['mutation', 'mutation', 'bool'],
  ['places', 'places', 'map'],
  ['language', 'language', 'scalar'],
  ['profile', 'profile', 'scalar'],
];

function unquotable(value) {
  const e = new Error(`el valor no se puede escribir en project.md (tiene comillas de los dos tipos o un salto de línea): ${value}`);
  e.kind = 'unquotable';
  return e;
}

// yaml-lite no tiene escapes: se elige el tipo de comilla según el contenido.
function quote(value) {
  const v = String(value);
  if (/[\r\n]/.test(v)) throw unquotable(v);
  const needs = /^[[{"']/.test(v) || v.includes(': ') || v.includes(' #') || v.includes('"') || v === 'true' || v === 'false' || v !== v.trim() || v.endsWith(':');
  if (!needs) return v;
  if (!v.includes('"')) return `"${v}"`;
  if (!v.includes("'")) return `'${v}'`;
  throw unquotable(v);
}

const hasValue = (kind, v) => {
  if (v === undefined || v === null) return false;
  if (kind === 'list') return Array.isArray(v) && v.length > 0;
  if (kind === 'map') return typeof v === 'object' && Object.keys(v).some((k) => v[k]);
  if (kind === 'bool') return v === true;
  return String(v).trim() !== '';
};

function keyLines(key, kind, value) {
  if (kind === 'scalar') return [`${key}: ${quote(value)}`];
  if (kind === 'bool') return [`${key}: true`];
  if (kind === 'list') return [`${key}:`, ...value.map((x) => `  - ${quote(x)}`)];
  return [`${key}:`, ...Object.entries(value).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${quote(v)}`)];
}

function renderProjectMd(proposal, { notes = '' } = {}) {
  const out = ['---'];
  for (const [key, prop, kind] of KEYS) if (hasValue(kind, proposal[prop])) out.push(...keyLines(key, kind, proposal[prop]));
  out.push('---');
  return `${out.join('\n')}\n${notes}`;
}

const sameList = (a, b) => a.length === b.length && a.every((x) => b.includes(String(x)));

// Rango de líneas (inclusive) del bloque de una clave de primer nivel, o null.
function blockOf(lines, key) {
  const start = lines.findIndex((l) => l.replace(/\r$/, '').startsWith(`${key}:`));
  if (start < 0) return null;
  let end = start;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i].replace(/\r$/, '');
    if (l.trim() === '' || l.trim().startsWith('#')) continue;
    if (/^\s/.test(l)) end = i; else break;
  }
  return { start, end };
}

function mergeProjectMd(existingText, proposal) {
  const bom = existingText.charCodeAt(0) === 0xFEFF ? '﻿' : '';
  const src = bom ? existingText.slice(1) : existingText;
  let data;
  try {
    ({ data } = parseFrontmatter(src));
  } catch (e) {
    if (e instanceof YamlLiteError) return { ok: false, refused: 'invalid-project-md', reason: e.message };
    throw e;
  }
  const added = [];
  const kept = [];
  const conflicts = [];
  const all = src.split('\n');
  const hasFm = all[0].replace(/\r$/, '') === '---';
  if (!hasFm) {
    // Solo notas: se antepone el frontmatter completo y las notas quedan tal cual.
    const text = renderProjectMd(proposal, { notes: src });
    for (const [key, prop, kind] of KEYS) if (hasValue(kind, proposal[prop])) added.push(key);
    return { ok: true, text: bom + text, added, kept, conflicts };
  }
  const closeIdx = all.findIndex((l, i) => i > 0 && l.replace(/\r$/, '') === '---');
  const cr = all[0].endsWith('\r') ? '\r' : '';
  const head = all.slice(0, closeIdx);
  const tail = all.slice(closeIdx);
  const inserts = []; // { at, lines } con `at` = índice de línea tras la cual se inserta
  const appended = [];
  const withCr = (ls) => ls.map((l) => l + cr);

  for (const [key, prop, kind] of KEYS) {
    const value = proposal[prop];
    if (!hasValue(kind, value)) continue;
    const declared = data[key];
    const isDeclared = declared !== undefined && declared !== null && !(Array.isArray(declared) && declared.length === 0);
    if (!isDeclared) {
      added.push(key);
      const blk = declared === null ? blockOf(head, key) : null;
      if (blk && (kind === 'scalar' || kind === 'bool')) head[blk.start] = keyLines(key, kind, value)[0] + cr; // `key:` vacía: el valor va en su línea (m-5)
      else if (blk) inserts.push({ at: blk.end, lines: withCr(keyLines(key, kind, value).slice(1)) });
      else appended.push(...withCr(keyLines(key, kind, value)));
      continue;
    }
    if (kind === 'map') {
      if (typeof declared !== 'object' || Array.isArray(declared)) { conflicts.push({ key, existing: declared, proposed: value }); continue; }
      const missing = [];
      for (const [k, v] of Object.entries(value)) {
        if (!v) continue;
        if (declared[k] === undefined) { missing.push([k, v]); added.push(`${key}.${k}`); } else if (String(declared[k]) !== String(v)) conflicts.push({ key: `${key}.${k}`, existing: declared[k], proposed: v });
        else kept.push(`${key}.${k}`);
      }
      if (missing.length) {
        const blk = blockOf(head, key);
        // Las claves nuevas usan la sangría de la primera línea hija (I-1): con otra, el archivo deja de parsear.
        const ind = (head.slice(blk.start + 1, blk.end + 1).filter((l) => !l.trim().startsWith('#')).map((l) => /^[ \t]+(?=\S)/.exec(l)).find((m) => m) || ['  '])[0];
        inserts.push({ at: blk.end, lines: withCr(missing.map(([k, v]) => `${ind}${k}: ${quote(v)}`)) });
      }
    } else if (kind === 'list') {
      if (Array.isArray(declared) && sameList(declared, value)) kept.push(key); else conflicts.push({ key, existing: declared, proposed: value });
    } else if (String(declared) === String(value)) kept.push(key); else conflicts.push({ key, existing: declared, proposed: value });
  }

  inserts.sort((a, b) => b.at - a.at);
  const lines = [...head];
  for (const ins of inserts) lines.splice(ins.at + 1, 0, ...ins.lines);
  const text = bom + [...lines, ...appended, ...tail].join('\n');
  return { ok: true, text, added, kept, conflicts };
}

// Deshacer el mapa (hito 8d, R-12): edita SOLO la línea `places.<tipo>` y solo si su valor actual es `after`.
// `before: null` quita la línea (y el bloque `places:` si queda vacío); si no, vuelve a `before`. El resto de los bytes no cambia.
function revertPlaces({ text, edits }) {
  const reverted = [];
  const left = [];
  const lines = String(text).split('\n');
  const unq = (v) => {
    const t = v.replace(/\r$/, '').trim();
    return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
  };
  for (const { kind, before, after } of edits || []) {
    const blk = blockOf(lines, 'places');
    let at = -1;
    if (blk) for (let i = blk.start + 1; i <= blk.end; i += 1) if (new RegExp(`^\\s+${kind}:`).test(lines[i])) { at = i; break; }
    if (at < 0) { if (before !== null) left.push({ kind, current: null }); continue; }
    const m = /^(\s+)([^:]+):(.*)$/.exec(lines[at].replace(/\r$/, ''));
    const current = unq(m[3]);
    if (current !== unq(String(after))) { left.push({ kind, current }); continue; }
    const cr = lines[at].endsWith('\r') ? '\r' : '';
    if (before === null) {
      lines.splice(at, 1);
      const nb = blockOf(lines, 'places');
      // Sin hijos: se quita también la línea `places:`.
      if (nb && nb.end === nb.start) lines.splice(nb.start, 1);
    } else lines[at] = `${m[1]}${kind}: ${quote(before)}${cr}`;
    reverted.push(kind);
  }
  return { text: lines.join('\n'), reverted, left };
}

function validatePiiPattern(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { ok: false, refused: 'too-broad', reason: 'un patrón vacío coincide con todo' };
  let re;
  try { re = new RegExp(pattern); } catch (e) { return { ok: false, refused: 'invalid-regex', reason: e.message }; }
  if (re.test('')) return { ok: false, refused: 'too-broad', reason: 'coincide con la cadena vacía: bloquearía todo' };
  for (const s of ['a', 'e', 'x', 'A', 'Z', '1']) {
    if (re.test(s)) return { ok: false, refused: 'too-broad', reason: `coincide con una sola letra o dígito ("${s}"): bloquearía todo` };
  }
  // Un patrón que casa líneas comunes de cualquier código bloquearía todo (m-7).
  const common = ['const total = items.length + 1;', 'The quick brown fox jumps over the lazy dog', 'import { x } from "./y";'];
  if (common.every((s) => re.test(s))) return { ok: false, refused: 'too-broad', reason: 'coincide con líneas comunes de cualquier archivo: bloquearía todo' };
  return { ok: true };
}

module.exports = { renderProjectMd, mergeProjectMd, validatePiiPattern, revertPlaces };
