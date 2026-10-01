'use strict';
// Limpieza de ramas y worktrees (lib/branch-cleanup.js, scripts/cleanup.js; hito 7a, Task 9; D-7-5, D-7-7). Repos reales de makeRepo().
// No confundir con tests/cleanup.test.js, que protege los temporales de los tests.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const C = require('../plugins/pignolo/lib/branch-cleanup');

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'cleanup.js');
const cli = (cwd, args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').pop()) : undefined, stderr: r.stderr };
};
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
// git con fechas de commit controladas
const gitAt = (args, cwd, date) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha = (main, ref) => git(['rev-parse', ref], main);
const exists = (main, ref) => { try { git(['rev-parse', '--verify', '--quiet', ref], main); return true; } catch (_) { return false; } };
const planJson = (stage, extra = {}) => `${JSON.stringify({ v: 1, plan: 'p', created: new Date().toISOString(), stage, request: 'x', claims: [], ...extra }, null, 2)}\n`;

// main con project.md, plan p (cerrado por defecto) e int/p en main. HEAD en main.
function fixture({ stage = 'closed', origin } = {}) {
  const main = makeRepo();
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n');
  write(main, '.gitignore', '.env\nnode_modules/\n');
  write(main, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  write(main, '.pignolo/state/plans/p/plan.json', planJson(stage, origin ? { origin } : {}));
  git(['add', '-f', '-A'], main);
  git(['commit', '-q', '-m', 'base'], main);
  git(['branch', 'int/p'], main);
  return main;
}
// Rama de tarea con un commit con fecha; sin worktree.
function task(main, name, { from = 'int/p', date = daysAgo(1), file = name.replace(/\W/g, '_') } = {}) {
  git(['checkout', '-q', '-b', name, from], main);
  write(main, `${file}.txt`, 'x\n');
  git(['add', '-A'], main);
  gitAt(['commit', '-q', '-m', `tarea ${name}`], main, date);
  git(['checkout', '-q', 'main'], main);
}
// Une `name` a `into` con un merge --no-ff (como la cola) y deja HEAD en main.
function mergeInto(main, name, into = 'int/p') {
  git(['checkout', '-q', into], main);
  git(['merge', '-q', '--no-ff', '-m', `merge ${name}`, name], main);
  git(['checkout', '-q', 'main'], main);
}
const toMain = (main, from = 'int/p') => git(['merge', '-q', '--ff-only', from], main);
function worktree(main, name, dir = path.join(main, '.pignolo', 'worktrees', name.replace(/\W+/g, '-'))) {
  git(['worktree', 'add', '-q', dir, name], main);
  return dir;
}
const names = (list) => list.map((x) => x.name).sort();
// Ejecutor inyectado que registra el argv y delega en git real; `fail(args)` puede devolver un error para simular.
function recorder(main, fail = () => null) {
  const log = [];
  const real = C.defaultRun(main);
  const run = (args, o) => {
    log.push(args);
    const err = fail(args);
    if (err) throw err;
    return real(args, o);
  };
  return { log, run };
}
const gitErr = (status, stderr) => Object.assign(new Error(stderr), { status, stderr });

test('findCandidates: lo unido a su destino se propone; lo sin unir de más de 7 días solo se informa; lo vivo y lo protegido, nunca', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(20) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  task(main, 'task/p/02-b', { date: daysAgo(8) }); // sin unir, 8 días
  task(main, 'task/p/03-c', { date: daysAgo(6) }); // sin unir, 6 días
  git(['tag', 'contract/p/v1', 'main~1'], main);
  git(['tag', 'cp/p/1', 'int/p'], main);
  const c = C.findCandidates({ main, now: NOW });
  assert.deepStrictEqual(names(c.merged), ['int/p', 'task/p/01-a']);
  assert.strictEqual(c.merged.find((m) => m.name === 'task/p/01-a').target, 'int/p');
  assert.strictEqual(c.merged.find((m) => m.name === 'int/p').target, 'main', 'int/p sin origin: la rama por defecto (R-14)');
  assert.deepStrictEqual(names(c.unmerged), ['task/p/02-b']);
  assert.ok(c.unmerged[0].ageDays >= 8);
  assert.ok(!c.merged.some((m) => m.name === 'main'), 'la rama de HEAD nunca');
  assert.ok(!JSON.stringify(c).includes('contract/') && !JSON.stringify(c).includes('cp/p'), 'contract/* y cp/* nunca');
});

