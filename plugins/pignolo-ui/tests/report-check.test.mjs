// Claim <-> evidence cross-check (lib/report-check.mjs, spec §12), in process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeTempDir, writeTree } from './helpers.mjs';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import { registeredManifestSha } from '../lib/approved.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const MANIFEST = 'a'.repeat(64);
const UI = JSON.stringify({ catalogVersion: '0.3.0', entries: [
  { id: 'A11Y-04', status: 'pass', severity: 'bloquea', scope: 'new', file: 'src/Save.tsx', line: 3, fingerprint: 'A11Y-04|src/Save.tsx|button' },
  { id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'COLOR-03||on-surface/surface/light', measure: { ratio: 3.45, required: 4.5 } },
] });

function setup() {
  const project = writeTree(makeTempDir(), {
    'DESIGN.md': `---\nversion: alpha\nname: X\n---\n\n## Decisions\n\n- 2026-09-29 — approved \`design/approved/checkout/\` (manifest sha256 \`${MANIFEST}\`): "B"\n`,
    'src/Save.tsx': 'export const S = () => <button>Guardar</button>;\n',
    '.pignolo-ui/runs/r1/ui-check.json': UI,
  });
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  fs.mkdirSync(path.join(run, 'captures'));
  fs.writeFileSync(path.join(run, 'captures', 'home.png'), PNG);
  return { project, run };
}
const uiRef = (fingerprint, extra = {}) => ({ source: 'ui-check', fingerprint, ...extra });
const report = (claims, extra = {}) => ({ version: 1, implemented: false, evidence: { 'ui-check.json': sha(UI) }, claims, ...extra });

