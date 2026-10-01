'use strict';
// Referencias a rutas que se van a mover y reescritura segura de enlaces markdown (hito 8d, Task 3; R-10, R-11, R-23).
// Se resuelven TODOS los enlaces relativos de todos los .md/.mdx (no se busca la cadena de la ruta vieja); lo no-markdown
// se busca por texto, como segmento completo. Solo se reescribe lo que se prueba seguro, por tramos de bytes: cambia el
// destino del enlace y el resto del buffer queda idéntico. Todo archivo leído o escrito pasa por `isLinkOrOutside`.
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { backupFile } = require('./init-actions');
const SM = require('./safe-move');

const { isLinkOrOutside, gitList, makeRun, norm, fold } = SM;
const MAX_READ = 1024 * 1024;
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'pdf', 'zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'docx', 'xlsx', 'pptx', 'drawio', 'sqlite', 'db']);
const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'cs', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'c', 'h', 'cpp', 'swift', 'vue', 'svelte', 'sql']);
const CONFIG_EXT = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'properties']);
const CONFIG_NAMES = new Set(['makefile', 'dockerfile', '.gitattributes', 'codeowners', '.editorconfig', '.npmignore', '.dockerignore']);
const PRIVATE_NAME = [/^\.env/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /^id_rsa/i];
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const abs = (main, rel) => path.join(main, ...norm(rel).split('/'));
const extOf = (file) => { const b = file.split('/').pop(); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i + 1).toLowerCase(); };
const isMd = (file) => ['md', 'mdx'].includes(extOf(file));
const insideRel = (child, parent) => fold(norm(child)).startsWith(`${fold(norm(parent))}/`);
const sameRel = (a, b) => fold(norm(a)) === fold(norm(b));

