// Output of ui-auditor (spec §10, R-9): the agent has no Bash, so its answer carries a ```json
// block { findings, notVerified, independent } that the main thread copies to <run>/auditor.json
// and this module validates against the run, without a model.
//
// extractJsonBlock(text) -> object | null          (the LAST ```json block)
// validateFindings({ output, run, project, catalog, judgmentIds }) -> { ok, problems: [{ index, problem }] }
// validateVerdicts({ output, request, run, project }) -> { ok, problems: [{ index, problem }] }   (verdict mode, hito 4f)
//
// `evidence.kind` is the auditor's vocabulary (ui-check | browser | file | capture); report.json
// uses `ref.source`. Only ui-check/browser findings become report claims (report-skeleton).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SEVERITIES = ['bloquea', 'alto', 'medio', 'detalle'];
const SCOPES = ['new', 'debt'];
const SELF_GRADE = ['score', 'grade', 'rating'];
// Author decision 2026-10-01 (R-4e-2): at most 3 judgment findings per screen; the 4th and later are rejected, not trimmed.
export const MAX_JUDGMENT_FINDINGS = 3;
// R-4e-20: the optional `keep` line, one thing that already works.
export const KEEP_MAX_CHARS = 160;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function extractJsonBlock(text) {
  const blocks = [...String(text).matchAll(/```json[ \t]*\r?\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  try {
    const parsed = JSON.parse(blocks[blocks.length - 1][1]);
    return isMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readEntries(run, name) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(run, name), 'utf8'));
    return Array.isArray(json.entries) ? json.entries : [];
  } catch {
    return [];
  }
}

function inside(root, rel) {
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? abs : null;
}

// Returns { problem } or { ok: true, failing }: failing = the cited script entry has status fail.
export function checkEvidence(ev, { run, project, entries }) {
  if (!isMap(ev) || !['ui-check', 'browser', 'file', 'capture'].includes(ev.kind)) return { problem: 'no-evidence' };
  if (ev.kind === 'ui-check' || ev.kind === 'browser') {
    if (typeof ev.fingerprint !== 'string' || !ev.fingerprint) return { problem: 'no-evidence' };
    const found = entries.filter((e) => e.fingerprint === ev.fingerprint);
    if (!found.length) return { problem: 'evidence-missing' };
    return { ok: true, failing: found.some((e) => e.status === 'fail'), script: true };
  }
  if (ev.kind === 'file') {
    const abs = inside(project, ev.path);
    if (!abs || !Number.isInteger(ev.line) || ev.line < 1) return { problem: 'evidence-missing' };
    let lines;
    try { lines = fs.readFileSync(abs, 'utf8').split('\n').length; } catch { return { problem: 'evidence-missing' }; }
    return ev.line <= lines ? { ok: true, failing: false, script: false } : { problem: 'evidence-missing' };
  }
  const abs = inside(run, ev.path);
  if (!abs || typeof ev.sha256 !== 'string') return { problem: 'evidence-missing' };
  try {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    return sha === ev.sha256 ? { ok: true, failing: false, script: false } : { problem: 'evidence-missing' };
  } catch {
    return { problem: 'evidence-missing' };
  }
}

export function validateFindings({ output, run, project, catalog, judgmentIds = [] }) {
  const problems = [];
  if (!isMap(output) || !Array.isArray(output.findings)) return { ok: false, problems: [{ index: -1, problem: 'bad-shape' }] };
  if (SELF_GRADE.some((k) => k in output)) problems.push({ index: -1, problem: 'self-grade' });
  if ('keep' in output) {
    const k = output.keep;
    if (typeof k !== 'string' || k.trim() === '' || /[\r\n]/.test(k) || k.length > KEEP_MAX_CHARS) problems.push({ index: -1, problem: 'bad-keep' });
  }
  let judgmentCount = 0;
  const known = new Set([...catalog.rules.map((r) => r.id), ...judgmentIds]);
  const entries = [...readEntries(run, 'ui-check.json'), ...readEntries(run, 'browser.json')];
  output.findings.forEach((f, index) => {
    const add = (problem) => problems.push({ index, problem });
    if (!isMap(f)) { add('bad-shape'); return; }
    if (SELF_GRADE.some((k) => k in f)) add('self-grade');
    if (typeof f.id !== 'string' || !known.has(f.id)) add('bad-id');
    if (!SEVERITIES.includes(f.severity)) add('bad-severity');
    if (!SCOPES.includes(f.scope)) add('bad-scope');
    if (/^J-\d+$/.test(String(f.id)) && ++judgmentCount > MAX_JUDGMENT_FINDINGS) add('judgment-cap');
    const ev = checkEvidence(f.evidence, { run, project, entries });
    if (ev.problem) add(ev.problem);
    if (f.severity === 'bloquea') {
      if (!ev.ok || !ev.script || !ev.failing) add('bloquea-without-script');
      if (/^J-\d+$/.test(String(f.id))) add('judgment-above-alto');
    }
    // author decision 2026-10-01: a judgment finding (J-nn) is at most `medio` unless a failing script or browser entry backs it.
    // Rejected, not downgraded, like every other violation here: the main thread sends the problem back to the auditor.
    if (/^J-\d+$/.test(String(f.id)) && (f.severity === 'alto' || f.severity === 'bloquea') && !(ev.ok && ev.script && ev.failing)) add('judgment-without-measure');
  });
  return { ok: problems.length === 0, problems };
}

// ---- verdict mode (hito 4f, R-4f-7) -------------------------------------------------------
// A second reading of the "after" version that only scores the judgment criteria the user chose to
// fix. The answer is { verdicts: [{ id, status, why, evidence }], independent } and nothing else:
// it can name the ids of the request and no others, so it cannot add findings.
export const VERDICT_STATUSES = ['resolved', 'partial', 'unresolved'];
const VERDICT_KEYS = ['id', 'status', 'why', 'evidence'];

export function validateVerdicts({ output, request, run, project }) {
  const problems = [];
  const ids = Array.isArray(request?.ids) ? request.ids : [];
  if (!isMap(output) || !Array.isArray(output.verdicts) || !Array.isArray(request?.ids)) return { ok: false, problems: [{ index: -1, problem: 'bad-shape' }] };
  if (SELF_GRADE.some((k) => k in output)) problems.push({ index: -1, problem: 'self-grade' });
  // `findings` or any other top-level key would be a way to add findings in a mode that must not
  if (Object.keys(output).some((k) => !['verdicts', 'independent'].includes(k) && !SELF_GRADE.includes(k))) problems.push({ index: -1, problem: 'new-finding' });
  const entries = [...readEntries(run, 'ui-check.json'), ...readEntries(run, 'browser.json')];
  const seen = new Set();
  output.verdicts.forEach((v, index) => {
    const add = (problem) => problems.push({ index, problem });
    if (!isMap(v)) { add('bad-shape'); return; }
    if (SELF_GRADE.some((k) => k in v)) add('self-grade');
    if (Object.keys(v).some((k) => !VERDICT_KEYS.includes(k) && !SELF_GRADE.includes(k))) add('new-finding');
    if (typeof v.id !== 'string' || !ids.includes(v.id)) add('unknown-id');
    else if (seen.has(v.id)) add('duplicate-id');
    else seen.add(v.id);
    if (!VERDICT_STATUSES.includes(v.status)) add('bad-status');
    if (typeof v.why !== 'string' || v.why.trim() === '') add('bad-why');
    const ev = checkEvidence(v.evidence, { run, project, entries });
    if (ev.problem === 'evidence-missing' && isMap(v.evidence) && v.evidence.kind === 'capture') add('evidence-invalid-capture');
    else if (ev.problem) add('evidence-missing');
  });
  for (const id of ids) if (!seen.has(id)) problems.push({ index: -1, problem: 'missing-id', id });
  return { ok: problems.length === 0, problems };
}
