'use strict';
// Hito 8d, Task 4: detección de carpetas existentes, archivos sueltos y mal ubicados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { detectPlaces, classifyFile, findStray, CANDIDATES, NAME_RULES } = require('../plugins/pignolo/lib/places-detect');

const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const cfgOf = (repo) => readProjectConfig({ root: repo });
const declare = (repo, yaml) => put(repo, '.pignolo/project.md', `---\ntype: docs\n${yaml}\n---\n`);
const detect = (repo, extra = {}) => detectPlaces({ root: repo, config: cfgOf(repo), ...extra });
const byKind = (d, kind) => d.candidates.filter((c) => c.kind === kind);

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

test('constantes congeladas', () => {
  assert.throws(() => { CANDIDATES.spec.push('x'); }, TypeError);
  assert.throws(() => { NAME_RULES.push({}); }, TypeError);
  assert.deepEqual(Object.keys(NAME_RULES.reduce((a, r) => ({ ...a, [r.kind]: 1 }), {})), ['spec', 'plan']);
});

test('candidatas: doc/specs y doc/plans con sus conteos', () => {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md');
  put(repo, 'doc/specs/b.md');
  put(repo, 'doc/plans/p.md');
  commitAll(repo);
  put(repo, 'doc/specs/sin-versionar.md');
  const d = detect(repo);
  assert.deepEqual(byKind(d, 'spec').map((c) => [c.path, c.files, c.trackedFiles, c.containsNonDoc, c.toolOwned, c.tooBig]), [['doc/specs/', 3, 2, false, false, false]]);
  assert.deepEqual(byKind(d, 'plan').map((c) => [c.path, c.files, c.trackedFiles]), [['doc/plans/', 1, 1]]);
  assert.deepEqual(d.ambiguous, []);
  assert.equal(d.existing, true);
});

