'use strict';
// Acciones de /pignolo:init sobre el repo (R-12, R-13, R-18, A8-05..A8-08). Nada se borra ni se
// pisa; todo archivo existente que cambie se respalda FUERA del árbol, en PIGNOLO_HOME/init-backup.
// Ninguna acción hace commit, add ni push. Cada una devuelve { id, status, reason?, ...datos };
// con `dry: true` calcula lo mismo sin escribir y devuelve 'would-do' donde haría algo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitRun, isGitFailure } = require('./git');
const { pignoloHome } = require('./home');
const { ensureIgnored, PIGNOLO_IGNORED } = require('./pignolo-gitignore');
const { setReflogPolicy } = require('./git-backup');

const GITATTR_LINE = '.pignolo/** text eol=lf';
const DEFAULT_CHANNEL = 'reporte privado de GitHub: habilitalo en Security → Report a vulnerability';
const DEFAULT_SUPPORTED = 'la última versión publicada';
const SECURITY_PATHS = ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'];

const defaultRun = (root) => (args, cwd) => gitRun(args, cwd || root);
const mkStep = (id, status, extra = {}) => ({ id, status, ...extra });

function stamp(now) { return new Date(now).toISOString().replace(/[:.]/g, '-'); }

// Copia `file` a <PIGNOLO_HOME>/init-backup/<sha12 de main>/<ts>/<ruta relativa>; nunca pisa un respaldo.
function backupFile({ file, main, env = process.env, now = new Date() }) {
  const rel = path.relative(main, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`el archivo ${file} no está dentro de ${main}`);
  const sha = crypto.createHash('sha256').update(path.resolve(main)).digest('hex').slice(0, 12);
  const base = path.join(pignoloHome(env), 'init-backup', sha, stamp(now), rel);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  for (let n = 0; ; n += 1) {
    const dest = n === 0 ? base : `${base}-${n}`;
    try {
      fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL);
      return dest;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function readIf(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function configGet(run, root, key) {
  try { return String(run(['config', '--local', '--get', key], root)).trim(); } catch (e) {
    if (isGitFailure(e)) return ''; // exit 1 con stdout vacío: la clave no está fijada (C-06)
    throw e;
  }
}

function applyReflog({ root, run, dry = false } = {}) {
  const git = run || defaultRun(root);
  const before = { expire: configGet(git, root, 'gc.reflogExpire'), unreachable: configGet(git, root, 'gc.reflogExpireUnreachable') };
  if (before.expire === 'never' && before.unreachable === 'never') return mkStep('reflog', 'skipped', { reason: 'already-set', before });
  if (dry) return mkStep('reflog', 'would-do', { before });
  setReflogPolicy({ cwd: root, run: git });
  return mkStep('reflog', 'done', { before, after: { expire: 'never', unreachable: 'never' } });
}

// ¿La línea cubre .pignolo/** ? Se mira el patrón (primer campo) de cada línea.
function coversPignolo(line) {
  const t = line.trim();
  if (t === '' || t.startsWith('#')) return false;
  return ['.pignolo/**', '/.pignolo/**', '.pignolo/*', '/.pignolo/*', '.pignolo/', '/.pignolo/', '.pignolo', '/.pignolo'].includes(t.split(/\s+/)[0]);
}

function applyGitattributes({ root, main = root, env = process.env, now = new Date(), dry = false } = {}) {
  const file = path.join(main, '.gitattributes');
  const text = readIf(file);
  if (text !== null) {
    const lines = text.split(/\r?\n/);
    if (lines.some((l) => l.trim() === GITATTR_LINE)) return mkStep('gitattributes', 'skipped', { reason: 'already-set' });
    const other = lines.find(coversPignolo);
    if (other) return mkStep('gitattributes', 'refused', { reason: 'conflicting-rule', line: other.trim() });
  }
  if (dry) return mkStep('gitattributes', 'would-do', { file });
  if (text === null) {
    atomicWrite(file, `${GITATTR_LINE}\n`);
    return mkStep('gitattributes', 'done', { file });
  }
  const backup = backupFile({ file, main, env, now });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const sep = text === '' || text.endsWith('\n') ? '' : eol;
  atomicWrite(file, `${text}${sep}${GITATTR_LINE}${eol}`);
  return mkStep('gitattributes', 'done', { file, backup });
}

function applyIgnores({ root, run, dry = false } = {}) {
  const git = run || defaultRun(root);
  const file = path.join(root, '.pignolo', '.gitignore');
  const have = new Set((readIf(file) || '').split(/\r?\n/).map((l) => l.trim()));
  const added = PIGNOLO_IGNORED.filter((l) => !have.has(l));
  let tracked = false;
  try { git(['ls-files', '--error-unmatch', '.pignolo/.gitignore'], root); tracked = true; } catch (_) { tracked = false; }
  if (!dry && added.length) ensureIgnored(root, PIGNOLO_IGNORED);
  let trackedModified = false;
  if (tracked) {
    try { trackedModified = String(git(['status', '--porcelain', '--', '.pignolo/.gitignore'], root)).trim() !== ''; } catch (_) { trackedModified = false; }
  }
  const data = { added, tracked, trackedModified };
  if (!added.length) return mkStep('ignores', 'skipped', { reason: 'already-set', ...data });
  return mkStep('ignores', dry ? 'would-do' : 'done', data);
}

function applySecurityMd({ root, template, answers = {}, dry = false } = {}) {
  for (const rel of SECURITY_PATHS) {
    if (fs.existsSync(path.join(root, rel))) return mkStep('security-md', 'skipped', { reason: 'exists', path: rel });
  }
  const vals = {
    project: answers.project || path.basename(path.resolve(root)),
    supported: answers.supported || DEFAULT_SUPPORTED,
    channel: answers.channel || DEFAULT_CHANNEL,
  };
  for (const v of Object.values(vals)) {
    if (typeof v !== 'string' || /[\r\n]/.test(v) || v.includes('{{')) return mkStep('security-md', 'refused', { reason: 'invalid-answer' });
  }
  if (dry) return mkStep('security-md', 'would-do', { file: path.join(root, 'SECURITY.md') });
  const text = template.replace(/\{\{(project|supported|channel)\}\}/g, (_, k) => vals[k]);
  atomicWrite(path.join(root, 'SECURITY.md'), text);
  return mkStep('security-md', 'done', { file: path.join(root, 'SECURITY.md') });
}

module.exports = { backupFile, atomicWrite, applyReflog, applyGitattributes, applyIgnores, applySecurityMd, GITATTR_LINE, DEFAULT_CHANNEL };
