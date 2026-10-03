// Finding of the final review of stage 2 of the canvas (hito 4c), as a test that FAILS on the reviewed code
// (4de0366) and passes with the right behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runScript, makeTempDir } from './helpers.mjs';
import { makeRun } from './support/canvas-run.mjs';

// RL2-08 (importante). `compare.mjs heights` checks --out only by its text (path.relative) and with lstat on the file:
// a folder of the run that is a junction takes the write outside the run (Global Constraints: writes only inside
// <run>/, never through a link; canvas-comments.mjs does check the real path). The usage check comes before the
// browser, so this does not need one: today it is exit 0 (with a browser the file is written outside).
test('RL2-08: heights refuses an --out that goes through a junction of the run to somewhere else (exit 2, nothing written outside)', (t) => {
  const r = makeRun({ options: ['A'], screens: ['inicio.html'] });
  const outside = makeTempDir();
  try {
    fs.symlinkSync(outside, path.join(r.run, 'sub'), 'junction');
  } catch (e) {
    t.skip(`no se pudo crear el enlace: ${e.code}`);
    return;
  }
  const res = runScript('compare.mjs', ['heights', '--run', r.run, '--kind', 'mockup', '--screens', 'inicio.html', '--options', 'A', '--platform', 'desktop', '--out', path.join(r.run, 'sub', 'heights.json')], { timeout: 120000 });
  assert.deepEqual(fs.readdirSync(outside), [], 'a file was written outside the run');
  assert.equal(res.status, 2, res.stdout.slice(0, 300));
});
