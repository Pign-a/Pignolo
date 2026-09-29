'use strict';
// Árbol de trabajo y diff sin tocar el índice real ni el árbol (hito 3a, Task 2).
// Todas aceptan `run` (de withDeadline) o { cwd, timeoutMs }.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isGitFailure, withDeadline } = require('./git');
const { addAll } = require('./shadow');

const BIG = 256 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const mkRun = ({ cwd, timeoutMs = DEFAULT_TIMEOUT_MS, run }) => run || withDeadline(cwd, timeoutMs);

// sha del árbol de la copia de trabajo (con lo no commiteado y lo nuevo no ignorado): copia
// del índice real a un temporal en <git-dir> (así rinde la caché de stat), add -A y write-tree.
function workingTree({ cwd, timeoutMs, run } = {}) {
  const r = mkRun({ cwd, timeoutMs, run });
  let gitDir;
  try {
    gitDir = r(['rev-parse', '--absolute-git-dir']);
  } catch (e) {
    if (isGitFailure(e)) throw new Error(`no es un repo git: ${cwd}`);
    throw e;
  }
  const tmp = path.join(gitDir, `pignolo-tree-index-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    const real = path.join(gitDir, 'index');
    if (fs.existsSync(real)) fs.copyFileSync(real, tmp);
    const env = { ...process.env, GIT_INDEX_FILE: tmp };
    addAll(r, { env, maxBuffer: BIG });
    return r(['write-tree'], { env });
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(`${tmp}.lock`, { force: true });
  }
}

// Archivos cambiados entre base y tree. emptied (con sizes): existe en base con tamaño > 0
// y en tree con tamaño 0. Con sizes:false no se llama a ls-tree y emptied es null.
function changedFiles({ cwd, base, tree, timeoutMs, run, sizes = true } = {}) {
  const r = mkRun({ cwd, timeoutMs, run });
  const out = r(['diff-tree', '-r', '-z', '--no-renames', '--name-status', base, tree], { maxBuffer: BIG });
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i]) files.push({ path: parts[i + 1], status: parts[i], emptied: sizes ? false : null });
  }
  if (sizes) {
    const maybe = files.filter((f) => f.status === 'M' || f.status === 'T').map((f) => f.path);
    if (maybe.length) {
      const sizeOf = (ref) => {
        const m = new Map();
        for (let i = 0; i < maybe.length; i += 200) {
          const o = r(['ls-tree', '-r', '-l', '-z', ref, '--', ...maybe.slice(i, i + 200)], { maxBuffer: BIG });
          for (const rec of o.split('\0')) {
            const mm = /^\S+ blob \S+\s+(\d+)\t([\s\S]*)$/.exec(rec);
            if (mm) m.set(mm[2], Number(mm[1]));
          }
        }
        return m;
      };
      const before = sizeOf(base);
      const after = sizeOf(tree);
      for (const f of files) f.emptied = before.get(f.path) > 0 && after.get(f.path) === 0;
    }
  }
  return files;
}

// Líneas agregadas y quitadas (sin contexto) con su número de línea del lado que
// corresponde: '+' en el archivo nuevo, '-' en el viejo. Binarios omitidos.
function addedLines({ cwd, base, tree, timeoutMs, run } = {}) {
  const r = mkRun({ cwd, timeoutMs, run });
  const out = r(['-c', 'core.quotepath=false', 'diff-tree', '-r', '-p', '-U0', '--no-renames', '--no-ext-diff', '--no-textconv', base, tree], { maxBuffer: BIG });
  const res = [];
  let header = false;
  let oldPath = null;
  let file = null;
  let oldNo = 0;
  let newNo = 0;
  for (const l of out.split('\n')) {
    if (l.startsWith('diff --git ')) { header = true; oldPath = null; file = null; continue; }
    if (header) {
      if (l.startsWith('--- ')) oldPath = l === '--- /dev/null' ? null : l.slice(4).replace(/^a\//, '');
      else if (l.startsWith('+++ ')) file = l === '+++ /dev/null' ? oldPath : l.slice(4).replace(/^b\//, '');
      else if (l.startsWith('@@')) header = false;
      if (header) continue;
    }
    if (l.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
      if (m) { oldNo = Number(m[1]); newNo = Number(m[2]); }
    } else if (file && l.startsWith('+')) {
      res.push({ path: file, line: newNo, text: l.slice(1), sign: '+' });
      newNo += 1;
    } else if (file && l.startsWith('-')) {
      res.push({ path: file, line: oldNo, text: l.slice(1), sign: '-' });
      oldNo += 1;
    }
  }
  return res;
}

function headSha({ cwd, timeoutMs, run } = {}) {
  const r = mkRun({ cwd, timeoutMs, run });
  try { return r(['rev-parse', '--verify', '-q', 'HEAD']) || null; } catch (e) {
    if (isGitFailure(e)) return null;
    throw e;
  }
}

module.exports = { workingTree, changedFiles, addedLines, headSha };
