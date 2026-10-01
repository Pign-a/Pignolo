'use strict';
// Hito 8d, Task 6: adaptar lo que ya hay (adoptar, mover o dejar) con referencias, ignorados y deshacer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { detectPlaces } = require('../plugins/pignolo/lib/places-detect');
const { newPlan } = require('../plugins/pignolo/lib/plan-state');
const SM = require('../plugins/pignolo/lib/safe-move');
const { proposeAdaptation, planAdaptation, applyAdaptation } = require('../plugins/pignolo/lib/init-adapt');

const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const status = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const MOVE_SPEC = { spec: { decision: 'move', from: 'doc/specs/' } };

function base() {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md', '# a\n');
  put(repo, 'doc/specs/b.md', 'b\n');
  put(repo, 'doc/plans/p.md', 'p\n');
  put(repo, 'guide/index.md', 'ver [a](../doc/specs/a.md)\n');
  commitAll(repo);
  return repo;
}
const cfgOf = (repo) => readProjectConfig({ root: repo });
function plan(repo, answers, extra = {}) {
  const detection = extra.detection || detectPlaces({ root: repo });
  return planAdaptation({ main: repo, answers, config: cfgOf(repo), detection, ...extra });
}
const apply = (repo, p, extra = {}) => applyAdaptation({ main: repo, plan: p, config: cfgOf(repo), ...extra });

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

test('proposeAdaptation: opciones por tipo, bloqueos de mover y ambigüedad', () => {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md');
  put(repo, 'specs/b.md');
  put(repo, 'openspec/changes/c.md');
  put(repo, 'designs/d.md');
  put(repo, 'references/r.md');
  put(repo, 'docs/research/r.md');
  const det = detectPlaces({ root: repo });
  const pub = proposeAdaptation({ detection: det, answers: {} });
  const kinds = Object.fromEntries(pub.items.map((i) => [i.kind, i]));
  assert.ok(!kinds.reference, 'reference solo con answers.public === false');
  assert.ok(!kinds.research, 'ya está en su lugar');
  assert.equal(kinds.spec.ambiguous, true);
  assert.deepEqual(kinds.spec.options, ['adopt', 'move', 'leave']);
  assert.equal(kinds.plan.moveBlockedBy, 'tool-owned');
  assert.deepEqual(kinds.plan.options, ['adopt', 'leave']);
  assert.equal(kinds.design.moveBlockedBy, 'kind-fixed');
  const priv = proposeAdaptation({ detection: det, answers: { public: false } });
  assert.equal(priv.items.find((i) => i.kind === 'reference').moveBlockedBy, 'kind-fixed');
});

test('el caso de todos los días (A8D-01): sin project.md, mover doc/specs y adoptar doc/plans', () => {
  const repo = base();
  const answers = { places: { ...MOVE_SPEC, plan: { decision: 'adopt', from: 'doc/plans/' } } };
  const p = plan(repo, answers);
  const spec = p.decisions.find((d) => d.kind === 'spec');
  assert.equal(spec.effective, 'move', JSON.stringify(spec));
  assert.equal(spec.refused, undefined);
  assert.equal(typeof p.stamp, 'string');
  assert.equal(p.rewrites.files.length, 1);
  const s = apply(repo, p);
  assert.equal(s.status, 'done', JSON.stringify(s));
  assert.ok(fs.existsSync(path.join(repo, 'docs/specs/a.md')));
  assert.ok(fs.existsSync(path.join(repo, 'doc/plans/p.md')));
  assert.deepEqual(s.places, { spec: 'docs/specs/', plan: 'doc/plans/' });
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo/project.md')), 'adapt no crea project.md');
  assert.equal(fs.readFileSync(path.join(repo, 'guide/index.md'), 'utf8'), 'ver [a](../docs/specs/a.md)\n');
  for (const l of status(repo).split('\n')) assert.ok(l.startsWith('R') || l.startsWith(' M'), l);
  assert.ok(status(repo).includes(' M guide/index.md'));
});

