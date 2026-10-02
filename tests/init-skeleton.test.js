'use strict';
// Hito 8d, Task 5: el esqueleto de carpetas (README, local/ privada, sin .gitkeep, sin salir del proyecto).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { resolvePlaces } = require('../plugins/pignolo/lib/places');
const { applySkeleton, skeletonPlan } = require('../plugins/pignolo/lib/init-skeleton');

const LINUX = process.platform === 'linux';
const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const status = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);

function newRepo() {
  const dir = makeTempDir('pignolo-new-');
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'pignolo-test'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  return dir;
}
const placesOf = (repo, over = {}) => ({ ...resolvePlaces(readProjectConfig({ root: repo })).places, ...over });
const skeleton = (repo, extra = {}) => applySkeleton({ root: repo, places: placesOf(repo, extra.over), answers: extra.answers || { public: false }, ...extra });
const allFiles = (dir) => {
  const out = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
    }
  }(dir, ''));
  return out.sort();
};

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

test('repo nuevo: las seis carpetas con README, ningún .gitkeep, design/approved y .pignolo no se crean', () => {
  const repo = newRepo();
  const s = skeleton(repo);
  assert.equal(s.status, 'done', JSON.stringify(s));
  for (const d of ['docs/specs', 'docs/plans', 'docs/research', 'docs/references', 'design', 'local']) {
    assert.ok(fs.existsSync(path.join(repo, d, 'README.md')), d);
  }
  assert.ok(!allFiles(repo).some((f) => f.endsWith('.gitkeep')));
  assert.ok(!fs.existsSync(path.join(repo, 'design/approved')));
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo')));
  for (const f of allFiles(repo).filter((x) => x.endsWith('README.md'))) {
    const text = fs.readFileSync(path.join(repo, f), 'utf8');
    assert.ok(text.split('\n').length <= 7 && /^[\x00-\x7F]*$/.test(text), `${f} ≤ 6 líneas, en inglés`);
  }
});

test('reference solo con answers.public === false: público o ausente no la crea (falla cerrada)', () => {
  for (const answers of [{ public: true }, {}]) {
    const repo = newRepo();
    const s = skeleton(repo, { answers });
    assert.ok(!fs.existsSync(path.join(repo, 'docs/references')));
    assert.ok(fs.existsSync(path.join(repo, 'docs/specs/README.md')));
    assert.ok(s.notes.some((n) => n.includes('local/')), s.notes.join('|'));
  }
});

test('local/ nueva: .gitignore con exactamente "*\\n" y no aparece en git status', () => {
  const repo = newRepo();
  skeleton(repo);
  assert.equal(fs.readFileSync(path.join(repo, 'local/.gitignore'), 'utf8'), '*\n');
  assert.ok(!status(repo).includes('local/'), status(repo));
  assert.ok(git(['check-ignore', '-v', 'local/README.md'], repo).includes('local/.gitignore'));
});

test('local/ con versionados, .gitignore ajeno o archivo: tracked-files, gitignore-exists, not-a-dir', async (t) => {
  await t.test('versionado', () => {
    const repo = makeRepo();
    put(repo, 'local/x.txt');
    commitAll(repo);
    const h = hashTree(path.join(repo, 'local'));
    const s = skeleton(repo, { answers: {} });
    assert.deepEqual(s.refused.find((r) => r.kind === 'private'), { kind: 'private', reason: 'tracked-files', files: ['local/x.txt'] });
    assert.equal(hashTree(path.join(repo, 'local')), h);
  });
  await t.test('Local/x.txt versionado con core.ignorecase=true', () => {
    const repo = makeRepo();
    git(['config', 'core.ignorecase', 'true'], repo);
    put(repo, 'Local/x.txt');
    commitAll(repo);
    const s = skeleton(repo, { answers: {} });
    assert.equal(s.refused.find((r) => r.kind === 'private').reason, 'tracked-files');
    assert.ok(!fs.existsSync(path.join(repo, 'local/.gitignore')) || !LINUX);
  });
  await t.test('.gitignore con otro contenido', () => {
    const repo = makeRepo();
    put(repo, 'local/.gitignore', 'solo-esto\n');
    const s = skeleton(repo, { answers: {} });
    assert.equal(s.refused.find((r) => r.kind === 'private').reason, 'gitignore-exists');
    assert.equal(fs.readFileSync(path.join(repo, 'local/.gitignore'), 'utf8'), 'solo-esto\n');
  });
  await t.test('local es un archivo', () => {
    const repo = makeRepo();
    put(repo, 'local', 'soy un archivo\n');
    const s = skeleton(repo, { answers: {} });
    assert.equal(s.refused.find((r) => r.kind === 'private').reason, 'not-a-dir');
    assert.equal(fs.readFileSync(path.join(repo, 'local'), 'utf8'), 'soy un archivo\n');
  });
});

test('local/ existente sin versionados y sin .gitignore: solo se escribe el .gitignore y el dry lista lo que dejará de verse', () => {
  const repo = makeRepo();
  put(repo, 'local/notas.txt', 'mis notas\n');
  const before = hashTree(repo);
  const dry = skeletonPlan({ root: repo, places: placesOf(repo), answers: {} });
  assert.deepEqual(dry.hidden, ['local/notas.txt']);
  assert.equal(hashTree(repo), before, 'el dry no escribe');
  const s = skeleton(repo, { answers: {} });
  assert.equal(s.status, 'done');
  assert.deepEqual(allFiles(path.join(repo, 'local')).sort(), ['.gitignore', 'notas.txt']);
  assert.equal(fs.readFileSync(path.join(repo, 'local/notas.txt'), 'utf8'), 'mis notas\n');
  assert.equal(fs.readFileSync(path.join(repo, 'local/.gitignore'), 'utf8'), '*\n');
});

