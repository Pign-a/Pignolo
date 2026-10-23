import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractJsonBlock, validateFindings } from '../lib/auditor-output.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { makeTempDir, writeTree, makePng } from './helpers.mjs';

const catalog = loadCatalog();
const judgmentIds = ['J-01', 'J-02'];
const png = makePng(4, 4);
const pngSha = crypto.createHash('sha256').update(png).digest('hex');

function setup() {
  const project = makeTempDir();
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  writeTree(project, { 'src/app.css': 'a{}\nb{}\nc{}\n' });
  writeTree(run, {
    'ui-check.json': JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'fp-fail' }, { id: 'A11Y-04', status: 'pass', severity: 'bloquea', scope: 'new', fingerprint: 'fp-pass' }] }),
  });
  fs.mkdirSync(path.join(run, 'captures'), { recursive: true });
  fs.writeFileSync(path.join(run, 'captures', 'a.png'), png);
  return { project, run };
}
const finding = (over = {}) => ({
  id: 'COLOR-03', severity: 'bloquea', scope: 'new', plain: 'texto gris', evidence: { kind: 'ui-check', fingerprint: 'fp-fail' }, why: 'poco contraste', ...over,
});
const validate = (findings, extra = {}) => {
  const { project, run } = setup();
  return validateFindings({ output: { findings, notVerified: [], independent: true, ...extra }, run, project, catalog, judgmentIds });
};
const names = (r) => r.problems.map((p) => p.problem);

test('a valid finding citing a failing fingerprint is ok', () => {
  assert.deepEqual(validate([finding()]), { ok: true, problems: [] });
});

test('each problem is detected', () => {
  assert.ok(names(validate([finding({ id: 'FOO-1' })])).includes('bad-id'));
  assert.ok(names(validate([finding({ severity: 'critical' })])).includes('bad-severity'));
  assert.ok(names(validate([finding({ evidence: undefined })])).includes('no-evidence'));
  assert.ok(names(validate([finding({ evidence: { kind: 'ui-check', fingerprint: 'nope' } })])).includes('evidence-missing'));
  assert.ok(names(validate([finding({ severity: 'alto', evidence: { kind: 'file', path: 'src/app.css', line: 99 } })])).includes('evidence-missing'));
  assert.deepEqual(names(validate([finding({ severity: 'alto', evidence: { kind: 'file', path: 'src/app.css', line: 2 } })])), []);
  assert.ok(names(validate([finding({ severity: 'alto', evidence: { kind: 'capture', path: 'captures/a.png', sha256: 'f'.repeat(64) } })])).includes('evidence-missing'));
  assert.deepEqual(names(validate([finding({ severity: 'alto', evidence: { kind: 'capture', path: 'captures/a.png', sha256: pngSha } })])), []);
  assert.ok(names(validate([finding({ evidence: { kind: 'file', path: 'src/app.css', line: 2 } })])).includes('bloquea-without-script'));
  assert.ok(names(validate([finding({ evidence: { kind: 'ui-check', fingerprint: 'fp-pass' } })])).includes('bloquea-without-script'));
  assert.ok(names(validate([finding({ id: 'J-01', evidence: { kind: 'ui-check', fingerprint: 'fp-fail' } })])).includes('judgment-above-alto'));
  assert.ok(names(validate([finding({ severity: 'alto', score: 4 })])).includes('self-grade'));
  assert.ok(names(validate([], { rating: 5 })).includes('self-grade'));
});

test('a J-nn finding above medio needs failing script or browser evidence', () => {
  const j = (severity, evidence) => finding({ id: 'J-01', severity, evidence });
  const file = { kind: 'file', path: 'src/app.css', line: 2 };
  assert.ok(names(validate([j('alto', file)])).includes('judgment-without-measure'));
  assert.ok(names(validate([j('alto', { kind: 'capture', path: 'captures/a.png', sha256: pngSha })])).includes('judgment-without-measure'));
  assert.ok(names(validate([j('alto', { kind: 'ui-check', fingerprint: 'fp-pass' })])).includes('judgment-without-measure'));
  assert.deepEqual(names(validate([j('alto', { kind: 'ui-check', fingerprint: 'fp-fail' })])), []);
  assert.deepEqual(names(validate([j('medio', file)])), []);
  assert.deepEqual(names(validate([j('detalle', file)])), []);
  // a rule finding (not J-nn) is not affected
  assert.deepEqual(names(validate([finding({ severity: 'alto', evidence: file })])), []);
});

test('a path outside the project or the run is evidence-missing', () => {
  assert.ok(names(validate([finding({ severity: 'alto', evidence: { kind: 'file', path: '../x', line: 1 } })])).includes('evidence-missing'));
  assert.ok(names(validate([finding({ severity: 'alto', evidence: { kind: 'capture', path: '../../x.png', sha256: pngSha } })])).includes('evidence-missing'));
});

test('extractJsonBlock takes the last block and returns null without a valid one', () => {
  const text = 'a\n```json\n{"n":1}\n```\nb\n```json\n{"n":2}\n```\n';
  assert.deepEqual(extractJsonBlock(text), { n: 2 });
  assert.equal(extractJsonBlock('sin bloque'), null);
  assert.equal(extractJsonBlock('```json\n{roto\n```'), null);
});