test('claims stay only when the cited evidence exists and says the same', async (t) => {
  const { project, run } = setup();
  const fileSha = sha(fs.readFileSync(path.join(project, 'src/Save.tsx')));
  const CASES = [
    ['ui-check pass', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') }, null],
    ['ui-check with line', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button', { line: 3 }) }, null],
    ['same measure', { rule: 'COLOR-03', status: 'fail', measure: { ratio: 3.45 }, ref: uiRef('COLOR-03||on-surface/surface/light') }, null],
    ['capture', { ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }, null],
    ['edited file', { ref: { source: 'file', path: 'src/Save.tsx', sha256: fileSha } }, null],
    ['no reference', {}, /no evidence reference/],
    ['contradicting status', { rule: 'COLOR-03', status: 'pass', ref: uiRef('COLOR-03||on-surface/surface/light') }, /evidence says COLOR-03 fail/],
    ['other rule', { rule: 'A11Y-16', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') }, /evidence says A11Y-04 pass/],
    ['other measure', { rule: 'COLOR-03', status: 'fail', measure: { ratio: 4.5 }, ref: uiRef('COLOR-03||on-surface/surface/light') }, /another measure/],
    ['wrong line', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button', { line: 9 }) }, /no ui-check\.json entry/],
    ['unknown fingerprint', { rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|x|y') }, /no ui-check\.json entry/],
    ['browser.json absent', { rule: 'COLOR-03', status: 'pass', ref: { source: 'browser', fingerprint: 'x' } }, /browser\.json not in the run/],
    ['capture outside the run', { ref: { source: 'capture', path: '../../../DESIGN.md', sha256: sha(PNG) } }, /outside the run/],
    ['capture with another hash', { ref: { source: 'capture', path: 'captures/home.png', sha256: 'b'.repeat(64) } }, /sha256 does not match/],
    ['file without hash', { ref: { source: 'file', path: 'src/Save.tsx' } }, /without sha256/],
    ['unknown source', { ref: { source: 'memory' } }, /unknown evidence source/],
    ['rule claim on a file', { rule: 'COLOR-03', status: 'pass', measure: { ratio: 7.1 }, ref: { source: 'file', path: 'src/Save.tsx', sha256: fileSha } }, /rule claims need ui-check or browser evidence/],
    ['status claim on a capture', { status: 'pass', ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }, /rule claims need ui-check or browser evidence/],
    ['measure claim on a file', { measure: { ratio: 7.1 }, ref: { source: 'file', path: 'src/Save.tsx', sha256: fileSha } }, /rule claims need ui-check or browser evidence/],
  ];
  for (const [name, claim, retired] of CASES) {
    await t.test(name, () => {
      const r = checkReport({ project, run, report: report([{ id: 'c1', text: 'afirmación', ...claim }]) });
      if (retired) {
        assert.equal(r.exitCode, 1);
        assert.match(r.retired[0].reason, retired);
      } else {
        assert.deepEqual([r.exitCode, r.kept, r.retired], [0, ['c1'], []]);
      }
    });
  }
});

test('ui-check.json must be cited by its current sha256', () => {
  const { project, run } = setup();
  const claim = { id: 'c1', text: 'x', rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') };
  assert.match(checkReport({ project, run, report: report([claim], { evidence: {} }) }).retired[0].reason, /not cited by sha256/);
  fs.appendFileSync(path.join(run, 'ui-check.json'), '\n');
  assert.match(checkReport({ project, run, report: report([claim]) }).retired[0].reason, /changed since the report was written/);
});

test('§16.1: an implementation must cite the approved with the sha256 DESIGN.md registers', () => {
  const { project, run } = setup();
  const imp = (manifestSha256) => report([], { implemented: true, implements: { path: 'design/approved/checkout', manifestSha256 } });
  assert.deepEqual([checkReport({ project, run, report: imp(MANIFEST) }).exitCode, checkReport({ project, run, report: imp(MANIFEST) }).implements.status], [0, 'ok']);
  const other = checkReport({ project, run, report: imp('b'.repeat(64)) });
  assert.deepEqual([other.exitCode, other.implements.status], [1, 'mismatch']);
  const missing = checkReport({ project, run, report: report([], { implemented: true }) });
  assert.deepEqual([missing.exitCode, missing.implements.status], [1, 'missing']);
  assert.equal(checkReport({ project, run, report: report([]) }).implements.status, 'not-required');
});

test('§16.1: one claim without evidence and one contradicted: both retired, exit 1', () => {
  const { project, run } = setup();
  const r = checkReport({ project, run, report: report([
    { id: 'c1', text: 'Todo en orden' },
    { id: 'c2', text: 'El contraste pasa', rule: 'COLOR-03', status: 'pass', ref: uiRef('COLOR-03||on-surface/surface/light') },
    { id: 'c3', text: 'Guardar tiene nombre', rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') },
  ]) });
  assert.deepEqual([r.exitCode, r.kept, r.retired.map((x) => x.id)], [1, ['c3'], ['c1', 'c2']]);
});

test('malformed reports throw ReportError; bad claims are retired, not fatal', () => {
  const { project, run } = setup();
  assert.throws(() => checkReport({ project, run, report: [] }), ReportError);
  assert.throws(() => checkReport({ project, run, report: { implemented: false } }), ReportError);
  assert.throws(() => checkReport({ project, run, report: { claims: [] } }), ReportError);
  const r = checkReport({ project, run, report: report([null, { id: 'c1', text: '' }, { id: 'c2', text: 'x', ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }, { id: 'c2', text: 'y', ref: { source: 'capture', path: 'captures/home.png', sha256: sha(PNG) } }]) });
  assert.deepEqual(r.retired, [{ id: '#1', reason: 'invalid claim' }, { id: 'c1', reason: 'invalid claim' }, { id: 'c2', reason: 'duplicate claim id' }]);
});

test('registeredManifestSha reads the last entry of a path and nothing else', () => {
  const text = [`- approved \`design/approved/a/\` (manifest sha256 \`${'1'.repeat(64)}\`)`, `- approved \`design/approved/ab/\` (manifest sha256 \`${'2'.repeat(64)}\`)`, `- approved \`design/approved/a/\` (manifest sha256 \`${'3'.repeat(64)}\`)`].join('\n');
  assert.equal(registeredManifestSha(text, 'design/approved/a'), '3'.repeat(64));
  assert.equal(registeredManifestSha(text, 'design/approved/ab'), '2'.repeat(64));
  assert.equal(registeredManifestSha(text, 'design/approved/b'), null);
});

// Rewrites ui-check.json and returns a report that cites it by its sha256.
const withUi = (run, ui, claims, extra = {}) => {
  const text = JSON.stringify(ui);
  fs.writeFileSync(path.join(run, 'ui-check.json'), text);
  return { version: 1, implemented: false, evidence: { 'ui-check.json': sha(text) }, claims, ...extra };
};

test('ui-check.json is stale when one of its inputs changed after it ran', () => {
  const { project, run } = setup();
  const file = path.join(project, 'src/Save.tsx');
  const ui = { ...JSON.parse(UI), inputs: [{ file: 'src/Save.tsx', sha256: sha(fs.readFileSync(file)) }, { url: 'http://127.0.0.1:1/', sha256: 'c'.repeat(64) }] };
  const claim = { id: 'c1', text: 'x', rule: 'A11Y-04', status: 'pass', ref: uiRef('A11Y-04|src/Save.tsx|button') };
  assert.deepEqual(checkReport({ project, run, report: withUi(run, ui, [claim]) }).kept, ['c1']);
  fs.appendFileSync(file, '// edited after ui-check\n');
  assert.deepEqual(checkReport({ project, run, report: withUi(run, ui, [claim]) }).retired, [{ id: 'c1', reason: 'ui-check.json is stale: src/Save.tsx changed after it ran' }]);
});

test('a pass that says the rule does not apply supports no claim; measure {} is refused', () => {
  const { project, run } = setup();
  const gate = { id: 'SEO-01', status: 'pass', severity: 'medio', scope: 'new', reason: 'web.public is not true: static SEO does not apply', fingerprint: 'SEO-01||not public', measure: { applicable: false } };
  const ui = { ...JSON.parse(UI), entries: [...JSON.parse(UI).entries, gate] };
  const r = checkReport({ project, run, report: withUi(run, ui, [
    { id: 'c1', text: 'robots.txt está bien', rule: 'SEO-01', status: 'pass', ref: uiRef('SEO-01||not public') },
    { id: 'c2', text: 'x', rule: 'COLOR-03', status: 'fail', measure: {}, ref: uiRef('COLOR-03||on-surface/surface/light') },
  ]) });
  assert.deepEqual(r.retired, [
    { id: 'c1', reason: 'evidence says SEO-01 does not apply (web.public is not true: static SEO does not apply)' },
    { id: 'c2', reason: 'measure must be a non-empty object' },
  ]);
});

test('a run with a saved batch implemented something: implemented false gives missing', () => {
  const { project, run } = setup();
  assert.equal(checkReport({ project, run, report: report([]) }).implements.status, 'not-required'); // no batch
  writeTree(run, { 'batch-1/files.json': JSON.stringify({ version: 1, files: [], initial: [], after: null }) });
  assert.equal(checkReport({ project, run, report: report([]) }).implements.status, 'missing'); // saved, never verified: still applied
  writeTree(run, { 'batch-2/files.json': JSON.stringify({ version: 1, files: [], initial: [], after: { files: {}, unexpected: [] } }) });
  const r = checkReport({ project, run, report: report([]) });
  assert.deepEqual([r.exitCode, r.implements.status], [1, 'missing']);
  assert.match(r.implements.reason, /has a batch \(files\.json\)/);
  const cited = checkReport({ project, run, report: report([], { implements: { path: 'design/approved/checkout', manifestSha256: MANIFEST } }) });
  assert.deepEqual([cited.exitCode, cited.implements.status], [0, 'ok']);
});
