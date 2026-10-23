// Claim <-> evidence cross-check of the final report (spec §12, PROC-02). Deterministic: a claim
// stays only if the evidence it cites exists and says the same thing.
//
// checkReport({ project, run, report }) -> { kept, retired, exitCode }
//   report  parsed <run>/report.json (see reportSkeleton in report-build.mjs)
//   kept    [claim id]    retired [{ id, reason }]
//   exitCode 0 nothing retired; 1 otherwise.
// The audit implements nothing, so there is no approved design to cite: an `implemented` or
// `implements` key left in report.json by the old flow is ignored. A claim that
// cites a file or a capture states no rule: with rule, status or measure it is retired.
// ui-check.json is stale (every claim citing it is retired) when a file in its `inputs` no
// longer has the sha256 it had when ui-check ran. An entry whose measure says
// `applicable: false` (a rule that did not apply) supports no claim. `measure` in a claim is a
// non-empty object; each of its keys must equal (deep, exact) the value the entry stored.
// A malformed report (not an object, claims not a list) throws
// ReportError, which the CLI turns into exit 2.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export class ReportError extends Error {}

const SOURCES = { 'ui-check': 'ui-check.json', browser: 'browser.json' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEX64 = /^[0-9a-f]{64}$/;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Path of `rel` inside `root`, or null when it leaves it.
function inside(root, rel) {
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? abs : null;
}

const fileSha = (abs) => { try { return sha256(fs.readFileSync(abs)); } catch { return null; } };

function loadSources(project, run, report) {
  const out = {};
  for (const [source, name] of Object.entries(SOURCES)) {
    const file = path.join(run, name);
    if (!fs.existsSync(file)) { out[source] = { error: `${name} not in the run` }; continue; }
    const buf = fs.readFileSync(file);
    const cited = isMap(report.evidence) ? report.evidence[name] : undefined;
    if (typeof cited !== 'string') { out[source] = { error: `${name} is not cited by sha256 in evidence` }; continue; }
    if (cited !== sha256(buf)) { out[source] = { error: `${name} changed since the report was written` }; continue; }
    let json;
    try { json = JSON.parse(buf.toString('utf8')); } catch { out[source] = { error: `${name} is not valid JSON` }; continue; }
    const stale = (Array.isArray(json.inputs) ? json.inputs : [])
      .find((i) => isMap(i) && typeof i.file === 'string' && fileSha(path.join(project, ...i.file.split('/'))) !== i.sha256);
    if (stale) { out[source] = { error: `${name} is stale: ${stale.file} changed after it ran` }; continue; }
    out[source] = { entries: Array.isArray(json.entries) ? json.entries : [] };
  }
  return out;
}

function checkClaim(claim, { project, run, sources }) {
  const ref = claim.ref;
  if (!isMap(ref)) return 'no evidence reference';
  if (ref.source in SOURCES) {
    const src = sources[ref.source];
    if (src.error) return src.error;
    if (typeof claim.rule !== 'string' || !['pass', 'fail', 'unverified'].includes(claim.status)) return 'claim without rule and status';
    const found = src.entries.filter((e) => e.fingerprint === ref.fingerprint && (ref.line === undefined || e.line === ref.line));
    if (!found.length) return `no ${SOURCES[ref.source]} entry with that fingerprint`;
    const same = found.filter((e) => e.id === claim.rule && e.status === claim.status);
    if (!same.length) return `evidence says ${found[0].id} ${found[0].status}`;
    if (same.every((e) => isMap(e.measure) && e.measure.applicable === false)) return `evidence says ${claim.rule} does not apply (${same[0].reason ?? 'not applicable'})`;
    if (claim.measure !== undefined) {
      if (!isMap(claim.measure) || Object.keys(claim.measure).length === 0) return 'measure must be a non-empty object';
      const ok = same.some((e) => isMap(e.measure) && Object.entries(claim.measure).every(([k, v]) => isDeepStrictEqual(e.measure[k], v)));
      if (!ok) return 'evidence has another measure';
    }
    return null;
  }
  if (ref.source === 'capture' || ref.source === 'file') {
    if (claim.rule !== undefined || claim.status !== undefined || claim.measure !== undefined) return 'rule claims need ui-check or browser evidence';
    const root = ref.source === 'capture' ? run : project;
    const abs = inside(root, ref.path);
    if (!abs) return `${ref.source} path outside the ${ref.source === 'capture' ? 'run' : 'project'}`;
    if (typeof ref.sha256 !== 'string' || !HEX64.test(ref.sha256)) return `${ref.source} without sha256`;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return `${ref.source} does not exist`;
    const buf = fs.readFileSync(abs);
    if (sha256(buf) !== ref.sha256) return `${ref.source} sha256 does not match`;
    if (ref.source === 'capture' && !buf.subarray(0, 8).equals(PNG)) return 'capture is not a PNG';
    return null;
  }
  return `unknown evidence source ${JSON.stringify(ref.source)}`;
}

export function checkReport({ project, run, report }) {
  if (!isMap(report)) throw new ReportError('report.json no es un objeto JSON');
  if (!Array.isArray(report.claims)) throw new ReportError('report.json no tiene la lista claims');
  const sources = loadSources(project, run, report);
  const kept = [];
  const retired = [];
  const seen = new Set();
  report.claims.forEach((claim, i) => {
    const id = isMap(claim) && typeof claim.id === 'string' && claim.id ? claim.id : `#${i + 1}`;
    let reason = null;
    if (!isMap(claim) || typeof claim.text !== 'string' || claim.text.trim() === '') reason = 'invalid claim';
    else if (seen.has(id)) reason = 'duplicate claim id';
    else reason = checkClaim(claim, { project, run, sources });
    seen.add(id);
    if (reason) retired.push({ id, reason });
    else kept.push(id);
  });
  return { kept, retired, exitCode: retired.length === 0 ? 0 : 1 };
}
