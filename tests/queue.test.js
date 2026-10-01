'use strict';
// Cola de integración (lib/queue.js, scripts/queue.js). Parte 1: sincronizar, prever, mergear, clasificar conflictos.
// La Task 6 agrega sus casos (pre-merge sellado, avance, lock, revert) al final de este mismo archivo.
//
// Paso 1 (R-5, A7-09), confirmado el 2026-10-01 con git 2.52.0.windows.1 (experimento descartable):
//   git merge-tree --write-tree --name-only --no-messages <a> <b>
//   limpio             -> exit 0, stdout = solo el OID del árbol
//   conflicto          -> exit 1, stdout = el OID y luego las rutas en conflicto (una por línea)
//   ref inexistente    -> exit 1, stdout VACÍO, stderr "merge-tree: nope - not something we can merge"
// El código de salida solo no distingue conflicto de error: parseMergeTree exige exit 1 Y primera línea OID.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const Q = require('../plugins/pignolo/lib/queue');

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'queue.js');
const cli = (cwd, args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').pop()) : undefined, stderr: r.stderr };
};
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const commitAll = (dir, msg) => { git(['add', '-A'], dir); git(['commit', '-q', '-m', msg], dir); return git(['rev-parse', 'HEAD'], dir); };

// main con index.js (con un hueco para importaciones) y cfg.js; int/p en su punta. HEAD queda en main.
function fixture(extraFiles = {}) {
  const main = makeRepo();
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n'); // como lo deja run.js start
  write(main, 'index.js', "// top\n\nmodule.exports = 1;\n");
  write(main, 'cfg.js', 'v = 0\n');
  for (const [f, t] of Object.entries(extraFiles)) write(main, f, t);
  commitAll(main, 'base');
  git(['branch', 'int/p'], main);
  return main;
}
// Rama de tarea desde `from` con los cambios `files` (un commit con trailers).
function taskBranch(main, name, files, from = 'int/p') {
  git(['checkout', '-q', '-b', name, from], main);
  for (const [f, t] of Object.entries(files)) write(main, f, t);
  commitAll(main, `tarea ${name}\n\nAgent: pignolo:implementer\nGates: on-done PASS`);
  git(['checkout', '-q', 'main'], main);
  return name;
}
const importIn = (line) => `// top\n${line}\n\nmodule.exports = 1;\n`;
const queueWt = (main) => path.join(main, '.pignolo', 'worktrees', '_queue', 'p');
const clean = (wt) => assert.strictEqual(git(['status', '--porcelain'], wt), '', 'la cola queda limpia') ;
const noMerge = (wt) => assert.throws(() => git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], wt), 'sin merge en curso');

test('syncQueue deja queue/p en la punta ACTUAL de int/p (R-4) y se puede repetir', () => {
  const main = fixture();
  const a = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(a.branch, 'queue/p');
  assert.strictEqual(a.intSha, git(['rev-parse', 'int/p'], main));
  assert.strictEqual(git(['rev-parse', 'queue/p'], main), a.intSha);
  // un commit de estado nuevo en int/p entre merges
  git(['checkout', '-q', 'int/p'], main);
  write(main, '.pignolo/state/x.md', 'estado\n');
  const state = commitAll(main, 'estado');
  git(['checkout', '-q', 'main'], main);
  const b = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(b.intSha, state);
  assert.strictEqual(git(['rev-parse', 'queue/p'], main), state);
  assert.doesNotThrow(() => Q.syncQueue({ main, plan: 'p' }));
});

test('syncQueue: la worktree sucia da queue-dirty y no se toca; una ruta ocupada no se pisa; una vacía sin registrar se reutiliza', () => {
  const main = fixture();
  Q.syncQueue({ main, plan: 'p' });
  const wt = queueWt(main);
  write(wt, 'index.js', 'cambio a mano\n');
  assert.throws(() => Q.syncQueue({ main, plan: 'p' }), (e) => e.kind === 'queue-dirty');
  assert.strictEqual(read(wt, 'index.js'), 'cambio a mano\n');

  const m2 = fixture();
  const w2 = queueWt(m2);
  fs.mkdirSync(w2, { recursive: true }); // un worktree remove fallido deja un directorio vacío sin registrar
  const r = Q.syncQueue({ main: m2, plan: 'p' });
  assert.strictEqual(r.worktree, w2);
  assert.ok(Q.listWorktrees(Q.runnerOf(m2)).some((w) => Q.norm(w.worktree) === Q.norm(w2)), 'quedó registrada');

  const m3 = fixture();
  const w3 = queueWt(m3);
  write(w3, 'ajeno.txt', 'mío\n');
  assert.throws(() => Q.syncQueue({ main: m3, plan: 'p' }), (e) => e.kind === 'queue-path-occupied');
  assert.strictEqual(read(w3, 'ajeno.txt'), 'mío\n', 'no se tocó');
});

test('precheck: estado, configuración, contrato, tres puntos y renombrados', () => {
  const main = fixture();
  const root = git(['rev-parse', 'HEAD'], main);
  taskBranch(main, 'task/p/01-ok', { 'index.js': importIn("import a from 'b';") });
  taskBranch(main, 'task/p/02-state', { '.pignolo/state/x.md': 'e\n' });
  taskBranch(main, 'task/p/03-cfg', { '.pignolo/project.md': '---\ntype: code-tested\n---\n' });
  assert.deepStrictEqual(Q.precheck({ main, plan: 'p', task: 'task/p/01-ok' }), { ok: true, files: ['index.js'] });
  const s = Q.precheck({ main, plan: 'p', task: 'task/p/02-state' });
  assert.strictEqual(s.kind, 'state-change');
  assert.deepStrictEqual(s.files, ['.pignolo/state/x.md']);
  const c = Q.precheck({ main, plan: 'p', task: 'task/p/03-cfg' });
  assert.strictEqual(c.kind, 'config-change');
  assert.strictEqual(Q.precheck({ main, plan: 'p', task: 'task/p/99-no' }).kind, 'no-branch');

  // tres puntos (A7-10): int/p recibe un commit de estado DESPUÉS de que la tarea se ramificó
  git(['checkout', '-q', 'int/p'], main);
  write(main, '.pignolo/state/y.md', 'estado\n');
  commitAll(main, 'estado en int');
  git(['checkout', '-q', 'main'], main);
  assert.strictEqual(Q.precheck({ main, plan: 'p', task: 'task/p/01-ok' }).ok, true, 'un commit de estado de int/ no es cambio de la tarea');

  // un renombrado fuera de .pignolo/state/ lista sus dos rutas
  git(['checkout', '-q', 'int/p'], main);
  write(main, '.pignolo/state/a.md', 'a\n');
  commitAll(main, 'a');
  git(['checkout', '-q', 'main'], main);
  git(['checkout', '-q', '-b', 'task/p/04-mv', 'int/p'], main);
  fs.mkdirSync(path.join(main, 'docs'), { recursive: true });
  git(['mv', '.pignolo/state/a.md', 'docs/a.md'], main);
  commitAll(main, 'mv');
  git(['checkout', '-q', 'main'], main);
  const mv = Q.precheck({ main, plan: 'p', task: 'task/p/04-mv' });
  assert.strictEqual(mv.kind, 'state-change');
  assert.ok(mv.files.includes('.pignolo/state/a.md'));
  assert.ok(mv.changed.includes('docs/a.md'), 'la ruta de destino también');

  // contrato: una rama que no lo contiene
  taskBranch(main, 'task/p/05-old', { 'old.txt': 'x\n' }, root);
  git(['tag', 'contract/p/v1', 'int/p'], main);
  assert.strictEqual(Q.precheck({ main, plan: 'p', task: 'task/p/05-old' }).kind, 'not-ancestor');
  taskBranch(main, 'task/p/06-new', { 'new.txt': 'x\n' });
  assert.strictEqual(Q.precheck({ main, plan: 'p', task: 'task/p/06-new' }).ok, true);
});

