'use strict';
// Rojo sobre código commiteado por los scripts, en el orden que prescriben las skills (hito 4b):
// daily (paso 12: test de algo que ya existe, parche escrito a mano en <main>/.pignolo/tmp/ y
// sabotage.js sobre el worktree de la tarea, y por qué no antes del implementer) y review (paso 7: un test decorativo se confirma
// porque sigue verde con la rotura, y el ledger lo marca confirmado). Sin agentes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT } = require('./helpers');

const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
// Sin NODE_TEST_CONTEXT: si no, el `node --test` hijo le reporta a esta suite y sale 0.
const ENV = { ...process.env, PIGNOLO_DISABLED: '' };
delete ENV.NODE_TEST_CONTEXT;

const PAGES = "'use strict';\nfunction pageOf(items, page, size) {\n  const start = (page - 1) * size;\n  return items.slice(start, start + size);\n}\nmodule.exports = { pageOf };\n";
const GOOD_TEST = "'use strict';\n// Protects: R1 · Breaks if: pageOf drops the last item of a page\nconst test = require('node:test');\nconst assert = require('node:assert');\nconst { pageOf } = require('../src/pages');\ntest('full page', () => assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 1, 2), [1, 2]));\n";
const DECORATIVE_TEST = GOOD_TEST.replace("test('full page', () => assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 1, 2), [1, 2]));",
  "test('full page', () => {\n  try {\n    assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 1, 2), [1, 2]);\n  } catch (e) {\n    // nothing to check\n  }\n});");
// El parche como lo escribe el orquestador: un hunk, una línea de contexto arriba y abajo.
const BREAK = '--- a/src/pages.js\n+++ b/src/pages.js\n@@ -3,3 +3,3 @@\n   const start = (page - 1) * size;\n-  return items.slice(start, start + size);\n+  return items.slice(start, start + size - 1);\n }\n';

function put(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
function script(name, args, cwd) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { cwd, encoding: 'utf8', env: ENV, timeout: 120000 });
  let json;
  try { json = JSON.parse(r.stdout); } catch (_) { json = undefined; }
  return { status: r.status, json, stderr: r.stderr };
}
function project(testText) {
  const main = makeRepo();
  put(main, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-done: node --test "tests/**/*.test.js"\ntest-paths:\n  - tests/\n---\n');
  put(main, 'src/pages.js', PAGES);
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'C0'], main);
  assert.strictEqual(script('run.js', ['start', '--flow', 'daily', '--cwd', main], main).status, 0);
  const wt = path.join(main, '.pignolo', 'worktrees', 'pages');
  git(['worktree', 'add', '-q', '-b', 'task/daily/2026-09-30-pages', wt, 'HEAD'], main);
  put(wt, 'tests/pages.test.js', testText);
  git(['add', 'tests/pages.test.js'], wt);
  git(['commit', '-q', '-m', 'test: pages'], wt);
  put(main, '.pignolo/tmp/sabotage-pages-1.patch', BREAK);
  return { main, wt, patch: path.join(main, '.pignolo', 'tmp', 'sabotage-pages-1.patch') };
}
const sabotage = (s) => script('sabotage.js', ['--patch', s.patch, '--gate', 'on-done', '--cwd', s.wt], s.main);
const clean = (s) => {
  assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], s.wt), '');
  assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], s.main), '');
};

test('daily paso 12: un test de algo que ya existe da rojo con la rotura (exit 0) y el worktree queda limpio', () => {
  const s = project(GOOD_TEST);
  const r = sabotage(s);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual([r.json.red, r.json.greenBefore, r.json.files], [true, true, ['src/pages.js']]);
  assert.strictEqual(fs.readFileSync(path.join(s.wt, 'src', 'pages.js'), 'utf8'), PAGES);
  clean(s);
});