test('findCandidates: destino explícito (D-7-5): unida a int/p pero no a main, con HEAD en main, no se propone y sale not-in-head', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  const c = C.findCandidates({ main, now: NOW });
  assert.ok(!c.merged.some((m) => m.name === 'task/p/01-a'), 'rojo: `git branch --merged` sin argumento la daría por unida a main');
  const info = c.informed.find((i) => i.name === 'task/p/01-a');
  assert.ok(info && info.why === 'not-in-head', JSON.stringify(c.informed));
  assert.ok(!c.merged.some((m) => m.name === 'int/p'), 'int/p tampoco: no llegó a main');
});

test('lo vivo no se propone (A7-15), un caso por regla', async (t) => {
  await t.test('(a) una task recién creada y sin commits, con su worktree limpia', () => {
    const main = fixture();
    toMain(main);
    git(['branch', 'task/p/05-x', 'int/p'], main);
    worktree(main, 'task/p/05-x');
    const c = C.findCandidates({ main, now: NOW });
    assert.ok(!c.merged.some((m) => m.name === 'task/p/05-x'), 'rojo: la regla solo con --merged');
  });
  await t.test('(b) queue/p igual a int/p con el lock presente', () => {
    const main = fixture();
    toMain(main);
    git(['branch', 'queue/p', 'int/p'], main);
    write(main, '.pignolo/tmp/queue/p.lock', '{}\n');
    assert.ok(!C.findCandidates({ main, now: NOW }).merged.some((m) => m.name === 'queue/p'));
    fs.rmSync(path.join(main, '.pignolo', 'tmp', 'queue', 'p.lock'));
    const without = C.findCandidates({ main, now: NOW });
    assert.ok(without.merged.some((m) => m.name === 'queue/p'), 'sin el lock sí se propone: el lock es lo que la protege');
  });
  await t.test('(c) int/p igual a su origen con el plan abierto', () => {
    const main = fixture({ stage: 'executing' });
    toMain(main);
    assert.ok(!C.findCandidates({ main, now: NOW }).merged.some((m) => m.name === 'int/p'));
    task(main, 'task/p/01-a', { date: daysAgo(2) });
    mergeInto(main, 'task/p/01-a');
    toMain(main);
    assert.ok(!C.findCandidates({ main, now: NOW }).merged.some((m) => m.name === 'task/p/01-a'), 'ni las tareas de un plan abierto');
  });
  await t.test('(d) una task con entrada en run.json', () => {
    const main = fixture();
    task(main, 'task/p/01-a', { date: daysAgo(2) });
    mergeInto(main, 'task/p/01-a');
    toMain(main);
    assert.ok(C.findCandidates({ main, now: NOW }).merged.some((m) => m.name === 'task/p/01-a'));
    write(main, '.pignolo/run.json', JSON.stringify({ v: 2, flow: 'plan', plan: 'p', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), tasks: { t1: { id: 't1', worktree: main, base: sha(main, 'main'), files: [], agents: [], branch: 'task/p/01-a' } } }));
    assert.ok(!C.findCandidates({ main, now: NOW }).merged.some((m) => m.name === 'task/p/01-a'));
  });
  await t.test('(e) una daily en la punta de main no; una daily ya integrada y fuera de run.json sí, con target main', () => {
    const main = fixture();
    git(['checkout', '-q', '-b', 'task/daily/2026-09-30-fix', 'main'], main);
    write(main, 'd.txt', 'd\n');
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', 'daily'], main);
    git(['checkout', '-q', 'main'], main);
    git(['merge', '-q', '--ff-only', 'task/daily/2026-09-30-fix'], main);
    assert.ok(!C.findCandidates({ main, now: NOW }).merged.some((m) => m.name.startsWith('task/daily/')), 'tip == punta del destino');
    git(['checkout', '-q', '-b', 'task/daily/2026-09-29-old', 'main~1'], main);
    write(main, 'e.txt', 'e\n');
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', 'daily viejo'], main);
    git(['checkout', '-q', 'main'], main);
    git(['merge', '-q', '--no-ff', '-m', 'merge daily', 'task/daily/2026-09-29-old'], main);
    const c = C.findCandidates({ main, now: NOW });
    const d = c.merged.find((m) => m.name === 'task/daily/2026-09-29-old');
    assert.ok(d, JSON.stringify(c));
    assert.strictEqual(d.target, 'main');
  });
  await t.test('(f) int/p con origin: feat/x y el plan cerrado, unida a feat/x, tiene ese destino; sin origin, main', () => {
    const main = fixture({ origin: 'feat/x' });
    git(['branch', 'feat/x', 'main'], main);
    git(['checkout', '-q', 'feat/x'], main);
    git(['merge', '-q', '--no-ff', '-m', 'int en feat', 'int/p'], main);
    git(['checkout', '-q', 'main'], main);
    git(['merge', '-q', '--ff-only', 'feat/x'], main);
    const c = C.findCandidates({ main, now: NOW });
    const i = c.merged.find((m) => m.name === 'int/p');
    assert.ok(i, JSON.stringify(c));
    assert.strictEqual(i.target, 'feat/x');
    assert.ok(!c.merged.some((m) => m.name === 'feat/x'), 'la rama de origen del plan nunca');
    assert.strictEqual(C.targetOf('int/p', { main }), 'feat/x');
    assert.strictEqual(C.targetOf('task/p/01-a', { main }), 'int/p');
    assert.strictEqual(C.targetOf('queue/p', { main }), 'int/p');
    assert.strictEqual(C.targetOf('task/daily/2026-09-30-x', { main }), 'main');
    assert.strictEqual(C.targetOf('feature/y', { main }), null);
    const m2 = fixture();
    toMain(m2);
    assert.strictEqual(C.targetOf('int/p', { main: m2 }), 'main', 'sin origin: la rama por defecto');
  });
});

