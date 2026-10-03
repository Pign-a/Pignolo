'use strict';
// Reglas del init y el setup rápidos que la revisión (mutaciones M9, M22, M24, M28, M29) encontró sin test: la marca del blanco no se
// escribe en preview, nada se aplica antes de la pantalla y la regla del sí sigue escrita. Sin agentes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git, PLUGIN_ROOT } = require('./helpers');
const { readSkill } = require('./skill-forms');

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.js');
const BLANK = ['ignores', 'gitattributes', 'reflog', 'skeleton'];
const MARK = ['.pignolo', 'tmp', 'init-blank.json'];
const run = (script, args, cwd, home) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, PIGNOLO_HOME: home, CLAUDE_CONFIG_DIR: makeTempDir('pignolo-rr-cfg-') } });
const plan = () => { const f = path.join(makeTempDir('pignolo-rr-plan-'), 'plan.json'); fs.writeFileSync(f, JSON.stringify({ v: 1, approved: BLANK, answers: {}, proposal: {} })); return f; };

test('M9: preview en un blanco no escribe la marca; apply sí', () => {
  const d = makeTempDir('pignolo-rr-');
  git(['init', '-q', '-b', 'main'], d);
  const home = makeTempDir('pignolo-rr-home-');
  const f = plan();
  const a = run(INIT, ['apply', '--plan', f, '--cwd', d], d, home);
  assert.equal(a.status, 0, a.stderr);
  const mark = path.join(d, ...MARK);
  assert.ok(fs.existsSync(mark), 'apply deja la marca');
  fs.unlinkSync(mark);
  const p = run(INIT, ['preview', '--plan', f, '--cwd', d], d, home);
  assert.equal(p.status, 0, p.stderr);
  assert.ok(!fs.existsSync(mark), 'preview no debe escribir la marca');
});

test('setup: permissions --apply no corre antes de la pantalla y la pantalla cuenta las reglas MCP', () => {
  const t = readSkill('setup').text;
  const fast = t.slice(t.indexOf('## Fast flow'), t.indexOf('## Review point by point'));
  const screen = fast.indexOf('**One screen**');
  assert.ok(screen > 0);
  assert.ok(!fast.slice(0, screen).includes('--apply'), 'nada se aplica antes de la pantalla');
  assert.ok(fast.indexOf('--apply') > screen, 'el flujo rápido aplica después de la pantalla');
  assert.match(fast, /`mcpAsk`/);
  const home = makeTempDir('pignolo-rr-home-');
  const cfg = makeTempDir('pignolo-rr-cfg-');
  const r = spawnSync(process.execPath, [SETUP, 'permissions', '--target', 'user'], { encoding: 'utf8', env: { ...process.env, PIGNOLO_HOME: home, CLAUDE_CONFIG_DIR: cfg, HOME: cfg, USERPROFILE: cfg } });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(Number.isInteger(j.mcpAsk) && j.mcpAsk >= 1, 'mcpAsk cuenta las reglas ask de MCP');
  assert.equal(j.applied, false);
});

test('init: preview antes de la pantalla y apply solo después, tanto en el blanco como en el flujo rápido', () => {
  const t = readSkill('init').text;
  const blank = t.slice(t.indexOf('## Blank project'), t.indexOf('## Fast flow'));
  assert.ok(blank.indexOf('init.js preview') > 0 && blank.indexOf('init.js preview') < blank.indexOf('Ask ONE yes/no question'), 'el blanco muestra el preview y después pregunta');
  assert.ok(blank.indexOf('On yes: `init.js apply') > blank.indexOf('Ask ONE yes/no question'), 'el blanco aplica solo tras el sí');
  const fast = t.slice(t.indexOf('## Fast flow'), t.indexOf('## Review point by point'));
  const screen = fast.indexOf('**One screen**');
  assert.ok(fast.indexOf('init.js preview') > 0 && fast.indexOf('init.js preview') < screen, 'preview antes de la pantalla');
  assert.ok(!fast.slice(0, screen).includes('init.js apply'), 'nada se aplica antes de la pantalla');
  assert.ok(fast.indexOf('init.js apply') > screen);
});

test('la regla del sí explícito sigue escrita en init y en setup, y el sí del selector vale solo para lo mostrado', () => {
  for (const name of ['init', 'setup']) {
    const t = readSkill(name).text;
    assert.match(t, /\*\*Explicit yes\.\*\* Nothing is written without the human's explicit yes in their own turn/, name);
    assert.match(t, /counts as that yes only for the exact (?:plan|setup) shown on that screen/, name);
  }
});

test('RI-01: un enlace o junction con nombre de herramienta (.claude) no es blanco; con otra capitalización, la carpeta real sí', () => {
  const { blankProject, hasCodeOrManifest } = require(path.join(PLUGIN_ROOT, 'lib', 'init-blank.js'));
  const d = makeTempDir('pignolo-rr-');
  const elsewhere = makeTempDir('pignolo-rr-else-');
  fs.writeFileSync(path.join(elsewhere, 'a.py'), 'print(1)\n');
  try { fs.symlinkSync(elsewhere, path.join(d, '.claude'), 'junction'); } catch (_) { return; }
  assert.equal(blankProject({ root: d }).blank, false, 'una junction no es la carpeta de la herramienta');
  const e = makeTempDir('pignolo-rr-');
  fs.mkdirSync(path.join(e, '.CLAUDE'));
  fs.mkdirSync(path.join(e, 'DOCS', 'Specs'), { recursive: true });
  fs.writeFileSync(path.join(e, 'DOCS', 'Specs', 'README.md'), '# x\n');
  assert.equal(blankProject({ root: e }).blank, true);
  assert.equal(hasCodeOrManifest({ root: e }), false);
  fs.writeFileSync(path.join(e, 'DOCS', 'Specs', 'idea.md'), '# idea\n');
  assert.equal(hasCodeOrManifest({ root: e }), false, 'un documento no es código');
  fs.mkdirSync(path.join(e, '.scripts'));
  fs.writeFileSync(path.join(e, '.scripts', 'b.py'), 'print(1)\n');
  assert.equal(hasCodeOrManifest({ root: e }), true, 'un script oculto es código');
});
