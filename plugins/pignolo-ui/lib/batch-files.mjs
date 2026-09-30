// Apply without breaking (spec §9): copies before editing, delta of `git status` against the
// initial state after editing, and a restore that never deletes what it cannot prove it wrote.
// No destructive git: git is only read (status, rev-parse, diff --numstat).
//
// saveBatch({ project, batch, expected, gitTimeoutMs })  -> { ok, problems, record }
//   expected = [{ path, exists, change: 'tokens'|'structure' }] (at most 5). Refuses (ok false)
//   a bad or repeated path, a path under .git/ or .pignolo-ui/, a path that is a symbolic link
//   or goes through a folder whose real path leaves the project (not-in-project), a path whose
//   letters differ from the disk only in case (case-mismatch), a declared state that does not
//   match the disk, an expected file with uncommitted changes, more than 5 files, or a batch
//   folder that already has files.json. Copies each existing file to <batch>/copies/<n>, and
//   records the paths git ignores (`ignored`, folders collapsed, nothing hashed) with the size
//   and mtime of each ignored file (`ignoredStats`; a collapsed folder only has to exist).
// verifyBatch({ project, batch, gitTimeoutMs })   -> { ok, unexpected, files, lines, overLineLimit }
//   Delta of the current status against the initial one: every new or changed entry outside
//   the expected list is `unexpected`; an untracked one that existed before save (ignored then,
//   in HEAD then, or still in the index) carries `existedBefore: true`. Records what the batch
//   left (sha256 of each file) in files.json (`after`), which restore needs. `problems` lists
//   expected files now reached through a link that leaves the project (not-in-project).
//   `warnings` lists every source that moved (source-moved): an ignored file that is gone or has
//   another size or mtime, an ignored folder that is gone, or an entry of the initial state that
//   is gone or has another sha256; while there is one, restore deletes no unexpected untracked
//   file (it may be the only copy of what moved). An untracked file whose sha256 is the one of
//   an initial entry also existed before (a copy). `note`: restore treats as the agent's
//   anything the user creates between save and restore.
// restoreBatch({ project, batch, gitTimeoutMs })  -> { ok, restored, deleted, blocked }
//   Recomputes the delta first: a change that verify did not record is BLOCKED (not-verified).
//   Nothing is written or deleted through a link that leaves the project (not-in-project).
//   Expected files that existed: rewritten from the copy only when they are missing or their
//   sha256 is the original or the one verify recorded (else changed-after-the-batch), then
//   checked by sha256. Created files (expected new or unexpected untracked): deleted only if
//   their sha256 is the one verify recorded; otherwise BLOCKED and left alone; a path still
//   there whose sha256 cannot be read is BLOCKED (unreadable). An untracked file that existed
//   before save is BLOCKED (existed-before-the-batch), never deleted. While a source moved
//   (see verify), no unexpected untracked file is deleted: BLOCKED (source-moved). Anything else
//   unexpected: BLOCKED (unexpectedAction, decision D-2b-1). `summary` says in one line exactly
//   what was restored, deleted and left alone; `sourcesChanged` names the sources that moved.
// Git runs with a deadline (GIT_TIMEOUT_MS); a failure or a timeout is a BatchError.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const MAX_FILES = 5;
export const MAX_LINES = 200;
export const GIT_TIMEOUT_MS = 60000;
const RECORD = 'files.json';

export class BatchError extends Error {}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function git(project, args, timeoutMs = GIT_TIMEOUT_MS) {
  try {
    return execFileSync('git', args, { cwd: project, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (e.code === 'ETIMEDOUT') throw Object.assign(new BatchError(`git ${args[0]} no terminó en ${timeoutMs / 1000} s: probá de nuevo sin otra operación de git en curso`), { timeout: true });
    const why = String(e.stderr ?? '').trim().split('\n')[0] || e.code || `código ${e.status}`;
    throw new BatchError(`git ${args[0]} falló: ${why}`);
  }
}

function fileSha(project, rel) {
  try {
    const abs = path.join(project, ...rel.split('/'));
    return fs.statSync(abs).isFile() ? sha256(fs.readFileSync(abs)) : null;
  } catch {
    return null;
  }
}

// `git status --porcelain=v1 -z --untracked-files=all` -> [{ code, path, from? }]
export function parsePorcelainZ(out) {
  const parts = out.split('\0');
  const entries = [];
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.length < 4) continue;
    const code = p.slice(0, 2);
    const entry = { code, path: p.slice(3) };
    if (code[0] === 'R' || code[0] === 'C') entry.from = parts[++k];
    entries.push(entry);
  }
  return entries;
}