test('private adoptada: ignorada por la raíz no escribe; sin regla se le escribe su .gitignore; con versionados se niega', async (t) => {
  const over = { private: { kind: 'private', path: 'private/', source: 'declared' } };
  await t.test('ignorada por una regla de la raíz', () => {
    const repo = makeRepo();
    put(repo, '.gitignore', '/private/\n');
    commitAll(repo);
    put(repo, 'private/s.txt');
    const h = hashTree(path.join(repo, 'private'));
    const s = skeleton(repo, { over, answers: {} });
    assert.ok(!s.refused.some((r) => r.kind === 'private'));
    assert.equal(hashTree(path.join(repo, 'private')), h);
  });
  await t.test('sin ninguna regla y sin versionados', () => {
    const repo = makeRepo();
    put(repo, 'private/s.txt');
    skeleton(repo, { over, answers: {} });
    assert.equal(fs.readFileSync(path.join(repo, 'private/.gitignore'), 'utf8'), '*\n');
  });
  await t.test('con versionados', () => {
    const repo = makeRepo();
    put(repo, 'private/s.txt');
    commitAll(repo);
    const s = skeleton(repo, { over, answers: {} });
    assert.equal(s.refused.find((r) => r.kind === 'private').reason, 'tracked-files');
    assert.ok(!fs.existsSync(path.join(repo, 'private/.gitignore')));
  });
});

test('una carpeta existente con contenido no se toca ni recibe README; Docs/ existente da case-collision', (t) => {
  const repo = makeRepo();
  put(repo, 'docs/specs/a.md', 'a\n');
  const h = hashTree(path.join(repo, 'docs/specs'));
  const s = skeleton(repo);
  assert.ok(s.skipped.some((x) => x.path === 'docs/specs/' && x.reason === 'exists'));
  assert.equal(hashTree(path.join(repo, 'docs/specs')), h);
  assert.ok(!fs.existsSync(path.join(repo, 'docs/specs/README.md')));
  if (LINUX) { t.skip('el sistema de archivos distingue mayúsculas: no hay colisión'); return; }
  const repo2 = makeRepo();
  put(repo2, 'Docs/x.md');
  const s2 = skeleton(repo2);
  assert.ok(s2.refused.some((r) => r.reason === 'case-collision'), JSON.stringify(s2.refused));
  assert.ok(!fs.existsSync(path.join(repo2, 'Docs/specs')));
});

test('junction: docs o local como enlace a afuera -> link-in-path y nada se crea afuera', async (t) => {
  for (const name of ['docs', 'local']) {
    await t.test(name, (t2) => {
      const repo = makeRepo();
      const outside = makeTempDir('pignolo-outside-');
      put(outside, 'o.txt', 'afuera\n');
      if (!tryLink(t2, outside, path.join(repo, name))) return;
      const h = hashTree(outside);
      const s = skeleton(repo);
      assert.ok(s.refused.length >= 1);
      assert.ok(s.refused.some((r) => r.reason === 'link-in-path'));
      assert.equal(hashTree(outside), h, 'nada se creó afuera');
    });
  }
});

test('wx: un README que aparece entre el chequeo y la escritura no se pisa', () => {
  const repo = newRepo();
  let armed = true;
  const spy = {
    ...fs,
    writeFileSync(f, text, o) {
      if (armed && String(f).replace(/\\/g, '/').endsWith('docs/specs/README.md')) { armed = false; fs.writeFileSync(f, 'del humano\n'); }
      return fs.writeFileSync(f, text, o);
    },
  };
  const s = applySkeleton({ root: repo, places: placesOf(repo), answers: { public: false }, fs: spy });
  assert.equal(fs.readFileSync(path.join(repo, 'docs/specs/README.md'), 'utf8'), 'del humano\n');
  assert.ok(s.skipped.some((x) => x.path === 'docs/specs/README.md' && x.reason === 'exists'));
});

test('idempotencia: la segunda corrida no hace nada y un README borrado a mano no se recrea', () => {
  const repo = newRepo();
  skeleton(repo);
  const st = status(repo);
  const h = hashTree(repo);
  const s2 = skeleton(repo);
  assert.equal(s2.status, 'skipped');
  assert.deepEqual(s2.created, []);
  assert.equal(hashTree(repo), h);
  assert.equal(status(repo), st);
  fs.rmSync(path.join(repo, 'docs/plans/README.md'));
  skeleton(repo);
  assert.ok(!fs.existsSync(path.join(repo, 'docs/plans/README.md')));
});

test('dry: lo mismo con would-do y sin escribir; willExist y leftKinds', () => {
  const repo = newRepo();
  const before = hashTree(repo);
  const d = skeletonPlan({ root: repo, places: placesOf(repo), answers: { public: false } });
  assert.equal(d.status, 'would-do');
  assert.ok(d.created.includes('docs/specs/') && d.created.includes('local/.gitignore'));
  assert.equal(hashTree(repo), before);
  const w = skeletonPlan({ root: repo, places: placesOf(repo), answers: { public: false }, willExist: ['docs/specs/'] });
  assert.ok(!w.created.includes('docs/specs/'));
  assert.ok(w.created.includes('docs/plans/'));
  const l = skeletonPlan({ root: repo, places: placesOf(repo), answers: { public: false }, leftKinds: ['spec'] });
  assert.ok(!l.created.includes('docs/specs/'));
  assert.ok(l.notes.some((n) => n.startsWith('spec:')));
});
