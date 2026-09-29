// report-check CLI (scripts/report-check.mjs) in a subprocess: 0/1/2 and report-check.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const RUN = '.pignolo-ui/runs/r1';

test('exit 0 with nothing retired, 1 with a retired claim; report-check.json is written', () => {
  const project = writeTree(makeTempDir(), { [`${RUN}/report.json`]: JSON.stringify({ implemented: false, claims: [] }) });
  const ok = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual([ok.json.kept, ok.json.retired, ok.json.implements], [0, [], 'not-required']);
  const written = JSON.parse(fs.readFileSync(path.join(project, RUN, 'report-check.json'), 'utf8'));
  assert.match(written.reportSha256, /^[0-9a-f]{64}$/);
  writeTree(project, { [`${RUN}/report.json`]: JSON.stringify({ implemented: false, claims: [{ id: 'c1', text: 'Todo en orden' }] }) });
  const bad = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(bad.status, 1);
  assert.deepEqual(bad.json.retired, [{ id: 'c1', reason: 'no evidence reference' }]);
});

test('errors exit 2 (not verified) with a Spanish message and no stack', async (t) => {
  const project = writeTree(makeTempDir(), { [`${RUN}/x`]: '' });
  const CASES = [
    ['no --run', ['--project', project], /falta --run/],
    ['run outside .pignolo-ui', ['--project', project, '--run', project], /--run debe estar dentro de \.pignolo-ui/],
    ['no report.json', ['--project', project, '--run', path.join(project, RUN)], /no existe/],
    ['unknown option', ['--project', project, '--run', path.join(project, RUN), '--all'], /opción desconocida --all/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('report-check.mjs', args);
      assert.equal(r.status, 2);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno|\n\s+at /);
    });
  }
  writeTree(project, { [`${RUN}/report.json`]: '{' });
  const r = runScript('report-check.mjs', ['--project', project, '--run', path.join(project, RUN)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no es JSON válido/);
});