test('con otro project.md existente, queda idéntico', () => {
  const repo = base();
  put(repo, '.pignolo/project.md', '---\ntype: docs\n---\nnotas\n');
  const before = fs.readFileSync(path.join(repo, '.pignolo/project.md'));
  const p = plan(repo, { places: MOVE_SPEC });
  assert.equal(apply(repo, p).status, 'done');
  assert.ok(fs.readFileSync(path.join(repo, '.pignolo/project.md')).equals(before));
});

test('migración (R-3): un test-paths declarado que casa los documentos deja el ítem en adopt', () => {
  let repo = base();
  put(repo, '.pignolo/project.md', '---\ntype: docs\ntest-paths:\n  - "*spec*"\n---\n');
  const hmd = fs.readFileSync(path.join(repo, '.pignolo/project.md'));
  let p = plan(repo, { places: MOVE_SPEC });
  let d = p.decisions[0];
  assert.equal(d.effective, 'adopt');
  assert.equal(d.refused.reason, 'matches-declared-paths');
  assert.equal(d.refused.detail, '*spec*');
  assert.deepEqual(p.moves.items, []);
  assert.ok(p.leftKinds.includes('spec'), 'no se crea docs/specs al lado');
  assert.ok(fs.readFileSync(path.join(repo, '.pignolo/project.md')).equals(hmd));

  repo = base();
  put(repo, '.pignolo/project.md', '---\ntype: docs\ntest-paths:\n  - "**/*.spec.ts"\n---\n');
  p = plan(repo, { places: MOVE_SPEC });
  d = p.decisions[0];
  assert.equal(d.effective, 'move');
  assert.equal(apply(repo, p).status, 'done');
});

test('leave y adopt: nada se mueve ni se reescribe', () => {
  const repo = base();
  const h = hashTree(repo);
  const p = plan(repo, { places: { spec: { decision: 'leave' }, plan: { decision: 'adopt', from: 'doc/plans/' } } });
  assert.ok(p.leftKinds.includes('spec'));
  assert.equal(p.places.spec, undefined);
  assert.equal(p.places.plan, 'doc/plans/');
  assert.deepEqual(p.moves.items, []);
  const s = apply(repo, p);
  assert.equal(s.status, 'skipped');
  assert.equal(hashTree(repo), h);
  assert.ok(p.notes.length === 0);
});

test('una referencia manual frena el movimiento; force la deja pasar y se lista; la prosa no frena', () => {
  const repo = base();
  put(repo, 'lib/x.js', "require('../doc/specs/x');\n");
  put(repo, 'notas.md', 'ver doc/specs en prosa\n');
  commitAll(repo, 'ref');
  const h = hashTree(repo);
  let p = plan(repo, { places: MOVE_SPEC });
  assert.equal(p.decisions[0].effective, 'adopt');
  assert.ok(p.decisions[0].blockedBy.some((r) => r.file === 'lib/x.js' && r.class === 'code'));
  assert.ok(!p.decisions[0].blockedBy.some((r) => r.file === 'notas.md'), 'la prosa no frena');
  assert.equal(p.places.spec, 'doc/specs/', 'queda adoptada en el lugar');
  assert.equal(apply(repo, p).status, 'skipped');
  assert.equal(hashTree(repo), h);

  p = plan(repo, { places: { spec: { decision: 'move', from: 'doc/specs/', force: true } } });
  assert.equal(p.decisions[0].effective, 'move');
  assert.equal(p.decisions[0].forced, true);
  const s = apply(repo, p);
  assert.equal(s.status, 'done', JSON.stringify(s));
  assert.ok(s.fixByHand.some((r) => r.file === 'lib/x.js'));

  // solo prosa: se mueve sin force
  const repo2 = base();
  put(repo2, 'notas.md', 'ver doc/specs en prosa\n');
  commitAll(repo2, 'prosa');
  assert.equal(plan(repo2, { places: MOVE_SPEC }).decisions[0].effective, 'move');
});

