'use strict';
// Detección de proyecto en blanco (plan 2026-10-02, Tarea 1). Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git } = require('./helpers');
const { blankProject } = require('../plugins/pignolo/lib/init-blank');

const INIT = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'init.js');
const write = (cwd, rel, text = 'x\n') => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
function freshRepo() {
  const d = makeTempDir('pignolo-blank-');
  git(['init', '-q', '-b', 'main'], d);
  return d;
}
function commitAll(repo) {
  git(['add', '-A'], repo);
  git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'c'], repo);
}

const TABLE = [
  ['recién git init', () => {}, { blank: true, reason: 'empty' }],
  ['README + .gitignore + .claude/settings.local.json', (d) => { write(d, 'README.md'); write(d, '.gitignore'); write(d, '.claude/settings.local.json', '{}'); }, { blank: true, reason: 'only-plain-docs' }],
  ['solo archivos ocultos', (d) => { write(d, '.gitignore'); write(d, '.claude/settings.local.json', '{}'); write(d, '.gitattributes'); }, { blank: true, reason: 'empty' }],
  ['un archivo oculto desconocido (.github/workflows/ci.yml) no es blanco', (d) => { write(d, '.gitignore'); write(d, '.github/workflows/ci.yml'); }, { blank: false, reason: 'has-files', first: '.github' }],
  ['.GIT y .Claude con otra capitalización', (d) => { write(d, '.Claude/settings.json', '{}'); write(d, '.GitIgnore'); }, { blank: true, reason: 'empty' }],
  ['un .js', (d) => { write(d, 'index.js'); }, { blank: false, reason: 'has-files', first: 'index.js' }],
  ['un package.json', (d) => { write(d, 'package.json', '{}'); }, { blank: false, reason: 'has-files', first: 'package.json' }],
  ['un package.json ilegible', (d) => { write(d, 'package.json', '{no'); }, { blank: false, reason: 'has-files', first: 'package.json' }],
  ['docs/ con markdown de usuario', (d) => { write(d, 'docs/guia.md'); }, { blank: false, reason: 'has-files', first: 'docs/guia.md' }],
  ['README + docs/ con markdown', (d) => { write(d, 'README.md'); write(d, 'docs/a/b.md'); }, { blank: false, reason: 'has-files', first: 'docs/a/b.md' }],
  ['sin commits pero con código', (d) => { write(d, 'src/main.py'); }, { blank: false, reason: 'has-files', first: 'src' }],
  ['con commits y solo README', (d) => { write(d, 'README.md'); commitAll(d); }, { blank: true, reason: 'only-plain-docs' }],
  ['código ignorado por .gitignore', (d) => { write(d, '.gitignore', 'src/\n'); write(d, 'src/a.js'); }, { blank: false, reason: 'has-files', first: 'src' }],
  ['carpeta src/ vacía', (d) => { fs.mkdirSync(path.join(d, 'src')); }, { blank: false, reason: 'has-files', first: 'src' }],
  ['otra capitalización: readme.MD y License', (d) => { write(d, 'readme.MD'); write(d, 'License'); write(d, 'LICENSE.txt'); }, { blank: true, reason: 'only-plain-docs' }],
  ['README con bytes que no son UTF-8 (no se lee)', (d) => { fs.writeFileSync(path.join(d, 'README.md'), Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0x00])); }, { blank: true, reason: 'only-plain-docs' }],
  ['nombre con acento fuera de la lista', (d) => { write(d, 'ñ.txt'); }, { blank: false, reason: 'has-files', first: 'ñ.txt' }],
  ['un Makefile', (d) => { write(d, 'Makefile'); }, { blank: false, reason: 'has-files', first: 'Makefile' }],
  ['CLAUDE.md solo no es un documento simple', (d) => { write(d, 'CLAUDE.md'); }, { blank: false, reason: 'has-files', first: 'CLAUDE.md' }],
  ['node_modules en la raíz', (d) => { write(d, 'node_modules/x/index.js'); }, { blank: false, reason: 'has-files', first: 'node_modules' }],
  ['solo el esqueleto de init', (d) => { for (const p of ['docs/specs', 'docs/plans', 'docs/research', 'design', 'local']) write(d, `${p}/README.md`); write(d, 'local/.gitignore', '*\n'); }, { blank: true, reason: 'empty' }],
  ['esqueleto con otra capitalización de la carpeta', (d) => { write(d, 'Docs/Specs/README.md'); }, { blank: true, reason: 'empty' }],
  ['esqueleto más un archivo propio', (d) => { write(d, 'docs/specs/README.md'); write(d, 'docs/specs/idea.md'); }, { blank: false, reason: 'has-files', first: 'docs/specs/idea.md' }],
  ['design/ con una imagen', (d) => { write(d, 'design/logo.png'); }, { blank: false, reason: 'has-files', first: 'design/logo.png' }],
];

