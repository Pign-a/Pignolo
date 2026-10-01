'use strict';
// Sellos de la compuerta (spec §8.2): ~/.pignolo/seals/<repo-id>/<tree>-<level>-<stamp>.json
// y el log en logs/<sha256>.log. Escritura atómica (temporal + rename).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withDeadline } = require('./git');
const { repoIdForGitDir } = require('./shadow');
const { pignoloHome } = require('./home');

const STATUSES = ['PASS', 'FAIL', 'NO_GATE', 'NO_TESTS', 'TREE_CHANGED', 'SCOPE', 'INTEGRITY', 'INTEGRITY_NO_REF', 'NO_MUTATION_TOOL', 'MUTATION'];
const LISTS = ['scope', 'emptied', 'integrity'];

function repoIdFor({ cwd, timeoutMs = 5000, run } = {}) {
  const r = run || withDeadline(cwd, timeoutMs);
  return repoIdForGitDir(r(['rev-parse', '--path-format=absolute', '--git-common-dir']));
}

const sealDir = (env, repoId) => path.join(pignoloHome(env), 'seals', repoId);

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v !== '';
const nullableStr = (v) => v === null || typeof v === 'string';

function validateSeal(o) {
  if (!isObj(o)) return ['el sello no es un objeto'];
  const errs = [];
  if (o.v !== 1) errs.push('v debe ser 1');
  for (const k of ['repoId', 'treeHash', 'level']) if (!isStr(o[k])) errs.push(`${k} debe ser un texto`);
  if (!nullableStr(o.sha)) errs.push('sha debe ser texto o null');
  if (!nullableStr(o.treeAfter)) errs.push('treeAfter debe ser texto o null');
  if (typeof o.command !== 'string') errs.push('command debe ser un texto');
  if (o.exit !== null && typeof o.exit !== 'number') errs.push('exit debe ser número o null');
  if (!STATUSES.includes(o.status)) errs.push(`status debe ser uno de ${STATUSES.join(', ')}`);
  if (typeof o.logHash !== 'string' || !/^[0-9a-f]{64}$/.test(o.logHash)) errs.push('logHash debe ser un sha256');
  if (typeof o.time !== 'string' || Number.isNaN(Date.parse(o.time))) errs.push('time debe ser una fecha ISO');
  if (!nullableStr(o.task)) errs.push('task debe ser texto o null');
  if (!nullableStr(o.noTestsReason)) errs.push('noTestsReason debe ser texto o null');
  if (o.seedOffered !== undefined && !Number.isInteger(o.seedOffered)) errs.push('seedOffered debe ser un entero');
  if (o.seedInCommand !== undefined && typeof o.seedInCommand !== 'boolean') errs.push('seedInCommand debe ser un booleano');
  if (!isObj(o.checks)) errs.push('checks debe ser un objeto');
  else {
    for (const k of LISTS) if (!Array.isArray(o.checks[k]) || !o.checks[k].every((x) => typeof x === 'string')) errs.push(`checks.${k} debe ser una lista de textos`);
    if (o.checks.noProtects !== undefined && (!Array.isArray(o.checks.noProtects) || !o.checks.noProtects.every((x) => typeof x === 'string'))) errs.push('checks.noProtects debe ser una lista de textos');
    const w = o.checks.weakened;
    if (w !== undefined && (!Array.isArray(w) || !w.every((x) => isObj(x) && typeof x.path === 'string' && typeof x.kind === 'string'))) errs.push('checks.weakened debe ser una lista de { path, kind }');
    const m = o.checks.mutation;
    if (m !== undefined && m !== null && !(isObj(m) && Array.isArray(m.files))) errs.push('checks.mutation debe ser { files, exit } o null');
    const e = o.checks.envDetect;
    if (!Array.isArray(e) || !e.every((x) => isObj(x) && typeof x.path === 'string' && typeof x.line === 'number')) errs.push('checks.envDetect debe ser una lista de { path, line }');
  }
  return errs;
}

// Escribe el log y el sello (logHash = sha256 del log). Lanza si el sello no valida.
function writeSeal({ env, repoId, seal, log = '' }) {
  const logHash = crypto.createHash('sha256').update(log).digest('hex');
  const full = { ...seal, logHash };
  const errs = validateSeal(full);
  if (errs.length) throw new Error(`sello inválido: ${errs.join('; ')}`);
  const dir = sealDir(env, repoId);
  atomicWrite(path.join(dir, 'logs', `${logHash}.log`), log);
  const stamp = new Date(Date.parse(full.time)).toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${full.treeHash}-${full.level}-${stamp}-${crypto.randomBytes(3).toString('hex')}.json`);
  atomicWrite(file, `${JSON.stringify(full, null, 2)}\n`);
  return { file, logHash };
}

// El sello más nuevo (por `time`) de ese árbol y nivel; los ilegibles o inválidos se ignoran.
function findSeal({ env, repoId, treeHash, level }) {
  const dir = sealDir(env, repoId);
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return null; }
  const prefix = `${treeHash}-${level}-`;
  let best = null;
  let bestT = -Infinity;
  for (const n of names) {
    if (!n.startsWith(prefix) || !n.endsWith('.json')) continue;
    let o;
    try { o = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_) { continue; }
    if (validateSeal(o).length || o.treeHash !== treeHash || o.level !== level) continue;
    const t = Date.parse(o.time);
    if (t >= bestT) { best = o; bestT = t; }
  }
  return best;
}

module.exports = { repoIdFor, sealDir, writeSeal, findSeal, validateSeal };