test('force nunca pasa una guarda dura (un subcaso por guarda)', async (t) => {
  const FORCE = { spec: { decision: 'move', from: 'doc/specs/', force: true } };
  const cases = [
    ['link-in-path', (r, t2) => { const o = makeTempDir('pignolo-outside-'); put(o, 'o.md'); return tryLink(t2, o, path.join(r, 'doc/specs/ext')); }],
    ['contains-non-doc', (r) => put(r, 'doc/specs/x.js', 'x\n')],
    ['dest-exists', (r) => put(r, 'docs/specs/otro.md', 'o\n')],
    ['dirty', (r) => fs.appendFileSync(path.join(r, 'doc/specs/a.md'), 'cambio\n')],
    ['ignored-by-outside-rule', (r) => { put(r, '.gitignore', 'doc/specs/*.pdf\n'); commitAll(r, 'ig'); put(r, 'doc/specs/x.pdf', 'pdf\n'); }],
    ['nested-repo', (r) => { fs.mkdirSync(path.join(r, 'doc/specs/sub'), { recursive: true }); git(['init', '-q', '-b', 'main'], path.join(r, 'doc/specs/sub')); }],
    ['plan-open', (r) => { put(r, '.pignolo/.gitignore', 'state/\n'); newPlan({ main: r, plan: 'mi-plan', request: 'x', spec: 'doc/specs/a.md' }); }],
  ];
  for (const [reason, mutate] of cases) {
    await t.test(reason, (t2) => {
      const repo = base();
      put(repo, 'lib/x.js', "require('../doc/specs/x');\n");
      commitAll(repo, 'ref');
      const detection = detectPlaces({ root: repo }); // se detecta ANTES: el cambio llega después (vista previa vieja)
      if (mutate(repo, t2) === false) return;
      const h = hashTree(repo);
      const p = plan(repo, { places: FORCE }, { detection });
      assert.equal(p.decisions[0].effective, 'adopt', JSON.stringify(p.decisions[0]));
      assert.equal(p.decisions[0].refused.reason, reason);
      assert.equal(p.decisions[0].forced, false);
      assert.deepEqual(p.moves.items, []);
      apply(repo, p);
      assert.equal(hashTree(repo), h);
    });
  }
});

test('respuestas mal formadas: bad-answer y nada se mueve (A8D-10)', async (t) => {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md');
  put(repo, 'design/d.md');
  put(repo, 'private/p.md');
  put(repo, 'references/r.md');
  put(repo, 'openspec/specs/o.md');
  put(repo, 'docs/plans/p.json', '{}\n');
  put(repo, 'assets/x.png', 'x');
  commitAll(repo);
  const det = detectPlaces({ root: repo });
  const h = hashTree(repo);
  const bad = {
    'from que no es candidata': { spec: { decision: 'adopt', from: 'assets/' } },
    'un to en la respuesta': { spec: { decision: 'move', from: 'doc/specs/', to: 'otro/' } },
    'mover design': { design: { decision: 'move', from: 'design/' } },
    'mover private': { private: { decision: 'move', from: 'private/' } },
    'mover reference': { reference: { decision: 'move', from: 'references/' } },
    'mover una candidata tool-owned': { spec: { decision: 'move', from: 'openspec/specs/' } },
    'mover una candidata con un .json': { plan: { decision: 'move', from: 'docs/plans/' } },
    'tipo desconocido': { cosa: { decision: 'adopt', from: 'doc/specs/' } },
    'decisión desconocida': { spec: { decision: 'borrar', from: 'doc/specs/' } },
  };
  for (const [name, places] of Object.entries(bad)) {
    await t.test(name, () => {
      assert.throws(() => planAdaptation({ main: repo, answers: { places, public: false }, config: cfgOf(repo), detection: det }), (e) => e.kind === 'bad-answer');
    });
  }
  assert.equal(hashTree(repo), h);
});