test('parseMergeTree: conflicto solo con exit 1 y primera línea OID; lo demás es preview-failed', () => {
  const oid = 'a'.repeat(40);
  assert.deepStrictEqual(Q.parseMergeTree({ code: 0, stdout: `${oid}\n` }), { status: 'clean', conflicts: [] });
  assert.deepStrictEqual(Q.parseMergeTree({ code: 1, stdout: `${oid}\nf.txt\ng.txt\n` }), { status: 'conflicts', conflicts: ['f.txt', 'g.txt'] });
  assert.strictEqual(Q.parseMergeTree({ code: 1, stdout: `${'b'.repeat(64)}\nf.txt\n` }).status, 'conflicts', 'sha256');
  for (const bad of [{ code: 1, stdout: '' }, { code: 1, stdout: 'merge-tree: nope\n' }, { code: 0, stdout: 'no-es-un-oid\n' }, { code: 128, stdout: `${oid}\n` }]) {
    assert.throws(() => Q.parseMergeTree(bad), (e) => e.kind === 'preview-failed', JSON.stringify(bad));
  }
});

test('previewMerge: clean, conflicts con la ruta, unavailable con git viejo y preview-failed con una rama inexistente', () => {
  const main = fixture();
  taskBranch(main, 'task/p/01-a', { 'a.txt': 'a\n' });
  taskBranch(main, 'task/p/02-b', { 'b.txt': 'b\n' });
  assert.deepStrictEqual(Q.previewMerge({ main, plan: 'p', task: 'task/p/01-a' }), { mergeTree: 'clean', conflicts: [] });
  taskBranch(main, 'task/p/03-x', { 'cfg.js': 'v = 1\n' });
  taskBranch(main, 'task/p/04-y', { 'cfg.js': 'v = 2\n' });
  // int/p con la tarea 03 ya adentro: la 04 choca
  git(['checkout', '-q', 'int/p'], main);
  git(['merge', '-q', '--ff-only', 'task/p/03-x'], main);
  git(['checkout', '-q', 'main'], main);
  assert.deepStrictEqual(Q.previewMerge({ main, plan: 'p', task: 'task/p/04-y' }), { mergeTree: 'conflicts', conflicts: ['cfg.js'] });
  assert.deepStrictEqual(Q.previewMerge({ main, plan: 'p', task: 'task/p/04-y', gitVersion: '2.37.1' }), { mergeTree: 'unavailable', conflicts: [] });
  assert.strictEqual(Q.previewMerge({ main, plan: 'p', task: 'task/p/01-a', gitVersion: '2.38.0' }).mergeTree, 'clean');
  assert.throws(() => Q.previewMerge({ main, plan: 'p', task: 'task/p/99-no' }), (e) => e.kind === 'preview-failed');
});

// Tres versiones de un archivo: base con un hueco y los dos lados insertando en el mismo punto.
const sides = (file, ours, theirs, base = ['// top', '// bottom']) => ({
  path: file,
  base: `${base.join('\n')}\n`,
  ours: `${[base[0], ...ours, base[1]].join('\n')}\n`,
  theirs: `${[base[0], ...theirs, base[1]].join('\n')}\n`,
});
const cls = (o, extra = {}) => Q.classifyConflict({ ...o, ...extra });

test('classifyConflict: tabla (las dos primeras filas fallaban con la expresión vieja)', () => {
  const T = (o, extra) => assert.strictEqual(cls(o, extra).trivial, true, JSON.stringify([o.path, cls(o, extra).why]));
  const F = (o, extra) => assert.strictEqual(cls(o, extra).trivial, false, JSON.stringify([o.path, cls(o, extra).why]));
  T(sides('a.js', ["import a from 'b';"], ["import c from 'd';"]));
  T(sides('a.js', ["const x = require('y');"], ["const z = require('w');"]));
  T(sides('README.md', ['- uno'], ['- dos']));
  T(sides('l.json', ['"a",'], ['"b",']));
  T(sides('a.js', ['export * from "x";'], ["from os import path"]));
  F(sides('l.json', ['"a"'], ['"b"']));
  F(sides('a.js', ['return'], ['return']));
  F(sides('a.js', ['* x'], ['* y']));
  F(sides('a.js', ['true'], ['false']));
  F(sides('a.js', ['break'], ["import a from 'b';"]));
  F(sides('a.js', ['* rm -rf /'], ['* y']));
  F(sides('notes.txt', ['- uno'], ['- dos']), undefined);
  // un lado modifica una línea que el otro también: base no vacía
  F({ path: 'a.js', base: 'a\nb\nc\n', ours: 'a\nB1\nc\n', theirs: 'a\nB2\nc\n' });
  // 20 líneas por lado pasan, 21 no
  const imports = (n, tag) => Array.from({ length: n }, (_, i) => `import ${tag}${i} from 'm';`);
  T(sides('a.js', imports(20, 'a'), imports(20, 'b')));
  F(sides('a.js', imports(21, 'a'), imports(21, 'b')));
  // contracts, test-paths y protected-test-config nunca son triviales
  F(sides('api/x.js', ["import a from 'b';"], ["import c from 'd';"]), { contracts: ['api/'] });
  F(sides('tests/a.test.js', ["import a from 'b';"], ["import c from 'd';"]), { protectedPaths: ['tests/'] });
  F(sides('jest.config.js', ["import a from 'b';"], ["import c from 'd';"]), { protectedPaths: ['jest.config.js'] });
  F(sides('db/m.js', ["import a from 'b';"], ["import c from 'd';"]), { serialPaths: ['db/'] });
  // add/add (sin etapa base) y binario
  F({ path: 'n.js', base: null, ours: "import a from 'b';\n", theirs: "import c from 'd';\n" });
  F({ path: 'b.bin', base: 'a\0\n', ours: 'a\0x\n', theirs: 'a\0y\n' });
  F({ path: 'gone.js', base: 'a\n', ours: null, theirs: 'a\nb\n' });
});

