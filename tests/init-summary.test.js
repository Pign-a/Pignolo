'use strict';
// El bloque `summary` de `init.js detect` (plan 2026-10-02, Tarea 4). Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git } = require('./helpers');
const { memorySlug } = require('../plugins/pignolo/lib/auto-memory');
const { buildSummary } = require('../plugins/pignolo/lib/init-summary');

const INIT = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'init.js');
const write = (cwd, rel, text = 'x\n') => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const repo = () => {
  const d = makeTempDir('pignolo-sum-');
  git(['init', '-q', '-b', 'main'], d);
  return d;
};
const env0 = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-sumhome-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-sumcfg-') });
function detect(cwd, env = env0()) {
  const r = spawnSync(process.execPath, [INIT, 'detect', '--cwd', cwd], { encoding: 'utf8', env, timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
function nodeRepo() {
  const d = repo();
  write(d, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' }, devDependencies: { vitest: '1' } }));
  write(d, 'package-lock.json', '{}');
  write(d, 'vitest.config.ts', 'export default {};\n');
  write(d, 'src/a.test.ts', '// t\n');
  return d;
}

test('summary de un repo en blanco: modo blank, solo los cuatro pasos, una pregunta sí/no, nada más', () => {
  const j = detect(repo());
  assert.deepEqual(j.summary, {
    mode: 'blank',
    recommended: ['ignores', 'gitattributes', 'reflog', 'skeleton'],
    recommendedPlaces: {},
    recommendedPlacesIfPrivate: {},
    proposal: {},
    found: {},
    ask: [{ id: 'create-skeleton', kind: 'yes-no', default: true }],
    optional: [],
    attention: [],
  });
  assert.deepEqual(j.steps.map((s) => s.id), ['ignores', 'gitattributes', 'reflog', 'skeleton']);
});

test('summary de un node con vitest: modo existing, recomendación completa, tres preguntas y una propuesta lista', () => {
  const j = detect(nodeRepo());
  const s = j.summary;
  assert.equal(s.mode, 'existing');
  assert.deepEqual(s.recommended, ['ignores', 'gitattributes', 'reflog', 'skeleton', 'project-md', 'security-md']);
  assert.deepEqual(s.ask, [{ id: 'public', kind: 'yes-no', default: true }, { id: 'piiPatterns', kind: 'free-text', default: [] }, { id: 'channel', kind: 'free-text', default: null }]);
  assert.deepEqual(s.found, { type: 'code-tested', stacks: ['node'], runners: ['vitest'], gates: ['on-edit', 'on-done', 'pre-merge'], domainRules: 0, projectMd: false });
  assert.equal(s.proposal.type, 'code-tested');
  assert.equal(s.proposal.gates['on-done'], j.detection.gates['on-done']);
  assert.ok(!('mutation' in s.proposal), 'la mutación la declara el humano, no el resumen');
  assert.ok(!('piiPatterns' in s.proposal));
  assert.deepEqual(s.optional, []);
  assert.deepEqual(s.attention, ['runner-excludes']);
  assert.deepEqual(s.recommendedPlaces, {});
  assert.equal(j.steps.length, 8);
});

test('summary sin manifiesto pero con código: no-type y modo existing', () => {
  const d = repo();
  write(d, 'a.txt');
  write(d, 'b.txt');
  const s = detect(d).summary;
  assert.equal(s.mode, 'existing');
  assert.ok(s.attention.includes('no-type'));
  assert.ok(!('type' in s.proposal));
  assert.equal(s.found.type, null);
});

test('summary con project.md previo, SECURITY.md y carpetas candidatas: sin security-md ni pregunta del canal, adapt solo adoptando', () => {
  const d = nodeRepo();
  write(d, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  write(d, 'SECURITY.md');
  write(d, 'doc/specs/a.md', '# a\n');
  write(d, 'notes/research/r.md', '# r\n');
  write(d, 'references/ref.md', '# ref\n');
  const s = detect(d).summary;
  assert.ok(!s.recommended.includes('security-md'));
  assert.deepEqual(s.ask.map((a) => a.id), ['public', 'piiPatterns']);
  assert.deepEqual(s.recommended.slice(0, 4), ['ignores', 'gitattributes', 'reflog', 'adapt']);
  assert.ok(s.attention.includes('existing-project-md'));
  assert.ok(s.attention.includes('places-candidates'));
  assert.equal(s.found.projectMd, true);
  assert.deepEqual(s.recommendedPlaces.spec, { decision: 'adopt', from: 'doc/specs/' });
  assert.ok(!('reference' in s.recommendedPlaces), 'reference solo cuenta si el repo es privado');
  for (const a of Object.values(s.recommendedPlacesIfPrivate)) assert.equal(a.decision === 'move', false);
  assert.ok(Object.values(s.recommendedPlaces).every((a) => ['adopt', 'leave'].includes(a.decision)));
});

test('summary: las respuestas de places que arma son válidas para el plan (preview las acepta)', () => {
  const d = nodeRepo();
  write(d, 'doc/specs/a.md', '# a\n');
  const env = env0();
  const s = detect(d, env).summary;
  const planFile = path.join(makeTempDir('pignolo-sumplan-'), 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ v: 1, approved: s.recommended, answers: { public: true, piiPatterns: [], places: s.recommendedPlaces }, proposal: s.proposal }));
  const r = spawnSync(process.execPath, [INIT, 'preview', '--plan', planFile, '--cwd', d], { encoding: 'utf8', env, timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  const adapt = j.steps.find((x) => x.id === 'adapt');
  assert.notEqual(adapt.status, 'refused');
  assert.equal(adapt.reason, 'nothing-to-move');
  assert.deepEqual(adapt.places, { spec: 'doc/specs/' });
  assert.equal(j.steps.find((x) => x.id === 'project-md').status, 'would-do');
  assert.ok(j.stamp);
});

test('summary: la memoria con archivos ofrece auto-memory-off como opcional y su contenido nunca aparece', () => {
  const d = nodeRepo();
  const env = env0();
  const mem = path.join(env.CLAUDE_CONFIG_DIR, 'projects', memorySlug(d), 'memory');
  fs.mkdirSync(mem, { recursive: true });
  fs.writeFileSync(path.join(mem, 'a.md'), 'SECRETO-DE-MEMORIA');
  const r = spawnSync(process.execPath, [INIT, 'detect', '--cwd', d], { encoding: 'utf8', env, timeout: 60000 });
  assert.equal(JSON.parse(r.stdout).summary.optional[0], 'auto-memory-off');
  assert.ok(!r.stdout.includes('SECRETO-DE-MEMORIA'));
});

test('summary: los códigos de atención por tipo de hallazgo (puro)', () => {
  const det = (over = {}) => ({ type: 'code-tested', stacks: ['node'], runners: [], gates: {}, domainRules: [], warnings: [], sources: {}, mutation: null, runnerExcludes: [], ...over });
  const ex = { projectMd: false, securityMd: false };
  const pl = { candidates: [] };
  const att = (over) => buildSummary({ blank: false, detection: det(over), existing: ex, memory: { found: false, files: 0 }, places: pl }).attention;
  assert.deepEqual(att({ type: 'code-untested' }), ['untested']);
  assert.deepEqual(att({ type: null }), ['no-type']);
  assert.deepEqual(att({ warnings: ['scripts.test de package.json es el placeholder del instalador o un comando'] }), ['test-placeholder']);
  assert.deepEqual(att({ sources: { testScript: 'scripts.test sin runner reconocido: "x"' } }), ['unrecognized-runner']);
  assert.deepEqual(att({ mutation: { tool: 'stryker' } }), ['mutation-config']);
  assert.deepEqual(att({ runnerExcludes: [{ runner: 'go', walksDotDirs: 'no', file: null }] }), []);
  assert.deepEqual(att({ runnerExcludes: [{ runner: 'jest', walksDotDirs: 'yes', file: 'jest.config.js' }] }), ['runner-excludes']);
  assert.deepEqual(att({ stacks: ['node', 'python'] }), ['several-stacks']);
});

test('summary no trae rutas absolutas del usuario', () => {
  const d = nodeRepo();
  const j = detect(d);
  const text = JSON.stringify(j.summary);
  assert.ok(!text.includes(d));
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]+Users|\/home\/|\/Users\//);
});

test('summary con una herramienta de mutación detectada: aviso mutation-config y la propuesta no declara mutation', () => {
  const d = nodeRepo();
  write(d, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '1', '@stryker-mutator/core': '1' } }));
  const j = detect(d);
  assert.ok(j.detection.mutation, 'el fixture debe detectar stryker');
  assert.ok(j.summary.attention.includes('mutation-config'));
  assert.ok(!('mutation' in j.summary.proposal));
});
