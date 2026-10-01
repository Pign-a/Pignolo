'use strict';
// Holdout en preparación (hito 4b; hallazgo 9 de la revisión final de 4a). El test-writer lo
// escribe solo en el checkout principal (<main>/.pignolo/tmp/holdout/<plan>/), que
// .pignolo/.gitignore ignora: el handback-gate y la compuerta del worktree de la tarea no lo
// ven, ningún otro subagente lo lee y holdout.js save lo saca del repo. En el worktree de la
// tarea no llega ese .gitignore: ahí el holdout entraría al diff (SCOPE) y se niega al escribir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, runLauncher, git, PLUGIN_ROOT } = require('./helpers');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');
const reads = require('../plugins/pignolo/hooks/handlers/private-reads');

const TW = { agent_id: 'a-tw', agent_type: 'pignolo:test-writer' };
const IMPL = { agent_id: 'a-impl', agent_type: 'pignolo:implementer' };

function put(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

function setup() {
  const home = makeTempDir('pignolo-staging-home-');
  const env = { ...process.env, HOME: home, USERPROFILE: home, PIGNOLO_HOME: path.join(home, '.pignolo'), PIGNOLO_DISABLED: '' };
  delete env.NODE_TEST_CONTEXT;
  const main = makeRepo();
  put(main, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-done: node --test\ntest-paths:\n  - tests/\n---\n');
  put(main, 'src/a.js', 'module.exports = 1;\n');
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'C0'], main);
  const script = (name, args, cwd = main) => {
    const r = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', name), ...args], { cwd, encoding: 'utf8', env, timeout: 60000 });
    let json;
    try { json = JSON.parse(r.stdout); } catch (_) { json = undefined; }
    return { status: r.status, json, stderr: r.stderr };
  };
  assert.strictEqual(script('run.js', ['start', '--flow', 'plan', '--cwd', main]).status, 0);
  const wt = path.join(main, '.pignolo', 'worktrees', 'acc');
  git(['worktree', 'add', '-q', '-b', 'task/plan/acc', wt, 'HEAD'], main);
  const base = git(['rev-parse', 'HEAD'], wt);
  const r = script('run.js', ['task', '--id', 'acc', '--worktree', wt, '--base', base, '--file', 'tests/a.test.js', '--agent', 'pignolo:test-writer', '--cwd', main]);
  assert.strictEqual(r.status, 0, r.stderr);
  return { env, main, wt, script };
}

const write = (s, cwd, file, who) => protect.run({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd, tool_input: { file_path: file, content: 'x' }, ...who }, { env: s.env });
const read = (s, cwd, tool, input, who) => reads.run({ hook_event_name: 'PreToolUse', tool_name: tool, cwd, tool_input: input, ...who }, { env: s.env });

test('holdout en preparación: solo en el checkout principal; en el worktree de la tarea se niega al escribir', () => {
  const s = setup();
  const inWt = write(s, s.wt, path.join(s.wt, '.pignolo', 'tmp', 'holdout', 'p1', 'acc.test.js'), TW);
  assert.strictEqual(inWt.exit, 2);
  assert.match(inWt.stderr, /Alternativa:[^\n]*checkout principal/);
  assert.strictEqual(write(s, s.wt, path.join(s.main, '.pignolo', 'tmp', 'holdout', 'p1', 'acc.test.js'), TW).exit, 0);
  assert.strictEqual(write(s, s.wt, path.join(s.wt, 'tests', 'a.test.js'), TW).exit, 0);
});

test('holdout en preparación: el handback-gate acepta al test-writer, save lo saca y git no lo vio nunca', () => {
  const s = setup();
  put(s.wt, 'tests/a.test.js', "'use strict';\n// Protects: R1 · Breaks if: a deja de ser 1\nrequire('node:test')('a', () => require('node:assert').strictEqual(require('../src/a'), 1));\n");
  put(s.main, '.pignolo/tmp/holdout/p1/tests/acc.test.js', "'use strict';\n// Protects: A1 · Breaks if: a deja de ser 1\nrequire('node:test')('acc', () => {});\n");
  assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], s.main), '');
  const stop = runLauncher('handback-gate', {
    hook_event_name: 'SubagentStop', agent_type: 'pignolo:test-writer', agent_id: 'a-tw',
    last_assistant_message: 'informe\nDONE', stop_hook_active: false, cwd: s.wt,
  }, { PIGNOLO_HOME: s.env.PIGNOLO_HOME, HOME: s.env.HOME, USERPROFILE: s.env.USERPROFILE });
  assert.strictEqual(stop.status, 0, stop.stderr);
  assert.strictEqual(s.script('run.js', ['status', '--cwd', s.main]).json.handback.accepted, true);
  const saved = s.script('holdout.js', ['save', '--plan', 'p1', '--from', '.pignolo/tmp/holdout/p1']);
  assert.strictEqual(saved.status, 0, saved.stderr);
  assert.strictEqual(fs.existsSync(path.join(s.main, '.pignolo', 'tmp', 'holdout', 'p1')), false);
  assert.strictEqual(s.script('holdout.js', ['list', '--plan', 'p1']).json.count, 1);
  assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], s.main), '');
});