test('adopt de una ruta que validatePlacePath rechaza es refused visible; reference público no se declara', () => {
  const repo = base();
  put(repo, 'references/r.md');
  commitAll(repo, 'r');
  put(repo, '.pignolo/project.md', '---\ntype: docs\ntest-paths:\n  - "*spec*"\n---\n');
  let p = plan(repo, { places: { spec: { decision: 'adopt', from: 'doc/specs/' } } });
  assert.equal(p.decisions[0].refused.reason, 'inside-test-paths');
  assert.equal(p.places.spec, undefined);
  fs.rmSync(path.join(repo, '.pignolo'), { recursive: true });
  for (const answers of [{}, { public: true }]) {
    p = planAdaptation({ main: repo, answers: { ...answers, places: { reference: { decision: 'adopt', from: 'references/' } } }, config: cfgOf(repo), detection: detectPlaces({ root: repo }) });
    assert.equal(p.places.reference, undefined);
    assert.ok(p.notes.some((n) => n.includes('repo público')), p.notes.join('|'));
  }
  p = planAdaptation({ main: repo, answers: { public: false, places: { reference: { decision: 'adopt', from: 'references/' } } }, config: cfgOf(repo), detection: detectPlaces({ root: repo }) });
  assert.equal(p.places.reference, 'references/');
});

test('lo ignorado no queda visible: regla de afuera frena; regla dentro de la carpeta viaja con ella', () => {
  let repo = base();
  put(repo, '.gitignore', 'doc/specs/*.pdf\n');
  commitAll(repo, 'ig');
  put(repo, 'doc/specs/x.pdf', 'pdf\n');
  let p = plan(repo, { places: MOVE_SPEC });
  assert.equal(p.decisions[0].effective, 'adopt');
  assert.equal(p.decisions[0].refused.reason, 'ignored-by-outside-rule');
  assert.ok(p.decisions[0].refused.detail.includes('doc/specs/*.pdf'));

  repo = base();
  put(repo, 'doc/specs/.gitignore', '*.pdf\n');
  commitAll(repo, 'ig');
  put(repo, 'doc/specs/x.pdf', 'pdf\n');
  p = plan(repo, { places: MOVE_SPEC });
  assert.equal(p.decisions[0].effective, 'move');
  assert.equal(apply(repo, p).status, 'done');
  assert.ok(!git(['add', '-A', '-n'], repo).includes('x.pdf'));
});

test('un places.<tipo> declarado distinto va a conflicts: no se mueve ni se adopta y project.md queda igual', () => {
  const repo = base();
  put(repo, '.pignolo/project.md', '---\ntype: docs\nplaces:\n  spec: especificaciones/\n---\n');
  const before = fs.readFileSync(path.join(repo, '.pignolo/project.md'));
  const h = hashTree(repo);
  const p = plan(repo, { places: MOVE_SPEC });
  assert.deepEqual(p.conflicts, [{ kind: 'spec', existing: 'especificaciones/', proposed: 'docs/specs/' }]);
  assert.deepEqual(p.moves.items, []);
  assert.equal(p.places.spec, undefined);
  assert.equal(apply(repo, p).status, 'skipped');
  assert.ok(fs.readFileSync(path.join(repo, '.pignolo/project.md')).equals(before));
  assert.equal(hashTree(repo), h);
});

