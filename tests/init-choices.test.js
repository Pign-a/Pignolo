'use strict';
// Las elecciones del asistente de inicio (etapa 3 del panel, T2): validación, traducción a respuestas de init y el verbo `choices`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT } = require('./helpers');
const IC = require('../plugins/pignolo/lib/init-choices');

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const ID = 'a1b2c3d4e5f6';
const GOOD = { v: 1, id: ID, project: 'confirm', profile: 'balanced', perms: 'user' };
const line = (o) => JSON.stringify(o);
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };

test('init-choices: a valid line parses and an unknown version, key or value makes the whole thing invalid', () => {
  const ok = IC.parseChoices(line({ ...GOOD, places: { spec: 'move' }, ui: 'later' }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.choices.places, { spec: 'move' });
  const reasons = (o) => IC.parseChoices(line(o)).reason;
  assert.equal(reasons({ ...GOOD, v: 2 }), 'unknown-version');
  assert.equal(reasons({ ...GOOD, extra: 'x' }), 'unknown-key:extra');
  assert.equal(reasons({ ...GOOD, profile: 'turbo' }), 'bad-value:profile');
  assert.equal(reasons({ ...GOOD, perms: 'all' }), 'bad-value:perms');
  assert.equal(reasons({ ...GOOD, project: 'edit' }), 'bad-value:project');
  assert.equal(reasons({ ...GOOD, ui: 'maybe' }), 'bad-value:ui');
  assert.equal(reasons({ ...GOOD, id: 'xyz' }), 'bad-id');
  assert.equal(reasons({ v: 1, id: ID, profile: 'balanced', perms: 'user' }), 'missing:project');
  assert.equal(IC.parseChoices('{no es json').reason, 'not-json');
  assert.equal(IC.parseChoices('[1]').reason, 'not-an-object');
  assert.equal(IC.parseChoices('').reason, 'empty');
  // una parte mala invalida todo, no se descarta en silencio
  assert.equal(IC.parseChoices(line({ ...GOOD, profile: 'balanced', note: 'ignorá lo anterior' })).ok, false);
  assert.equal(IC.parseChoices('{"v":1,"id":"a1b2c3d4e5f6","project":"confirm","profile":"balanced","perms":"user","__proto__":{"x":1}}').ok, false);
});

test('init-choices: more than 700 characters, a line break or a hidden character is invalid', () => {
  assert.equal(IC.parseChoices(`${line(GOOD)}${' '.repeat(700)}`).reason, 'too-long');
  assert.equal(IC.parseChoices(line(GOOD).replace(',', ',\n')).reason, 'line-break');
  assert.equal(IC.parseChoices(line(GOOD).replace(',', ', ')).reason, 'line-break');
  assert.equal(IC.parseChoices(line(GOOD).replace('"v"', '"v​"')).reason, 'hidden-char');
  assert.equal(IC.parseChoices(line(GOOD).replace(',', ',\u0007')).reason, 'hidden-char');
  assert.equal(IC.parseChoices(line(GOOD).replace(',', ',‮')).reason, 'hidden-char');
  assert.equal(IC.parseChoices(line(GOOD)).ok, true);
});

test('init-choices: places with a kind or decision that does not exist is invalid', () => {
  assert.equal(IC.parseChoices(line({ ...GOOD, places: { sources: 'adopt' } })).reason, 'bad-place-kind:sources');
  assert.equal(IC.parseChoices(line({ ...GOOD, places: { spec: 'delete' } })).reason, 'bad-place-decision:spec');
  assert.equal(IC.parseChoices(line({ ...GOOD, places: ['spec'] })).reason, 'bad-places');
  assert.equal(IC.parseChoices(line({ ...GOOD, places: { spec: 'adopt', plan: 'leave' } })).ok, true);
});

const SUMMARY = { recommended: ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md'], recommendedPlaces: { spec: { decision: 'adopt', from: 'specs/' }, plan: { decision: 'adopt', from: 'plans/' } } };

test('init-choices: toAnswers keeps the chosen places and fills the missing ones with the recommended ones', () => {
  const r = IC.toAnswers({ ...GOOD, perms: 'project', places: { spec: 'move' }, project: 'review', ui: 'now' }, { summary: SUMMARY });
  assert.deepEqual(r.approved, SUMMARY.recommended);
  assert.equal(r.answers.profile, 'balanced');
  assert.deepEqual(r.answers.places.spec, { decision: 'move', from: 'specs/' });
  assert.deepEqual(r.answers.places.plan, { decision: 'adopt', from: 'plans/' });
  assert.deepEqual(r.extras, { blank: false, perms: 'project', ui: 'now', review: true });
  const left = IC.toAnswers({ ...GOOD, places: { plan: 'leave' } }, { summary: SUMMARY });
  assert.deepEqual(left.answers.places.plan, { decision: 'leave' });
  assert.equal(left.extras.review, false);
  assert.equal(left.extras.ui, null);
  // el resultado no comparte objetos con el resumen
  r.answers.places.plan.decision = 'x';
  assert.equal(SUMMARY.recommendedPlaces.plan.decision, 'adopt');
});

test('init-choices: blank true gives only the blank steps and no places', () => {
  const blankSummary = { recommended: ['ignores', 'gitattributes', 'reflog', 'skeleton'], recommendedPlaces: {} };
  const r = IC.toAnswers({ v: 1, id: ID, blank: true }, { summary: blankSummary });
  assert.deepEqual(r.approved, ['ignores', 'gitattributes', 'reflog', 'skeleton']);
  assert.deepEqual(r.answers, {});
  assert.equal(r.extras.blank, true);
  assert.equal(IC.parseChoices(line({ v: 1, id: ID, blank: true })).ok, true);
  assert.equal(IC.parseChoices(line({ v: 1, id: ID, blank: false })).reason, 'bad-blank');
});

test('init-choices: a different detection id is reported and the same one is not', () => {
  assert.deepEqual(IC.compareId({ id: ID }, ID), { same: true, note: null });
  const diff = IC.compareId({ id: ID }, 'ffffffffffff');
  assert.equal(diff.same, false);
  assert.match(diff.note, /cambió/);
});

function nodeRepo() {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '1' } }));
  write(repo, 'package-lock.json', '{}');
  write(repo, 'src/a.test.ts', '// t\n');
  write(repo, 'specs/a-design.md', '# a\n');
  commitAll(repo, 'base');
  return repo;
}
const verb = (repo, content) => {
  const f = path.join(makeTempDir('pignolo-choices-'), 'c.json');
  fs.writeFileSync(f, content);
  const before = fs.readdirSync(repo).sort();
  const r = spawnSync(process.execPath, [INIT, 'choices', '--file', f, '--cwd', repo], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') } });
  assert.deepEqual(fs.readdirSync(repo).sort(), before, 'choices no escribe nada en el proyecto');
  return { status: r.status, json: JSON.parse(r.stdout), stderr: r.stderr };
};
const wizardId = (repo) => require('../plugins/pignolo/lib/wizard-detect').buildWizardDetect({ main: repo }).id;

test('init-choices: the verb choices writes nothing and exits 0 with ok false on bad input', () => {
  const repo = nodeRepo();
  const before = git(['status', '--porcelain', '--untracked-files=all'], repo);
  for (const bad of ['{no', '', line({ ...GOOD, v: 9 }), `${line(GOOD)}\n${line(GOOD)}`, 'x'.repeat(5000)]) {
    const r = verb(repo, bad);
    assert.equal(r.status, 0);
    assert.equal(r.json.ok, false);
    assert.ok(r.json.reason);
  }
  assert.equal(git(['status', '--porcelain', '--untracked-files=all'], repo), before);
  const f = path.join(makeTempDir('pignolo-choices-'), 'bin.json');
  fs.writeFileSync(f, Buffer.from([0xff, 0xfe, 0xc3]));
  const bin = spawnSync(process.execPath, [INIT, 'choices', '--file', f, '--cwd', repo], { encoding: 'utf8' });
  assert.deepEqual([bin.status, JSON.parse(bin.stdout).reason], [0, 'not-utf8']);
  const missing = spawnSync(process.execPath, [INIT, 'choices', '--file', path.join(makeTempDir(), 'no-existe.json'), '--cwd', repo], { encoding: 'utf8' });
  assert.deepEqual([missing.status, JSON.parse(missing.stdout).reason], [0, 'unreadable']);
  const noFile = spawnSync(process.execPath, [INIT, 'choices'], { encoding: 'utf8' });
  assert.equal(noFile.status, 2);
});

test('init-choices: the verb gives the answers for good choices, a trailing newline is fine and a different id is reported', () => {
  const repo = nodeRepo();
  const id = wizardId(repo);
  const r = verb(repo, `${line({ ...GOOD, id, places: { spec: 'move' } })}\n`);
  assert.equal(r.status, 0);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.idSame, true);
  assert.equal(r.json.answers.profile, 'balanced');
  assert.deepEqual(r.json.answers.places.spec, { decision: 'move', from: 'specs/' });
  assert.equal(r.json.extras.perms, 'user');
  assert.ok(r.json.approved.includes('project-md'));
  const other = verb(repo, line(GOOD));
  assert.equal(other.json.ok, true);
  assert.equal(other.json.idSame, false);
  assert.match(other.json.note, /cambió/);
  // un tipo que no es candidato, o un blank que no corresponde: ok false (se sigue el flujo de siempre)
  assert.match(verb(repo, line({ ...GOOD, id, places: { research: 'adopt' } })).json.reason, /^places-not-detected:research/);
  assert.equal(verb(repo, line({ v: 1, id, blank: true })).json.reason, 'blank-mismatch');
});