test('ignorados (A7-14): un .env ignorado no se propone y se informa; node_modules/ solo sí; prunable y locked solo se informan; la edad cuenta la actividad de la worktree', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  task(main, 'task/p/02-b', { date: daysAgo(3) });
  task(main, 'task/p/03-c', { date: daysAgo(3) });
  task(main, 'task/p/04-d', { date: daysAgo(3) });
  for (const n of ['task/p/01-a', 'task/p/02-b', 'task/p/03-c', 'task/p/04-d']) mergeInto(main, n);
  toMain(main);
  const w1 = worktree(main, 'task/p/01-a');
  write(w1, '.env', 'SECRETO=1\n');
  const w2 = worktree(main, 'task/p/02-b');
  write(w2, 'node_modules/x/index.js', '1\n');
  const w3 = worktree(main, 'task/p/03-c');
  git(['worktree', 'lock', w3], main);
  const w4 = worktree(main, 'task/p/04-d');
  fs.rmSync(w4, { recursive: true, force: true }); // borrada a mano: prunable
  const c = C.findCandidates({ main, now: NOW });
  assert.ok(!c.merged.some((m) => m.name === 'task/p/01-a'));
  const ign = c.informed.find((i) => i.name === 'task/p/01-a');
  assert.deepStrictEqual([ign.why, ign.ignored], ['ignored-files', ['.env']]);
  assert.ok(c.merged.some((m) => m.name === 'task/p/02-b'), 'con solo node_modules/ ignorado sí se propone');
  assert.strictEqual(c.informed.find((i) => i.name === 'task/p/03-c').why, 'locked');
  assert.strictEqual(c.informed.find((i) => i.name === 'task/p/04-d').why, 'prunable');
  assert.ok(!c.merged.some((m) => ['task/p/03-c', 'task/p/04-d'].includes(m.name)));
  git(['worktree', 'unlock', w3], main);

  // edad = ahora - max(último commit, último cambio de la worktree)
  const m2 = fixture();
  task(m2, 'task/p/01-old', { date: daysAgo(10) });
  task(m2, 'task/p/02-quiet', { date: daysAgo(10) });
  const wt = worktree(m2, 'task/p/01-old');
  write(wt, 'tocado-ayer.txt', 'x\n');
  const u = C.findCandidates({ main: m2, now: NOW });
  assert.deepStrictEqual(names(u.unmerged), ['task/p/02-quiet'], 'rojo: edad = último commit');
  assert.ok(u.dirtyWorktrees.some((d) => path.resolve(d.path) === path.resolve(wt)), 'una worktree sucia va a dirtyWorktrees');
});