test('mergeIntoQueue: importaciones adyacentes con resolveTrivial dan merged con ambas líneas; sin resolveTrivial, conflict y la cola limpia', () => {
  const main = fixture();
  taskBranch(main, 'task/p/01-a', { 'index.js': importIn("import a from 'b';") });
  taskBranch(main, 'task/p/02-b', { 'index.js': importIn("import c from 'd';") });
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  const first = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' });
  assert.strictEqual(first.status, 'merged');
  assert.strictEqual(git(['rev-parse', 'HEAD'], worktree), first.sha);
  assert.match(git(['log', '-1', '--format=%s'], worktree), /^merge\(p\): task 01/);

  const noResolve = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b' });
  assert.strictEqual(noResolve.status, 'conflict');
  assert.deepStrictEqual(noResolve.trivial, [{ path: 'index.js' }]);
  assert.deepStrictEqual(noResolve.logic, []);
  clean(worktree); noMerge(worktree);
  assert.strictEqual(git(['rev-parse', 'HEAD'], worktree), first.sha, 'la cola no se movió');

  const res = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b', resolveTrivial: true });
  assert.strictEqual(res.status, 'merged');
  assert.deepStrictEqual(res.trivial, [{ path: 'index.js' }]);
  const text = read(worktree, 'index.js');
  assert.ok(text.includes("import a from 'b';") && text.includes("import c from 'd';"), 'ambos lados');
  assert.ok(text.indexOf("import a from 'b';") < text.indexOf("import c from 'd';"), 'el de int/ primero');
  assert.ok(!/[<>=|]{7}/.test(text), 'sin marcas de conflicto');
  assert.match(git(['log', '-1', '--format=%s'], worktree), /^merge\(p\): task 02 \(conflictos triviales: 1\)$/);
  assert.strictEqual(git(['rev-parse', 'HEAD'], worktree), res.sha);
  clean(worktree);
});

test('mergeIntoQueue: un conflicto trivial y uno de lógica en la misma tarea dan conflict y NINGUNO queda resuelto', () => {
  const main = fixture();
  taskBranch(main, 'task/p/01-a', { 'index.js': importIn("import a from 'b';"), 'cfg.js': 'v = 1\n' });
  taskBranch(main, 'task/p/02-b', { 'index.js': importIn("import c from 'd';"), 'cfg.js': 'v = 2\n' });
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'merged');
  const head = git(['rev-parse', 'HEAD'], worktree);
  const r = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b', resolveTrivial: true });
  assert.strictEqual(r.status, 'conflict');
  assert.deepStrictEqual(r.trivial.map((x) => x.path), ['index.js']);
  assert.deepStrictEqual(r.logic.map((x) => x.path), ['cfg.js']);
  assert.ok(r.logic[0].why);
  clean(worktree); noMerge(worktree);
  assert.strictEqual(git(['rev-parse', 'HEAD'], worktree), head);
  assert.ok(!/[<>=|]{7}/.test(read(worktree, 'index.js')));
});

test('mergeIntoQueue: una rama ya unida da already-merged y la cola sigue limpia', () => {
  const main = fixture();
  taskBranch(main, 'task/p/01-a', { 'a.txt': 'a\n' });
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'merged');
  const head = git(['rev-parse', 'HEAD'], worktree);
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'already-merged');
  assert.strictEqual(git(['rev-parse', 'HEAD'], worktree), head);
  clean(worktree); noMerge(worktree);
});

test('mergeIntoQueue: con rerere habilitado en la config del usuario, un conflicto de lógica NO se resuelve solo', () => {
  const main = fixture();
  git(['config', 'rerere.enabled', 'true'], main);
  git(['config', 'rerere.autoupdate', 'true'], main);
  taskBranch(main, 'task/p/01-a', { 'cfg.js': 'v = 1\n' });
  taskBranch(main, 'task/p/02-b', { 'cfg.js': 'v = 2\n' });
  // se graba una resolución a mano en una rama descartable: rerere la recordará
  git(['checkout', '-q', '-b', 'scratch', 'int/p'], main);
  git(['merge', '-q', '--ff-only', 'task/p/01-a'], main);
  assert.throws(() => git(['merge', '--no-ff', '-q', 'task/p/02-b'], main));
  write(main, 'cfg.js', 'v = 3\n');
  git(['add', 'cfg.js'], main);
  git(['commit', '-q', '-m', 'resuelto a mano'], main);
  git(['checkout', '-q', 'main'], main);
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'merged');
  const r = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b', resolveTrivial: true });
  assert.strictEqual(r.status, 'conflict');
  assert.deepStrictEqual(r.logic.map((x) => x.path), ['cfg.js']);
  clean(worktree); noMerge(worktree);
});

test('mergeIntoQueue: la configuración de contracts sale de int/p; un archivo de contrato nunca es trivial', () => {
  const main = fixture({ 'api/s.js': '// top\n\n// bottom\n', 'tests/t.test.js': '// top\n\n// bottom\n', '.pignolo/project.md': '---\ntype: code-tested\ncontracts:\n  - api/\n---\n' });
  taskBranch(main, 'task/p/01-a', { 'api/s.js': "// top\nimport a from 'b';\n\n// bottom\n", 'tests/t.test.js': "// top\nimport a from 'b';\n\n// bottom\n" });
  taskBranch(main, 'task/p/02-b', { 'api/s.js': "// top\nimport c from 'd';\n\n// bottom\n", 'tests/t.test.js': "// top\nimport c from 'd';\n\n// bottom\n" });
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'merged');
  const r = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b', resolveTrivial: true });
  assert.strictEqual(r.status, 'conflict');
  assert.deepStrictEqual(r.trivial, []);
  assert.deepStrictEqual(r.logic.map((x) => x.path).sort(), ['api/s.js', 'tests/t.test.js']);
  assert.match(r.logic.find((x) => x.path === 'api/s.js').why, /contrato/);
  assert.match(r.logic.find((x) => x.path === 'tests/t.test.js').why, /tests/, 'test-paths de int/p: nunca triviales');
  clean(worktree);
});

