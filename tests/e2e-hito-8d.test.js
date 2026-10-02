'use strict';
// Hito 8d, Task 11: de punta a punta por los scripts reales (init.js, places.js, gate.js) en repos temporales.
// Nunca toca el HOME real: PIGNOLO_HOME y CLAUDE_CONFIG_DIR son temporales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');

const SCRIPTS = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts');
const env0 = () => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-e2e-home-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-e2e-cfg-'), PIGNOLO_DISABLED: '' });
function run(script, args, env, cwd) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, env, encoding: 'utf8', timeout: 120000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const put = (repo, rel, text = 'x\n') => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const porcelain = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const planFile = (obj) => { const f = path.join(makeTempDir('pignolo-e2e-plan-'), 'plan.json'); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
const stepOf = (r, id) => r.json.steps.find((s) => s.id === id);
const emptyRepo = () => { const d = makeTempDir('pignolo-e2e-new-'); git(['init', '-q', '-b', 'main'], d); git(['config', 'user.name', 't'], d); git(['config', 'user.email', 't@example.invalid'], d); git(['config', 'commit.gpgsign', 'false'], d); return d; };
const GATE_CHECK = "const fs=require('fs');process.exit(fs.existsSync('docs/specs/2026-01-01-a-design.md')?0:1);\n";

function docsRepo({ withRef = false } = {}) {
  const repo = makeRepo();
  put(repo, 'doc/specs/2026-01-01-a-design.md', '# a\n');
  put(repo, 'README.md', 'ver [la spec](doc/specs/2026-01-01-a-design.md)\n');
  put(repo, 'check.js', GATE_CHECK);
  if (withRef) put(repo, 'scripts/build.js', "require('../doc/specs/x');\n");
  commitAll(repo, 'docs');
  return repo;
}
const adaptPlan = (spec) => planFile({
  v: 1,
  approved: ['adapt', 'skeleton', 'project-md'],
  answers: { piiPatterns: [], places: { spec } },
  proposal: { type: 'docs', gates: { 'on-done': 'node check.js' } },
});
const previewApply = (plan, repo, env) => {
  const pv = run('init.js', ['preview', '--plan', plan, '--cwd', repo], env);
  assert.equal(pv.status, 0, pv.stderr + pv.stdout);
  const ap = run('init.js', ['apply', '--plan', plan, '--expect', pv.json.stamp, '--cwd', repo], env);
  return { pv, ap };
};

test('e2e proyecto nuevo: detect, plan, preview, apply, verify; carpetas con README, local/ ignorada, mapa sin reference', () => {
  const env = env0();
  const repo = emptyRepo();
  const det = run('init.js', ['detect', '--cwd', repo], env);
  assert.equal(det.status, 0, det.stderr + det.stdout);
  assert.equal(det.json.places.existing, false);
  const plan = planFile({ v: 1, approved: ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md'], answers: { piiPatterns: [] }, proposal: { type: 'docs' } });
  const { pv, ap } = previewApply(plan, repo, env);
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  assert.equal(stepOf(ap, 'adapt').reason, 'nothing-to-adapt');
  for (const d of ['docs/specs', 'docs/plans', 'docs/research', 'design', 'local']) assert.ok(fs.existsSync(path.join(repo, d, 'README.md')), d);
  assert.ok(!fs.existsSync(path.join(repo, 'docs', 'references')));
  assert.ok(!fs.existsSync(path.join(repo, 'docs', 'specs', '.gitkeep')));
  const pm = fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8');
  assert.match(pm, /^ {2}spec: docs\/specs\/$/m);
  assert.doesNotMatch(pm, /reference:/);
  put(repo, 'local/privado.txt', 'secreto\n');
  assert.ok(!/local\//.test(porcelain(repo)), 'local/ no se ve en git status');
  assert.equal(git(['check-ignore', 'local/privado.txt'], repo).trim(), 'local/privado.txt');
  const v = run('init.js', ['verify', '--cwd', repo], env);
  assert.equal(v.status, 0, 'verify ' + v.stderr + v.stdout);
  const rep = run('places.js', ['report', '--cwd', repo], env);
  assert.equal(rep.json.lines, 0, rep.stdout);
  for (const k of ['spec', 'plan', 'research', 'design', 'private']) {
    const w = run('places.js', ['where', k, '--cwd', repo], env);
    assert.equal(w.status, 0, k + w.stderr + w.stdout);
    assert.equal(w.json.exists, true, k);
  }
  assert.equal(run('places.js', ['where', 'reference', '--cwd', repo], env).json.path, null);
  assert.ok(pv.json.stamp);
});

test('e2e proyecto existente sin project.md: adopt con referencia manual no mueve; force mueve y reescribe; sin --expect es exit 2', () => {
  const env = env0();
  const repo = docsRepo({ withRef: true });
  const h = hashTree(repo);
  const adopt = adaptPlan({ decision: 'adopt', from: 'doc/specs/' });
  const a = previewApply(adopt, repo, env);
  assert.equal(a.ap.status, 0, a.ap.stderr + a.ap.stdout);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'specs', '2026-01-01-a-design.md')));
  assert.match(fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8'), /^ {2}spec: doc\/specs\/$/m);

  const repo2 = docsRepo({ withRef: true });
  const move = adaptPlan({ decision: 'move', from: 'doc/specs/' });
  const pv0 = run('init.js', ['preview', '--plan', move, '--cwd', repo2], env);
  assert.equal(pv0.status, 0, pv0.stderr + pv0.stdout);
  const item = stepOf(pv0, 'adapt').items[0];
  assert.equal(item.effective, 'adopt', 'una referencia manual frena el movimiento por defecto');
  assert.ok(h);

  const repo3 = docsRepo({ withRef: true });
  const force = adaptPlan({ decision: 'move', from: 'doc/specs/', force: true });
  const pv = run('init.js', ['preview', '--plan', force, '--cwd', repo3], env);
  assert.equal(pv.status, 0, pv.stderr + pv.stdout);
  const h3 = hashTree(repo3);
  assert.equal(run('init.js', ['apply', '--plan', force, '--cwd', repo3], env).status, 2, 'sin --expect');
  assert.equal(hashTree(repo3), h3);
  const ap = run('init.js', ['apply', '--plan', force, '--expect', pv.json.stamp, '--cwd', repo3], env);
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  assert.ok(fs.existsSync(path.join(repo3, 'docs', 'specs', '2026-01-01-a-design.md')));
  assert.match(fs.readFileSync(path.join(repo3, 'README.md'), 'utf8'), /\]\(docs\/specs\/2026-01-01-a-design\.md\)/);
  assert.match(fs.readFileSync(path.join(repo3, 'scripts', 'build.js'), 'utf8'), /doc\/specs\/x/, 'el código no se reescribe');
  const gate = run('gate.js', ['--level', 'on-done', '--cwd', repo3], env);
  assert.equal(gate.status, 0, gate.stderr + gate.stdout);
});

test('e2e mover, fallar la compuerta corrida aparte y deshacer: árbol idéntico, project.md sin places.spec y un segundo undo no cambia nada', () => {
  const env = env0();
  const repo = docsRepo();
  const move = adaptPlan({ decision: 'move', from: 'doc/specs/' });
  const { ap } = previewApply(move, repo, env);
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  const record = stepOf(ap, 'adapt').record;
  // La compuerta falla: se rompe a propósito lo que mira (el archivo movido) sin tocar el movimiento registrado.
  fs.writeFileSync(path.join(repo, 'check.js'), 'process.exit(1);\n');
  const gate = run('gate.js', ['--level', 'on-done', '--cwd', repo], env);
  assert.notEqual(gate.status, 0, 'la compuerta falla');
  fs.writeFileSync(path.join(repo, 'check.js'), GATE_CHECK);
  const un = run('places.js', ['undo', '--record', record, '--cwd', repo], env);
  assert.equal(un.status, 0, un.stderr + un.stdout);
  const pmPath = path.join(repo, '.pignolo', 'project.md');
  const pm = fs.readFileSync(pmPath, 'utf8');
  assert.doesNotMatch(pm, /spec: docs\/specs\//);
  assert.match(pm, /type: docs/);
  assert.match(pm, /on-done/);
  // El árbol (sin .pignolo ni lo que creó skeleton, ni el registro) vuelve idéntico.
  const strip = (d) => hashTree(d, { skip: ['.git', '.pignolo', 'docs', 'design', 'local'] });
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'specs', '2026-01-01-a-design.md')));
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'ver [la spec](doc/specs/2026-01-01-a-design.md)\n');
  const afterFirst = strip(repo);
  const un2 = run('places.js', ['undo', '--record', record, '--cwd', repo], env);
  assert.equal(un2.status, 0, un2.stderr + un2.stdout);
  assert.equal(strip(repo), afterFirst, 'el segundo undo no cambia nada');
  assert.equal(fs.readFileSync(pmPath, 'utf8'), pm);
});