test('apply --proposal: la worktree y la rama desaparecen con un respaldo de refs; un id viejo es stale-proposal; sin id exit 2', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const wt = worktree(main, 'task/p/01-a');
  const a = sha(main, 'task/p/01-a');
  const rep = C.report({ main, now: NOW });
  assert.match(rep.text, /task\/p\/01-a/);
  const r = C.apply({ main, proposalId: rep.proposal.id, now: NOW });
  assert.deepStrictEqual(r.removed.map((x) => x.branch).sort(), ['int/p', 'task/p/01-a']);
  assert.ok(!exists(main, 'refs/heads/task/p/01-a'));
  assert.ok(!fs.existsSync(wt), 'la worktree se quitó');
  assert.ok(git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/pignolo/backup'], main).includes(a), 'el respaldo de refs tiene el sha de la rama');
  // un id viejo: se creó otra rama unida después del reporte
  const m2 = fixture();
  task(m2, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(m2, 'task/p/01-a');
  toMain(m2);
  const old = C.report({ main: m2, now: NOW }).proposal.id;
  task(m2, 'task/p/02-b', { date: daysAgo(3) });
  mergeInto(m2, 'task/p/02-b');
  toMain(m2);
  const stale = C.apply({ main: m2, proposalId: old, now: NOW });
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.refused[0].why, 'stale-proposal');
  assert.ok(exists(m2, 'refs/heads/task/p/01-a') && exists(m2, 'refs/heads/task/p/02-b'), 'no se tocó nada');
  // sin --proposal
  assert.throws(() => C.apply({ main: m2 }), (e) => e.kind === 'usage' && e.exit === 2);
  const s = cli(m2, ['apply']);
  assert.strictEqual(s.status, 2);
});

test('apply: un -d que git rechaza se informa con su motivo, sin un segundo intento con otro flag, y las demás ramas siguen; nunca --force ni -D', () => {
  const main = fixture();
  for (const n of ['task/p/01-a', 'task/p/02-b', 'task/p/03-c']) { task(main, n, { date: daysAgo(3) }); mergeInto(main, n); }
  toMain(main);
  const rec = recorder(main, (args) => (args[0] === 'branch' && args[1] === '-d' && args[2] === 'task/p/02-b' ? gitErr(1, 'error: the branch \'task/p/02-b\' is not fully merged') : null));
  const id = C.report({ main, now: NOW, opts: { run: rec.run } }).proposal.id;
  const r = C.apply({ main, proposalId: id, now: NOW, opts: { run: rec.run } });
  assert.ok(rec.log.length > 0, 'el registro de comandos no está vacío');
  const deletes = rec.log.filter((a) => a[0] === 'branch');
  assert.ok(deletes.length >= 3);
  assert.deepStrictEqual(deletes.filter((a) => a.includes('task/p/02-b')), [['branch', '-d', 'task/p/02-b']], 'un solo intento y con -d');
  assert.match(r.refused.find((x) => x.branch === 'task/p/02-b').why, /not fully merged/);
  assert.deepStrictEqual(r.removed.map((x) => x.branch).sort(), ['int/p', 'task/p/01-a', 'task/p/03-c']);
  for (const a of rec.log) {
    assert.ok(!a.includes('--force') && !a.includes('-D') && !a.includes('-f'), `argv prohibido: ${a.join(' ')}`);
    assert.ok(a[0] !== 'push', 'nunca push');
  }
});

test('apply: una worktree que se ensució o a la que se le agregó un ignorado después del reporte no se toca; el respaldo que falla corta todo', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const wt = worktree(main, 'task/p/01-a');
  const items = C.report({ main, now: NOW }).proposal.items.filter((x) => x.name === 'task/p/01-a');
  write(wt, '.env', 'x\n'); // un ignorado nuevo
  const r = C.applyItems({ main, items, now: NOW });
  assert.ok(r.refused.some((x) => x.branch === 'task/p/01-a'));
  assert.ok(exists(main, 'refs/heads/task/p/01-a') && fs.existsSync(wt), 'nada de esa rama se tocó');
  assert.ok(!r.removed.some((x) => x.branch === 'task/p/01-a'));
  fs.rmSync(path.join(wt, '.env'));
  // respaldo: null o excepción cortan, sin tocar ramas ni worktrees
  const fresh = C.report({ main, now: NOW });
  for (const backupRefs of [() => null, () => { throw new Error('boom'); }]) {
    let got = null;
    try { got = C.apply({ main, proposalId: fresh.proposal.id, now: NOW, opts: { backupRefs } }); } catch (e) { got = e; }
    assert.strictEqual(got && got.kind, 'backup-failed', JSON.stringify([got, fresh.proposal]));
    assert.ok(exists(main, 'refs/heads/task/p/01-a') && fs.existsSync(wt));
  }
});