test('CLI: sync, preview y merge con los kind estructurados y Alternativa', () => {
  const main = fixture();
  taskBranch(main, 'task/p/01-a', { 'index.js': importIn("import a from 'b';") });
  taskBranch(main, 'task/p/02-b', { 'index.js': importIn("import c from 'd';") });
  const s = cli(main, ['sync', '--plan', 'p']);
  assert.strictEqual(s.status, 0, s.stderr);
  assert.strictEqual(s.out.branch, 'queue/p');
  const p = cli(main, ['preview', '--plan', 'p', '--task', '01']);
  assert.strictEqual(p.status, 0, p.stderr);
  assert.strictEqual(p.out.mergeTree, 'clean');
  assert.strictEqual(cli(main, ['merge', '--plan', 'p', '--task', '01']).status, 0);
  const c = cli(main, ['merge', '--plan', 'p', '--task', '02']);
  assert.strictEqual(c.status, 1);
  assert.strictEqual(c.out.kind, 'conflict');
  assert.deepStrictEqual(c.out.trivial, [{ path: 'index.js' }]);
  assert.match(c.stderr, /Alternativa:/);
  assert.strictEqual(cli(main, ['merge', '--plan', 'p', '--task', '02', '--resolve-trivial']).status, 0);
  const again = cli(main, ['merge', '--plan', 'p', '--task', '02']);
  assert.strictEqual(again.status, 1);
  assert.strictEqual(again.out.kind, 'already-merged');
  assert.strictEqual(cli(main, ['merge', '--plan', 'p']).status, 2);
  assert.strictEqual(cli(main, ['merge', '--plan', 'Hito']).status, 2);
  assert.strictEqual(cli(main, ['nope']).status, 2);
  taskBranch(main, 'task/p/03-st', { '.pignolo/state/z.md': 'e\n' });
  const st = cli(main, ['merge', '--plan', 'p', '--task', '03']);
  assert.strictEqual(st.out.kind, 'state-change');
});

// ================================================================ Task 6: pre-merge sellado, avance, lock y revert
const { spawn } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const { findSeal, sealDir, repoIdFor } = require('../plugins/pignolo/lib/seals');

// Un repo con int/p, una compuerta de fixture (gate.js: lee H7_CTL/ctl.json para decidir su salida y anota cada ejecución
// en H7_LOG) y un comando de archivos (files.js). Cada test usa su propio juego de control.
const GATE_JS = [
  "const fs = require('fs'); const path = require('path');",
  'const ctl = process.env.H7_CTL; const log = process.env.H7_LOG;',
  "const read = (n, d) => { try { return JSON.parse(fs.readFileSync(path.join(ctl, n), 'utf8')); } catch (_) { return d; } };",
  "const cf = path.join(ctl, 'full.count'); let n = 0; try { n = Number(fs.readFileSync(cf, 'utf8')); } catch (_) { n = 0; } fs.writeFileSync(cf, String(n + 1));",
  "const c = read('ctl.json', {}); fs.appendFileSync(log, 'full\\n');",
  'if (c.sleepMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, c.sleepMs);',
  'const exit = c.exits && c.exits[n] !== undefined ? c.exits[n] : 0;',
  "if (exit) console.log(c.failFile === null ? 'FAIL algo' : `FAIL ${c.failFile || 'tests/x.test.js'}`);",
  'process.exit(exit);',
].join('\n');
const FILES_JS = [
  "const fs = require('fs'); const path = require('path');",
  'const ctl = process.env.H7_CTL; const log = process.env.H7_LOG;',
  "const read = (n, d) => { try { return JSON.parse(fs.readFileSync(path.join(ctl, n), 'utf8')); } catch (_) { return d; } };",
  "const cf = path.join(ctl, 'files.count'); let n = 0; try { n = Number(fs.readFileSync(cf, 'utf8')); } catch (_) { n = 0; } fs.writeFileSync(cf, String(n + 1));",
  "const c = read('ctl.json', {}); fs.appendFileSync(log, `files ${process.argv.slice(2).join(' ')}\\n`);",
  'const exit = c.filesExits && c.filesExits[n] !== undefined ? c.filesExits[n] : 0;',
  "if (exit) console.log(`FAIL ${process.argv[2]}`);",
  'process.exit(exit);',
].join('\n');
const MUT_JS = "require('fs').appendFileSync(process.env.H7_LOG, `mutation ${process.env.PIGNOLO_MUTATE_FILES}\\n`);\n";
const DEPS_JS = "require('fs').appendFileSync(process.env.H7_LOG, 'deps\\n');\n";

function qrepo({ files = true, type = 'code-tested', yaml = '', gateExtra = '' } = {}) {
  const main = makeRepo();
  const gates = ['  pre-merge: "node gate.js"', files ? '  pre-merge-files: "node files.js {files}"' : '', gateExtra].filter(Boolean).join('\n');
  write(main, '.pignolo/project.md', `---\ntype: ${type}\ngates:\n${gates}\ntest-paths:\n  - tests/\n${yaml}---\n`);
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n');
  write(main, 'gate.js', GATE_JS);
  write(main, 'files.js', FILES_JS);
  write(main, 'mut.js', MUT_JS);
  write(main, 'deps.js', DEPS_JS);
  write(main, 'tests/x.test.js', '// t\n');
  write(main, 'tests/y.test.js', '// t\n');
  write(main, 'src/s.js', 'module.exports = 1;\n');
  commitAll(main, 'base');
  git(['branch', 'int/p'], main);
  const ctl = makeTempDir('pignolo-ctl-');
  const logFile = path.join(ctl, 'log.txt');
  fs.writeFileSync(logFile, '');
  process.env.H7_CTL = ctl;
  process.env.H7_LOG = logFile;
  const env = { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') };
  return {
    main, ctl, logFile, env,
    setCtl: (o) => fs.writeFileSync(path.join(ctl, 'ctl.json'), JSON.stringify(o)),
    log: () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean),
    run: (task, o = {}) => Q.integrate({ main, plan: 'p', task, env, timeoutMs: 60000, ...o }),
  };
}
const kindOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };
// Registra una tarea en run.json (v2) con su rama y, si se pide, la autorización de tests (la cola la lee de ahí).
function register(main, branch, extra = {}) {
  fs.mkdirSync(path.join(main, '.pignolo'), { recursive: true });
  const t = { id: 't1', worktree: main, base: git(['rev-parse', 'main'], main), files: [], agents: [], branch, ...extra };
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify({ v: 2, flow: 'plan', plan: 'p', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), tasks: { t1: t } }));
}
const sha =(main, ref) => git(['rev-parse', ref], main);

