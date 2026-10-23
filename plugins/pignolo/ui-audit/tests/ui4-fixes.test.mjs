// Fix pass of the final review of hito 4 that the audit keeps: check --before as debt (I-3) and the minors m-4, m-8 and m-10.
// The ones about verdict, discard, menu and the patch of DESIGN.md went with those subcommands.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';
import { reportSkeleton } from '../lib/report-build.mjs';

const RUN = '.pignolo-ui/runs/r1';
const run = (args) => runScript('audit.mjs', args);
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body><main>${body}</main></body></html>`;

function repo(tree) {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeTree(dir, { 'README.md': 'x\n', ...tree });
  return dir;
}
const after = (p) => path.join(p, RUN, 'after');

// I-3: improve. A defect the "before" page already had is debt in after/, not new.
function domRun(body, dir) {
  return { [`${dir}/dom-1440.html`]: page(body), [`${dir}/dom.json`]: JSON.stringify({ doms: [{ path: 'dom-1440.html', width: 1440 }] }) };
}
test('I-3: check --before turns pre-existing DOM failures into debt and keeps the extra ones new', () => {
  const OLD = '<h1>Hola</h1><img src="a.png">';
  const project = repo({ ...domRun(OLD, RUN), ...domRun(OLD, `${RUN}/after`) });
  const b = run(['check', '--project', project, '--run', path.join(project, RUN)]);
  assert.equal(b.status, 1, 'the before page has a blocking defect');
  const before = path.join(project, RUN, 'ui-check.json');

  const without = run(['check', '--project', project, '--run', after(project)]);
  assert.equal(without.status, 1, 'without --before the same defect counts as new');

  const same = run(['check', '--project', project, '--run', after(project), '--before', before]);
  assert.equal(same.status, 0, same.stderr);
  const entries = JSON.parse(fs.readFileSync(path.join(after(project), 'ui-check.json'), 'utf8')).entries.filter((e) => e.status === 'fail');
  assert.ok(entries.length > 0 && entries.every((e) => e.scope === 'debt'), JSON.stringify(entries));

  writeTree(project, domRun(`${OLD}<img src="b.png">`, `${RUN}/after`));
  const more = run(['check', '--project', project, '--run', after(project), '--before', before]);
  assert.equal(more.status, 1, 'a second image without alt is a new defect');
  assert.equal(more.json.counts.blockingNew, 1);
});

test('I-3: --before must be a readable ui-check.json', () => {
  const project = repo({ ...domRun('<h1>Hola</h1>', `${RUN}/after`) });
  const r = run(['check', '--project', project, '--run', after(project), '--before', path.join(project, 'nada.json')]);
  assert.equal(r.status, 2);
});

test('m-4: reportSkeleton does not double a failure that ui-check.json repeats from browser.json', () => {
  const entry = { id: 'COLOR-03', status: 'fail', severity: 'alto', scope: 'new', fingerprint: 'fp-dup', measure: { ratio: 2.1 } };
  const project = repo({
    [`${RUN}/browser.json`]: JSON.stringify({ entries: [entry] }),
    [`${RUN}/ui-check.json`]: JSON.stringify({ entries: [entry, { ...entry, fingerprint: 'fp-other' }] }),
  });
  const sk = reportSkeleton({ project, run: path.join(project, RUN) });
  assert.deepEqual(sk.candidates.map((c) => `${c.ref.source}:${c.ref.fingerprint}`), ['browser:fp-dup', 'ui-check:fp-other']);
});

test('m-8: init prints the run folder with forward slashes (they survive Git Bash)', () => {
  const project = repo({});
  const r = run(['init', '--project', project, '--command', 'audit', '--slug', 'x']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.json.run.includes(String.fromCharCode(92)), r.json.run);
  assert.ok(fs.existsSync(r.json.run));
});

test('m-10: report-line rejects facts without subagents instead of printing undefined', () => {
  const project = repo({});
  const facts = path.join(project, 'facts.json');
  fs.writeFileSync(facts, JSON.stringify({ pluginVersion: '0.6.1', degraded: [] }));
  const r = run(['report-line', '--facts', facts]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /subagents/);
  assert.doesNotMatch(r.stdout, /undefined/);
});