// Relativo con "/", sin "./" sobrante, conservando #ancla y ?consulta. Función pura.
function relativeLink(fromFileDir, targetPath) {
  const m = /[#?]/.exec(targetPath);
  const suffix = m ? targetPath.slice(m.index) : '';
  const target = m ? targetPath.slice(0, m.index) : targetPath;
  const rel = path.posix.relative(`/${norm(fromFileDir || '')}`, `/${norm(target)}`);
  return `${rel === '' ? '.' : rel}${suffix}`;
}

function mapper(moves) {
  const list = moves.map((m) => ({ from: norm(m.from), to: norm(m.to), kind: m.kind }));
  return (p) => {
    for (let i = 0; i < list.length; i += 1) {
      const m = list[i];
      if (sameRel(p, m.from)) return { path: m.to, move: i };
      if (m.kind === 'dir' && insideRel(p, m.from)) return { path: m.to + norm(p).slice(m.from.length), move: i };
    }
    return { path: norm(p), move: null };
  };
}

// ---------------------------------------------------------------- markdown

const blank = (s) => s.replace(/[^\n\r]/g, ' ');

// Bloques de código cercados y código en línea: son ejemplos, no enlaces.
function maskCode(text) {
  const lines = text.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!fence) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (m) { fence = { ch: m[1][0], len: m[1].length }; lines[i] = blank(line); }
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})[ \t\r]*$/.exec(line);
      lines[i] = blank(line);
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len) fence = null;
    }
  }
  let out = lines.join('\n');
  const re = /`+/g;
  let m;
  const spans = [];
  const runs = [];
  while ((m = re.exec(out)) !== null) runs.push({ at: m.index, len: m[0].length });
  for (let i = 0; i < runs.length; i += 1) {
    const open = runs[i];
    const close = runs.slice(i + 1).find((r) => r.len === open.len);
    if (close) { spans.push([open.at, close.at + close.len]); i = runs.indexOf(close); }
  }
  for (const [a, b] of spans) out = out.slice(0, a) + blank(out.slice(a, b)) + out.slice(b);
  return out;
}

// Enlaces `[t](dest)`, imágenes y definiciones `[x]: dest`. Cada uno: { start, end, raw, simple, dest } con el tramo del destino.
function mdLinks(masked) {
  const out = [];
  const re = /\]\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    let i = m.index + 2;
    while (masked[i] === ' ' || masked[i] === '\t') i += 1;
    const start = i;
    let angle = false;
    let dest;
    let end;
    if (masked[i] === '<') {
      angle = true;
      const close = masked.indexOf('>', i);
      if (close < 0 || masked.slice(i, close).includes('\n')) continue;
      dest = masked.slice(i + 1, close);
      end = close + 1;
    } else {
      let depth = 0;
      let parens = false;
      while (i < masked.length && !/\s/.test(masked[i])) {
        if (masked[i] === '(') { depth += 1; parens = true; } else if (masked[i] === ')') { if (depth === 0) break; depth -= 1; }
        i += 1;
      }
      dest = masked.slice(start, i);
      end = i;
      if (parens) angle = true; // con paréntesis: no es una forma simple
    }
    // ¿termina limpio con ")" o hay un título?
    let j = end;
    while (masked[j] === ' ' || masked[j] === '\t') j += 1;
    const title = masked[j] !== ')';
    if (dest === '') continue;
    out.push({ start, end, dest, angle, title, simple: !angle && !title && !dest.includes('%') && !dest.startsWith('/') });
  }
  const defRe = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)([ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t\r]*$/gm;
  while ((m = defRe.exec(masked)) !== null) {
    const raw = m[1];
    const start = m.index + m[0].indexOf(raw);
    const angle = raw.startsWith('<');
    out.push({ start, end: start + raw.length, dest: angle ? raw.slice(1, -1) : raw, angle, title: Boolean(m[2]), simple: !angle && !m[2] && !raw.includes('%') && !raw.startsWith('/') });
  }
  return out;
}

const hasScheme = (d) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(d) || d.startsWith('//');

// Destino viejo T (relativo a la raíz) de un destino de enlace, o null si no es un archivo del proyecto.
function resolveTarget(fromFile, rawDest, { root = false } = {}) {
  let d = rawDest;
  const m = /[#?]/.exec(d);
  const pathPart = m ? d.slice(0, m.index) : d;
  if (pathPart === '' || hasScheme(pathPart)) return null;
  d = pathPart.replace(/\\/g, '/');
  const joined = root && d.startsWith('/') ? d.slice(1) : path.posix.join(path.posix.dirname(fromFile), d);
  const t = path.posix.normalize(joined);
  if (t === '..' || t.startsWith('../') || t.startsWith('/')) return null;
  return t === '.' ? '' : t.replace(/\/$/, '');
}

// ---------------------------------------------------------------- texto (no markdown y menciones en prosa)

function classOf(file) {
  const base = file.split('/').pop().toLowerCase();
  if (base === '.gitignore') return 'gitignore';
  if (base === 'package.json') return 'package-json';
  if (file.startsWith('.github/') || base === '.gitlab-ci.yml') return 'ci';
  const e = extOf(file);
  if (CONFIG_NAMES.has(base) || CONFIG_EXT.has(e)) return 'config';
  if (CODE_EXT.has(e)) return 'code';
  return 'other';
}

function textRegex(from) {
  const esc = (s) => s.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
  const fwd = esc(norm(from));
  const back = esc(norm(from).replace(/\//g, '\\'));
  const body = fwd === back ? fwd : `(?:${fwd}|${back})`;
  return new RegExp(`(?<=^|["'\`\\s(\\[=:/\\\\])${body}(?=$|[/\\\\"'\`)#\\s])`, 'gm');
}

function lineCol(text, idx) {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < idx; i = text.indexOf('\n', i + 1)) { line += 1; last = i; }
  return { line, col: idx - last };
}
const snippet = (text, idx) => {
  const ls = text.lastIndexOf('\n', idx - 1) + 1;
  const le = text.indexOf('\n', idx);
  const line = text.slice(ls, le < 0 ? text.length : le).replace(/\r$/, '');
  const col = idx - ls;
  return line.slice(Math.max(0, col - 40), col + 40);
};

// ---------------------------------------------------------------- scanReferences

function privateName(file) {
  const base = file.split('/').pop();
  return PRIVATE_NAME.some((re) => re.test(base));
}

