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
