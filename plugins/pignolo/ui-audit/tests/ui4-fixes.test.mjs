// Fix pass of the final review of hito 4 (I-1, I-2, I-3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const RUN = '.pignolo-ui/runs/r1';
const run = (args) => runScript('run.mjs', args);
const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body><main>${body}</main></body></html>`;
const GOOD = page('<h1>Hola</h1><p>texto</p>');
const NO_ALT = page('<h1>Hola</h1><img src="a.png">');

function repo(tree) {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeTree(dir, { 'README.md': 'x\n', ...tree });
  return dir;
}
const after = (p) => path.join(p, RUN, 'after');

// check + skeleton + empty-claims report in <run>/after, as the skills do.
function checked(project, files = 'src/a.html') {
  const c = run(['check', '--project', project, '--run', after(project), '--files', files]);
  assert.ok([0, 1].includes(c.status), c.stderr);
  const sk = run(['report-skeleton', '--project', project, '--run', after(project)]);
  writeTree(project, { [`${RUN}/after/report.json`]: JSON.stringify({ implemented: false, evidence: sk.json.evidence, claims: [] }) });
}
const verdict = (project, extra = []) => run(['verdict', '--project', project, '--run', after(project), ...extra]);

test('I-1: verdict is sin verificar when a file ui-check.json checked changed afterwards', () => {
  const project = repo({ 'src/a.html': GOOD, [`${RUN}/after/.keep`]: '' });
  checked(project);
  assert.equal(verdict(project).json.status, 'terminado');
  fs.writeFileSync(path.join(project, 'src', 'a.html'), NO_ALT);
  const r = verdict(project);
  assert.equal(r.status, 1);
  assert.equal(r.json.status, 'sin verificar');
  assert.ok(r.json.reasons.some((x) => /desactualizado.*src\/a\.html/.test(x)), JSON.stringify(r.json));
});

test('I-2: a project that declares a build is not terminado without --build-ok', () => {
  const project = repo({ 'src/a.html': GOOD, 'package.json': JSON.stringify({ scripts: { build: 'exit 1' } }), [`${RUN}/after/.keep`]: '' });
  checked(project);
  const none = verdict(project);
  assert.equal(none.json.status, 'sin verificar');
  assert.ok(none.json.reasons.some((x) => /build sin informar/.test(x)));
  assert.doesNotMatch(none.json.reasons.join(' '), /no declara build/);
  assert.equal(verdict(project, ['--build-ok', 'yes']).json.status, 'terminado');
  assert.equal(verdict(project, ['--build-ok', 'no']).json.status, 'BLOCKED');
});

test('I-2: without a declared build the verdict still says so and can be terminado', () => {
  const project = repo({ 'src/a.html': GOOD, 'package.json': JSON.stringify({ scripts: { dev: 'x' } }), [`${RUN}/after/.keep`]: '' });
  checked(project);
  const r = verdict(project);
  assert.equal(r.json.status, 'terminado');
  assert.ok(r.json.reasons.some((x) => /no declara build/.test(x)));
});

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

// I-5: DESIGN.md is created from the plugin template without ever touching the template.
test('I-5: patch --out creates a new DESIGN.md; --write on the template and an existing --out are refused', async () => {
  const { PLUGIN_ROOT } = await import('./helpers.mjs');
  const template = path.join(PLUGIN_ROOT, 'templates', 'DESIGN.md');
  const original = fs.readFileSync(template);
  const project = repo({});
  const ops = path.join(project, 'ops.json');
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['name'], value: 'Mi proyecto' }]));
  const target = path.join(project, 'DESIGN.md');
  const dry = runScript('design-md.mjs', ['patch', '--file', template, '--ops', ops]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(target), false, 'without --out nothing is written');

  const bad = runScript('design-md.mjs', ['patch', '--file', template, '--ops', ops, '--write']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /plugin/);
  assert.ok(fs.readFileSync(template).equals(original), 'the template stays intact');

  const made = runScript('design-md.mjs', ['patch', '--file', template, '--ops', ops, '--out', target]);
  assert.equal(made.status, 0, made.stderr);
  assert.match(fs.readFileSync(target, 'utf8'), /^name: .?Mi proyecto/m);
  assert.ok(fs.readFileSync(template).equals(original));

  const again = runScript('design-md.mjs', ['patch', '--file', template, '--ops', ops, '--out', target]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /nunca sobrescribe/);
  assert.equal(runScript('design-md.mjs', ['patch', '--file', target, '--ops', ops, '--out', path.join(PLUGIN_ROOT, 'templates', 'x.md')]).status, 2);
});

// ---- texts of the skills (I-2, I-3, I-5, m-5, m-10) --------------------------------------------
import { readSkill, readReference } from './support/skill-checks.mjs';

test('I-2: new and improve pass --build-ok to the verdict', () => {
  for (const name of ['new', 'improve']) {
    const { text } = readSkill(name);
    const line = text.split('\n').find((l) => /run\.mjs" verdict/.test(l));
    assert.match(line, /verdict --project <repo> --run <run>\/after --build-ok yes\|no/, name);
  }
});

test('I-3: improve checks "after" against the "before" reading; new does not have one', () => {
  assert.match(readSkill('improve').text, /run\.mjs" check --project <repo> --run <run>\/after --files <touched files> --base <base> --before <run>\/ui-check\.json/);
  assert.doesNotMatch(readSkill('new').text, /--before/);
});

test('I-5: DESIGN.md is created from the template with patch --out, never with --write over the template', () => {
  const { text } = readSkill('define');
  for (const l of text.split('\n')) {
    if (/templates\/DESIGN\.md/.test(l)) assert.ok(!/patch[^`]*--file[^`]*templates\/DESIGN\.md[^`]*--write/.test(l), l.slice(0, 120));
  }
  assert.match(text, /--out <repo>\/DESIGN\.md/);
  assert.match(text, /Never use `--write` on the template/);
});