test('holdout en preparación: el implementer no lo lee (Read, Glob, Grep, Bash); el test-writer sí', () => {
  const s = setup();
  const staged = path.join(s.main, '.pignolo', 'tmp', 'holdout', 'p1', 'tests', 'acc.test.js');
  put(s.main, '.pignolo/tmp/holdout/p1/tests/acc.test.js', 'x\n');
  const dir = path.dirname(staged);
  assert.strictEqual(read(s, s.wt, 'Read', { file_path: staged }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Glob', { pattern: '**/*.js', path: dir }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: dir }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.main, 'Bash', { command: 'cat .pignolo/tmp/holdout/p1/tests/acc.test.js' }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.main, 'PowerShell', { command: 'Get-Content .pignolo\\tmp\\holdout\\p1\\tests\\acc.test.js' }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Read', { file_path: staged }, TW).exit, 0);
  // Buscar en el repo (un ancestro de la preparación) sigue permitido: no es el almacén.
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: s.main }, IMPL).exit, 0);
  assert.strictEqual(read(s, s.wt, 'Read', { file_path: path.join(s.main, 'src', 'a.js') }, IMPL).exit, 0);
  // Hallazgo final 3 (medido con el Grep real): desde .pignolo o .pignolo/tmp, Grep devuelve el contenido de la
  // preparación (la base ya está dentro del .gitignore). Se niega la base, el cwd y el prefijo del glob.
  const tmp = path.join(s.main, '.pignolo', 'tmp');
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: tmp }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: path.join(s.main, '.pignolo') }, IMPL).exit, 2);
  assert.strictEqual(read(s, tmp, 'Grep', { pattern: 'x' }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.main, 'Grep', { pattern: 'x', glob: '.pignolo/tmp/**' }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Glob', { pattern: '**/*.js', path: tmp }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: tmp }, TW).exit, 0);
  // El resto de .pignolo (worktrees) no contiene la preparación: sigue permitido.
  assert.strictEqual(read(s, s.wt, 'Grep', { pattern: 'x', path: path.join(s.main, '.pignolo', 'worktrees') }, IMPL).exit, 0);
});

test('holdout en preparación: la shell no lo alcanza por ruta relativa ni por la forma Git Bash; Glob desde un ancestro es el límite conocido', () => {
  const s = setup();
  put(s.main, '.pignolo/tmp/holdout/p1/tests/acc.test.js', 'x\n');
  const staged = path.join(s.main, '.pignolo', 'tmp', 'holdout', 'p1', 'tests', 'acc.test.js');
  // Desde el worktree de la tarea (<main>/.pignolo/worktrees/acc), donde daily hace cd "<wt>" && ...
  assert.strictEqual(read(s, s.wt, 'Bash', { command: 'cat ../../tmp/holdout/p1/tests/acc.test.js' }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Bash', { command: `cat "${staged.split(path.sep).join('/').replace(/^([a-zA-Z]):/, '/$1')}"` }, IMPL).exit, 2);
  assert.strictEqual(read(s, s.wt, 'Bash', { command: 'cat ../../tmp/holdout/p1/tests/acc.test.js' }, TW).exit, 0);
  assert.strictEqual(read(s, s.wt, 'Bash', { command: 'cat src/a.js ../../project.md' }, IMPL).exit, 0);
  // Límite conocido (medido): Glob no respeta el .gitignore de .pignolo; desde un ancestro lista
  // los NOMBRES de la preparación (no su contenido: Read sigue negado). Lo acota que la preparación
  // dura hasta holdout.js save, sin otro subagente en vuelo (Global Constraints).
  assert.strictEqual(read(s, s.main, 'Glob', { pattern: '**/*.test.js', path: s.main }, IMPL).exit, 0);
});
