'use strict';
// Hito 8d, Task 2: movimientos seguros (guarda de rutas, guardas por ítem, registro write-ahead, deshacer).
// Repos reales de makeRepo(), PIGNOLO_HOME temporal (helpers.js); todo "árbol idéntico" es hashTree antes y después.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, hashTree, PLUGIN_ROOT } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { newPlan } = require('../plugins/pignolo/lib/plan-state');
const { pignoloHome } = require('../plugins/pignolo/lib/home');
const { backupFile } = require('../plugins/pignolo/lib/init-actions');
const SM = require('../plugins/pignolo/lib/safe-move');

const { isLinkOrOutside, walkTree, planMoves, applyMoves, undoMoves, makeRun } = SM;
const LINUX = process.platform === 'linux';

// ---------------------------------------------------------------- utilidades

const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const status = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const cfgOf = (repo) => readProjectConfig({ root: repo });

function base() {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md', '# a\n');
  put(repo, 'doc/specs/b.md', 'b\r\nmezcla\n');
  commitAll(repo);
  return repo;
}
const ITEM = { kind: 'dir', from: 'doc/specs', to: 'docs/specs' };
const verbOf = (args) => args.find((a) => !a.startsWith('-'));

function recorder(main, { failOn } = {}) {
  const real = makeRun(main);
  const calls = [];
  let mvCount = 0;
  const run = (args, cwd, o) => {
    calls.push(args);
    if (failOn && verbOf(args) === 'mv') { mvCount += 1; if (failOn(mvCount, args)) { const e = new Error('fatal: simulated failure (Permission denied)'); e.status = 128; throw e; } }
    return real(args, cwd, o);
  };
  return { run, calls };
}

function plan(repo, items = [ITEM], extra = {}) {
  return planMoves({ main: repo, items, config: cfgOf(repo), ...extra });
}

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

function records(repo) {
  const root = path.join(pignoloHome(), 'init-backup');
  const out = [];
  const real = fs.realpathSync(repo);
  const walk = (d) => {
    let names = [];
    try { names = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const n of names) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) walk(p);
      else if (n.name === 'moves.json') {
        const rec = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (fs.realpathSync(rec.main) === real) out.push(p);
      }
    }
  };
  walk(root);
  return out.sort();
}

const apply = (repo, items = [ITEM], extra = {}) => {
  const p = plan(repo, items, { run: extra.run });
  return applyMoves({ main: repo, plan: p, config: cfgOf(repo), ...extra });
};
const same = (a, b, msg) => assert.equal(a, b, msg);

// ---------------------------------------------------------------- junction (la base de los demás)

test('isLinkOrOutside y walkTree: un junction real se ve como enlace y no se atraviesa', async (t) => {
  const repo = makeRepo();
  const outside = makeTempDir('pignolo-outside-');
  put(outside, 'o.txt', 'afuera\n');
  put(repo, 'real/dentro.md', 'x\n');
  if (!tryLink(t, outside, path.join(repo, 'enlace'))) return;
  if (!tryLink(t, outside, path.join(repo, 'real', 'ext'))) return;

  assert.deepEqual(isLinkOrOutside(repo, 'enlace'), { bad: true, reason: 'link-in-path', at: 'enlace' });
  assert.deepEqual(isLinkOrOutside(repo, 'enlace/o.txt'), { bad: true, reason: 'link-in-path', at: 'enlace' });
  assert.deepEqual(isLinkOrOutside(repo, 'enlace/nuevo/hondo'), { bad: true, reason: 'link-in-path', at: 'enlace' });
  assert.deepEqual(isLinkOrOutside(repo, 'real/dentro.md'), { bad: false });
  assert.deepEqual(isLinkOrOutside(repo, 'no/existe/todavia'), { bad: false });
  assert.equal(isLinkOrOutside(repo, '../afuera').reason, 'outside-project');
  assert.equal(isLinkOrOutside(repo, 'C:/x').reason, 'outside-project');

  const w = walkTree(repo, 'real');
  assert.deepEqual(w.files.map((f) => f.path), ['real/dentro.md']);
  assert.deepEqual(w.links, ['real/ext']);
  assert.ok(!w.files.some((f) => f.path.includes('o.txt')), 'no entra al enlace');
  assert.equal(w.tooBig, false);
});