test('ambiguas, con archivos que no son documentos y demasiado grandes', () => {
  const repo = makeRepo();
  put(repo, 'docs/specs/a.md');
  put(repo, 'specs/b.md');
  put(repo, 'docs/plans/x.js');
  put(repo, 'plans/y.json', '{}\n');
  let d = detect(repo);
  assert.deepEqual(d.ambiguous, ['spec', 'plan']);
  assert.ok(byKind(d, 'plan').every((c) => c.containsNonDoc));
  assert.ok(byKind(d, 'spec').every((c) => !c.containsNonDoc));

  const orig = fs;
  const fake = {
    ...orig,
    readdirSync(p, o) {
      if (o && o.withFileTypes && path.resolve(String(p)) === path.resolve(repo, 'specs')) {
        return Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}.md`, isSymbolicLink: () => false, isDirectory: () => false }));
      }
      return orig.readdirSync(p, o);
    },
  };
  d = detect(repo, { fs: fake });
  assert.equal(byKind(d, 'spec').find((c) => c.path === 'specs/').tooBig, true);
});

test('otras herramientas: toolOwned', () => {
  const mk = (setup) => { const repo = makeRepo(); setup(repo); return detect(repo); };
  assert.equal(byKind(mk((r) => put(r, 'openspec/specs/a.md')), 'spec')[0].toolOwned, true);
  assert.equal(byKind(mk((r) => put(r, 'docs/superpowers/specs/a.md')), 'spec')[0].toolOwned, true);
  assert.equal(byKind(mk((r) => { put(r, 'specs/a.md'); put(r, '.specify/x.json', '{}'); }), 'spec')[0].toolOwned, true);
  assert.equal(byKind(mk((r) => { put(r, 'docs/specs/a.md'); put(r, 'mkdocs.yml', 'site_name: x\n'); }), 'spec')[0].toolOwned, true);
  assert.equal(byKind(mk((r) => { put(r, 'docs/specs/a.md'); put(r, 'docusaurus.config.js', 'module.exports = {};\n'); }), 'spec')[0].toolOwned, true);
  assert.equal(byKind(mk((r) => put(r, 'docs/specs/a.md')), 'spec')[0].toolOwned, false);
  assert.equal(byKind(mk((r) => put(r, 'specs/a.md')), 'spec')[0].toolOwned, false, 'specs/ sin .specify no es de nadie');
});

test('repo vacío: existing false; mayúsculas: caseCollisions', () => {
  const dir = makeTempDir('pignolo-empty-');
  git(['init', '-q', '-b', 'main'], dir);
  const d = detectPlaces({ root: dir });
  assert.deepEqual(d, { candidates: [], ambiguous: [], caseCollisions: [], existing: false });
  const orig = fs;
  const fake = { ...orig, readdirSync(p, o) { const r = orig.readdirSync(p, o); return !o && path.resolve(String(p)) === path.resolve(dir) ? [...r, 'Docs', 'docs'] : r; } };
  assert.deepEqual(detectPlaces({ root: dir, fs: fake }).caseCollisions, [['Docs', 'docs']]);
});

test('classifyFile: solo por nombre', () => {
  assert.equal(classifyFile('2026-10-01-foo-design.md'), 'spec');
  assert.equal(classifyFile('2026-10-01-foo-plan.md'), 'plan');
  for (const n of ['README.md', 'notas.md', 'design.md', '2026-10-01-x.md', 'docs/audits/2026-10-01-x.md', 'src/app.js']) assert.equal(classifyFile(n), null, n);
});

test('findStray: un .env suelto es high y sin suggest; un Makefile es info; ignorado o versionado no aparece', () => {
  const repo = makeRepo();
  put(repo, '.env', 'A=1\n');
  put(repo, 'Makefile', 'all:\n');
  put(repo, '.gitignore', 'ignorado.env\n');
  commitAll(repo, 'g');
  put(repo, 'nuevo.txt', 'n\n');
  put(repo, 'ignorado.env', 'x\n');
  put(repo, 'sub/dentro.txt', 'x\n');
  const s = findStray({ root: repo, config: cfgOf(repo) });
  assert.deepEqual(s.stray.map((x) => x.path), ['nuevo.txt']);
  assert.equal(s.stray[0].severity, 'info');
  fs.rmSync(path.join(repo, 'nuevo.txt'));
  git(['rm', '-q', '--cached', '.env'], repo);
  git(['commit', '-q', '-m', 'sin env'], repo);
  put(repo, 'cert.pem', 'p\n');
  const s2 = findStray({ root: repo, config: cfgOf(repo) });
  const env = s2.stray.find((x) => x.path === '.env');
  assert.equal(env.severity, 'high');
  assert.equal(env.suggest, undefined);
  assert.match(env.note, /\.gitignore/);
  assert.equal(s2.stray.find((x) => x.path === 'cert.pem').severity, 'high');
  assert.ok(s2.stray.every((x) => x.suggest === undefined));
  assert.equal(s2.stray.find((x) => x.path === 'Makefile'), undefined, 'versionado: no aparece');
});

test('findStray: Makefile sin versionar es info con la nota de falso positivo', () => {
  const repo = makeRepo();
  put(repo, 'Makefile', 'all:\n');
  const s = findStray({ root: repo, config: cfgOf(repo) });
  assert.equal(s.stray[0].severity, 'info');
  assert.match(s.stray[0].note, /falso positivo/);
});

test('misplaced y los falsos positivos (A8D-20)', () => {
  const repo = makeRepo();
  put(repo, '2026-10-01-x-design.md');
  put(repo, 'docs/specs/2026-10-02-ya-design.md');
  put(repo, 'docs/audits/2026-09-01-a.md');
  put(repo, 'packages/x/docs/2026-10-01-y-design.md');
  put(repo, 'docs/superpowers/specs/2026-10-01-z-design.md');
  put(repo, 'tests/2026-10-01-t-design.md');
  commitAll(repo);
  // sin declarar: nada
  assert.deepEqual(findStray({ root: repo, config: cfgOf(repo) }).misplaced, []);
  declare(repo, 'places:\n  spec: docs/specs/');
  let m = findStray({ root: repo, config: cfgOf(repo) }).misplaced;
  assert.deepEqual(m.map((x) => x.path), ['2026-10-01-x-design.md']);
  assert.deepEqual(m[0].suggest, { from: '2026-10-01-x-design.md', to: 'docs/specs/2026-10-01-x-design.md' });
  // destino ocupado
  put(repo, 'docs/specs/2026-10-01-x-design.md', 'otro\n');
  m = findStray({ root: repo, config: cfgOf(repo) }).misplaced;
  assert.equal(m[0].suggest, null);
  assert.equal(m[0].reason, 'dest-exists');
  // un patrón declarado de test-paths lo saca
  declare(repo, 'places:\n  spec: docs/specs/\ntest-paths:\n  - "2026-10-01-*"');
  assert.deepEqual(findStray({ root: repo, config: cfgOf(repo) }).misplaced, []);
  // hijo directo de otro lugar declarado
  fs.rmSync(path.join(repo, 'docs/specs/2026-10-01-x-design.md'));
  put(repo, 'docs/plans/2026-10-03-w-design.md');
  declare(repo, 'places:\n  spec: docs/specs/\n  plan: docs/plans/');
  m = findStray({ root: repo, config: cfgOf(repo) }).misplaced;
  assert.ok(m.some((x) => x.path === 'docs/plans/2026-10-03-w-design.md' && x.suggest.to === 'docs/specs/2026-10-03-w-design.md'));
  assert.ok(!m.some((x) => /packages|superpowers|audits|tests/.test(x.path)));
});

test('junction: nada bajo un enlace se lista ni se cuenta', (t) => {
  const repo = makeRepo();
  const outside = makeTempDir('pignolo-outside-');
  put(outside, '.env', 'A=1\n');
  put(outside, '2026-10-01-q-design.md');
  put(outside, 'specs/o.md');
  if (!tryLink(t, outside, path.join(repo, 'enlace'))) return;
  if (!tryLink(t, outside, path.join(repo, 'docs'))) return;
  declare(repo, 'places:\n  spec: docs/specs/\n  plan: enlace/');
  const h = hashTree(outside);
  const s = findStray({ root: repo, config: cfgOf(repo) });
  assert.ok(!s.stray.some((x) => x.path.includes('enlace')));
  assert.deepEqual(s.misplaced, []);
  const d = detect(repo);
  assert.deepEqual(byKind(d, 'spec'), []);
  assert.equal(hashTree(outside), h);
});

test('detectPlaces no abre el contenido de ningún documento', () => {
  const repo = makeRepo();
  put(repo, 'docs/specs/a.md', 'contenido\n');
  put(repo, 'doc/plans/b.md', 'contenido\n');
  const ops = [];
  const spy = {};
  for (const [k, v] of Object.entries(fs)) {
    spy[k] = typeof v === 'function' ? (...a) => { ops.push(k); return v(...a); } : v;
  }
  spy.realpathSync = Object.assign((...a) => { ops.push('realpathSync'); return fs.realpathSync(...a); }, { native: fs.realpathSync.native });
  const d = detectPlaces({ root: repo, fs: spy });
  assert.ok(d.candidates.length >= 2);
  assert.ok(ops.length > 0, 'el registro no está vacío');
  assert.ok(!ops.some((o) => ['readFileSync', 'openSync', 'readSync', 'createReadStream'].includes(o)), ops.join(','));
});

test('findStray: lo que escribe init y todavía no se commiteó (.gitattributes, SECURITY.md) no se avisa como suelto', () => {
  const repo = makeRepo();
  put(repo, '.gitattributes', '.pignolo/** text eol=lf\n');
  put(repo, 'SECURITY.md', '# s\n');
  put(repo, 'Makefile', 'all:\n');
  assert.deepEqual(findStray({ root: repo, config: cfgOf(repo) }).stray.map((s) => s.path), ['Makefile']);
});
