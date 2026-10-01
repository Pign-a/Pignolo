'use strict';
// `next` con la cola y las olas (hito 7a, Task 10; spec §15 `next`: "ola cortada, `queue/` con conflicto"). Solo lectura.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const { writeCounter } = require(path.join(PLUGIN_ROOT, 'lib', 'handback-counter.js'));
const { deriveNext } = require(path.join(PLUGIN_ROOT, 'lib', 'next.js'));

const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const next = (cwd) => deriveNext({ cwd, env: process.env, now: NOW });
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const counter = (repo, id, over = {}) => writeCounter(process.env, repo, id, { count: 0, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [], ...over });

function runJson(repo, tasks, over = {}) {
  const obj = {
    v: 2, flow: 'plan', plan: 'p', started: '2026-09-30T11:00:00.000Z', expires: '2026-09-30T13:00:00.000Z',
    tasks: Object.fromEntries(tasks.map((id) => [id, { id, worktree: path.resolve(repo), base: 'a'.repeat(40), files: [], agents: [] }])), ...over,
  };
  write(repo, '.pignolo/run.json', JSON.stringify(obj));
}

// Una cola con un merge cortado por un conflicto de lógica (la worktree de la cola con MERGE_HEAD).
function repoWithCutMerge() {
  const repo = makeRepo();
  write(repo, 'cfg.js', 'v = 0\n');
  write(repo, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'base'], repo);
  git(['branch', 'int/p'], repo);
  for (const [name, v] of [['task/p/01-a', 1], ['task/p/02-b', 2]]) {
    git(['checkout', '-q', '-b', name, 'int/p'], repo);
    write(repo, 'cfg.js', `v = ${v}\n`);
    git(['commit', '-q', '-am', name], repo);
    git(['checkout', '-q', 'main'], repo);
  }
  const wt = path.join(repo, '.pignolo', 'worktrees', '_queue', 'p');
  git(['worktree', 'add', '-q', '-b', 'queue/p', wt, 'int/p'], repo);
  git(['merge', '-q', '--no-ff', '-m', 'm1', 'task/p/01-a'], wt);
  assert.throws(() => git(['merge', '--no-ff', '--no-commit', 'task/p/02-b'], wt), 'el merge tiene que chocar');
  return { repo, wt };
}
const snapshot = (repo) => ({
  refs: git(['for-each-ref', '--format=%(refname) %(objectname)'], repo),
  status: git(['status', '--porcelain'], repo),
  files: fs.readdirSync(path.join(repo, '.pignolo'), { recursive: true }).map(String).sort().join('\n'),
});

test('queue-conflict: un merge cortado en la worktree de la cola lo dice con los archivos; con last.json en conflict también; con merged, no', () => {
  const { repo } = repoWithCutMerge();
  const n = next(repo);
  assert.strictEqual(n.kind, 'queue-conflict');
  assert.match(n.text, /^La cola de p quedó con un conflicto de lógica en la tarea en curso \(cfg\.js\); la próxima acción registrada es devolver la tarea a su rama para rebasarla y registrarlo como falla del plan\.$/);

  // sin el merge en curso: lo dice last.json
  const r2 = makeRepo();
  write(r2, '.pignolo/tmp/queue/p.last.json', JSON.stringify({ status: 'conflict', task: 'task/p/02-b', conflicts: ['cfg.js', 'x.js'] }));
  const c = next(r2);
  assert.strictEqual(c.kind, 'queue-conflict');
  assert.match(c.text, /en task\/p\/02-b \(cfg\.js, x\.js\)/);
  write(r2, '.pignolo/tmp/queue/p.last.json', JSON.stringify({ status: 'merged', task: 'task/p/02-b', conflicts: [] }));
  assert.notStrictEqual(next(r2).kind, 'queue-conflict', 'con merged no');
  assert.strictEqual(next(makeRepo()).kind, 'nothing', 'sin cola no hay nada');
});

test('queue-busy-dead: un lock de un pid inexistente; el pid del propio proceso, aunque el archivo sea viejo, no', () => {
  const repo = makeRepo();
  const lock = path.join(repo, '.pignolo', 'tmp', 'queue', 'p.lock');
  write(repo, '.pignolo/tmp/queue/p.lock', JSON.stringify({ pid: 2147483646, startedAt: 0, deadline: Date.now() + 3600e3 }));
  const n = next(repo);
  assert.strictEqual(n.kind, 'queue-busy-dead');
  assert.match(n.text, /^El lock de la cola de p es de un proceso que ya no existe; la próxima acción registrada es correr `queue\.js status` y retomar la entrada\.$/);
  write(repo, '.pignolo/tmp/queue/p.lock', JSON.stringify({ pid: process.pid, startedAt: 0, deadline: Date.now() + 3600e3 }));
  const old = new Date(Date.now() - 5 * 3600e3);
  fs.utimesSync(lock, old, old);
  assert.notStrictEqual(next(repo).kind, 'queue-busy-dead', 'pid vivo con deadline futuro no cuenta aunque el archivo sea viejo');
});