test('m-5: the "after" map.json lives in <run>/after and the repeated commands do not repeat --before', () => {
  for (const name of ['new', 'improve']) {
    const { text } = readSkill(name);
    assert.doesNotMatch(text, /<run>\/map\.json/, name);
    assert.match(text, /<run>\/after\/map\.json/, name);
  }
  assert.match(readSkill('improve').text, /same arguments except `--before`/);
});

test('m-10: leak-values gets the account email and present-and-choose defines <flow> and <approved>', () => {
  assert.match(readReference('options.md'), /leak-values --project <repo> --run <run> --email /);
  const pc = readReference('present-and-choose.md');
  assert.match(pc.split('\n').slice(0, 3).join('\n'), /`<flow>`[^\n]*`<approved>`/);
});

// ---- minors: m-4, m-6, m-8, m-10 -------------------------------------------------------------------
import { reportSkeleton } from '../lib/report-build.mjs';

test('m-4: reportSkeleton does not double a failure that ui-check.json repeats from browser.json', () => {
  const entry = { id: 'COLOR-03', status: 'fail', severity: 'alto', scope: 'new', fingerprint: 'fp-dup', measure: { ratio: 2.1 } };
  const project = repo({
    [`${RUN}/browser.json`]: JSON.stringify({ entries: [entry] }),
    [`${RUN}/ui-check.json`]: JSON.stringify({ entries: [entry, { ...entry, fingerprint: 'fp-other' }] }),
  });
  const sk = reportSkeleton({ project, run: path.join(project, RUN) });
  assert.deepEqual(sk.candidates.map((c) => `${c.ref.source}:${c.ref.fingerprint}`), ['browser:fp-dup', 'ui-check:fp-other']);
});

test('m-4: discard refuses an option folder that is a link and leaves its target alone', () => {
  const outside = makeTempDir();
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'x');
  const project = repo({ [`${RUN}/keep.txt`]: '' });
  fs.symlinkSync(outside, path.join(project, RUN, 'option-A'), process.platform === 'win32' ? 'junction' : 'dir');
  const r = run(['discard', '--run', path.join(project, RUN), '--option', 'A']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no es una carpeta común/);
  assert.ok(fs.existsSync(path.join(outside, 'precious.txt')));
  assert.ok(fs.lstatSync(path.join(project, RUN, 'option-A')).isSymbolicLink(), 'the link stays where it was');
});

test('m-6: menu only pre-ticks with the auditor findings that auditor-check kept', () => {
  const good = { id: 'COLOR-03', severity: 'alto', scope: 'new', plain: 'x', evidence: { kind: 'ui-check', fingerprint: 'fp-1' }, why: 'y' };
  const bad = { ...good, evidence: { kind: 'ui-check', fingerprint: 'no-such-fingerprint' } };
  const tree = (finding) => ({
    [`${RUN}/ui-check.json`]: JSON.stringify({ entries: [{ id: 'COLOR-03', status: 'pass', severity: 'alto', scope: 'new', fingerprint: 'fp-1' }] }),
    [`${RUN}/auditor.json`]: JSON.stringify({ findings: [finding], notVerified: [], independent: true }),
  });
  const ticked = (project) => run(['menu', '--run', path.join(project, RUN)]).json.menu.filter((m) => m.preticked).length;
  const withGood = repo(tree(good));
  const withBad = repo(tree(bad));
  assert.ok(ticked(withGood) >= 1, 'a kept finding pre-ticks its symptom');
  assert.equal(ticked(withBad), 0, 'a finding without evidence is dropped, so it ticks nothing');
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