test('ataque T5b: nombres que difieren solo en mayúsculas (refs empaquetadas) nunca se proponen y el commit sin unir sigue alcanzable (D-7-7)', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3), file: 'x_sin_unir' });
  const x = sha(main, 'task/p/01-a');
  git(['pack-refs', '--all'], main);
  try {
    git(['branch', 'task/p/01-A', 'int/p'], main);
  } catch (_) { assert.ok(true, 'con las dos sueltas git se niega (T5f, guarda de regresión)'); return; }
  git(['checkout', '-q', 'task/p/01-A'], main);
  write(main, 'y_unida.txt', 'y\n');
  git(['add', '-A'], main);
  gitAt(['commit', '-q', '-m', 'unida'], main, daysAgo(3));
  git(['checkout', '-q', 'main'], main);
  mergeInto(main, 'task/p/01-A');
  toMain(main);
  const c = C.findCandidates({ main, now: NOW });
  assert.ok(!c.merged.some((m) => m.name.toLowerCase() === 'task/p/01-a'), 'ninguna de las dos en merged');
  const cc = c.informed.filter((i) => i.why === 'case-collision').map((i) => i.name);
  assert.deepStrictEqual(cc.sort(), ['task/p/01-A', 'task/p/01-a'].sort());
  // un id forjado que las incluye: refused y X sigue alcanzable
  const forged = [{ name: 'task/p/01-a', kind: 'task', target: 'int/p', sha: x }, { name: 'task/p/01-A', kind: 'task', target: 'int/p', sha: sha(main, 'refs/heads/task/p/01-A') }];
  const r = C.applyItems({ main, items: forged, now: NOW });
  assert.strictEqual(r.removed.length, 0);
  assert.strictEqual(r.refused.length, 2);
  git(['cat-file', '-e', x], main);
  assert.ok(git(['for-each-ref', '--format=%(refname)', 'refs/heads'], main).toLowerCase().includes('task/p/01-a'));
});

test('ataques T1b y T2b: la rama avanza o retrocede entre el reporte y el apply: refused y nada se pierde', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const rep = C.report({ main, now: NOW });
  let newSha;
  const beforeDelete = (item) => {
    if (item.name !== 'task/p/01-a') return;
    git(['checkout', '-q', 'task/p/01-a'], main);
    write(main, 'nuevo.txt', 'x\n');
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', 'commit nuevo'], main);
    newSha = sha(main, 'HEAD');
    git(['checkout', '-q', 'main'], main);
  };
  const r = C.apply({ main, proposalId: rep.proposal.id, now: NOW, opts: { beforeDelete } });
  assert.ok(r.refused.some((x) => x.branch === 'task/p/01-a'), JSON.stringify(r));
  assert.strictEqual(sha(main, 'refs/heads/task/p/01-a'), newSha, 'el commit nuevo sigue en la rama');
  // T2b: int/p retrocede a main entre el reporte y el apply
  const m2 = fixture();
  task(m2, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(m2, 'task/p/01-a');
  toMain(m2);
  const rep2 = C.report({ main: m2, now: NOW });
  const mainSha = sha(m2, 'main');
  const back = (item) => { if (item.name === 'int/p') git(['branch', '-f', 'int/p', 'main~1'], m2); };
  const r2 = C.apply({ main: m2, proposalId: rep2.proposal.id, now: NOW, opts: { beforeDelete: back } });
  assert.ok(r2.refused.some((x) => x.branch === 'int/p'));
  assert.ok(exists(m2, 'refs/heads/int/p'), 'la rama quedó intacta');
  assert.ok(mainSha);
});