test('wave-partial: dos tareas con una sola aceptada; las dos aceptadas o una sola tarea, no', () => {
  const repo = makeRepo();
  runJson(repo, ['a', 'b']);
  counter(repo, 'a', { accepted: true, acceptedAgentId: 'x' });
  const n = next(repo);
  assert.strictEqual(n.kind, 'wave-partial');
  assert.match(n.text, /^La ola tiene 2 tareas; a aceptadas y b pendientes; la próxima acción registrada es esperar o revisar `run\.js status`\.$/);
  counter(repo, 'b', { accepted: true, acceptedAgentId: 'y' });
  assert.notStrictEqual(next(repo).kind, 'wave-partial');
  const one = makeRepo();
  runJson(one, ['a']);
  counter(one, 'a', { accepted: true, acceptedAgentId: 'x' });
  assert.notStrictEqual(next(one).kind, 'wave-partial', 'una sola tarea (guarda de regresión)');
  const none = makeRepo();
  runJson(none, ['a', 'b']);
  assert.notStrictEqual(next(none).kind, 'wave-partial', 'ninguna aceptada todavía: la ola va en curso');
});

test('prioridad: sabotage-pending primero; task-blocked gana a queue-conflict; queue-conflict gana a queue-busy-dead y a wave-partial', () => {
  const { repo } = repoWithCutMerge();
  runJson(repo, ['a', 'b']);
  counter(repo, 'a', { accepted: true });
  write(repo, '.pignolo/tmp/queue/q.lock', JSON.stringify({ pid: 2147483646, startedAt: 0, deadline: Date.now() + 3600e3 }));
  assert.strictEqual(next(repo).kind, 'queue-conflict', 'conflicto > lock muerto > ola cortada');
  counter(repo, 'b', { count: 8, blocked: true, lastReason: 'x' });
  assert.strictEqual(next(repo).kind, 'task-blocked', 'task-blocked gana a queue-conflict');
  const lock = { v: 1, startedAt: new Date(NOW - 3600000).toISOString(), pid: 2147483000, expires: new Date(NOW - 1000).toISOString(), head: git(['rev-parse', 'HEAD'], repo), worktree: repo, files: ['a.txt'], added: [] };
  fs.writeFileSync(path.join(repo, '.git', 'pignolo-sabotage.json'), JSON.stringify(lock));
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(path.join(repo, '.git', 'pignolo-sabotage.json'), old, old);
  assert.strictEqual(next(repo).kind, 'sabotage-pending', 'el sabotaje sigue primero');
});

test('solo lectura: el árbol y las refs quedan idénticos antes y después de deriveNext', () => {
  const { repo } = repoWithCutMerge();
  runJson(repo, ['a', 'b']);
  write(repo, '.pignolo/tmp/queue/p.last.json', JSON.stringify({ status: 'conflict', task: 'task/p/02-b', conflicts: ['cfg.js'] }));
  write(repo, '.pignolo/tmp/queue/p.lock', JSON.stringify({ pid: 2147483646, startedAt: 0, deadline: 1 }));
  const before = snapshot(repo);
  const wtBefore = git(['status', '--porcelain'], path.join(repo, '.pignolo', 'worktrees', '_queue', 'p'));
  next(repo);
  next(repo);
  assert.deepStrictEqual(snapshot(repo), before);
  assert.strictEqual(git(['status', '--porcelain'], path.join(repo, '.pignolo', 'worktrees', '_queue', 'p')), wtBefore, 'la worktree de la cola tampoco');
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'tmp', 'queue', 'p.lock')), 'el lock no se borró');
});

test('solo lectura (lock muerto): next lo describe y no lo borra', () => {
  const repo = makeRepo();
  write(repo, '.pignolo/tmp/queue/p.lock', JSON.stringify({ pid: 2147483646, startedAt: 0, deadline: 1 }));
  const before = snapshot(repo);
  assert.strictEqual(next(repo).kind, 'queue-busy-dead');
  assert.deepStrictEqual(snapshot(repo), before);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'tmp', 'queue', 'p.lock')));
});
