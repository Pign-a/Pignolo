// Re-review of the RL2 fixes. Goes in plugins/pignolo-ui/tests/ (imports are relative to that folder: change the base below).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRun, addRun, screenHtml, BUILD_ARGS, canvasIndex } from './support/canvas-run.mjs';
import { planKit, fakeUrl } from './support/canvas-plan.mjs';

const canvasFile = (r, ...p) => path.join(r.run, 'canvas', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const stepId = (res) => (res.json && res.json.step ? res.json.step.id : null);

// RR-01: a publication that never reached record leaves no hash base (planned.json keeps only paths): an artboard of ours that the user
// edited in the live canvas after that publication is replaced by merge without editedByHand and without a stop.
test('RR-01: after an unrecorded publication, a hand edit of our artboard in the live canvas is not overwritten silently', () => {
  const r = makeRun();
  assert.equal(canvasIndex(BUILD_ARGS(r)).status, 0);
  const kit = planKit(r);
  const url = fakeUrl(64);
  assert.equal(stepId(kit.plan()), 'canvas-create');
  assert.equal(kit.record('canvas-create', url).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  assert.equal(kit.merge().status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-publish');
  // published, session cut before record. The user then edits one of our artboards in the canvas.
  const live = path.join(kit.dir, 'live.json');
  fs.writeFileSync(live, JSON.stringify(readJson(canvasFile(r, 'project', 'canvas.json')), null, 2));
  const liveDir = path.join(kit.dir, 'live-files');
  fs.cpSync(canvasFile(r, 'project'), path.join(liveDir, 'project'), { recursive: true });
  const edited = fs.readdirSync(path.join(liveDir, 'project')).find((f) => f.endsWith('.dc.html'));
  fs.appendFileSync(path.join(liveDir, 'project', edited), '\n<!-- edited by the user in the canvas -->\n');
  for (const f of ['inicio.html', 'detalle.html']) fs.writeFileSync(path.join(r.optionDir('B'), f), screenHtml('B v2', { link: f === 'inicio.html' ? 'detalle.html' : 'inicio.html' }));
  assert.equal(canvasIndex(BUILD_ARGS(r, { first: 'yes' })).status, 0);
  assert.equal(stepId(kit.plan()), 'canvas-read-live');
  const m = kit.merge(['--live', live, '--live-dir', liveDir]);
  const ok = m.status !== 0 || (m.json.editedByHand ?? []).length > 0 || (m.json.problems ?? []).some((p) => p.code === 'artboard-edited-by-hand');
  assert.ok(ok, 'merge exit 0 and no editedByHand: the edit of the user is replaced');
});