test('el código de este hito no usa readdirSync recursivo ni borra archivos', () => {
  const dir = path.join(PLUGIN_ROOT, 'lib');
  for (const name of ['safe-move.js', 'ref-scan.js', 'places-detect.js', 'init-skeleton.js', 'init-adapt.js']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/readdirSync\([^)]*recursive\s*:\s*true/.test(src), `${name}: readdirSync con recursive: true`);
    const del = (src.match(/\b(rmSync|unlinkSync)\s*\(/g) || []).length;
    assert.ok(del === 0 || (name === 'safe-move.js' && del === 1), `${name}: borra archivos (solo el temporal propio de writeAtomic)`);
    if (name !== 'safe-move.js') assert.ok(!/\brmdirSync\s*\(/.test(src), `${name}: rmdirSync fuera de safe-move`);
  }
});

// ---------------------------------------------------------------- movimiento feliz

test('feliz: directorio versionado doc/specs -> docs/specs con git mv, registro completo antes del primer mv', () => {
  const repo = base();
  const before = status(repo);
  assert.equal(before, '');
  let atMv = null;
  const real = makeRun(repo);
  const calls = [];
  const run = (args, cwd, o) => {
    calls.push(args);
    if (verbOf(args) === 'mv' && !atMv) { const rs = records(repo); atMv = { count: rs.length, rec: rs.length ? JSON.parse(fs.readFileSync(rs[0], 'utf8')) : null }; }
    return real(args, cwd, o);
  };
  const r = apply(repo, [ITEM], { run, mapEdits: [{ kind: 'spec', before: null, after: 'docs/specs/' }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const mv = calls.filter((a) => verbOf(a) === 'mv');
  assert.equal(mv.length, 1);
  assert.deepEqual(mv[0], ['mv', '--', 'doc/specs', 'docs/specs']);
  assert.ok(status(repo).split('\n').every((l) => l.startsWith('R')), status(repo));
  assert.equal(fs.readFileSync(path.join(repo, 'docs/specs/b.md'), 'utf8'), 'b\r\nmezcla\n');
  assert.equal(fs.readFileSync(path.join(repo, 'docs/specs/a.md'), 'utf8'), '# a\n');
  assert.ok(!fs.existsSync(path.join(repo, 'doc/specs')));
  assert.deepEqual(r.createdDirs, ['docs']);
  assert.ok(atMv && atMv.count === 1, 'moves.json existía antes del primer mv');
  assert.equal(atMv.rec.status, 'applying');
  assert.equal(atMv.rec.items.length, 1);
  assert.deepEqual(atMv.rec.createdDirs, ['docs']);
  assert.ok(Array.isArray(atMv.rec.rewrites));
  assert.deepEqual(atMv.rec.mapEdits, [{ kind: 'spec', before: null, after: 'docs/specs/' }]);
  assert.equal(JSON.parse(fs.readFileSync(r.record, 'utf8')).status, 'applied');
});

test('feliz: sin versionar (rename), parcialmente versionado con un ignorado de la propia carpeta y archivos sueltos', () => {
  const repo = makeRepo();
  put(repo, 'sv/u.md', 'u\n');
  const r1 = recorder(repo);
  const a = apply(repo, [{ kind: 'dir', from: 'sv', to: 'docs/sv' }], { run: r1.run });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(r1.calls.filter((c) => verbOf(c) === 'mv').length, 0, 'sin versionar: renameSync, no git mv');
  assert.equal(fs.readFileSync(path.join(repo, 'docs/sv/u.md'), 'utf8'), 'u\n');

  put(repo, 'doc/mixto/t.md', 't\n');
  put(repo, 'doc/mixto/.gitignore', '*.pdf\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'm'], repo);
  put(repo, 'doc/mixto/nuevo.md', 'n\n');
  put(repo, 'doc/mixto/oculto.pdf', 'pdf\n');
  const r2 = recorder(repo);
  const b = apply(repo, [{ kind: 'dir', from: 'doc/mixto', to: 'docs/mixto' }], { run: r2.run });
  assert.equal(b.ok, true, JSON.stringify(b));
  for (const f of ['t.md', '.gitignore', 'nuevo.md', 'oculto.pdf']) assert.ok(fs.existsSync(path.join(repo, 'docs/mixto', f)), f);
  assert.equal(r2.calls.filter((c) => verbOf(c) === 'mv').length, 1);

  put(repo, 'spec.md', 'tracked\n');
  commitAll(repo, 'f');
  put(repo, 'suelto.md', 'untracked\n');
  const r3 = recorder(repo);
  const c = apply(repo, [{ kind: 'file', from: 'spec.md', to: 'docs/specs/spec.md' }, { kind: 'file', from: 'suelto.md', to: 'docs/specs/suelto.md' }], { run: r3.run });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(r3.calls.filter((x) => verbOf(x) === 'mv').length, 1, 'versionado: git mv; sin versionar: rename');
  assert.ok(fs.existsSync(path.join(repo, 'docs/specs/spec.md')) && fs.existsSync(path.join(repo, 'docs/specs/suelto.md')));
});

// ---------------------------------------------------------------- guardas

test('una guarda por caso: reason exacto y nada movido', async (t) => {
  const cases = [];
  const add = (name, reason, setup, items = [ITEM], opt = {}) => cases.push({ name, reason, setup, items, opt });

  add('not-found', 'not-found', () => {}, [{ kind: 'dir', from: 'doc/nada', to: 'docs/nada' }]);
  add('dest-exists (archivo)', 'dest-exists', (r) => put(r, 'docs/specs', 'soy un archivo\n'));
  add('dest-exists (carpeta con contenido)', 'dest-exists', (r) => put(r, 'docs/specs/otro.md', 'o\n'));
  add('dest-exists (carpeta vacía)', 'dest-exists', (r) => fs.mkdirSync(path.join(r, 'docs/specs'), { recursive: true }));
  add('dest-inside-source', 'dest-inside-source', () => {}, [{ kind: 'dir', from: 'doc/specs', to: 'doc/specs/sub' }]);
  add('source-inside-dest', 'source-inside-dest', () => {}, [{ kind: 'dir', from: 'doc/specs', to: 'doc' }]);
  add('dirty (origen)', 'dirty', (r) => fs.appendFileSync(path.join(r, 'doc/specs/a.md'), 'cambio\n'), [ITEM], { detail: 'a.md' });
  add('dirty (destino modificado)', 'dirty', (r) => {
    put(r, 'docs/specs/z.md', 'z\n');
    commitAll(r, 'z');
    fs.rmSync(path.join(r, 'docs'), { recursive: true });
  }, [{ kind: 'dir', from: 'doc/specs', to: 'docs/specs' }], { detail: 'z.md' });
  add('contains-non-doc (.js)', 'contains-non-doc', (r) => put(r, 'doc/specs/x.js', 'x\n'));
  add('contains-non-doc (.json)', 'contains-non-doc', (r) => put(r, 'doc/specs/x.json', '{}\n'));
  add('contains-non-doc (Makefile)', 'contains-non-doc', (r) => put(r, 'doc/specs/Makefile', 'all:\n'));
  add('reserved-source (.github)', 'reserved-source', (r) => { put(r, '.github/guia.md', 'g\n'); commitAll(r, 'g'); }, [{ kind: 'dir', from: '.github', to: 'docs/gh' }]);
  add('reserved-source (src)', 'reserved-source', (r) => { put(r, 'src/guia.md', 'g\n'); commitAll(r, 'g'); }, [{ kind: 'dir', from: 'src', to: 'docs/src' }]);
  add('merge-in-progress', 'merge-in-progress', (r) => fs.writeFileSync(path.join(r, '.git', 'MERGE_HEAD'), 'a'.repeat(40) + '\n'));
  add('index-locked', 'index-locked', (r) => fs.writeFileSync(path.join(r, '.git', 'index.lock'), ''));
  add('long-path', 'long-path', () => {}, [{ kind: 'dir', from: 'doc/specs', to: `docs/${'x'.repeat(200)}/specs` }]);
  add('batch-conflict', 'batch-conflict', (r) => { put(r, 'doc/plans/p.md', 'p\n'); commitAll(r, 'p'); },
    [{ kind: 'dir', from: 'doc/specs', to: 'docs/x' }, { kind: 'dir', from: 'doc/plans', to: LINUX ? 'docs/x' : 'Docs/X' }]);
  add('dest-ignored', 'dest-ignored', (r) => { put(r, '.gitignore', 'docs/\n'); commitAll(r, 'ig'); });

  for (const c of cases) {
    await t.test(c.name, () => {
      const repo = base();
      c.setup(repo);
      const h = hashTree(repo);
      const rec = recorder(repo);
      const p = planMoves({ main: repo, items: c.items, config: cfgOf(repo), run: rec.run });
      assert.equal(p.ok, false);
      const refused = p.items.filter((i) => i.status === 'refused');
      assert.ok(refused.length >= 1, JSON.stringify(p.items));
      assert.equal(refused[refused.length - 1].reason, c.reason, JSON.stringify(p.items));
      if (c.opt.detail) assert.ok(String(refused[0].detail).includes(c.opt.detail), refused[0].detail);
      const r = applyMoves({ main: repo, plan: p, config: cfgOf(repo), run: rec.run });
      assert.equal(r.ok, false);
      assert.ok(rec.calls.length > 0, 'el registro de run no está vacío');
      assert.equal(rec.calls.filter((a) => verbOf(a) === 'mv').length, 0, 'no se movió nada');
      assert.equal(hashTree(repo), h, 'árbol idéntico');
    });
  }
});

test('matches-declared-paths: declarado frena y nombra el patrón; sin project.md se acepta', () => {
  const repo = base();
  assert.equal(plan(repo).ok, true, 'sin project.md, doc/specs -> docs/specs se acepta (A8D-01)');
  put(repo, '.pignolo/project.md', '---\ntype: docs\ntest-paths:\n  - "*spec*"\n---\n');
  const p = plan(repo);
  assert.equal(p.ok, false);
  assert.equal(p.items[0].reason, 'matches-declared-paths');
  assert.equal(p.items[0].detail, '*spec*');
  put(repo, '.pignolo/project.md', '---\ntype: docs\ntest-paths:\n  - "**/*.spec.ts"\n---\n');
  assert.equal(plan(repo).ok, true);
});

test('too-big: más de 2000 archivos (fs inyectado)', () => {
  const repo = base();
  const orig = fs;
  const fake = {
    ...orig,
    readdirSync(p, o) {
      if (o && o.withFileTypes && path.resolve(String(p)) === path.resolve(repo, 'doc/specs')) {
        return Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}.md`, isSymbolicLink: () => false, isDirectory: () => false }));
      }
      return orig.readdirSync(p, o);
    },
  };
  const w = walkTree(repo, 'doc/specs', fake);
  assert.equal(w.tooBig, true);
  const p = planMoves({ main: repo, items: [ITEM], config: cfgOf(repo), fs: fake });
  assert.equal(p.items[0].reason, 'too-big');
});

test('nested-repo: .git adentro, submódulo y worktree registrado', () => {
  const run = (cwd, args) => git(args, cwd);
  // .git adentro
  let repo = base();
  fs.mkdirSync(path.join(repo, 'doc/specs/sub'), { recursive: true });
  run(path.join(repo, 'doc/specs/sub'), ['init', '-q', '-b', 'main']);
  let h = hashTree(repo);
  assert.equal(plan(repo).items[0].reason, 'nested-repo');
  assert.equal(hashTree(repo), h);

  // submódulo (gitlink 160000)
  repo = base();
  const other = makeRepo();
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', other, 'doc/specs/sub'], repo);
  commitAll(repo, 'sub');
  const gm = fs.readFileSync(path.join(repo, '.gitmodules'), 'utf8');
  assert.ok(git(['ls-files', '-s', '--', 'doc/specs/sub'], repo).startsWith('160000'));
  h = hashTree(repo);
  const rec = recorder(repo);
  const p = planMoves({ main: repo, items: [ITEM], config: cfgOf(repo), run: rec.run });
  assert.equal(p.items[0].reason, 'nested-repo');
  assert.equal(applyMoves({ main: repo, plan: p, config: cfgOf(repo), run: rec.run }).ok, false);
  assert.equal(fs.readFileSync(path.join(repo, '.gitmodules'), 'utf8'), gm);
  assert.equal(hashTree(repo), h);

  // worktree registrado adentro
  repo = base();
  git(['worktree', 'add', '-q', '-b', 'wtb', path.join(repo, 'doc/specs/wt')], repo);
  assert.equal(plan(repo).items[0].reason, 'nested-repo');
});

test('ignorados: una regla de afuera frena y cita la regla; una de adentro viaja con la carpeta', async (t) => {
  const forms = [
    ['regla en el .gitignore de la raíz', (r) => { put(r, '.gitignore', 'doc/specs/*.pdf\n'); }, 'doc/specs/*.pdf'],
    ['regla en .git/info/exclude', (r) => { fs.appendFileSync(path.join(r, '.git', 'info', 'exclude'), 'doc/specs/*.pdf\n'); }, 'doc/specs/*.pdf'],
    ['glob doc/spec*/*.pdf', (r) => { put(r, '.gitignore', 'doc/spec*/*.pdf\n'); }, 'doc/spec*/*.pdf'],
    ['regla de un .gitignore en un ancestro', (r) => { put(r, 'doc/.gitignore', 'specs/*.pdf\n'); }, 'specs/*.pdf'],
  ];
  for (const [name, setup, rule] of forms) {
    await t.test(name, () => {
      const repo = base();
      setup(repo);
      if (git(['status', '--porcelain'], repo)) commitAll(repo, 'ig');
      put(repo, 'doc/specs/x.pdf', 'pdf\n');
      assert.ok(git(['ls-files', '-o', '-i', '--exclude-standard'], repo).includes('x.pdf'));
      const h = hashTree(repo);
      const p = plan(repo);
      assert.equal(p.items[0].reason, 'ignored-by-outside-rule', JSON.stringify(p.items));
      assert.ok(String(p.items[0].detail).includes(rule), p.items[0].detail);
      assert.equal(apply(repo).ok, false);
      assert.equal(hashTree(repo), h);
    });
  }
  await t.test('regla dentro del origen: se acepta y sigue ignorando tras mover', () => {
    const repo = base();
    put(repo, 'doc/specs/.gitignore', '*.pdf\n');
    commitAll(repo, 'ig');
    put(repo, 'doc/specs/x.pdf', 'pdf\n');
    const r = apply(repo);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(git(['check-ignore', '-v', 'docs/specs/x.pdf'], repo).includes('docs/specs/.gitignore'));
    assert.ok(!git(['add', '-A', '-n'], repo).includes('x.pdf'));
  });
});

test('mayúsculas: Docs/ real frena (case-collision) y el renombre solo de mayúsculas es case-only', (t) => {
  if (LINUX) { t.skip('el sistema de archivos distingue mayúsculas: no hay colisión'); return; }
  const repo = base();
  put(repo, 'Docs/x.md', 'x\n');
  put(repo, 'Readme.md', 'r\n');
  commitAll(repo, 'case');
  const h = hashTree(repo);
  const rec = recorder(repo);
  const p = planMoves({ main: repo, items: [ITEM], config: cfgOf(repo), run: rec.run });
  assert.equal(p.items[0].reason, 'case-collision');
  const p2 = planMoves({ main: repo, items: [{ kind: 'dir', from: 'Docs', to: 'docs' }, { kind: 'file', from: 'Readme.md', to: 'README.md' }], config: cfgOf(repo), run: rec.run });
  assert.deepEqual(p2.items.map((i) => i.reason), ['case-only', 'case-only']);
  assert.equal(applyMoves({ main: repo, plan: p2, config: cfgOf(repo), run: rec.run }).ok, false);
  assert.equal(rec.calls.filter((a) => verbOf(a) === 'mv').length, 0);
  assert.equal(hashTree(repo), h);
});

test('junction en movimientos: origen enlace, enlace adentro y padre del destino enlace (git mv escribiría afuera)', async (t) => {
  await t.test('(a) el origen es un junction', (t2) => {
    const repo = base();
    const outside = makeTempDir('pignolo-outside-');
    put(outside, 'o.md', 'afuera\n');
    put(repo, 'doc/ext/.keep', '');
    fs.rmSync(path.join(repo, 'doc/ext'), { recursive: true });
    if (!tryLink(t2, outside, path.join(repo, 'doc/ext'))) return;
    const h = hashTree(outside);
    const rec = recorder(repo);
    const p = planMoves({ main: repo, items: [{ kind: 'dir', from: 'doc/ext', to: 'docs/ext' }], config: cfgOf(repo), run: rec.run });
    assert.equal(p.items[0].reason, 'link-in-path');
    assert.equal(applyMoves({ main: repo, plan: p, config: cfgOf(repo), run: rec.run }).ok, false);
    assert.equal(hashTree(outside), h);
    assert.equal(rec.calls.filter((a) => verbOf(a) === 'mv').length, 0);
  });
  await t.test('(b) un origen real contiene un junction', (t2) => {
    const repo = base();
    const outside = makeTempDir('pignolo-outside-');
    put(outside, 'o.md', 'afuera\n');
    if (!tryLink(t2, outside, path.join(repo, 'doc/specs/ext'))) return;
    const h = hashTree(outside);
    const p = plan(repo);
    assert.equal(p.items[0].reason, 'link-in-path');
    assert.equal(apply(repo).ok, false);
    assert.equal(hashTree(outside), h);
    assert.ok(fs.existsSync(path.join(repo, 'doc/specs/a.md')));
  });
  await t.test('(c) el padre existente del destino es un junction', (t2) => {
    const repo = base();
    const outside = makeTempDir('pignolo-outside-');
    put(outside, 'o.md', 'afuera\n');
    if (!tryLink(t2, outside, path.join(repo, 'docs'))) return;
    const h = hashTree(outside);
    const rec = recorder(repo);
    const p = planMoves({ main: repo, items: [ITEM], config: cfgOf(repo), run: rec.run });
    assert.equal(p.items[0].reason, 'link-in-path');
    assert.equal(applyMoves({ main: repo, plan: p, config: cfgOf(repo), run: rec.run }).ok, false);
    assert.equal(hashTree(outside), h, 'nada se creó afuera');
    assert.equal(rec.calls.filter((a) => verbOf(a) === 'mv').length, 0);
  });
});

// ---------------------------------------------------------------- movimiento a medias

function two() {
  const repo = base();
  put(repo, 'doc/plans/p.md', 'p\n');
  commitAll(repo, 'p');
  return { repo, items: [ITEM, { kind: 'dir', from: 'doc/plans', to: 'docs/plans' }] };
}

test('archivo bloqueado: el segundo mv falla (128): se detiene, no revierte solo, deja el registro partial', () => {
  const { repo, items } = two();
  const rec = recorder(repo, { failOn: (n) => n === 2 });
  const r = apply(repo, items, { run: rec.run });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'partial');
  assert.equal(r.failed.item, 'doc/plans');
  assert.match(r.failed.error, /cerr[aá] el programa/);
  assert.deepEqual(r.done, ['doc/specs']);
  assert.deepEqual(r.pending, ['doc/plans']);
  const rcd = JSON.parse(fs.readFileSync(r.record, 'utf8'));
  assert.equal(rcd.status, 'partial');
  assert.deepEqual(rcd.items.map((i) => i.status), ['done', 'pending']);
  assert.ok(fs.existsSync(path.join(repo, 'docs/specs/a.md')) && fs.existsSync(path.join(repo, 'doc/plans/p.md')));
  const mvs = rec.calls.filter((a) => verbOf(a) === 'mv');
  assert.ok(mvs.every((a) => a[2].startsWith('doc/')), 'ningún mv de reversión');
});

test('archivo bloqueado de verdad (sin compartir lectura)', (t) => {
  t.skip('Node abre los archivos compartiendo todo en Windows: no se puede bloquear uno desde un test sin un proceso externo');
});

test('un fallo en el primer ítem: kind failed y el árbol idéntico', () => {
  const { repo, items } = two();
  const h = hashTree(repo);
  const rec = recorder(repo, { failOn: (n) => n === 1 });
  const r = apply(repo, items, { run: rec.run });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'failed');
  assert.equal(hashTree(repo), h);
  assert.equal(JSON.parse(fs.readFileSync(r.record, 'utf8')).status, 'undone');
  assert.equal(status(repo), '');
});

// ---------------------------------------------------------------- deshacer

test('el deshacer funciona tras un git mv real sin commitear (A8D-02) y no lo niega un .js adentro', () => {
  const repo = base();
  const h = hashTree(repo);
  const before = status(repo);
  const r = apply(repo);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(status(repo).includes('R'), 'git status muestra renombres');
  const u = undoMoves({ record: r.record, main: repo });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(status(repo), before);
  assert.equal(hashTree(repo), h, 'incluye que docs/ ya no existe y que doc/ sigue');
  assert.ok(!fs.existsSync(path.join(repo, 'docs')));

  const r2 = apply(repo);
  assert.equal(r2.ok, true);
  put(repo, 'docs/specs/agregado.js', 'x\n');
  const u2 = undoMoves({ record: r2.record, main: repo });
  assert.equal(u2.ok, true, JSON.stringify(u2));
  assert.ok(fs.existsSync(path.join(repo, 'doc/specs/agregado.js')));
});

test('deshacer decide por el disco, es idempotente y retomable', async (t) => {
  await t.test('(a) registro en pending con el movimiento ya hecho', () => {
    const repo = base();
    const h = hashTree(repo);
    const r = apply(repo);
    const rcd = JSON.parse(fs.readFileSync(r.record, 'utf8'));
    rcd.status = 'applying';
    rcd.items[0].status = 'pending';
    fs.writeFileSync(r.record, JSON.stringify(rcd));
    assert.equal(undoMoves({ record: r.record, main: repo }).ok, true);
    assert.equal(hashTree(repo), h);
  });
  await t.test('(b) un segundo undo no cambia nada', () => {
    const repo = base();
    const r = apply(repo);
    assert.equal(undoMoves({ record: r.record, main: repo }).ok, true);
    const h = hashTree(repo);
    const u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.ok, true);
    assert.equal(u.already, 'undone');
    assert.equal(hashTree(repo), h);
  });
  await t.test('(c) from y to existiendo a la vez, o ninguno', () => {
    let repo = base();
    let r = apply(repo);
    fs.mkdirSync(path.join(repo, 'doc/specs'), { recursive: true });
    let h = hashTree(repo);
    let u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.refused, 'source-exists');
    assert.equal(hashTree(repo), h);
    repo = base();
    r = apply(repo);
    fs.renameSync(path.join(repo, 'docs/specs'), path.join(repo, 'docs/otro'));
    h = hashTree(repo);
    u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.refused, 'dest-missing');
    assert.equal(hashTree(repo), h);
  });
  await t.test('(d) registro de otro repo', () => {
    const repoA = base();
    const repoB = base();
    const r = apply(repoA);
    const u = undoMoves({ record: r.record, main: repoB });
    assert.equal(u.refused, 'wrong-repo');
    assert.ok(fs.existsSync(path.join(repoA, 'docs/specs/a.md')));
  });
  await t.test('(e) un fallo a mitad del deshacer se completa con otro undo', () => {
    const { repo, items } = two();
    const h = hashTree(repo);
    const r = apply(repo, items);
    assert.equal(r.ok, true, JSON.stringify(r));
    const rec = recorder(repo, { failOn: (n) => n === 2 });
    const u = undoMoves({ record: r.record, main: repo, run: rec.run });
    assert.equal(u.ok, false);
    assert.equal(u.kind, 'partial');
    assert.deepEqual(u.pending, ['doc/specs']);
    const u2 = undoMoves({ record: r.record, main: repo });
    assert.equal(u2.ok, true, JSON.stringify(u2));
    assert.equal(hashTree(repo), h);
  });
  await t.test('(f) un createdDirs que ya no está vacío no se toca y se informa', () => {
    const repo = base();
    const r = apply(repo);
    put(repo, 'docs/otro.md', 'mio\n');
    const u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.deepEqual(u.notEmpty, ['docs']);
    assert.ok(fs.existsSync(path.join(repo, 'docs/otro.md')));
  });
});

test('reescritos y deshacer: modified-since, restaurar en la ruta nueva y enlace en to', async (t) => {
  const setup = () => {
    const repo = base();
    const file = path.join(repo, 'doc/specs/a.md');
    const original = fs.readFileSync(file);
    const rewritten = Buffer.from('# a reescrito\n');
    const sha = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');
    const rewrites = [{ file: 'docs/specs/a.md', fileBefore: 'doc/specs/a.md', sha256Before: sha(original), sha256After: sha(rewritten) }];
    const r = apply(repo, [ITEM], { rewrites });
    assert.equal(r.ok, true, JSON.stringify(r));
    const now = path.join(repo, 'docs/specs/a.md');
    const backup = backupFile({ file: now, main: repo });
    fs.writeFileSync(now, rewritten);
    SM.updateRecord(r.record, (rc) => { rc.rewrites[0].backup = backup; rc.rewrites[0].status = 'done'; });
    return { repo, r, original };
  };
  await t.test('un hash que no es ni antes ni después: modified-since y nada movido', () => {
    const { repo, r } = setup();
    fs.writeFileSync(path.join(repo, 'docs/specs/a.md'), 'otra cosa\n');
    const h = hashTree(repo);
    const u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.refused, 'modified-since');
    assert.deepEqual(u.files, ['docs/specs/a.md']);
    assert.equal(hashTree(repo), h);
  });
  await t.test('el hash de después: se restaura desde el respaldo en la ruta nueva y se mueve', () => {
    const { repo, r, original } = setup();
    const h0 = hashTree(repo);
    assert.notEqual(h0, '');
    const u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.deepEqual(u.restored, ['docs/specs/a.md']);
    assert.ok(fs.readFileSync(path.join(repo, 'doc/specs/a.md')).equals(original));
    assert.ok(!fs.existsSync(path.join(repo, 'docs')));
  });
  await t.test('un enlace en to: link-in-path sin mover', (t2) => {
    const { repo, r } = setup();
    const outside = makeTempDir('pignolo-outside-');
    fs.rmSync(path.join(repo, 'docs'), { recursive: true });
    if (!tryLink(t2, outside, path.join(repo, 'docs'))) return;
    const h = hashTree(outside);
    const u = undoMoves({ record: r.record, main: repo });
    assert.equal(u.refused, 'link-in-path');
    assert.equal(hashTree(outside), h);
  });
});

test('vista previa vieja: un .js, un junction o un archivo nuevo aparecidos después del plan no dejan mover nada', async (t) => {
  await t.test('un .js', () => {
    const repo = base();
    const p = plan(repo);
    assert.equal(p.ok, true);
    put(repo, 'doc/specs/x.js', 'x\n');
    const h = hashTree(repo);
    const r = applyMoves({ main: repo, plan: p, config: cfgOf(repo) });
    assert.equal(r.ok, false);
    assert.ok(['stale-plan', 'contains-non-doc'].includes(r.refused), r.refused);
    assert.equal(hashTree(repo), h);
  });
  await t.test('un archivo nuevo (stale-plan)', () => {
    const repo = base();
    const p = plan(repo);
    put(repo, 'doc/specs/c.md', 'c\n');
    const h = hashTree(repo);
    const r = applyMoves({ main: repo, plan: p, config: cfgOf(repo) });
    assert.equal(r.refused, 'stale-plan');
    assert.equal(hashTree(repo), h);
  });
  await t.test('un junction', (t2) => {
    const repo = base();
    const p = plan(repo);
    const outside = makeTempDir('pignolo-outside-');
    if (!tryLink(t2, outside, path.join(repo, 'doc/specs/ext'))) return;
    const r = applyMoves({ main: repo, plan: p, config: cfgOf(repo) });
    assert.equal(r.ok, false);
    assert.equal(r.refused, 'link-in-path');
    assert.ok(fs.existsSync(path.join(repo, 'doc/specs/a.md')));
  });
});

test('plan abierto y corrida activa (con los archivos reales de plan-state y run.js)', () => {
  const repo = base();
  put(repo, '.pignolo/.gitignore', 'state/\nrun.json\n');
  const created = newPlan({ main: repo, plan: 'mi-plan', request: 'algo', spec: 'doc/specs/a.md' });
  assert.equal(created.ok, true);
  let p = plan(repo);
  assert.equal(p.items[0].reason, 'plan-open');
  assert.ok(String(p.items[0].detail).includes('mi-plan'));

  // un plan cerrado ya no frena
  const file = path.join(repo, '.pignolo/state/plans/mi-plan/plan.json');
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  obj.stage = 'closed';
  fs.writeFileSync(file, JSON.stringify(obj));
  assert.equal(plan(repo).ok, true);

  // run.js start real + una tarea que usa un archivo del origen en el checkout principal
  const res = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'run.js'), 'start', '--flow', 'daily', '--cwd', repo], { encoding: 'utf8', env: process.env });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(plan(repo).ok, true, 'una corrida sin tarea en el origen no frena');
  const rj = path.join(repo, '.pignolo/run.json');
  const run = JSON.parse(fs.readFileSync(rj, 'utf8'));
  run.task = { id: 't1', worktree: repo, base: 'abc', files: ['doc/specs/a.md'], agents: [] };
  fs.writeFileSync(rj, JSON.stringify(run));
  p = plan(repo);
  assert.equal(p.items[0].reason, 'run-active');
  fs.writeFileSync(rj, 'esto no es json');
  assert.equal(plan(repo).items[0].reason, 'run-active', 'un run.json ilegible falla cerrado');
});

test('ningún flujo ejecuta commit, add, push, reset, checkout, clean ni stash; cada mv trae un origen y un destino', () => {
  const { repo, items } = two();
  const rec = recorder(repo);
  const r = apply(repo, items, { run: rec.run });
  assert.equal(r.ok, true, JSON.stringify(r));
  const u = undoMoves({ record: r.record, main: repo, run: rec.run });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.ok(rec.calls.length > 0);
  const allowed = new Set(['status', 'ls-files', 'rev-parse', 'mv', 'worktree', 'check-ignore', 'config', 'diff']);
  for (const a of rec.calls) assert.ok(allowed.has(verbOf(a)), `verbo fuera de la lista: ${a.join(' ')}`);
  const mvs = rec.calls.filter((a) => verbOf(a) === 'mv');
  assert.equal(mvs.length, 4);
  for (const a of mvs) assert.equal(a.filter((x) => x !== 'mv' && x !== '--').length, 2, a.join(' '));
});
