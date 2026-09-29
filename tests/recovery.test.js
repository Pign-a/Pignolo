'use strict';
// Spec §15 `backup`: después de borrar .git, la receta del README ("Recuperar desde el
// repo sombra") recupera las ramas commiteadas y el trabajo sin commitear byte a byte.
// El test ejecuta los comandos tal como están en el README (no una copia propia), con
// init.defaultBranch=main y core.autocrlf=true en una config de git aislada: es lo que
// trae Git for Windows y lo que rompía la receta anterior (auditoría 3, G4).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, runGuard } = require('./helpers');
const { seedShadow } = require('../plugins/pignolo/lib/git-backup');
const { repoIdForGitDir } = require('../plugins/pignolo/lib/shadow');
const { parseBash } = require('../plugins/pignolo/lib/shell-parse');

const SESSION = 'sesion-rescate';

// Los comandos del bloque que sigue a "Si se borró `.git`" en README.md.
function readmeRecipe() {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('## Recuperar desde el repo sombra'));
  const m = /Si se borró `\.git`[^\n]*\n\n((?: {4}\S.*\n)+)/.exec(section);
  assert.ok(m, 'README.md: falta la receta de "Si se borró `.git`"');
  return m[1].split('\n').filter(Boolean).map((l) => l.slice(4));
}

test('backup: the README recipe rebuilds the repo from the shadow after deleting .git (defaultBranch=main, autocrlf=true)', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'secreto.env\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'ignore'], repo);
  git(['checkout', '-q', '-b', 'feature'], repo);
  fs.writeFileSync(path.join(repo, 'f.txt'), 'rama feature\n');
  git(['add', 'f.txt'], repo);
  git(['commit', '-q', '-m', 'feature'], repo);
  git(['checkout', '-q', 'main'], repo);
  const home = makeTempDir('pignolo-home-');
  seedShadow({ cwd: repo, env: { ...process.env, PIGNOLO_HOME: home }, sessionId: SESSION });

  // Trabajo sin commitear; la guardia (hook real) toma la instantánea antes de un comando.
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo sin commitear\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'archivo nuevo\n');
  const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node limpiar.js' }, cwd: repo, session_id: SESSION }, { PIGNOLO_HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  // Se pierde todo: .git y los archivos con trabajo.
  fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true });
  fs.rmSync(path.join(repo, 'a.txt'));
  fs.rmSync(path.join(repo, 'nuevo.txt'));

  const shadow = path.join(home, 'shadow', `${repoIdForGitDir(path.join(repo, '.git'))}.git`);
  const newest = (prefix) => git(['--git-dir', shadow, 'for-each-ref', '--sort=-refname', '--count=1', '--format=%(refname)', prefix], repo);
  const fecha = newest('refs/pignolo/refs/').split('/')[3];
  const snapshot = newest('refs/pignolo/wip/');
  const config = path.join(makeTempDir(), 'gitconfig');
  fs.writeFileSync(config, '[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = true\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
  // Lo que el humano reemplaza a mano (<…>) se reemplaza en el texto; "$S", ya partido.
  const values = { '<fecha>': fecha, '<ref-de-instantánea>': snapshot, '<rama>': 'main' };
  for (const line of readmeRecipe()) {
    const cmds = parseBash(line.replace(/<fecha>|<ref-de-instantánea>|<rama>/g, (k) => values[k])).filter((c) => !c.sub);
    assert.strictEqual(cmds.length, 1, line);
    const argv = cmds[0].words.map((w) => (w.value === '$S' ? shadow : w.value));
    assert.strictEqual(argv[0], 'git', line);
    execFileSync('git', argv.slice(1), { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  const g = (args) => execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();
  assert.deepStrictEqual(g(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter((b) => !b.startsWith('pignolo-')).sort(), ['feature', 'main']);
  assert.strictEqual(g(['symbolic-ref', 'HEAD']), 'refs/heads/main');
  assert.strictEqual(g(['show', 'feature:f.txt']), 'rama feature');
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'trabajo sin commitear\n', 'bytes exactos, sin CRLF');
  assert.strictEqual(fs.readFileSync(path.join(repo, 'nuevo.txt'), 'utf8'), 'archivo nuevo\n');
  assert.strictEqual(g(['status', '--porcelain']), 'M a.txt\n?? nuevo.txt');
});