for (const [name, setup, want] of TABLE) {
  test(`blankProject: ${name}`, () => {
    const d = freshRepo();
    setup(d);
    const r = blankProject({ root: d });
    assert.equal(r.blank, want.blank);
    assert.equal(r.reason, want.reason);
    assert.equal(r.firstFile, want.first === undefined ? null : want.first);
  });
}

test('blankProject: un enlace (junction) a una carpeta en la raíz o dentro del esqueleto impide el blanco', (t) => {
  const d = freshRepo();
  const target = makeTempDir('pignolo-blank-target-');
  try { fs.symlinkSync(target, path.join(d, 'lib'), 'junction'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  assert.deepEqual(blankProject({ root: d }), { blank: false, reason: 'has-files', firstFile: 'lib' });
  const e = freshRepo();
  fs.mkdirSync(path.join(e, 'docs'));
  fs.symlinkSync(target, path.join(e, 'docs', 'specs'), 'junction');
  assert.equal(blankProject({ root: e }).blank, false);
});

test('blankProject: un enlace a un archivo en la raíz impide el blanco', (t) => {
  const d = freshRepo();
  const target = path.join(makeTempDir('pignolo-blank-target-'), 'a.txt');
  fs.writeFileSync(target, 'x');
  try { fs.symlinkSync(target, path.join(d, 'README.md'), 'file'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  assert.equal(blankProject({ root: d }).blank, false);
});

test('blankProject: la raíz ilegible lanza (el que llama falla cerrado, no adivina)', () => {
  assert.throws(() => blankProject({ root: path.join(makeTempDir('pignolo-blank-'), 'no-existe') }));
});

test('blankProject: un repo con el esqueleto y un manifiesto no es blanco, y alcanzado por una junction da lo mismo', (t) => {
  const d = freshRepo();
  write(d, 'docs/specs/README.md');
  const link = path.join(makeTempDir('pignolo-blank-link-'), 'via');
  try { fs.symlinkSync(d, link, 'junction'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  assert.equal(blankProject({ root: link }).blank, true);
  write(d, 'go.mod', 'module x\n');
  assert.equal(blankProject({ root: link }).blank, false);
});

test('detect (CLI): un git init trae blank true y un repo con código blank false', () => {
  const run = (cwd) => {
    const r = spawnSync(process.execPath, [INIT, 'detect', '--cwd', cwd], { encoding: 'utf8', env: process.env, timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const d = freshRepo();
  let j = run(d);
  assert.equal(j.blank, true);
  assert.equal(j.blankReason, 'empty');
  assert.equal(j.blankFirstFile, null);
  assert.equal(j.detection.type, null);
  write(d, 'index.js');
  j = run(d);
  assert.equal(j.blank, false);
  assert.equal(j.blankReason, 'has-files');
  assert.equal(j.blankFirstFile, 'index.js');
});

test('blankProject: un enlace llamado README.md dentro del esqueleto no cuenta como el README del esqueleto', (t) => {
  const d = freshRepo();
  const target = path.join(makeTempDir('pignolo-blank-target-'), 'a.txt');
  fs.writeFileSync(target, 'x');
  fs.mkdirSync(path.join(d, 'docs', 'specs'), { recursive: true });
  try { fs.symlinkSync(target, path.join(d, 'docs', 'specs', 'README.md'), 'file'); } catch (e) { t.skip(`no se pudo crear el enlace: ${e.code}`); return; }
  assert.deepEqual(blankProject({ root: d }), { blank: false, reason: 'has-files', firstFile: 'docs/specs/README.md' });
});
