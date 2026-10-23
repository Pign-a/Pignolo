import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { firstLine, reportSkeleton, verdict } from '../lib/report-build.mjs';
import { checkReport } from '../lib/report-check.mjs';
import { makeTempDir, writeTree } from './helpers.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const entry = (over) => ({ id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', fingerprint: 'fp-1', measure: { ratio: 2.1 }, ...over });

function makeRun(files = {}) {
  const project = makeTempDir();
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  writeTree(project, files);
  return { project, run };
}

test('firstLine: normal, degraded, sequential and non-independent audit', () => {
  const base = { pluginVersion: '0.5.0', degraded: [], subagents: { requested: 3, launched: 3, model: 'sonnet' }, sequential: false, notIndependentAudit: false };
  assert.equal(firstLine(base), 'pignolo ui-audit 0.5.0 · sin degradaciones · subagentes: 3 de 3 (modelo pedido: sonnet)');
  assert.match(firstLine({ ...base, degraded: ['sin navegador', 'lienzo no disponible'] }), /· sin navegador; lienzo no disponible ·/);
  assert.match(firstLine({ ...base, notIndependentAudit: true }), /auditoría no independiente/);
  const seq = firstLine({ ...base, sequential: true, subagents: { requested: 3, launched: 0, model: 'sonnet' } }).split('\n');
  assert.equal(seq[0], 'opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron 0 de 3 subagentes');
  assert.ok(seq[1].startsWith('pignolo ui-audit'));
});

test('firstLine: there is no canvas in the audit, so a canvas fact in the facts does not change the line', () => {
  const base = { pluginVersion: '1.0.0', degraded: [], subagents: { requested: 1, launched: 1, model: 'opus' } };
  assert.equal(firstLine({ ...base, canvas: 'published' }), firstLine(base));
  assert.ok(!firstLine(base).includes('lienzo'));
});

test('reportSkeleton builds candidates and evidence from the run', () => {
  const uiCheck = JSON.stringify({ entries: [entry({ id: 'A11Y-04', fingerprint: 'fp-u' }), entry({ status: 'pass', fingerprint: 'fp-p' })] });
  const browser = JSON.stringify({ entries: [entry()] });
  const { project, run } = makeRun({ '.pignolo-ui/runs/r1/ui-check.json': uiCheck, '.pignolo-ui/runs/r1/browser.json': browser });
  const sk = reportSkeleton({ project, run });
  assert.equal(sk.candidates.length, 2);
  assert.deepEqual(sk.evidence, { 'ui-check.json': sha(uiCheck), 'browser.json': sha(browser) });
  assert.deepEqual(sk.candidates.map((c) => c.ref.source).sort(), ['browser', 'ui-check']);
  assert.equal('implemented' in sk, false);
  assert.equal('implements' in sk, false);
  // without browser.json only ui-check is cited
  const { project: p2, run: r2 } = makeRun({ '.pignolo-ui/runs/r1/ui-check.json': uiCheck });
  assert.deepEqual(Object.keys(reportSkeleton({ project: p2, run: r2 }).evidence), ['ui-check.json']);
});

test('reportSkeleton with run = <run>/after reads after/, not the parent', () => {
  const { project, run } = makeRun({
    '.pignolo-ui/runs/r1/ui-check.json': JSON.stringify({ entries: [entry({ fingerprint: 'antes' })] }),
    '.pignolo-ui/runs/r1/after/ui-check.json': JSON.stringify({ entries: [entry({ fingerprint: 'despues' })] }),
  });
  const sk = reportSkeleton({ project, run: path.join(run, 'after') });
  assert.equal(sk.candidates.length, 1);
  assert.equal(sk.candidates[0].ref.fingerprint, 'despues');
  assert.equal(sk.evidence['ui-check.json'], sha(fs.readFileSync(path.join(run, 'after', 'ui-check.json'))));
});

test('reportSkeleton has no approved design to cite: the audit implements nothing', () => {
  const { project, run } = makeRun({ '.pignolo-ui/runs/r1/ui-check.json': JSON.stringify({ entries: [] }) });
  const sk = reportSkeleton({ project, run, implementsPath: 'design/approved/flujo' });
  assert.deepEqual(Object.keys(sk).sort(), ['candidates', 'claims', 'evidence', 'version']);
});

test('round trip: a claim built from a candidate survives report-check; a changed measure is retired', () => {
  const { project, run } = makeRun({
    '.pignolo-ui/runs/r1/browser.json': JSON.stringify({ entries: [entry()] }),
    '.pignolo-ui/runs/r1/ui-check.json': JSON.stringify({ inputs: [], entries: [entry({ id: 'A11Y-04', fingerprint: 'fp-u', measure: undefined })] }),
  });
  const sk = reportSkeleton({ project, run });
  const claims = sk.candidates.map((c) => ({ ...c, text: `hallazgo ${c.rule}` }));
  const report = { evidence: sk.evidence, claims };
  assert.equal(checkReport({ project, run, report }).exitCode, 0);
  const tampered = { ...report, claims: claims.map((c) => (c.measure ? { ...c, measure: { ratio: 9 } } : c)) };
  const res = checkReport({ project, run, report: tampered });
  assert.equal(res.exitCode, 1);
  assert.equal(res.retired.length, 1);
});

test('verdict follows the rules of §12 with the right precedence', () => {
  const ok = { uiCheck: { exitCode: 0, blockingNew: 0 }, reportCheck: { exitCode: 0, retired: [] }, build: { ran: true, ok: true } };
  assert.deepEqual(verdict(ok), { status: 'terminado', reasons: [] });
  const blocking = verdict({ ...ok, uiCheck: { exitCode: 1, blockingNew: 1 } });
  assert.equal(blocking.status, 'BLOCKED');
  assert.ok(blocking.reasons.includes('bloquea nuevo en alcance (1)'));
  assert.equal(verdict({ ...ok, reportCheck: { exitCode: 1, retired: [{ id: 'c1' }] } }).status, 'BLOCKED');
  const broken = verdict({ ...ok, build: { ran: true, ok: false, script: 'build' } });
  assert.equal(broken.status, 'BLOCKED');
  assert.ok(broken.reasons.some((r) => r.startsWith('build roto')));
  assert.equal(verdict({ ...ok, uiCheck: null }).status, 'sin verificar');
  assert.equal(verdict({ ...ok, reportCheck: { exitCode: 2 } }).status, 'sin verificar');
  const noBuild = verdict({ ...ok, build: { ran: false } });
  assert.equal(noBuild.status, 'terminado');
  assert.ok(noBuild.reasons.includes('no verificado: el proyecto no declara build'));
  const precedence = verdict({ ...ok, uiCheck: { exitCode: 2, blockingNew: 0 }, reportCheck: { exitCode: 1, retired: [] } });
  assert.equal(precedence.status, 'sin verificar');
});