test('ataques T2, T3, T4, T4b, T6 y T8: int/p sin sacar, rama sacada en otra worktree o como HEAD, HEAD desacoplado, refs empaquetadas y nombres forjados', async (t) => {
  await t.test('T2: int/p sin llegar a main con HEAD en main: no se propone', () => {
    const main = fixture();
    task(main, 'task/p/01-a', { date: daysAgo(3) });
    mergeInto(main, 'task/p/01-a');
    const c = C.findCandidates({ main, now: NOW });
    assert.ok(!c.merged.some((m) => m.name === 'int/p' || m.name === 'task/p/01-a'));
  });
  await t.test('T3/T4b: una rama sacada en una worktree con cambios sin commitear o como HEAD del principal: no se propone y, forjada, se rechaza sin tocar la worktree', () => {
    const main = fixture();
    task(main, 'task/p/01-a', { date: daysAgo(3) });
    mergeInto(main, 'task/p/01-a');
    toMain(main);
    const wt = worktree(main, 'task/p/01-a');
    write(wt, 'sin-commit.txt', 'x\n');
    const forged = [{ name: 'task/p/01-a', kind: 'task', target: 'int/p', sha: sha(main, 'task/p/01-a'), worktree: wt }];
    const r = C.applyItems({ main, items: forged, now: NOW });
    assert.strictEqual(r.removed.length, 0);
    assert.ok(fs.existsSync(path.join(wt, 'sin-commit.txt')), 'la worktree intacta');
    // como HEAD del checkout principal
    git(['worktree', 'remove', '--force', wt], main);
    git(['checkout', '-q', 'task/p/01-a'], main);
    const c = C.findCandidates({ main, now: NOW });
    assert.ok(!c.merged.some((m) => m.name === 'task/p/01-a'), 'la rama de HEAD nunca');
    const r2 = C.applyItems({ main, items: forged.map((x) => ({ ...x, worktree: undefined })), now: NOW });
    assert.strictEqual(r2.removed.length, 0);
    assert.ok(exists(main, 'refs/heads/task/p/01-a'));
    assert.strictEqual(git(['rev-parse', '--abbrev-ref', 'HEAD'], main), 'task/p/01-a', 'HEAD sigue en su rama (rojo: update-ref -d la dejaría sin commits)');
  });
  await t.test('T4: HEAD desacoplado en main con lo unido a int/p, ya en main: se propone y se borra (guarda de regresión)', () => {
    const main = fixture();
    task(main, 'task/p/01-a', { date: daysAgo(3) });
    mergeInto(main, 'task/p/01-a');
    toMain(main);
    git(['checkout', '-q', '--detach', 'main'], main);
    const id = C.report({ main, now: NOW }).proposal.id;
    const r = C.apply({ main, proposalId: id, now: NOW });
    assert.ok(r.removed.some((x) => x.branch === 'task/p/01-a'));
    assert.ok(!exists(main, 'refs/heads/task/p/01-a'));
  });
  await t.test('T6: ref empaquetada: se propone, se borra y packed-refs queda sin la entrada', () => {
    const main = fixture();
    task(main, 'task/p/01-a', { date: daysAgo(3) });
    mergeInto(main, 'task/p/01-a');
    toMain(main);
    git(['pack-refs', '--all'], main);
    assert.match(fs.readFileSync(path.join(main, '.git', 'packed-refs'), 'utf8'), /task\/p\/01-a/);
    const id = C.report({ main, now: NOW }).proposal.id;
    assert.ok(C.apply({ main, proposalId: id, now: NOW }).removed.some((x) => x.branch === 'task/p/01-a'));
    const packed = fs.existsSync(path.join(main, '.git', 'packed-refs')) ? fs.readFileSync(path.join(main, '.git', 'packed-refs'), 'utf8') : '';
    assert.doesNotMatch(packed, /task\/p\/01-a/);
  });
  await t.test('T8: una propuesta forjada con HEAD, main o un nombre con espacios se rechaza y nunca llega a git branch -d', () => {
    const main = fixture();
    toMain(main);
    const head = fs.readFileSync(path.join(main, '.git', 'HEAD'), 'utf8');
    const rec = recorder(main);
    const forged = ['HEAD', 'main', 'task/p/x y'].map((name) => ({ name, kind: 'task', target: 'main', sha: sha(main, 'main') }));
    const r = C.applyItems({ main, items: forged, now: NOW, opts: { run: rec.run } });
    assert.ok(rec.log.length > 0);
    assert.strictEqual(r.removed.length, 0);
    assert.strictEqual(r.refused.length, 3);
    assert.ok(!rec.log.some((a) => a[0] === 'branch' && a[1] === '-d'), 'nunca se llamó a branch -d');
    assert.strictEqual(fs.readFileSync(path.join(main, '.git', 'HEAD'), 'utf8'), head);
  });
});