test('vista previa vieja: un .js, un junction o un commit nuevo cambian el stamp y el plan viejo no mueve nada', async (t) => {
  for (const [name, mutate] of [
    ['un .js', (r) => put(r, 'doc/specs/x.js', 'x\n')],
    ['un junction', (r, t2) => { const o = makeTempDir('pignolo-outside-'); return tryLink(t2, o, path.join(r, 'doc/specs/ext')); }],
    ['un commit nuevo', (r) => { put(r, 'otro.txt'); commitAll(r, 'nuevo'); }],
  ]) {
    await t.test(name, (t2) => {
      const repo = base();
      const old = plan(repo, { places: MOVE_SPEC });
      if (mutate(repo, t2) === false) return;
      const h = hashTree(repo);
      if (name === 'un .js') {
        // la detección nueva ya ve un archivo que no es un documento: la respuesta de mover deja de ser válida
        assert.throws(() => plan(repo, { places: MOVE_SPEC }), (e) => e.kind === 'bad-answer');
      } else {
        const fresh = plan(repo, { places: MOVE_SPEC });
        assert.notEqual(fresh.stamp, old.stamp);
      }
      const s = apply(repo, old);
      if (name === 'un commit nuevo') return; // el commit solo cambia el stamp; el CLI compara el stamp antes de aplicar (Task 8)
      assert.notEqual(s.status, 'done');
      assert.equal(hashTree(repo), h);
    });
  }
});

test('movimiento a medias: un fallo al reescribir deja el registro, no revierte solo y el deshacer deja el árbol idéntico', () => {
  const repo = base();
  put(repo, 'guide/dos.md', '[b](../doc/specs/b.md)\n');
  commitAll(repo, 'dos');
  const h = hashTree(repo);
  const before = status(repo);
  const p = plan(repo, { places: MOVE_SPEC });
  assert.equal(p.rewrites.files.length, 2);
  let renames = 0;
  const spy = { ...fs, renameSync(a, b) { if (/\.tmp-/.test(String(a)) && !/moves\.json/.test(String(a))) { renames += 1; if (renames === 2) throw new Error('EBUSY: archivo abierto'); } return fs.renameSync(a, b); } };
  const s = apply(repo, p, { fs: spy });
  assert.equal(s.status, 'refused');
  assert.equal(s.kind, 'partial');
  assert.ok(s.record);
  assert.ok(s.notes.some((n) => n.includes('places.js undo')));
  const rec = JSON.parse(fs.readFileSync(s.record, 'utf8'));
  assert.deepEqual(rec.rewrites.map((r) => r.status).sort(), ['done', 'pending']);
  assert.ok(fs.existsSync(path.join(repo, 'docs/specs/a.md')), 'no se revirtió solo');
  const u = SM.undoMoves({ record: s.record, main: repo });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(hashTree(repo), h);
  assert.equal(status(repo), before);
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo/project.md')));
});

test('el índice sucio en las rutas: refused dirty y cero cambios; aplicar dos veces no cambia nada (already-in-place)', () => {
  const repo = base();
  fs.appendFileSync(path.join(repo, 'doc/specs/a.md'), 'cambio\n');
  const h = hashTree(repo);
  const p = plan(repo, { places: MOVE_SPEC });
  assert.equal(p.decisions[0].refused.reason, 'dirty');
  assert.equal(apply(repo, p).status, 'skipped');
  assert.equal(hashTree(repo), h);

  const repo2 = base();
  const p2 = plan(repo2, { places: MOVE_SPEC });
  assert.equal(apply(repo2, p2).status, 'done');
  const h2 = hashTree(repo2);
  const st2 = status(repo2);
  const again = apply(repo2, p2);
  assert.equal(again.status, 'skipped');
  assert.equal(again.reason, 'already-in-place');
  assert.equal(hashTree(repo2), h2);
  assert.equal(status(repo2), st2);
});

test('dry: la salida no tiene marcas de tiempo ni rutas de registro, es estable y trae willExist', () => {
  const repo = base();
  const h = hashTree(repo);
  const p = plan(repo, { places: MOVE_SPEC });
  const a = apply(repo, p, { dry: true, now: new Date('2026-01-01T00:00:00Z') });
  const b = apply(repo, p, { dry: true, now: new Date('2030-01-01T00:00:00Z') });
  assert.deepEqual(a, b);
  assert.equal(a.status, 'would-do');
  assert.ok(a.willExist.includes('docs/specs/'));
  assert.ok(!JSON.stringify(a).match(/\d{4}-\d{2}-\d{2}T/), 'sin marcas de tiempo');
  assert.ok(!('record' in a));
  assert.equal(hashTree(repo), h);
});