test('review paso 7: el test decorativo sigue verde con la rotura (exit 1) y el ledger lo confirma', () => {
  const s = project(DECORATIVE_TEST);
  const sha = git(['rev-parse', 'HEAD'], s.wt);
  const r = sabotage(s);
  assert.strictEqual(r.status, 1, r.stderr);
  assert.strictEqual(r.json.red, false);
  clean(s);
  const dir = path.join(s.main, '.pignolo', 'tmp', `review-${sha.slice(0, 7)}`);
  put(dir, 'testability.json', JSON.stringify([{ id: '1', lens: 'testability', location: 'tests/pages.test.js:7', severity: 'BLOCKER', evidence: 'green with the break', repro: BREAK }]));
  const L = path.join(dir, 'ledger.json');
  assert.strictEqual(script('ledger.js', ['build', '--sha', sha, '--level', 'medium', '--out', L, path.join(dir, 'testability.json')], s.main).status, 0);
  const rep = script('ledger.js', ['repro', '--ledger', L, '--id', 'testability-1', '--red'], s.main);
  assert.strictEqual(rep.status, 0, rep.stderr);
  assert.strictEqual(rep.json.finding.status, 'confirmed');
});

// Un test test-first rojo ya commiteado (el normal de una tarea que suma comportamiento) hace que
// el sabotaje corrido antes del implementer dé exit 2 (el comando ya falla sin el parche): por eso
// daily lo corre después del commit del implementer (paso 12).
const FIRST_TEST = "'use strict';\n// Protects: R2 · Breaks if: lastPage no existe\nconst test = require('node:test');\nconst assert = require('node:assert');\nconst { lastPage } = require('../src/pages');\ntest('last page', () => assert.strictEqual(lastPage(5, 2), 3));\n";
const PAGES_IMPL = PAGES.replace('module.exports = { pageOf };\n', 'function lastPage(n, size) {\n  return Math.ceil(n / size);\n}\nmodule.exports = { pageOf, lastPage };\n');

test('daily paso 12: con un test test-first rojo commiteado el sabotaje da exit 2; después del commit del implementer, exit 0', () => {
  const s = project(GOOD_TEST);
  put(s.wt, 'tests/last.test.js', FIRST_TEST);
  git(['add', 'tests/last.test.js'], s.wt);
  git(['commit', '-q', '-m', 'test: last'], s.wt);
  const early = sabotage(s);
  assert.strictEqual(early.status, 2, early.stderr);
  assert.strictEqual(early.json.greenBefore, false);
  clean(s);
  put(s.wt, 'src/pages.js', PAGES_IMPL);
  git(['add', 'src/pages.js'], s.wt);
  git(['commit', '-q', '-m', 'feat: lastPage'], s.wt);
  const late = sabotage(s);
  assert.strictEqual(late.status, 0, late.stderr);
  assert.deepStrictEqual([late.json.red, late.json.greenBefore], [true, true]);
  clean(s);
});

// Hallazgo final 1: el exit 2 que no es un veredicto no puede leerse como "parche rechazado" (en review
// terminaba en --no-red). Solo los rechazos del parche llevan `refused: "patch"`.
test('exit 2 sin veredicto: el comando que ensucia el árbol no lleva refused:patch y los rechazos del parche sí', () => {
  const main = makeRepo();
  put(main, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n  on-done: node gen.js\ntest-paths:\n  - tests/\n---\n');
  put(main, 'gen.js', "require('node:fs').writeFileSync('gen.txt', 'x');\n");
  put(main, 'src/pages.js', PAGES);
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'C0'], main);
  const out = makeTempDir('pignolo-patch-');
  const good = path.join(out, 'p.patch');
  const badPatch = path.join(out, 'bad.patch');
  fs.writeFileSync(good, BREAK);
  const r = script('sabotage.js', ['--patch', good, '--gate', 'on-done', '--cwd', main], main);
  assert.strictEqual(r.status, 2);
  assert.strictEqual(r.json.greenBefore, true);
  assert.strictEqual(r.json.refused, undefined);
  // El árbol quedó sucio: el siguiente sabotaje sale 2 por árbol sucio, tampoco es un rechazo del parche.
  const again = script('sabotage.js', ['--patch', good, '--gate', 'on-done', '--cwd', main], main);
  assert.strictEqual(again.status, 2);
  assert.strictEqual(again.json.refused, undefined);
  // Un parche que no aplica sí es un rechazo del parche.
  fs.unlinkSync(path.join(main, 'gen.txt'));
  fs.writeFileSync(badPatch, BREAK.replace('start + size);', 'nada de esto existe);'));
  const bad = script('sabotage.js', ['--patch', badPatch, '--gate', 'on-done', '--cwd', main], main);
  assert.strictEqual(bad.status, 2);
  assert.strictEqual(bad.json.refused, 'patch');
});
