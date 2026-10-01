// Output of ui-auditor (spec §10, R-9): the agent has no Bash, so its answer carries a ```json
// block { findings, notVerified, independent } that the main thread copies to <run>/auditor.json
// and this module validates against the run, without a model.
//
// extractJsonBlock(text) -> object | null          (the LAST ```json block)
// validateFindings({ output, run, project, catalog, judgmentIds }) -> { ok, problems: [{ index, problem }] }
//
// `evidence.kind` is the auditor's vocabulary (ui-check | browser | file | capture); report.json
// uses `ref.source`. Only ui-check/browser findings become report claims (report-skeleton).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SEVERITIES = ['bloquea', 'alto', 'medio', 'detalle'];
const SCOPES = ['new', 'debt'];
const SELF_GRADE = ['score', 'grade', 'rating'];
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

function readEntries(run, name) {
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
function checkEvidence(ev, { run, project, entries }) {
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
  const known = new Set([...catalog.rules.map((r) => r.id), ...judgmentIds]);
  const entries = [...readEntries(run, 'ui-check.json'), ...readEntries(run, 'browser.json')];
  output.findings.forEach((f, index) => {
    const add = (problem) => problems.push({ index, problem });
    if (!isMap(f)) { add('bad-shape'); return; }
    if (SELF_GRADE.some((k) => k in f)) add('self-grade');
    if (typeof f.id !== 'string' || !known.has(f.id)) add('bad-id');
    if (!SEVERITIES.includes(f.severity)) add('bad-severity');
    if (!SCOPES.includes(f.scope)) add('bad-scope');
    const ev = checkEvidence(f.evidence, { run, project, entries });
    if (ev.problem) add(ev.problem);
    if (f.severity === 'bloquea') {
      if (!ev.ok || !ev.script || !ev.failing) add('bloquea-without-script');
      if (/^J-\d+$/.test(String(f.id))) add('judgment-above-alto');
    }
  });
  return { ok: problems.length === 0, problems };
}