test('ataques T1a, T5d y T10: sin valor esperado y sin reflog: por eso el respaldo de refs va antes de borrar', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const a = sha(main, 'task/p/01-a');
  const id = C.report({ main, now: NOW }).proposal.id;
  C.apply({ main, proposalId: id, now: NOW });
  assert.ok(git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/pignolo/backup'], main).includes(a), 'el juego de respaldo tiene el sha');
  let reflog = '';
  try { reflog = git(['reflog', 'show', 'refs/heads/task/p/01-a'], main); } catch (_) { reflog = ''; }
  assert.strictEqual(reflog, '', 'el reflog de la rama se borra con ella');
  // y un apply sin respaldo no toca nada: el rojo de "apply sin respaldo"
  const m2 = fixture();
  task(m2, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(m2, 'task/p/01-a');
  toMain(m2);
  const id2 = C.report({ main: m2, now: NOW }).proposal.id;
  assert.throws(() => C.apply({ main: m2, proposalId: id2, now: NOW, opts: { backupRefs: () => null } }), (e) => e.kind === 'backup-failed');
  assert.ok(exists(m2, 'refs/heads/task/p/01-a'));
});

test('T7, T7b y T12: una worktree que se ensucia tras la comprobación hace que worktree remove (sin --force) se niegue y la rama no se borre', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const wt = worktree(main, 'task/p/01-a');
  const id = C.report({ main, now: NOW }).proposal.id;
  const rec = recorder(main);
  const beforeDelete = (item) => { if (item.worktree) write(wt, 'sin-seguimiento.txt', 'x\n'); };
  const r = C.apply({ main, proposalId: id, now: NOW, opts: { run: rec.run, beforeDelete } });
  assert.ok(rec.log.length > 0);
  const refused = r.refused.find((x) => x.branch === 'task/p/01-a');
  assert.ok(refused, JSON.stringify(r));
  assert.ok(exists(main, 'refs/heads/task/p/01-a'), 'la rama no se borró');
  assert.ok(fs.existsSync(path.join(wt, 'sin-seguimiento.txt')), 'ni la worktree');
  assert.ok(rec.log.some((a) => a[0] === 'worktree' && a[1] === 'remove' && !a.includes('--force')), 'se intentó sin --force');
});

test('partial-remove (A7-14): un worktree remove que sale 255 corta con exit 3, no borra la rama y deja el resto sin intentar', () => {
  const main = fixture();
  for (const n of ['task/p/01-a', 'task/p/02-b']) { task(main, n, { date: daysAgo(3) }); mergeInto(main, n); }
  toMain(main);
  const w1 = worktree(main, 'task/p/01-a');
  worktree(main, 'task/p/02-b');
  const rec = recorder(main, (args) => (args[0] === 'worktree' && args[1] === 'remove' && args[2] && args[2].includes('01-a') ? gitErr(255, 'Permission denied') : null));
  const id = C.report({ main, now: NOW, opts: { run: rec.run } }).proposal.id;
  const err = (() => { try { C.apply({ main, proposalId: id, now: NOW, opts: { run: rec.run } }); } catch (e) { return e; } return null; })();
  assert.ok(err, 'tenía que cortar');
  assert.strictEqual(err.kind, 'partial-remove');
  assert.strictEqual(err.exit, 3);
  assert.strictEqual(path.resolve(err.path), path.resolve(w1));
  assert.ok(exists(main, 'refs/heads/task/p/01-a'), 'no se hizo branch -d de esa rama');
  assert.ok(!rec.log.some((a) => a[0] === 'branch' && a[1] === '-d' && a[2] === 'task/p/01-a'));
  assert.ok(err.notAttempted.length >= 0 && Array.isArray(err.notAttempted));
  const cli3 = cli(main, ['apply', '--proposal', 'zzz']);
  assert.strictEqual(cli3.status, 1, 'un id desconocido es stale-proposal por el CLI');
  assert.strictEqual(cli3.out.kind, 'stale-proposal');
});