test('pre-merge: dos tareas pasan una tras otra; int/p avanza dos veces con cp/p/1 y cp/p/2, queue/p = int/p e historia lineal', () => {
  const q = qrepo();
  const base = sha(q.main, 'int/p');
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  taskBranch(q.main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const r1 = q.run('task/p/01-a');
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.cp, 'cp/p/1');
  assert.strictEqual(sha(q.main, 'int/p'), r1.merged);
  assert.strictEqual(sha(q.main, 'cp/p/1'), r1.merged);
  const r2 = q.run('task/p/02-b');
  assert.strictEqual(r2.cp, 'cp/p/2');
  assert.strictEqual(sha(q.main, 'cp/p/2'), sha(q.main, 'int/p'));
  assert.strictEqual(sha(q.main, 'queue/p'), sha(q.main, 'int/p'));
  assert.strictEqual(sha(q.main, 'int/p^1'), r1.merged, 'int/p avanzó en fast-forward: la cadena de primeros padres es lineal');
  assert.strictEqual(sha(q.main, 'int/p~2'), base);
  assert.deepStrictEqual(r2.warnings, []);
});

test('pre-merge: compuerta roja no mueve int/p, no hay tag, exit gate-failed, y la cola sigue utilizable', () => {
  const q = qrepo();
  q.setCtl({ exits: [1, 0], filesExits: [1] });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  taskBranch(q.main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const before = sha(q.main, 'int/p');
  const e = kindOf(() => q.run('task/p/01-a'));
  assert.strictEqual(e.kind, 'gate-failed');
  assert.strictEqual(sha(q.main, 'int/p'), before);
  assert.strictEqual(git(['tag', '--list', 'cp/*'], q.main), '');
  assert.ok(e.logTail && e.logTail.includes('FAIL'), 'la cola de la salida viaja en el error');
  assert.strictEqual(q.run('task/p/02-b').ok, true, 'una tarea buena después pasa');
  assert.notStrictEqual(sha(q.main, 'int/p'), before);
});

test('pre-merge: la configuración sale de la punta de int/p, no del árbol mergeado (A7-01)', () => {
  const q = qrepo({ yaml: 'deps-install: "node deps.js"\n' });
  const cfgOf = (gate) => `---\ntype: code-tested\ngates:\n  pre-merge: "${gate}"\ntest-paths:\n  - tests/\nhigh-risk-paths: []\n---\n`;
  taskBranch(q.main, 'task/p/01-cfg', { '.pignolo/project.md': cfgOf('node ok.js'), 'ok.js': 'process.exit(0);\n' });
  const before = sha(q.main, 'int/p');
  // primero: el precheck la rechaza
  assert.strictEqual(kindOf(() => q.run('task/p/01-cfg')).kind, 'config-change');
  assert.strictEqual(sha(q.main, 'int/p'), before);
  // saltándose el precheck: la compuerta que corre es la de int/p (se ve en el log) y, si da rojo, gate-failed
  q.setCtl({ exits: [1], filesExits: [1] });
  const e = kindOf(() => q.run('task/p/01-cfg', { opts: { precheck: () => ({ ok: true, files: [] }) } }));
  assert.strictEqual(e.kind, 'gate-failed');
  assert.ok(q.log().includes('full'), 'corrió la compuerta de int/p (gate.js), no la del árbol de la tarea (ok.js)');
  assert.ok(q.log().includes('deps'), 'y el deps-install de int/p, aunque la tarea lo quitara');
  assert.strictEqual(sha(q.main, 'int/p'), before);
});

test('pre-merge: base e intSha (A7-04): la mutación corre, un proyecto code-untested con un test agregado da PASS y testAuthorization sale del run.json', () => {
  const q = qrepo({ yaml: 'high-risk-paths:\n  - src/\nmutation: true\n', gateExtra: '  mutation: "node mut.js"' });
  taskBranch(q.main, 'task/p/01-risk', { 'src/s.js': 'module.exports = 2;\n' });
  assert.strictEqual(q.run('task/p/01-risk').ok, true);
  assert.ok(q.log().some((l) => l.startsWith('mutation') && l.includes('src/s.js')), 'la mutación corrió sobre el archivo de riesgo');

  const u = qrepo({ type: 'code-untested' });
  taskBranch(u.main, 'task/p/01-t', { 'tests/new.test.js': '// nuevo\n' });
  assert.strictEqual(u.run('task/p/01-t').ok, true, 'con base el diff ve el test agregado: PASS (sin base, NO_TESTS)');

  // un test debilitado: INTEGRITY sin registro; con testAuthorization registrada en run.json, pasa
  const w = qrepo();
  write(w.main, 'tests/w.test.js', "it('x', () => { assert.ok(true); });\n");
  commitAll(w.main, 'w');
  git(['branch', '-f', 'int/p', 'main'], w.main);
  taskBranch(w.main, 'task/p/01-weak', { 'tests/w.test.js': "it.skip('x', () => { assert.ok(true); });\n" });
  assert.strictEqual(kindOf(() => w.run('task/p/01-weak')).kind, 'gate-integrity');
  register(w.main, 'task/p/01-weak', { testAuthorization: true });
  assert.strictEqual(w.run('task/p/01-weak').ok, true);
});

test('pre-merge: un commit en la cola entre la compuerta y el avance da seal-mismatch; un archivo sin commitear no cambia el resultado (A7-06)', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const before = sha(q.main, 'int/p');
  const wt = queueWt(q.main);
  const e = kindOf(() => q.run('task/p/01-a', { opts: { beforeAdvance: () => git(['commit', '--allow-empty', '-q', '-m', 'colado'], wt) } }));
  assert.strictEqual(e.kind, 'seal-mismatch');
  assert.strictEqual(sha(q.main, 'int/p'), before);
  // un archivo sin commitear (después de la compuerta): el commit sellado es el que se mueve
  const r = q.run('task/p/01-a', { opts: { beforeAdvance: () => write(wt, 'sin-commitear.txt', 'x\n') } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(sha(q.main, 'int/p'), r.merged);
});

test('pre-merge: repetición (R-6, D-7-3) (a) rojo y verde al repetir solo ese archivo es FLAKY, con UN sello no-PASS', () => {
  const q = qrepo();
  q.setCtl({ exits: [1], filesExits: [0] });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const before = sha(q.main, 'int/p');
  const e = kindOf(() => q.run('task/p/01-a'));
  assert.strictEqual(e.kind, 'flaky');
  assert.deepStrictEqual(e.repeat.differing, ['tests/x.test.js']);
  assert.strictEqual(sha(q.main, 'int/p'), before);
  assert.deepStrictEqual(q.log(), ['full', 'files tests/x.test.js']);
  const tree = sha(q.main, 'queue/p^{tree}');
  const repoId = repoIdFor({ cwd: q.main });
  const found = findSeal({ env: q.env, repoId, treeHash: tree, level: 'pre-merge' });
  assert.notStrictEqual(found.status, 'PASS');
  assert.strictEqual(found.status, 'FLAKY');
  assert.strictEqual(fs.readdirSync(sealDir(q.env, repoId)).filter((f) => f.startsWith(`${tree}-pre-merge-`)).length, 1, 'exactamente un sello pre-merge');
});

test('pre-merge: repetición (b) roja y roja de nuevo es gate-failed', () => {
  const q = qrepo();
  q.setCtl({ exits: [1], filesExits: [1] });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const e = kindOf(() => q.run('task/p/01-a'));
  assert.strictEqual(e.kind, 'gate-failed');
  assert.deepStrictEqual(q.log(), ['full', 'files tests/x.test.js']);
});

test('pre-merge: repetición (c) verde con tests tocados: la suite 1 vez y ese archivo 3 veces; una en rojo es FLAKY', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-t', { 'tests/x.test.js': '// cambiado\n' });
  const r = q.run('task/p/01-t');
  assert.deepStrictEqual(q.log(), ['full', 'files tests/x.test.js', 'files tests/x.test.js', 'files tests/x.test.js']);
  assert.strictEqual(r.repeat.runs, 4);
  assert.strictEqual(r.repeat.same, true);

  const f = qrepo();
  f.setCtl({ filesExits: [0, 1, 0] });
  taskBranch(f.main, 'task/p/01-t', { 'tests/x.test.js': '// cambiado\n' });
  const before = sha(f.main, 'int/p');
  const e = kindOf(() => f.run('task/p/01-t'));
  assert.strictEqual(e.kind, 'flaky');
  assert.deepStrictEqual(e.repeat.differing, ['tests/x.test.js']);
  assert.strictEqual(sha(f.main, 'int/p'), before);
});

test('pre-merge: repetición (d) un test borrado en el diff no se corre; (e) sin tests tocados, una sola ejecución', () => {
  const q = qrepo();
  git(['checkout', '-q', '-b', 'task/p/01-d', 'int/p'], q.main);
  write(q.main, 'tests/x.test.js', '// cambiado\n');
  fs.rmSync(path.join(q.main, 'tests', 'y.test.js'));
  commitAll(q.main, 'cambia x y borra y\n\nAgent: a\nGates: g');
  git(['checkout', '-q', 'main'], q.main);
  register(q.main, 'task/p/01-d', { testAuthorization: true }); // borrar un test es debilitarlo: la cola lo exige registrado
  q.run('task/p/01-d');
  assert.ok(!q.log().some((l) => l.includes('y.test.js')), `el borrado no se corre: ${q.log().join(' | ')}`);
  assert.strictEqual(q.log().filter((l) => l.startsWith('files')).length, 3);

  const e = qrepo();
  taskBranch(e.main, 'task/p/01-src', { 'src/a.txt': 'a\n' });
  e.run('task/p/01-src');
  assert.deepStrictEqual(e.log(), ['full'], 'ningún pre-merge-files');
});

test('pre-merge: repetición (f) sin gates.pre-merge-files: un rojo repite la suite completa una vez y los tests tocados dan available: false sin corridas extra', () => {
  const q = qrepo({ files: false });
  q.setCtl({ exits: [1, 0] });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const e = kindOf(() => q.run('task/p/01-a'));
  assert.strictEqual(e.kind, 'flaky');
  assert.deepStrictEqual(q.log(), ['full', 'full'], 'la suite completa una vez más');
  assert.strictEqual(e.repeat.available, false);

  const t = qrepo({ files: false });
  taskBranch(t.main, 'task/p/01-t', { 'tests/x.test.js': '// cambiado\n' });
  const r = t.run('task/p/01-t');
  assert.deepStrictEqual(t.log(), ['full'], 'sin corridas extra');
  assert.deepStrictEqual({ available: r.repeat.available, reason: r.repeat.reason }, { available: false, reason: 'no-files-command' });
});

test('pre-merge: repetición (g) una salida roja que no nombra ningún archivo conocido cae al respaldo: la suite completa una vez', () => {
  const q = qrepo();
  q.setCtl({ exits: [1, 0], failFile: null });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const e = kindOf(() => q.run('task/p/01-a'));
  assert.strictEqual(e.kind, 'flaky');
  assert.deepStrictEqual(q.log(), ['full', 'full']);
  assert.deepStrictEqual(e.repeat.differing, ['<suite>']);
});

test('pre-merge: failedFiles y los argumentos de {files} con espacios', () => {
  assert.deepStrictEqual(Q.failedFiles('FAIL tests\\a.test.js\nok tests/b.test.js', ['tests/a.test.js', 'tests/c.test.js']), ['tests/a.test.js'], 'las barras de Windows cuentan');
  assert.deepStrictEqual(Q.failedFiles('nada', ['tests/a.test.js']), []);
});

test('pre-merge: int-moved si int/p se mueve durante la compuerta; reintentar la entrada pasa', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const before = sha(q.main, 'int/p');
  const move = () => {
    const c = git(['commit-tree', `${before}^{tree}`, '-p', before, '-m', 'estado'], q.main);
    git(['update-ref', 'refs/heads/int/p', c], q.main);
  };
  const e = kindOf(() => q.run('task/p/01-a', { opts: { beforeAdvance: move } }));
  assert.strictEqual(e.kind, 'int-moved');
  assert.notStrictEqual(sha(q.main, 'int/p'), before, 'quien movió int/p lo movió: la cola no lo pisó');
  const moved = sha(q.main, 'int/p');
  assert.strictEqual(q.run('task/p/01-a').ok, true, 'reintentar parte de la punta actual');
  assert.strictEqual(sha(q.main, 'int/p^1'), moved);
});