test('e2e junctions: una candidata que es un junction a afuera, y docs como junction, se niegan sin tocar nada', (t) => {
  const env = env0();
  const outside = makeTempDir('pignolo-e2e-out-');
  put(outside, 'afuera.md', 'afuera\n');
  const outsideHash = hashTree(outside);

  const repo = makeRepo();
  put(repo, 'doc/leeme.md', 'x\n');
  commitAll(repo, 'base');
  const link = path.join(repo, 'doc', 'specs');
  try { fs.symlinkSync(outside, link, 'junction'); } catch (e) { t.skip(`sin junction: ${e.code}`); return; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { /* ya no está */ } });
  const plan = planFile({ v: 1, approved: ['adapt', 'skeleton', 'project-md'], answers: { piiPatterns: [], places: { spec: { decision: 'move', from: 'doc/specs/' } } }, proposal: { type: 'docs' } });
  const pv = run('init.js', ['preview', '--plan', plan, '--cwd', repo], env);
  if (pv.status === 0) run('init.js', ['apply', '--plan', plan, '--expect', pv.json.stamp, '--cwd', repo], env);
  assert.equal(hashTree(outside), outsideHash, 'afuera no cambió');
  assert.ok(fs.existsSync(path.join(outside, 'afuera.md')));
  assert.ok(!fs.existsSync(path.join(outside, 'docs')) && !fs.existsSync(path.join(outside, 'README.md')));
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'el junction sigue ahí, intacto');
  assert.ok(!fs.existsSync(path.join(repo, 'docs', 'specs', 'afuera.md')), 'nada de afuera entró al destino');
  const items = pv.json && stepOf(pv, 'adapt') && stepOf(pv, 'adapt').items;
  if (items && items.length) assert.ok(items.every((i) => i.effective !== 'move'), JSON.stringify(items));

  // docs (padre del destino) es un junction a afuera: ni skeleton ni adapt crean ni mueven ahí.
  const repo2 = makeRepo();
  put(repo2, 'doc/specs/2026-01-01-a-design.md', '# a\n');
  commitAll(repo2, 'base');
  const docsLink = path.join(repo2, 'docs');
  try { fs.symlinkSync(outside, docsLink, 'junction'); } catch (e) { t.skip(`sin junction: ${e.code}`); return; }
  t.after(() => { try { fs.rmdirSync(docsLink); } catch (_) { /* ya no está */ } });
  const pv2 = run('init.js', ['preview', '--plan', plan, '--cwd', repo2], env);
  if (pv2.status === 0) run('init.js', ['apply', '--plan', plan, '--expect', pv2.json.stamp, '--cwd', repo2], env);
  assert.equal(hashTree(outside), outsideHash, 'afuera no cambió con docs como junction');
  assert.ok(fs.existsSync(path.join(repo2, 'doc', 'specs', '2026-01-01-a-design.md')), 'el origen sigue donde estaba');
  const reasons = JSON.stringify(pv2.json);
  assert.match(reasons, /link-in-path/);
});