// ---- cap of 3 judgment findings per screen (R-4e-2) and the `keep` line (R-4e-20) ----
const jFinding = () => finding({ id: 'J-01', severity: 'medio', evidence: { kind: 'file', path: 'src/app.css', line: 1 } });
const caps = (r) => r.problems.filter((p) => p.problem === 'judgment-cap').map((p) => p.index);

test('judgment cap: three J findings are fine, the fourth and fifth are rejected by index', () => {
  assert.deepEqual(validate([jFinding(), jFinding(), jFinding()]), { ok: true, problems: [] });
  assert.deepEqual(caps(validate([jFinding(), jFinding(), jFinding(), jFinding()])), [3]);
  assert.deepEqual(caps(validate([jFinding(), jFinding(), jFinding(), jFinding(), jFinding()])), [3, 4]);
});

test('judgment cap: rule findings do not count, and a failing measure does not exempt the fourth', () => {
  const rules = [1, 2, 3, 4].map(() => finding({ severity: 'alto' }));
  assert.deepEqual(caps(validate([...rules, jFinding(), jFinding(), jFinding()])), []);
  const withMeasure = finding({ id: 'J-02', severity: 'alto', evidence: { kind: 'ui-check', fingerprint: 'fp-fail' } });
  assert.deepEqual(caps(validate([jFinding(), jFinding(), jFinding(), withMeasure])), [3]);
});

test('keep: optional, one line of at most 160 characters', () => {
  assert.deepEqual(validate([finding()], { keep: 'x'.repeat(40) }), { ok: true, problems: [] });
  assert.deepEqual(validate([finding()]), { ok: true, problems: [] });
  assert.deepEqual(validate([finding()], { keep: 'x'.repeat(160) }), { ok: true, problems: [] });
  for (const bad of [42, 'x'.repeat(161), 'uno\ndos', '', '   ']) {
    assert.deepEqual(validate([finding()], { keep: bad }).problems, [{ index: -1, problem: 'bad-keep' }], JSON.stringify(bad).slice(0, 20));
  }
});

test('keep does not count toward the judgment cap', () => {
  assert.deepEqual(validate([jFinding(), jFinding(), jFinding()], { keep: 'la tabla de datos se lee bien' }), { ok: true, problems: [] });
});

// ---- verdict mode (hito 4f) ----
import { validateVerdicts, VERDICT_STATUSES } from '../lib/auditor-output.mjs';

const verdict = (id, over = {}) => ({ id, status: 'resolved', why: 'ahora está agrupado', evidence: { kind: 'file', path: 'src/app.css', line: 2 }, ...over });
const request = { v: 1, ids: ['J-05', 'J-07'], findings: [] };
const check = (output, req = request) => {
  const { project, run } = setup();
  return validateVerdicts({ output, request: req, run, project });
};

test('validateVerdicts: the two requested ids with valid states and existing evidence are ok', () => {
  assert.deepEqual(VERDICT_STATUSES, ['resolved', 'partial', 'unresolved']);
  const out = { verdicts: [verdict('J-05'), verdict('J-07', { status: 'partial' })], independent: true };
  assert.deepEqual(check(out), { ok: true, problems: [] });
});

test('validateVerdicts: each problem is detected', () => {
  const both = [verdict('J-05'), verdict('J-07')];
  assert.ok(names(check({ verdicts: [...both, verdict('J-09')] })).includes('unknown-id'));
  assert.ok(names(check({ verdicts: [verdict('J-05')] })).includes('missing-id'));
  assert.ok(names(check({ verdicts: [...both, verdict('J-05')] })).includes('duplicate-id'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { status: 'ok' }), verdict('J-07')] })).includes('bad-status'));
  assert.ok(names(check({ verdicts: both, findings: [] })).includes('new-finding'));
  assert.ok(names(check({ verdicts: both, notes: 'x' })).includes('new-finding'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { severity: 'alto' }), verdict('J-07')] })).includes('new-finding'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { evidence: { kind: 'file', path: 'src/none.css', line: 1 } }), verdict('J-07')] })).includes('evidence-missing'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { evidence: { kind: 'capture', path: 'captures/a.png', sha256: '0'.repeat(64) } }), verdict('J-07')] })).includes('evidence-invalid-capture'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { evidence: undefined }), verdict('J-07')] })).includes('evidence-missing'));
  assert.ok(names(check({ verdicts: both, score: 4 })).includes('self-grade'));
  assert.ok(names(check({ verdicts: [verdict('J-05', { rating: 3 }), verdict('J-07')] })).includes('self-grade'));
  assert.ok(names(check({ findings: [] })).includes('bad-shape'));
});

test('validateVerdicts: a capture with the right sha256 is valid evidence', () => {
  const out = { verdicts: [verdict('J-05', { evidence: { kind: 'capture', path: 'captures/a.png', sha256: pngSha } }), verdict('J-07')] };
  assert.deepEqual(check(out), { ok: true, problems: [] });
});