test('pre-merge: el avance (A7-07): backup-failed, cp-missing, int/p en uso, int-dirty e int-moved', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  taskBranch(q.main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const before = sha(q.main, 'int/p');
  assert.strictEqual(kindOf(() => q.run('task/p/01-a', { opts: { backupRefs: () => null } })).kind, 'backup-failed');
  assert.strictEqual(kindOf(() => q.run('task/p/01-a', { opts: { backupRefs: () => { throw new Error('boom'); } } })).kind, 'backup-failed');
  assert.strictEqual(sha(q.main, 'int/p'), before, 'int/ quieto');
  // el tag falla DESPUÉS de avanzar: exit 3 con el sha
  const e = kindOf(() => q.run('task/p/01-a', { opts: { tag: () => { throw new Error('sin tag'); } } }));
  assert.strictEqual(e.kind, 'cp-missing');
  assert.strictEqual(e.exit, 3);
  assert.strictEqual(e.sha, sha(q.main, 'int/p'));
  assert.notStrictEqual(e.sha, before);

  // int/p en uso en el checkout principal: merge --ff-only allí y la worktree queda limpia
  const u = qrepo();
  taskBranch(u.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  git(['checkout', '-q', 'int/p'], u.main);
  write(u.main, 'sin-seguimiento.txt', 'del usuario\n');
  const r = u.run('task/p/01-a');
  assert.strictEqual(git(['rev-parse', 'HEAD'], u.main), r.merged);
  assert.strictEqual(git(['status', '--porcelain', '-uno'], u.main), '', 'rojo: update-ref la dejaría con `M archivo` en el índice');
  assert.ok(fs.existsSync(path.join(u.main, 'src', 'a.txt')), 'el árbol de trabajo avanzó');
  assert.strictEqual(read(u.main, 'sin-seguimiento.txt'), 'del usuario\n', 'un archivo sin seguimiento no bloquea');

  // un archivo versionado modificado: int-dirty e int/ quieto
  const d = qrepo();
  taskBranch(d.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  git(['checkout', '-q', 'int/p'], d.main);
  write(d.main, 'src/s.js', 'cambio sin commitear\n');
  const dirtyBefore = sha(d.main, 'int/p');
  assert.strictEqual(kindOf(() => d.run('task/p/01-a')).kind, 'int-dirty');
  assert.strictEqual(sha(d.main, 'int/p'), dirtyBefore);

  // HEAD de esa worktree en otro sha (alguien commiteó en int/p durante la compuerta) o en otra rama: int-moved
  const m = qrepo();
  taskBranch(m.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  git(['checkout', '-q', 'int/p'], m.main);
  const e2 = kindOf(() => m.run('task/p/01-a', { opts: { beforeAdvance: () => git(['commit', '--allow-empty', '-q', '-m', 'durante la compuerta'], m.main) } }));
  assert.strictEqual(e2.kind, 'int-moved');
  const m2 = qrepo();
  taskBranch(m2.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const real = Q.defaultRun(m2.main);
  const stale = (args, o) => (args[0] === 'worktree' && args[1] === 'list'
    ? real(args, o) + `\n\nworktree ${m2.main}\nHEAD ${sha(m2.main, 'int/p')}\nbranch refs/heads/int/p\n`
    : real(args, o));
  assert.strictEqual(kindOf(() => m2.run('task/p/01-a', { opts: { run: stale } })).kind, 'int-moved', 'la lista decía int/p en uso pero HEAD está en otra rama');
});

test('lock (R-8, A7-05): pid muerto se toma; pid vivo con deadline futuro es busy aunque el archivo sea viejo; pid vivo con deadline pasado se toma', () => {
  const main = makeRepo();
  const lock = path.join(main, '.pignolo', 'tmp', 'queue', 'p.lock');
  const put = (rec) => { fs.mkdirSync(path.dirname(lock), { recursive: true }); fs.writeFileSync(lock, JSON.stringify(rec)); };
  put({ pid: 2147483646, startedAt: Date.now(), deadline: Date.now() + 3600e3 });
  const a = Q.acquireQueueLock({ main, plan: 'p' });
  assert.strictEqual(JSON.parse(fs.readFileSync(lock, 'utf8')).pid, process.pid, 'tomó el lock de un pid muerto');
  a.release();
  assert.ok(!fs.existsSync(lock));
  put({ pid: process.pid, startedAt: Date.now() - 7200e3, deadline: Date.now() + 3600e3 });
  const old = new Date(Date.now() - 3 * 3600e3);
  fs.utimesSync(lock, old, old);
  const busy = kindOf(() => Q.acquireQueueLock({ main, plan: 'p' }));
  assert.strictEqual(busy.kind, 'busy', 'rojo: la regla "latido > 10 min" lo tomaría');
  assert.strictEqual(busy.exit, 2);
  put({ pid: process.pid, startedAt: Date.now() - 7200e3, deadline: Date.now() - 1000 });
  const b = Q.acquireQueueLock({ main, plan: 'p' });
  b.release();
  assert.ok(!fs.existsSync(lock));
});

test('lock: dos integrate a la vez sobre el mismo plan: el segundo sale exit 2 busy', async () => {
  const q = qrepo();
  q.setCtl({ sleepMs: 4000 });
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  taskBranch(q.main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const lock = path.join(q.main, '.pignolo', 'tmp', 'queue', 'p.lock');
  const first = spawn(process.execPath, [CLI, 'run', '--plan', 'p', '--task', '01'], { cwd: q.main, env: q.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const done = new Promise((resolve) => first.on('close', resolve));
  for (let i = 0; i < 200 && !fs.existsSync(lock); i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.ok(fs.existsSync(lock), 'el primero tomó el lock');
  const second = cli(q.main, ['run', '--plan', 'p', '--task', '02']);
  assert.strictEqual(second.status, 2);
  assert.strictEqual(second.out.kind, 'busy');
  assert.match(second.stderr, /Alternativa:/);
  assert.strictEqual(await done, 0);
  assert.ok(!fs.existsSync(lock), 'se liberó');
  q.setCtl({});
  assert.strictEqual(cli(q.main, ['run', '--plan', 'p', '--task', '02']).status, 0);
});

test('revertOnInt: el revert pasa por la compuerta de int/ y deja un commit nuevo; un commit ajeno es not-on-int; reintegrar la rama revertida es already-merged', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const r = q.run('task/p/01-a');
  const old = sha(q.main, 'int/p');
  const v = Q.revertOnInt({ main: q.main, plan: 'p', commit: r.merged, env: q.env, timeoutMs: 60000 });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.kind, 'revert');
  assert.strictEqual(v.cp, 'cp/p/2');
  assert.notStrictEqual(sha(q.main, 'int/p'), old);
  git(['merge-base', '--is-ancestor', old, 'int/p'], q.main); // la historia no se reescribió
  assert.ok(!fs.existsSync(path.join(queueWt(q.main), 'src', 'a.txt')), 'el revert quitó el archivo de la tarea');
  assert.strictEqual(git(['rev-parse', '--abbrev-ref', 'queue/p'], q.main), 'queue/p');
  // un commit ajeno
  git(['checkout', '-q', '-b', 'otra', 'main'], q.main);
  write(q.main, 'otra.txt', 'x\n');
  const foreign = commitAll(q.main, 'otra');
  git(['checkout', '-q', 'main'], q.main);
  assert.strictEqual(kindOf(() => Q.revertOnInt({ main: q.main, plan: 'p', commit: foreign, env: q.env, timeoutMs: 60000 })).kind, 'not-on-int');
  // reintegrar la rama revertida: ya está unida (se resuelve revirtiendo el revert)
  assert.strictEqual(kindOf(() => q.run('task/p/01-a')).kind, 'already-merged');
  // el revert usa la configuración de int/: con la compuerta en rojo no avanza
  q.setCtl({ exits: [0, 0, 1], filesExits: [1] });
  const tip = sha(q.main, 'int/p');
  assert.strictEqual(kindOf(() => Q.revertOnInt({ main: q.main, plan: 'p', commit: tip, env: q.env, timeoutMs: 60000 })).kind, 'gate-failed');
  assert.strictEqual(sha(q.main, 'int/p'), tip, 'con la compuerta en rojo el revert no avanza');
});

test('señales de §11.1: missingTrailers lista el commit sin Agent:/Gates:, overBudget con 401 líneas; ninguno bloquea', () => {
  const q = qrepo();
  git(['checkout', '-q', '-b', 'task/p/01-big', 'int/p'], q.main);
  write(q.main, 'big.txt', `${Array.from({ length: 401 }, (_, i) => `l${i}`).join('\n')}\n`);
  git(['add', '-A'], q.main);
  git(['commit', '-q', '-m', 'sin trailers'], q.main);
  const bare = sha(q.main, 'HEAD');
  write(q.main, 'ok.txt', 'ok\n');
  commitAll(q.main, 'con trailers\n\nAgent: pignolo:implementer\nGates: on-done PASS');
  git(['checkout', '-q', 'main'], q.main);
  const r = q.run('task/p/01-big');
  assert.deepStrictEqual(r.missingTrailers, [bare]);
  assert.ok(r.diffLines >= 402);
  assert.strictEqual(r.overBudget, true);
  const small = qrepo();
  taskBranch(small.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  assert.strictEqual(small.run('task/p/01-a').overBudget, false);
});

test('CLI: run, status y revert con los kind y exit codes', () => {
  const q = qrepo();
  taskBranch(q.main, 'task/p/01-a', { 'src/a.txt': 'a\n' });
  const s0 = cli(q.main, ['status', '--plan', 'p']);
  assert.strictEqual(s0.status, 0);
  assert.strictEqual(s0.out.lock, null);
  const r = cli(q.main, ['run', '--plan', 'p', '--task', '01']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.out.cp, 'cp/p/1');
  const s = cli(q.main, ['status', '--plan', 'p']);
  assert.strictEqual(s.out.inSync, true);
  assert.deepStrictEqual(s.out.cp.map((c) => c.tag), ['cp/p/1']);
  assert.strictEqual(s.out.last.status, 'integrated');
  const rv = cli(q.main, ['revert', '--plan', 'p', '--commit', r.out.merged]);
  assert.strictEqual(rv.status, 0, rv.stderr);
  const bad = cli(q.main, ['revert', '--plan', 'p', '--commit', 'deadbeef']);
  assert.strictEqual(bad.status, 1);
  assert.strictEqual(bad.out.kind, 'not-on-int');
  assert.strictEqual(cli(q.main, ['revert', '--plan', 'p']).status, 2);
  q.setCtl({ exits: [0, 0, 1], filesExits: [1] });
  taskBranch(q.main, 'task/p/02-b', { 'src/b.txt': 'b\n' });
  const g = cli(q.main, ['run', '--plan', 'p', '--task', '02']);
  assert.strictEqual(g.status, 1);
  assert.strictEqual(g.out.kind, 'gate-failed');
  assert.match(g.stderr, /Alternativa:/);
});

test('mergeIntoQueue: una tarea que quita contracts de project.md no los desactiva: la configuración sale de la punta de int/p (A7-01)', () => {
  const main = fixture({ 'api/s.js': '// top\n\n// bottom\n', '.pignolo/project.md': '---\ntype: code-tested\ncontracts:\n  - api/\n---\n' });
  taskBranch(main, 'task/p/01-a', { 'api/s.js': "// top\nimport a from 'b';\n\n// bottom\n" });
  taskBranch(main, 'task/p/02-b', { 'api/s.js': "// top\nimport c from 'd';\n\n// bottom\n", '.pignolo/project.md': '---\ntype: code-tested\n---\n' });
  const { worktree } = Q.syncQueue({ main, plan: 'p' });
  assert.strictEqual(Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/01-a' }).status, 'merged');
  // sin pasar por precheck (que rechazaría el cambio de project.md): el merge ve la config de int/p
  const r = Q.mergeIntoQueue({ main, plan: 'p', task: 'task/p/02-b', resolveTrivial: true });
  assert.strictEqual(r.status, 'conflict', 'api/ sigue siendo contrato aunque la tarea lo haya quitado');
  assert.match(r.logic[0].why, /contrato/);
  clean(worktree);
});