function scanReferences({ main, moves, run, fs = nodeFs } = {}) {
  const git = run || makeRun(main);
  const map = mapper(moves);
  const listed = gitList(git, main, ['ls-files', '-z', '-c', '-o', '--exclude-standard']);
  const ignoredTracked = new Set(gitList(git, main, ['ls-files', '-z', '-c', '-i', '--exclude-standard']).map(norm));
  const files = [...new Set(listed.map(norm))].sort();
  const refs = [];
  const unscanned = [];
  const skip = (file, reason) => unscanned.push({ path: file, reason });
  const contentFiles = new Map();

  for (const file of files) {
    if (file.startsWith('.pignolo/state/')) { skip(file, 'state'); continue; }
    if (file.split('/').includes('node_modules')) { skip(file, 'node_modules'); continue; }
    if (privateName(file) || ignoredTracked.has(file)) { skip(file, 'private'); continue; }
    if (BINARY_EXT.has(extOf(file))) { skip(file, 'binary'); continue; }
    if (isLinkOrOutside(main, file, fs).bad) { skip(file, 'link'); continue; }
    let st;
    try { st = fs.lstatSync(abs(main, file)); } catch (_) { continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_READ) { skip(file, 'too-large'); continue; }
    let buf;
    try { buf = fs.readFileSync(abs(main, file)); } catch (_) { skip(file, 'unreadable'); continue; }
    if (buf.subarray(0, 8192).includes(0)) { skip(file, 'binary'); continue; }
    let text;
    try { text = decoder.decode(buf); } catch (_) { skip(file, 'not-utf8'); continue; }
    if (!Buffer.from(text, 'utf8').equals(buf)) { skip(file, 'not-utf8'); continue; }
    contentFiles.set(file, { buf, text });
  }

  const exists = (t) => {
    if (t === '') return true;
    try { fs.lstatSync(abs(main, t)); return !isLinkOrOutside(main, t, fs).bad; } catch (_) { return false; }
  };

  for (const [file, { text }] of contentFiles) {
    const fileMap = map(file);
    const whole = text;
    let searchable = whole;
    if (isMd(file)) {
      const masked = maskCode(whole);
      const links = mdLinks(masked);
      for (const l of links) {
        searchable = searchable.slice(0, l.start) + ' '.repeat(l.end - l.start) + searchable.slice(l.end);
        const fileMoved = fileMap.move !== null;
        if (l.simple) {
          const t = resolveTarget(file, l.dest);
          if (t === null) continue;
          const tm = map(t);
          if (tm.move === null && !fileMoved) continue;
          if (!exists(t)) continue;
          const dirNew = path.posix.dirname(fileMap.path);
          const m = /[#?]/.exec(l.dest);
          const oldPath = m ? l.dest.slice(0, m.index) : l.dest;
          const newRel = relativeLink(dirNew === '.' ? '' : dirNew, tm.path);
          const normalizedOld = oldPath.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
          if (newRel === normalizedOld) continue;
          const lc = lineCol(whole, l.start);
          refs.push({
            file, line: lc.line, col: lc.col, text: snippet(whole, l.start), move: tm.move !== null ? tm.move : fileMap.move,
            class: tm.move === null ? 'outbound-link' : 'markdown-link', rewritable: true,
            span: { start: l.start, end: l.start + oldPath.length }, old: oldPath, to: newRel === '.' ? '.' : newRel,
          });
        } else {
          let d = l.dest;
          try { d = decodeURIComponent(d); } catch (_) { /* se resuelve como está */ }
          const t = resolveTarget(file, d, { root: true });
          if (t === null) continue;
          const tm = map(t);
          const relative = !d.startsWith('/');
          if (tm.move === null && !(fileMoved && relative)) continue;
          if (!exists(t)) continue;
          const lc = lineCol(whole, l.start);
          refs.push({ file, line: lc.line, col: lc.col, text: snippet(whole, l.start), move: tm.move !== null ? tm.move : fileMap.move, class: 'markdown-unsupported', rewritable: false });
        }
      }
    }
    for (let i = 0; i < moves.length; i += 1) {
      const re = textRegex(moves[i].from);
      let m;
      while ((m = re.exec(searchable)) !== null) {
        const lc = lineCol(searchable, m.index);
        refs.push({ file, line: lc.line, col: lc.col, text: snippet(whole, m.index), move: i, class: isMd(file) ? 'markdown-text' : classOf(file), rewritable: false });
      }
    }
  }

  // Un archivo con cambios sin guardar no se reescribe: sus enlaces reescribibles pasan a manual.
  const dirtyChecked = new Map();
  for (const r of refs) {
    if (!r.rewritable) continue;
    if (!dirtyChecked.has(r.file)) {
      let out;
      try { out = gitList(git, main, ['status', '--porcelain', '-z', '--untracked-files=no', '--', `:(literal)${r.file}`]); } catch (e) { throw e; }
      dirtyChecked.set(r.file, out.length > 0);
    }
    if (dirtyChecked.get(r.file)) { r.class = 'dirty-file'; r.rewritable = false; }
  }
  const rewritable = refs.filter((r) => r.rewritable);
  const manual = refs.filter((r) => !r.rewritable && r.class !== 'markdown-text');
  const warnings = refs.filter((r) => r.class === 'markdown-text');
  return { refs, rewritable, manual, warnings, unscanned };
}

// ---------------------------------------------------------------- planRewrites / applyRewrites

// Calcula los buffers nuevos por tramos de bytes sin escribir. `newBuffer` no es enumerable (no entra a JSON ni a los stamps).
function planRewrites({ main, moves, refs, fs = nodeFs } = {}) {
  const map = mapper(moves);
  const byFile = new Map();
  for (const r of refs.filter((x) => x.rewritable)) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  const files = [];
  for (const [file, list] of byFile) {
    if (isLinkOrOutside(main, file, fs).bad) continue;
    let buf;
    try { buf = fs.readFileSync(abs(main, file)); } catch (_) { continue; }
    let text;
    try { text = decoder.decode(buf); } catch (_) { continue; }
    if (!Buffer.from(text, 'utf8').equals(buf)) continue;
    const spans = list.map((r) => ({
      start: Buffer.byteLength(text.slice(0, r.span.start)), end: Buffer.byteLength(text.slice(0, r.span.end)), to: Buffer.from(r.to, 'utf8'), old: r.old,
    })).sort((a, b) => b.start - a.start);
    let out = buf;
    let edits = 0;
    for (const s of spans) {
      if (out.subarray(s.start, s.end).toString('utf8') !== s.old) continue; // el archivo ya no es el escaneado
      out = Buffer.concat([out.subarray(0, s.start), s.to, out.subarray(s.end)]);
      edits += 1;
    }
    if (!edits || out.equals(buf)) continue;
    const entry = { file: map(file).path, fileBefore: file, sha256Before: sha256(buf), sha256After: sha256(out), edits };
    Object.defineProperty(entry, 'newBuffer', { value: out, enumerable: false });
    files.push(entry);
  }
  return { files };
}

// Respalda (fuera del árbol), escribe atómico y devuelve el hash posterior. `rewrites` = planRewrites().files (o el objeto).
// Con `record` (ruta de moves.json) marca cada reescritura como hecha. Un fallo se detiene: no revierte solo.
function applyRewrites({ main, rewrites, env = process.env, now = new Date(), fs = nodeFs, record } = {}) {
  const list = Array.isArray(rewrites) ? rewrites : (rewrites && rewrites.files) || [];
  const done = [];
  // Primero se valida todo (enlaces y hashes): un archivo que cambió desde el plan no deja un lote a medias.
  for (const r of list) {
    const g = isLinkOrOutside(main, r.file, fs);
    if (g.bad) return { ok: false, kind: 'refused', refused: g.reason, failed: { file: r.file, error: `${g.reason}: ${g.at}` }, files: [] };
    let cur;
    try { cur = fs.readFileSync(abs(main, r.file)); } catch (e) { return { ok: false, kind: 'refused', refused: 'unreadable', failed: { file: r.file, error: e.message }, files: [] }; }
    if (sha256(cur) !== r.sha256Before) return { ok: false, kind: 'refused', refused: 'file-changed', failed: { file: r.file, error: 'file-changed' }, files: [] };
  }
  for (const r of list) {
    const g = isLinkOrOutside(main, r.file, fs);
    if (g.bad) return { ok: false, kind: 'partial', refused: g.reason, failed: { file: r.file, error: `${g.reason}: ${g.at}` }, files: done };
    let cur;
    try { cur = fs.readFileSync(abs(main, r.file)); } catch (e) { return { ok: false, kind: 'partial', failed: { file: r.file, error: e.message }, files: done }; }
    if (sha256(cur) !== r.sha256Before) return { ok: false, kind: 'partial', refused: 'file-changed', failed: { file: r.file, error: 'file-changed' }, files: done };
    const next = r.newBuffer;
    if (!next || sha256(next) !== r.sha256After) return { ok: false, kind: 'partial', refused: 'no-buffer', failed: { file: r.file, error: 'falta el buffer calculado por planRewrites' }, files: done };
    try {
      const backup = backupFile({ file: abs(main, r.file), main, env, now });
      SM.writeAtomic(fs, abs(main, r.file), next);
      done.push({ file: r.file, backup, sha256After: r.sha256After });
      if (record) SM.updateRecord(record, (rc) => { const k = rc.rewrites.findIndex((x) => x.file === r.file); if (k >= 0) { rc.rewrites[k].backup = backup; rc.rewrites[k].status = 'done'; } }, nodeFs);
    } catch (e) {
      return { ok: false, kind: 'partial', failed: { file: r.file, error: e.message }, files: done };
    }
  }
  return { ok: true, files: done };
}

module.exports = { scanReferences, planRewrites, applyRewrites, relativeLink, mapper };