function statusOf(project, timeoutMs) {
  return parsePorcelainZ(git(project, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], timeoutMs))
    .map((e) => ({ ...e, sha256: fileSha(project, e.path) }));
}

// Normalized project-relative posix path, or null when it leaves the project or is reserved.
export function cleanRel(p) {
  if (typeof p !== 'string' || p.trim() === '' || path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return null;
  const rel = path.posix.normalize(p.replace(/\\/g, '/'));
  if (rel === '.' || rel.startsWith('../') || rel === '..') return null;
  const top = rel.split('/')[0].toLowerCase();
  if (top === '.git' || top === '.pignolo-ui') return null;
  return rel;
}

// null when writing `rel` lands inside the project; 'not-in-project' when `rel` is a symbolic
// link (or junction) or the real path of its nearest existing folder leaves the project: save
// would copy, and restore would write or delete, somewhere else.
function linkProblem(project, rel) {
  const abs = path.join(project, ...rel.split('/'));
  try { if (fs.lstatSync(abs).isSymbolicLink()) return 'not-in-project'; } catch { /* absent */ }
  let dir = path.dirname(abs);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try {
    const r = path.relative(fs.realpathSync.native(project), fs.realpathSync.native(dir));
    return r === '' || (r.split(path.sep)[0] !== '..' && !path.isAbsolute(r)) ? null : 'not-in-project';
  } catch {
    return 'not-in-project';
  }
}

// On a case-insensitive disk (Windows, macOS) `src/Page.tsx` opens `src/page.tsx`, while git
// and files.json would track another name: every existing segment must match the disk exactly.
function caseMismatch(project, rel) {
  let dir = project;
  for (const seg of rel.split('/')) {
    const next = path.join(dir, seg);
    if (!fs.existsSync(next)) return false;
    let names;
    try { names = fs.readdirSync(dir); } catch { return false; }
    if (!names.includes(seg)) return true;
    dir = next;
  }
  return false;
}

// What restore does with an unexpected change (spec §9 "si no, se revierte"; decision D-2b-1,
// pending with the author). Only an untracked file that did not exist before the batch has
// proof (verify recorded its sha256); the rest has no copy and git is only read, so it is
// BLOCKED and the user is asked. The alternative (revert a tracked file that was clean with
// `git checkout -- <file>`) changes only this function and the "git is only read" constraint.
function unexpectedAction(u, sourceMoved) {
  if (u.code === '??' && u.existedBefore) return 'existed-before-the-batch';
  if (u.code === '??' && !u.wasDirty) return sourceMoved ? 'source-moved' : 'delete-if-ours';
  return 'block';
}

// Paths git ignored at save (`--directory`: an ignored folder is one entry ending in '/').
function ignoredOf(project, timeoutMs) {
  return git(project, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'], timeoutMs).split('\0').filter(Boolean);
}
const underIgnored = (ignored, p) => ignored.some((i) => (i.endsWith('/') ? p.startsWith(i) : p === i));

// Size and mtime of each ignored file, without reading it; an ignored folder only has to exist.
function ignoredStatsOf(project, ignored) {
  return ignored.map((rel) => {
    try {
      const st = fs.lstatSync(path.join(project, ...rel.split('/').filter(Boolean)));
      return rel.endsWith('/') ? { path: rel, dir: true } : { path: rel, size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return { path: rel, gone: true }; // vanished between ls-files and lstat
    }
  });
}

// Sources that moved since save: an ignored file gone or with another size or mtime, an ignored
// folder gone, an initial entry gone or with another sha256. While one moved, an unexpected
// untracked file may be its only copy (`mv`, or `cp` + `rm`), so restore deletes none. A
// record without ignoredStats (older save) cannot tell: it counts as moved.
function movedSources(project, record) {
  if (!Array.isArray(record.ignoredStats)) return ['(files.json sin ignoredStats)'];
  const expected = new Set(record.files.map((f) => f.path));
  const moved = [];
  for (const s of record.ignoredStats) {
    if (s.gone || s.path.split('/')[0].toLowerCase() === '.pignolo-ui') continue; // the run folder changes on purpose
    let st = null;
    try { st = fs.lstatSync(path.join(project, ...s.path.split('/').filter(Boolean))); } catch { /* gone */ }
    if (!st || (!s.dir && (st.size !== s.size || st.mtimeMs !== s.mtimeMs))) moved.push(s.path);
  }
  for (const b of record.initial) {
    if (!expected.has(b.path) && fileSha(project, b.path) !== b.sha256) moved.push(b.path);
  }
  return moved;
}

export const TOUCH_NOTE = 'no toques el proyecto entre save y restore; lo que crees en ese intervalo se trata como del agente y restore lo borra';

// Every path of a commit (only read when some untracked entry needs it).
function treePaths(project, head, timeoutMs) {
  if (!head) return new Set();
  return new Set(git(project, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', head], timeoutMs).split('\0').filter(Boolean));
}

const readRecord = (batch) => {
  const file = path.join(batch, RECORD);
  if (!fs.existsSync(file)) throw new BatchError(`no hay ${RECORD} en el lote: corré save primero`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const writeRecord = (batch, record) => fs.writeFileSync(path.join(batch, RECORD), `${JSON.stringify(record, null, 2)}\n`);

export function saveBatch({ project, batch, expected, gitTimeoutMs = GIT_TIMEOUT_MS }) {
  const problems = [];
  if (!Array.isArray(expected) || expected.length === 0) problems.push({ problem: 'empty-list' });
  else if (expected.length > MAX_FILES) problems.push({ problem: 'too-many-files', max: MAX_FILES, count: expected.length });
  if (fs.existsSync(path.join(batch, RECORD))) problems.push({ problem: 'batch-exists' });
  const initial = statusOf(project, gitTimeoutMs);
  const dirty = new Set(initial.flatMap((e) => (e.from ? [e.path, e.from] : [e.path])));
  const seen = new Set();
  const files = [];
  for (const [i, item] of (Array.isArray(expected) ? expected : []).entries()) {
    const rel = cleanRel(item && item.path);
    if (!rel) { problems.push({ path: item && item.path, problem: 'bad-path' }); continue; }
    if (seen.has(rel.toLowerCase())) { problems.push({ path: rel, problem: 'duplicate' }); continue; }
    seen.add(rel.toLowerCase());
    if (typeof item.exists !== 'boolean') { problems.push({ path: rel, problem: 'exists-not-boolean' }); continue; }
    if (item.change !== 'tokens' && item.change !== 'structure') { problems.push({ path: rel, problem: 'bad-change' }); continue; }
    const link = linkProblem(project, rel);
    if (link) { problems.push({ path: rel, problem: link }); continue; }
    if (caseMismatch(project, rel)) { problems.push({ path: rel, problem: 'case-mismatch' }); continue; }
    const abs = path.join(project, ...rel.split('/'));
    const onDisk = fs.existsSync(abs);
    if (onDisk !== item.exists) { problems.push({ path: rel, problem: item.exists ? 'declared-existing-but-missing' : 'declared-new-but-exists' }); continue; }
    if (onDisk && !fs.statSync(abs).isFile()) { problems.push({ path: rel, problem: 'not-a-file' }); continue; }
    if (dirty.has(rel)) { problems.push({ path: rel, problem: 'uncommitted-changes' }); continue; }
    files.push({ path: rel, existed: onDisk, change: item.change, index: i });
  }
  if (problems.length) return { ok: false, problems };

  fs.mkdirSync(path.join(batch, 'copies'), { recursive: true });
  const recorded = files.map((f, n) => {
    if (!f.existed) return { path: f.path, existed: false, change: f.change, sha256: null, copy: null };
    const buf = fs.readFileSync(path.join(project, ...f.path.split('/')));
    const copy = `copies/${n}`;
    fs.writeFileSync(path.join(batch, copy), buf, { flag: 'wx' });
    return { path: f.path, existed: true, change: f.change, sha256: sha256(buf), copy };
  });
  let head = null;
  try { head = git(project, ['rev-parse', '--verify', '--quiet', 'HEAD'], gitTimeoutMs).trim() || null; } catch (e) { if (e.timeout) throw e; head = null; } // no commit yet
  const ignored = ignoredOf(project, gitTimeoutMs);
  const record = { version: 1, head, files: recorded, initial, ignored, ignoredStats: ignoredStatsOf(project, ignored), after: null };
  fs.writeFileSync(path.join(batch, RECORD), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { ok: true, problems: [], record };
}

function changedLines(project, head, files, timeoutMs) {
  let lines = 0;
  const tracked = files.filter((f) => f.existed).map((f) => f.path);
  if (head && tracked.length) {
    for (const row of git(project, ['diff', '--numstat', head, '--', ...tracked], timeoutMs).split('\n')) {
      const m = /^(\d+)\t(\d+)\t/.exec(row);
      if (m) lines += Number(m[1]) + Number(m[2]);
    }
  }
  for (const f of files.filter((x) => !x.existed)) {
    let text;
    try { text = fs.readFileSync(path.join(project, ...f.path.split('/')), 'utf8'); } catch { continue; } // not created
    if (text) lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  }
  return lines;
}

// Entries of the current status outside the expected list that differ from the initial state.
function deltaOf(project, record, timeoutMs) {
  const expected = new Set(record.files.map((f) => f.path));
  const before = new Map(record.initial.map((e) => [e.path, e]));
  const current = statusOf(project, timeoutMs);
  const unexpected = [];
  const nowPaths = new Set();
  for (const e of current) {
    for (const p of e.from ? [e.path, e.from] : [e.path]) {
      nowPaths.add(p);
      if (expected.has(p)) continue;
      const b = before.get(p);
      if (b && b.code === e.code && b.sha256 === fileSha(project, p)) continue; // untouched prior change
      unexpected.push({ path: p, code: e.code, sha256: fileSha(project, p), wasDirty: Boolean(b) });
    }
  }
  for (const b of record.initial) {
    if (!nowPaths.has(b.path) && !expected.has(b.path)) unexpected.push({ path: b.path, code: 'clean-now', sha256: fileSha(project, b.path), wasDirty: true });
  }
  // An untracked file restore could delete: did it exist before save? Ignored then (and no
  // longer), in HEAD then, or with another status entry now (`git rm --cached`: `D ` + `??`).
  // A record without `ignored` (older save) cannot tell: it counts as existing.
  // A copy of an initial entry (same sha256) existed before too.
  const untracked = unexpected.filter((u) => u.code === '??' && !u.wasDirty);
  if (untracked.length) {
    const inHead = treePaths(project, record.head, timeoutMs);
    const otherEntry = new Set(current.filter((e) => e.code !== '??').flatMap((e) => (e.from ? [e.path, e.from] : [e.path])));
    const initialShas = new Set(record.initial.map((b) => b.sha256).filter(Boolean));
    for (const u of untracked) {
      if (!Array.isArray(record.ignored) || underIgnored(record.ignored, u.path) || inHead.has(u.path) || otherEntry.has(u.path) || (u.sha256 && initialShas.has(u.sha256))) u.existedBefore = true;
    }
  }
  return unexpected;
}

export function verifyBatch({ project, batch, gitTimeoutMs = GIT_TIMEOUT_MS }) {
  const record = readRecord(batch);
  const unexpected = deltaOf(project, record, gitTimeoutMs);
  const files = record.files.map((f) => {
    const now = fileSha(project, f.path);
    return { path: f.path, existed: f.existed, exists: now !== null, changed: now !== f.sha256, sha256: now };
  });
  const problems = record.files.flatMap((f) => { const link = linkProblem(project, f.path); return link ? [{ path: f.path, problem: link }] : []; });
  const lines = changedLines(project, record.head, record.files, gitTimeoutMs);
  const warnings = movedSources(project, record).map((p) => ({ path: p, problem: 'source-moved' }));
  record.after = { files: Object.fromEntries(files.map((f) => [f.path, f.sha256])), unexpected };
  writeRecord(batch, record);
  return { ok: unexpected.length === 0 && problems.length === 0, unexpected, problems, warnings, files, lines, overLineLimit: lines > MAX_LINES, note: TOUCH_NOTE };
}

export function restoreBatch({ project, batch, gitTimeoutMs = GIT_TIMEOUT_MS }) {
  const record = readRecord(batch);
  if (!record.after) throw new BatchError('el lote no tiene verificación: corré verify antes de restore');
  const restored = [];
  const deleted = [];
  const blocked = [];
  const abs = (rel) => path.join(project, ...rel.split('/'));
  // before touching anything: a change that verify did not record is not the batch's to undo
  const verified = new Set(record.after.unexpected.map((u) => u.path));
  const sourcesChanged = movedSources(project, record);
  const fresh = new Map();
  for (const u of deltaOf(project, record, gitTimeoutMs)) {
    fresh.set(u.path, u);
    if (!verified.has(u.path)) blocked.push({ path: u.path, problem: 'not-verified' });
  }
  const deleteIfOurs = (rel, wrote) => {
    const link = linkProblem(project, rel);
    if (link) { blocked.push({ path: rel, problem: link }); return; }
    const now = fileSha(project, rel);
    if (now === null && fs.existsSync(abs(rel))) { blocked.push({ path: rel, problem: 'unreadable' }); return; }
    if (now === null) return; // already gone
    if (wrote && now === wrote) {
      fs.rmSync(abs(rel), { force: false });
      if (fs.existsSync(abs(rel))) blocked.push({ path: rel, problem: 'delete-failed' });
      else deleted.push(rel);
    } else blocked.push({ path: rel, problem: 'changed-after-the-batch' });
  };
  for (const f of record.files) {
    if (f.existed) {
      const link = linkProblem(project, f.path);
      if (link) { blocked.push({ path: f.path, problem: link }); continue; }
      const now = fileSha(project, f.path);
      if (now === null && fs.existsSync(abs(f.path))) { blocked.push({ path: f.path, problem: 'not-a-file' }); continue; }
      // overwrite only with proof: missing, still the original, or what verify recorded
      if (now !== null && now !== f.sha256 && now !== record.after.files[f.path]) { blocked.push({ path: f.path, problem: 'changed-after-the-batch' }); continue; }
      const buf = fs.readFileSync(path.join(batch, f.copy));
      fs.mkdirSync(path.dirname(abs(f.path)), { recursive: true });
      fs.writeFileSync(abs(f.path), buf);
      if (fileSha(project, f.path) === f.sha256) restored.push(f.path);
      else blocked.push({ path: f.path, problem: 'restore-mismatch' });
    } else {
      deleteIfOurs(f.path, record.after.files[f.path]);
    }
  }
  for (const u of record.after.unexpected) {
    const action = unexpectedAction({ ...u, existedBefore: u.existedBefore || fresh.get(u.path)?.existedBefore }, sourcesChanged.length > 0);
    if (action === 'delete-if-ours') deleteIfOurs(u.path, u.sha256);
    else blocked.push({ path: u.path, problem: action === 'block' ? 'unexpected-change-not-restorable' : action });
  }
  const list = (a) => (a.length ? ` (${a.join(', ')})` : '');
  const summary = `restaurados ${restored.length}${list(restored)}; borrados ${deleted.length}${list(deleted)}; sin tocar ${blocked.length}${list(blocked.map((b) => b.path))}`;
  return { ok: blocked.length === 0, restored, deleted, blocked, sourcesChanged, summary };
}