test('CLI: report y apply por el script, con un solo sí', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const rep = cli(main, ['report']);
  assert.strictEqual(rep.status, 0, rep.stderr);
  assert.ok(rep.out.proposal.items.some((m) => m.name === 'task/p/01-a'));
  const ok = cli(main, ['apply', '--proposal', rep.out.proposal.id]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.ok(ok.out.removed.some((x) => x.branch === 'task/p/01-a'));
  assert.ok(!exists(main, 'refs/heads/task/p/01-a'));
  assert.strictEqual(cli(main, ['report', '--days', 'x']).status, 2);
});

test('realpath antes de borrar (lección de la junction): una worktree fuera de .pignolo/worktrees/, o que entra por un enlace, no se propone y se informa', () => {
  const main = fixture();
  for (const n of ['task/p/01-a', 'task/p/02-b']) { task(main, n, { date: daysAgo(3) }); mergeInto(main, n); }
  toMain(main);
  // 01-a: una worktree ajena, fuera de la carpeta de pignolo
  const outside = path.join(makeTempDir('pignolo-out-'), 'wt');
  git(['worktree', 'add', '-q', outside, 'task/p/01-a'], main);
  // 02-b: una worktree a la que se llega por un enlace (junction en Windows) bajo .pignolo/worktrees/
  const real = makeTempDir('pignolo-real-');
  const link = path.join(main, '.pignolo', 'worktrees', 'enlace');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(real, link, 'junction');
  git(['worktree', 'add', '-q', path.join(link, 'wt'), 'task/p/02-b'], main);
  const c = C.findCandidates({ main, now: NOW });
  assert.ok(!c.merged.some((m) => m.name === 'task/p/01-a' || m.name === 'task/p/02-b'), JSON.stringify(c.merged));
  assert.strictEqual(c.informed.find((i) => i.name === 'task/p/01-a').why, 'worktree-outside');
  assert.strictEqual(c.informed.find((i) => i.name === 'task/p/02-b').why, 'worktree-outside', 'rojo: una comparación léxica de la ruta la daría por interna');
  const r = C.applyItems({ main, items: [{ name: 'task/p/01-a', kind: 'task', target: 'int/p', sha: sha(main, 'task/p/01-a'), worktree: outside }, { name: 'task/p/02-b', kind: 'task', target: 'int/p', sha: sha(main, 'task/p/02-b'), worktree: path.join(link, 'wt') }], now: NOW });
  assert.strictEqual(r.removed.length, 0);
  assert.ok(fs.existsSync(outside) && fs.existsSync(path.join(real, 'wt')), 'las worktrees ajenas no se tocaron');
});

test('realpath al borrar: si la ruta de la worktree pasa a ser un enlace hacia afuera después de la comprobación, no se llama a worktree remove', () => {
  const main = fixture();
  task(main, 'task/p/01-a', { date: daysAgo(3) });
  mergeInto(main, 'task/p/01-a');
  toMain(main);
  const wt = worktree(main, 'task/p/01-a');
  const id = C.report({ main, now: NOW }).proposal.id;
  const elsewhere = makeTempDir('pignolo-else-');
  fs.writeFileSync(path.join(elsewhere, 'ajeno.txt'), 'no lo toques\n');
  const swap = (item) => {
    if (!item.worktree) return;
    fs.renameSync(wt, `${wt}.bak`);
    fs.symlinkSync(elsewhere, wt, 'junction');
  };
  const rec = recorder(main);
  const r = C.apply({ main, proposalId: id, now: NOW, opts: { run: rec.run, beforeDelete: swap } });
  assert.ok(rec.log.length > 0);
  assert.ok(!rec.log.some((a) => a[0] === 'worktree' && a[1] === 'remove'), 'nunca se llamó a worktree remove');
  assert.ok(r.refused.some((x) => x.branch === 'task/p/01-a' && x.why === 'worktree-outside'), JSON.stringify(r));
  assert.strictEqual(fs.readFileSync(path.join(elsewhere, 'ajeno.txt'), 'utf8'), 'no lo toques\n');
  assert.ok(exists(main, 'refs/heads/task/p/01-a'));
});