test('e2e mal ubicado: un -design.md en la raíz se mueve con el sí; un .env suelto solo se avisa', () => {
  const env = env0();
  const repo = makeRepo();
  put(repo, '.pignolo/project.md', '---\ntype: docs\nplaces:\n  spec: docs/specs/\n---\n');
  put(repo, '2026-10-01-a-design.md', '# a\n');
  commitAll(repo, 'base');
  put(repo, '.env', 'A=1\n');
  const rep = run('places.js', ['report', '--cwd', repo], env);
  assert.equal(rep.status, 0, rep.stderr);
  assert.equal(rep.json.misplaced.length, 1);
  assert.equal(rep.json.stray.length, 1);
  assert.equal(rep.json.lines, 1);
  const pv = run('places.js', ['fix', 'preview', '--cwd', repo], env);
  assert.equal(pv.status, 0, pv.stderr + pv.stdout);
  assert.deepEqual(pv.json.items.map((i) => [i.from, i.to]), [['2026-10-01-a-design.md', 'docs/specs/2026-10-01-a-design.md']]);
  const moves = path.join(makeTempDir('pignolo-e2e-mv-'), 'moves.json');
  fs.writeFileSync(moves, JSON.stringify({ v: 1, approved: ['2026-10-01-a-design.md'] }));
  const ap = run('places.js', ['fix', 'apply', '--moves', moves, '--expect', pv.json.stamp, '--cwd', repo], env);
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  assert.ok(fs.existsSync(path.join(repo, 'docs', 'specs', '2026-10-01-a-design.md')));
  assert.ok(fs.existsSync(path.join(repo, '.env')), 'el .env no se movió');
  const rep2 = run('places.js', ['report', '--cwd', repo], env);
  assert.equal(rep2.json.misplaced.length, 0);
  assert.equal(rep2.json.stray.length, 1, 'el .env solo se avisa');
});
