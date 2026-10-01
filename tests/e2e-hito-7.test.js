'use strict';
// Pruebas de punta a punta del hito 7a (spec §15 `queue`, `worktree`, `state-queue`): git de verdad y el launcher real, sin
// agentes. El "implementer" es un script que edita y corre gate.js dentro de su worktree.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, runLauncher, git } = require('./helpers');
const { deriveNext } = require('../plugins/pignolo/lib/next');

const P = PLUGIN_ROOT.split(path.sep).join('/');
const script = (name) => path.join(PLUGIN_ROOT, 'scripts', name);
const NODE = process.execPath;
function sh(name, args, cwd, env = {}) {
  const r = spawnSync(NODE, [script(name), ...args], { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } });
  const last = r.stdout.trim().split('\n').filter(Boolean).pop();
  let json;
  try { json = JSON.parse(r.stdout); } catch (_) { try { json = last ? JSON.parse(last) : undefined; } catch (_e) { json = undefined; } }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commitAll = (dir, msg) => { git(['add', '-A'], dir); git(['commit', '-q', '-m', msg], dir); return git(['rev-parse', 'HEAD'], dir); };
const sha = (main, ref) => git(['rev-parse', ref], main);

const PROJECT = (extra = '') => `---\ntype: code-tested\ngates:\n  on-done: "node ok.js"\n  pre-merge: "node ok.js"\ntest-paths:\n  - tests/\n${extra}---\n`;
function project(extra = '', extraFiles = {}) {
  const main = makeRepo();
  write(main, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n.disabled\n');
  write(main, '.pignolo/project.md', PROJECT(extra));
  write(main, 'ok.js', 'process.exit(0);\n');
  write(main, 'index.js', "// top\n\nmodule.exports = 1;\n");
  write(main, 'cfg.js', 'v = 0\n');
  for (const [f, t] of Object.entries(extraFiles)) write(main, f, t);
  commitAll(main, 'base');
  git(['branch', 'int/p'], main);
  const home = makeTempDir('pignolo-home-');
  return { main, home, env: { PIGNOLO_HOME: home } };
}
// Crea una worktree de tarea con worktree.js, la registra con run.js y hace el trabajo del "implementer" dentro de ella.
function implement(p, nn, slug, files, { register = true, id = `t${nn}` } = {}) {
  const c = sh('worktree.js', ['create', '--plan', 'p', '--nn', nn, '--slug', slug], p.main, p.env);
  assert.strictEqual(c.status, 0, c.stderr);
  const { worktree, branch, base } = c.json;
  if (register) {
    const t = sh('run.js', ['task', '--id', id, '--worktree', worktree, '--base', base, '--branch', branch, ...Object.keys(files).flatMap((f) => ['--file', f])], p.main, p.env);
    assert.strictEqual(t.status, 0, t.stderr);
  }
  for (const [f, text] of Object.entries(files)) write(worktree, f, text);
  git(['add', '-A'], worktree);
  git(['commit', '-q', '-m', `tarea ${nn}\n\nAgent: pignolo:implementer\nGates: on-done PASS`], worktree);
  return { worktree, branch, base, id };
}
const gateIn = (p, t) => sh('gate.js', ['--level', 'on-done', '--task', '--id', t.id, '--cwd', t.worktree], p.main, p.env);

test('plan de 6 tareas: waves.js, tag de contrato, dos worktrees reales en paralelo con sellos de árboles distintos y la cola integra todo en línea recta', () => {
  const p = project('contracts:\n  - api/\nserial-paths:\n  - db/\n');
  const card = (n, files, extra = '') => `### Task ${n}: t${n}\n\n**Files:**\n- Create: \`${files}\`\n\n${extra}\n`;
  const planFile = path.join(makeTempDir('pignolo-plan-'), 'plan.md');
  fs.writeFileSync(planFile, [
    card(1, 'api/schema.js', '**Kind:** judgment\n**Contract:** yes'),
    card(2, 'src/a.js', '**Kind:** judgment\n**Parallel:** yes'),
    card(3, 'src/b.js', '**Kind:** judgment\n**Parallel:** yes'),
    card(4, 'src/c.js', '**Kind:** judgment\n**Parallel:** yes'),
    card(5, 'src/d.js', '**Kind:** judgment\n**Parallel:** yes'),
    card(6, 'db/migrate.js', '**Kind:** judgment'),
  ].join('\n'));
  const w = sh('waves.js', ['--plan-file', planFile, '--profile', 'balanced', '--cwd', p.main], p.main, p.env);
  assert.strictEqual(w.status, 0, w.stderr);
  assert.deepStrictEqual(w.json.waves.map((x) => [x.mode, x.tasks.join(',')]), [['contract', '1'], ['serial', '6'], ['parallel', '2,3'], ['parallel', '4,5']]);

  assert.strictEqual(sh('run.js', ['start', '--flow', 'plan', '--plan', 'p'], p.main, p.env).status, 0);
  // ola 0: el contrato entra por la cola y se etiqueta
  const t1 = implement(p, '01', 'schema', { 'api/schema.js': 'module.exports = {};\n' });
  assert.strictEqual(gateIn(p, t1).status, 0);
  assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', '01'], p.main, p.env).status, 0);
  sh('run.js', ['task-end', '--id', t1.id], p.main, p.env);
  const tag = sh('worktree.js', ['tag-contract', '--plan', 'p', '--n', '1'], p.main, p.env);
  assert.strictEqual(tag.status, 0, tag.stderr);
  assert.strictEqual(tag.json.tag, 'contract/p/v1');

  // la ola paralela de 2: dos worktrees reales nacidas del contrato, cada una con su sello
  const a = implement(p, '02', 'a', { 'src/a.js': 'module.exports = "a";\n' });
  const b = implement(p, '03', 'b', { 'src/b.js': 'module.exports = "b";\n' });
  assert.strictEqual(a.base, sha(p.main, 'contract/p/v1'));
  assert.strictEqual(b.base, a.base);
  const sa = gateIn(p, a);
  const sb = gateIn(p, b);
  assert.strictEqual(sa.status, 0, sa.stderr);
  assert.strictEqual(sb.status, 0, sb.stderr);
  assert.strictEqual(sa.json.task, a.id);
  assert.strictEqual(sb.json.task, b.id);
  assert.notStrictEqual(sa.json.treeHash, sb.json.treeHash, 'el sello corresponde al árbol de SU worktree (§15 `worktree`)');
  const status = sh('run.js', ['status'], p.main, p.env).json;
  assert.deepStrictEqual(Object.keys(status.tasks).sort(), [a.id, b.id].sort());
  for (const t of [a, b]) assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', t.branch], p.main, p.env).status, 0);
  for (const t of [a, b]) sh('run.js', ['task-end', '--id', t.id], p.main, p.env);

  const c = implement(p, '04', 'c', { 'src/c.js': 'module.exports = "c";\n' }, { register: false });
  const d = implement(p, '05', 'd', { 'src/d.js': 'module.exports = "d";\n' }, { register: false });
  const m = implement(p, '06', 'mig', { 'db/migrate.js': 'module.exports = "m";\n' }, { register: false });
  for (const t of [c, d, m]) assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', t.branch], p.main, p.env).status, 0);

  // int/p termina con todas, historia lineal de primeros padres y cp/p/1..6
  const files = git(['ls-tree', '-r', '--name-only', 'int/p'], p.main).split('\n');
  for (const f of ['api/schema.js', 'src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'db/migrate.js']) assert.ok(files.includes(f), f);
  assert.deepStrictEqual(git(['tag', '--list', 'cp/p/*', '--sort=version:refname'], p.main).split('\n'), ['cp/p/1', 'cp/p/2', 'cp/p/3', 'cp/p/4', 'cp/p/5', 'cp/p/6']);
  assert.strictEqual(sha(p.main, 'cp/p/6'), sha(p.main, 'int/p'));
  assert.strictEqual(sha(p.main, 'queue/p'), sha(p.main, 'int/p'));
  const chain = git(['rev-list', '--first-parent', 'int/p'], p.main).split('\n');
  assert.strictEqual(chain.length, 8, 'commit inicial + base + 6 merges en línea recta');
  assert.strictEqual(sh('run.js', ['end'], p.main, p.env).status, 0);
});

test('edición fuera de la worktree por el launcher real: un implementer con run.tasks {a, b} que escribe en el checkout principal sale exit 2 con Alternativa', () => {
  const p = project();
  assert.strictEqual(sh('run.js', ['start', '--flow', 'plan', '--plan', 'p'], p.main, p.env).status, 0);
  const a = implement(p, '01', 'a', { 'src/a.js': '1\n' });
  const b = implement(p, '02', 'b', { 'src/b.js': '1\n' });
  const payload = (file, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: a.worktree, tool_input: { file_path: file, content: 'x' }, agent_id: 'ag1', agent_type: 'pignolo:implementer', ...extra });
  const bad = runLauncher('protect-paths', payload(path.join(p.main, 'src', 'x.js')), p.env);
  assert.strictEqual(bad.status, 2, bad.stderr);
  assert.match(bad.stderr, /Alternativa:.*worktree/);
  const ok = runLauncher('protect-paths', payload(path.join(a.worktree, 'src', 'x.js')), p.env);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(runLauncher('protect-paths', payload(path.join(b.worktree, 'src', 'x.js')), p.env).status, 0, 'la de b también (límite declarado)');
  assert.strictEqual(runLauncher('protect-paths', payload(path.join(p.main, 'src', 'x.js'), { agent_id: undefined, agent_type: undefined }), p.env).status, 0, 'el hilo principal escribe en el principal');
  // el estado de .pignolo/state lo sigue negando a todo subagente
  assert.strictEqual(runLauncher('protect-paths', payload(path.join(a.worktree, '.pignolo', 'state', 'x.md')), p.env).status, 2);
});

test('conflicto trivial y de lógica en la misma corrida de cola: el trivial pasa con --resolve-trivial, el de lógica vuelve y next lo describe', () => {
  const p = project();
  const mk = (nn, slug, files) => {
    git(['checkout', '-q', '-b', `task/p/${nn}-${slug}`, 'int/p'], p.main);
    for (const [f, t] of Object.entries(files)) write(p.main, f, t);
    commitAll(p.main, `tarea ${nn}\n\nAgent: pignolo:implementer\nGates: on-done PASS`);
    git(['checkout', '-q', 'main'], p.main);
  };
  mk('01', 'a', { 'index.js': "// top\nimport a from 'b';\n\nmodule.exports = 1;\n" });
  mk('02', 'b', { 'index.js': "// top\nimport c from 'd';\n\nmodule.exports = 1;\n" });
  mk('03', 'x', { 'cfg.js': 'v = 1\n' });
  mk('04', 'y', { 'cfg.js': 'v = 2\n' });
  assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', '01'], p.main, p.env).status, 0);
  const noFlag = sh('queue.js', ['run', '--plan', 'p', '--task', '02'], p.main, p.env);
  assert.strictEqual(noFlag.status, 1);
  assert.strictEqual(noFlag.json.kind, 'conflict');
  const triv = sh('queue.js', ['run', '--plan', 'p', '--task', '02', '--resolve-trivial'], p.main, p.env);
  assert.strictEqual(triv.status, 0, triv.stderr);
  assert.deepStrictEqual(triv.json.trivial, [{ path: 'index.js' }]);
  assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', '03'], p.main, p.env).status, 0);
  const logic = sh('queue.js', ['run', '--plan', 'p', '--task', '04', '--resolve-trivial'], p.main, p.env);
  assert.strictEqual(logic.status, 1);
  assert.strictEqual(logic.json.kind, 'conflict');
  assert.deepStrictEqual(logic.json.logic.map((x) => x.path), ['cfg.js']);
  const n = deriveNext({ cwd: p.main, env: { ...process.env, ...p.env }, now: Date.now() });
  assert.strictEqual(n.kind, 'queue-conflict');
  assert.match(n.text, /task\/p\/04-y \(cfg\.js\)/);
});

test('una tarea que cambia .pignolo/project.md sale config-change e int/ queda quieta (A7-01)', () => {
  const p = project();
  git(['checkout', '-q', '-b', 'task/p/01-cfg', 'int/p'], p.main);
  write(p.main, '.pignolo/project.md', PROJECT().replace('node ok.js', 'node siempre-verde.js'));
  commitAll(p.main, 'cambia la compuerta');
  git(['checkout', '-q', 'main'], p.main);
  const before = sha(p.main, 'int/p');
  const r = sh('queue.js', ['run', '--plan', 'p', '--task', '01'], p.main, p.env);
  assert.strictEqual(r.status, 1);
  assert.strictEqual(r.json.kind, 'config-change');
  assert.match(r.stderr, /Alternativa:/);
  assert.strictEqual(sha(p.main, 'int/p'), before);
});

test('estado entre merges con el plan completo (state-queue): el estado commiteado por el hilo principal entra sin romper el --ff-only', () => {
  const p = project('', { '.pignolo/state/plans/p/plan.json': `${JSON.stringify({ v: 1, plan: 'p', stage: 'executing', request: 'x', claims: [] })}\n` });
  const t1 = implement(p, '01', 'a', { 'src/a.js': '1\n' }, { register: false });
  const t2 = implement(p, '02', 'b', { 'src/b.js': '1\n' }, { register: false });
  assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', t1.branch], p.main, p.env).status, 0);
  // el hilo principal commitea el estado sobre int/p (en una worktree temporal) entre los dos merges
  const tmp = path.join(makeTempDir('pignolo-st-'), 'wt');
  git(['worktree', 'add', '-q', tmp, 'int/p'], p.main);
  write(tmp, '.pignolo/state/plans/p/plan.json', `${JSON.stringify({ v: 1, plan: 'p', stage: 'validating', request: 'x', claims: [] })}\n`);
  git(['add', '-f', '-A'], tmp);
  git(['commit', '-q', '-m', 'estado: validating'], tmp);
  const stateSha = git(['rev-parse', 'HEAD'], tmp);
  git(['worktree', 'remove', tmp], p.main);
  const r2 = sh('queue.js', ['run', '--plan', 'p', '--task', t2.branch], p.main, p.env);
  assert.strictEqual(r2.status, 0, r2.stderr);
  assert.strictEqual(sha(p.main, 'int/p^1'), stateSha);
  assert.strictEqual(sha(p.main, 'cp/p/2'), sha(p.main, 'int/p'));
  assert.match(git(['show', 'int/p:.pignolo/state/plans/p/plan.json'], p.main), /validating/);
  // una tarea que toca el estado se rechaza
  git(['checkout', '-q', '-b', 'task/p/03-st', 'int/p'], p.main);
  write(p.main, '.pignolo/state/plans/p/plan.json', '{"stage":"closed"}\n');
  git(['add', '-f', '-A'], p.main);
  git(['commit', '-q', '-m', 'toca el estado'], p.main);
  git(['checkout', '-q', 'main'], p.main);
  const before = sha(p.main, 'int/p');
  const bad = sh('queue.js', ['run', '--plan', 'p', '--task', '03'], p.main, p.env);
  assert.strictEqual(bad.json.kind, 'state-change');
  assert.strictEqual(sha(p.main, 'int/p'), before);
});

test('worktree remove con un proceso vivo en la worktree (Windows, A7-14): apply sale 3 partial-remove, la rama sigue y se anota cómo quedó el directorio', async (t) => {
  const p = project();
  write(p.main, '.pignolo/state/plans/p/plan.json', `${JSON.stringify({ v: 1, plan: 'p', stage: 'closed', request: 'x', claims: [] })}\n`);
  git(['add', '-f', '-A'], p.main);
  git(['commit', '-q', '-m', 'plan cerrado'], p.main);
  git(['branch', '-f', 'int/p', 'main'], p.main);
  const t1 = implement(p, '01', 'a', { 'src/a.js': '1\n' }, { register: false });
  assert.strictEqual(sh('queue.js', ['run', '--plan', 'p', '--task', t1.branch], p.main, p.env).status, 0);
  git(['merge', '-q', '--ff-only', 'int/p'], p.main);
  const rep = sh('cleanup.js', ['report'], p.main, p.env);
  assert.ok(rep.json.proposal.items.some((m) => m.name === t1.branch), JSON.stringify(rep.json));
  // un proceso real con su cwd en la worktree
  const child = spawn(NODE, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: t1.worktree, stdio: 'ignore', windowsHide: true });
  try {
    await new Promise((r) => setTimeout(r, 400));
    const ap = sh('cleanup.js', ['apply', '--proposal', rep.json.proposal.id], p.main, p.env);
    if (process.platform === 'win32') {
      assert.strictEqual(ap.status, 3, `${ap.stdout} ${ap.stderr}`);
      assert.strictEqual(ap.json.kind, 'partial-remove');
      assert.ok(fs.existsSync(path.join(p.main, '.git', 'refs', 'heads', 'task', 'p', '01-a')) || git(['branch', '--list', t1.branch], p.main) !== '', 'la rama sigue');
      t.diagnostic(`worktree remove con un proceso vivo: exit ${ap.status}; directorio ${fs.existsSync(t1.worktree) ? 'sigue' : 'ya no está'}; estado de git worktree list: ${JSON.stringify(ap.json.worktreeState)}`);
    } else {
      // en POSIX un proceso con su cwd adentro no impide el borrado: queda anotado y el lote termina bien
      assert.ok([0, 3].includes(ap.status), ap.stderr);
      t.diagnostic(`worktree remove con un proceso vivo (no Windows): exit ${ap.status}`);
    }
  } finally {
    child.kill();
  }
});

test('plan.js list y next por los scripts reales: dos planes sin cerrar, uno con el registro truncado: list lo muestra como unreadable y next trae el segundo como hecho', () => {
  const main = makeRepo();
  const req = path.join(makeTempDir('pignolo-req-'), 'req.txt');
  fs.writeFileSync(req, 'Quiero una cosa con un ejemplo claro y nada de más.');
  for (const name of ['uno', 'dos', 'tres']) assert.strictEqual(sh('plan.js', ['new', '--plan', name, '--request-file', req], main).status, 0);
  fs.writeFileSync(path.join(main, '.pignolo', 'state', 'plans', 'dos', 'plan.json'), '{"v":1,');
  const list = sh('plan.js', ['list'], main);
  assert.strictEqual(list.status, 0, list.stderr);
  assert.deepStrictEqual(list.json.plans.map((x) => x.plan).sort(), ['dos', 'tres', 'uno']);
  assert.deepStrictEqual(list.json.plans.find((x) => x.plan === 'dos'), { plan: 'dos', unreadable: true });
  assert.ok(list.json.plans.filter((x) => !x.unreadable).every((x) => x.stage === 'spec'));
  const nx = sh('next.js', [], main);
  assert.strictEqual(nx.status, 0);
  assert.ok(nx.json.kind.startsWith('plan-'), nx.stdout);
  assert.ok(nx.json.facts.some((f) => /^Plan (uno|tres): etapa spec\.$/.test(f)), JSON.stringify(nx.json.facts));
  assert.strictEqual(nx.json.plans.length, 3);
});

test('medición (G8 y lo no verificado): una entrada de cola con una compuerta de 3 s, y dos worktrees seguidas con deps-install sin pisarse', (t) => {
  const p = project('deps-install: "node deps.js"\n', {
    'deps.js': "const fs = require('fs'); fs.mkdirSync('node_modules/.cache', { recursive: true }); fs.writeFileSync('node_modules/.cache/ok', String(Date.now()));\n",
    'slow.js': 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);\n',
  });
  fs.appendFileSync(path.join(p.main, '.gitignore'), 'node_modules/\n');
  write(p.main, '.pignolo/project.md', PROJECT('deps-install: "node deps.js"\n').replace('pre-merge: "node ok.js"', 'pre-merge: "node slow.js"'));
  commitAll(p.main, 'compuerta lenta');
  git(['branch', '-f', 'int/p', 'main'], p.main);
  const t0 = Date.now();
  const a = implement(p, '01', 'a', { 'src/a.js': '1\n' }, { register: false });
  const t1 = Date.now();
  const b = implement(p, '02', 'b', { 'src/b.js': '1\n' }, { register: false });
  const t2 = Date.now();
  for (const w of [a, b]) assert.ok(fs.existsSync(path.join(w.worktree, 'node_modules', '.cache', 'ok')), 'deps-install corrió dentro de cada worktree');
  const q0 = Date.now();
  const r = sh('queue.js', ['run', '--plan', 'p', '--task', a.branch], p.main, p.env);
  const q1 = Date.now();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(q1 - q0 >= 3000, 'la compuerta de fixture tarda 3 s');
  t.diagnostic(`worktree + deps-install: ${t1 - t0} ms y ${t2 - t1} ms (seguidas, sin pelearse); entrada de la cola con una compuerta de 3 s: ${q1 - q0} ms (la máquina tranquila y una sola suite: G8)`);
});

test('humo por el launcher real: un implementer con agent_id que ejecuta queue.js run sale con exit 2 y Alternativa; leer el script pasa', () => {
  const repo = makeRepo();
  const payload = (who, command = `node "${P}/scripts/queue.js" run --plan p --task 01`) => ({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: repo, permission_mode: 'default', ...who,
  });
  const denied = runLauncher('guard', payload({ agent_id: 'a1', agent_type: 'pignolo:implementer' }), { PIGNOLO_CANARY: '1' });
  assert.strictEqual(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, /Alternativa: la cola la opera el integrator; pedile la integración al hilo principal/);
  const read = runLauncher('guard', payload({ agent_id: 'a1', agent_type: 'pignolo:implementer' }, `cat "${P}/scripts/queue.js"`), { PIGNOLO_CANARY: '1' });
  assert.strictEqual(read.status, 0, read.stderr);
  assert.strictEqual(runLauncher('guard', payload({}), { PIGNOLO_CANARY: '1' }).status, 0);
  assert.strictEqual(runLauncher('guard', payload({ agent_id: 'a2', agent_type: 'pignolo:integrator' }), { PIGNOLO_CANARY: '1' }).status, 0);
});
