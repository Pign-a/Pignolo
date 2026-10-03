'use strict';
// Hallazgos de la revisión del init rápido y el repo en blanco (rama core/init-rapido, d559187).
// Cada test FALLA con el código revisado y pasa con el comportamiento correcto. No arreglan nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git, PLUGIN_ROOT } = require('./helpers');
const { readSkill } = require('./skill-forms');
const { blankProject } = require(path.join(PLUGIN_ROOT, 'lib', 'init-blank.js'));
const { deriveNext } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const BLANK = ['ignores', 'gitattributes', 'reflog', 'skeleton'];
const write = (cwd, rel, text = 'x\n') => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const envOf = (home) => ({ ...process.env, PIGNOLO_HOME: home, CLAUDE_CONFIG_DIR: makeTempDir('pignolo-rvcfg-') });
function repo() {
  const d = makeTempDir('pignolo-rv-');
  git(['init', '-q', '-b', 'main'], d);
  return d;
}
function planFile(obj) {
  const f = path.join(makeTempDir('pignolo-rvplan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}
function cli(args, cwd, home) {
  const r = spawnSync(process.execPath, [INIT, ...args, '--cwd', cwd], { encoding: 'utf8', env: envOf(home), timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stderr: r.stderr, json };
}
// Un repo en blanco al que init ya le aplicó el camino en blanco completo (deja la marca).
function initializedBlank() {
  const d = repo();
  const home = makeTempDir('pignolo-rvhome-');
  const r = cli(['apply', '--plan', planFile({ v: 1, approved: BLANK, answers: {}, proposal: {} })], d, home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(d, '.pignolo', 'tmp', 'init-blank.json')), 'el fixture debe dejar la marca');
  return { d, home };
}

// RI-01 (importante). lib/init-blank.js:18,25,39: todo nombre con punto se salta sin mirar, en la raíz y dentro del esqueleto.
// Un repo cuyo código vive en carpetas o archivos ocultos (dotfiles, scripts en .scripts/) se trata como blanco y, como
// preview/apply niegan todo paso fuera de los cuatro del blanco, ese repo ya no se puede configurar nunca.
test('RI-01: código que vive solo en carpetas o archivos ocultos no es un proyecto en blanco', () => {
  const tooling = repo();
  write(tooling, '.gitignore');
  write(tooling, '.claude/settings.local.json', '{}');
  assert.equal(blankProject({ root: tooling }).blank, true, 'lo oculto de las herramientas (.git, .claude, .gitignore) sigue siendo blanco');

  const dotfiles = repo();
  write(dotfiles, '.config/nvim/init.lua', 'print(1)\n');
  write(dotfiles, '.bashrc', 'echo hi\n');
  assert.equal(blankProject({ root: dotfiles }).blank, false, 'un repo de dotfiles tiene código');

  const scripts = repo();
  write(scripts, 'README.md');
  write(scripts, '.scripts/build.py', 'print(1)\n');
  assert.equal(blankProject({ root: scripts }).blank, false, '.scripts/build.py es código');

  const inSkeleton = repo();
  write(inSkeleton, 'docs/specs/README.md');
  write(inSkeleton, 'docs/.vitepress/config.js', 'export default {};\n');
  assert.equal(blankProject({ root: inSkeleton }).blank, false, 'docs/.vitepress/config.js es código');
});

test('RI-01: un repo con código solo en lo oculto no queda sin salida: init admite project-md', () => {
  const d = repo();
  write(d, '.scripts/build.py', 'print(1)\n');
  const home = makeTempDir('pignolo-rvhome-');
  const r = cli(['preview', '--plan', planFile({ v: 1, approved: [...BLANK, 'project-md'], answers: { piiPatterns: [] }, proposal: { type: 'script' } })], d, home);
  assert.notEqual(r.json && r.json.kind, 'blank-project');
  assert.equal(r.status, 0, r.stderr);
});

// RI-02 (importante). lib/next.js:116-124 avisa con `blankProject().blank === false`, pero "no blanco" no es "hay código o un
// manifiesto": el primer documento que el humano escribe en el esqueleto que init le acaba de crear (docs/specs/idea.md), o un
// CHANGELOG.md, dispara en cada SessionStart "ahora tiene código o un manifiesto; corré /pignolo:init". Si hace caso, init
// escribe un project.md sin tipo ni compuertas y el aviso queda apagado para cuando aparezca el código.
test('RI-02: escribir un documento en el esqueleto (sin código ni manifiesto) no dispara el aviso init-blank-ready', () => {
  const { d, home } = initializedBlank();
  write(d, 'docs/specs/2026-10-02-idea.md', '# idea\n');
  assert.equal(deriveNext({ cwd: d, env: { PIGNOLO_HOME: home } }).kind, 'nothing');
});

test('RI-02: un CHANGELOG.md en la raíz tampoco es "código o un manifiesto"', () => {
  const { d, home } = initializedBlank();
  write(d, 'CHANGELOG.md', '# cambios\n');
  assert.equal(deriveNext({ cwd: d, env: { PIGNOLO_HOME: home } }).kind, 'nothing');
  // y el aviso sigue saliendo cuando sí aparece código
  write(d, 'main.py', 'print(1)\n');
  assert.equal(deriveNext({ cwd: d, env: { PIGNOLO_HOME: home } }).kind, 'init-blank-ready');
});

// RI-03 (importante). scripts/init.js:396,409: en un blanco el mensaje del commit propuesto dice "esqueleto de pignolo (carpetas y
// .gitattributes)" pero `nextCommit.files` solo trae `.gitattributes`: la skill (paso 14) muestra esa lista y el commit del
// "esqueleto" sale sin ninguna carpeta del esqueleto.
test('RI-03: en un blanco, el commit propuesto incluye los README del esqueleto que su mensaje nombra (y nunca local/)', () => {
  const { d, home } = initializedBlank();
  const v = cli(['verify'], d, home);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.json.blank, true);
  assert.match(v.json.nextCommit.message, /carpetas/);
  const files = v.json.nextCommit.files.map((f) => f.replace(/\\/g, '/'));
  assert.ok(!files.some((f) => f.startsWith('local/')), 'local/ nunca se commitea');
  for (const f of ['docs/specs/README.md', 'docs/plans/README.md', 'docs/research/README.md', 'design/README.md']) {
    assert.ok(files.some((x) => x === f || x === `${path.posix.dirname(f)}/`), `${f} falta en nextCommit.files (${files.join(', ')})`);
  }
});

// RI-04 (importante). skills/setup/SKILL.md:21: la unión con main perdió el arreglo a13dd6b. La pantalla del flujo rápido dice
// "push, merge and deleting branches ask first", pero templates/permissions.json ya no pone push ni merge en ask (main dice
// "push and merge do not ask, but a subagent cannot push or merge onto main"). El sí del selector cubre un plan mal descrito.
test('RI-04: setup no promete que push o merge pregunten si la plantilla de permisos no los pone en ask', () => {
  const perms = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions;
  const asks = (verb) => perms.ask.some((r) => r.includes(`git ${verb} `) || r.includes(`git ${verb})`));
  assert.equal(asks('push') || asks('merge'), false, 'la plantilla volvió a poner push o merge en ask: revisar este test');
  const t = readSkill('setup').text;
  assert.doesNotMatch(t, /push, merge and deleting branches ask first/);
  assert.match(t, /push and merge do not ask/);
});
