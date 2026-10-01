'use strict';
// Hito 8d, Task 7: scripts/places.js (where, report, fix, undo).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');
const SM = require('../plugins/pignolo/lib/safe-move');
const places = require('../plugins/pignolo/scripts/places');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'places.js');
const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const status = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const verbOf = (args) => args.find((a) => !a.startsWith('-'));

function cli(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: cwd || undefined, env: env || process.env, encoding: 'utf8', timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const declare = (repo, yaml) => put(repo, '.pignolo/project.md', `---\ntype: docs\n${yaml}\n---\n`);
const approvalFile = (list) => { const f = path.join(makeTempDir('pignolo-appr-'), 'moves.json'); fs.writeFileSync(f, JSON.stringify({ v: 1, approved: list })); return f; };

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

function misplacedRepo() {
  const repo = makeRepo();
  declare(repo, 'places:\n  spec: docs/specs/');
  put(repo, '2026-10-01-a-design.md', '# a\n');
  put(repo, '2026-10-02-b-design.md', '# b\n');
  put(repo, 'README.md', 'ver [a](2026-10-01-a-design.md)\n');
  commitAll(repo);
  return repo;
}

test('where: default, declarado, reference sin declarar, tipo desconocido, no crea nada', () => {
  const repo = makeRepo();
  const h = hashTree(repo);
  let r = cli(['where', 'spec', '--cwd', repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual({ path: r.json.path, source: r.json.source, declared: r.json.declared, exists: r.json.exists }, { path: 'docs/specs/', source: 'default', declared: false, exists: false });
  r = cli(['where', 'reference', '--cwd', repo]);
  assert.equal(r.status, 0);
  assert.equal(r.json.path, null);
  assert.equal(r.json.declared, false);
  assert.equal(cli(['where', 'cosa', '--cwd', repo]).status, 2);
  assert.equal(hashTree(repo), h, 'where no crea ninguna carpeta');
  declare(repo, 'places:\n  spec: doc/specs/');
  put(repo, 'doc/specs/a.md');
  r = cli(['where', 'spec', '--cwd', repo]);
  assert.deepEqual({ path: r.json.path, source: r.json.source, declared: r.json.declared, exists: r.json.exists }, { path: 'doc/specs/', source: 'declared', declared: true, exists: true });
});

test('where: un enlace es link-in-path, un project.md inválido es invalid-config, una carpeta inexistente es exists:false', (t) => {
  const repo = makeRepo();
  const outside = makeTempDir('pignolo-outside-');
  let r = cli(['where', 'plan', '--cwd', repo]);
  assert.equal(r.status, 0);
  assert.equal(r.json.exists, false);
  declare(repo, 'gates: [a, b]');
  r = cli(['where', 'spec', '--cwd', repo]);
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'invalid-config');
  assert.match(r.stderr, /Alternativa:/);
  fs.rmSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs'));
  if (!tryLink(t, outside, path.join(repo, 'docs', 'specs'))) return;
  r = cli(['where', 'spec', '--cwd', repo]);
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'link-in-path');
  assert.equal(r.json.path, undefined);
});

test('report: limpio, con un .env suelto, un spec fuera de lugar, un tipo declarado sin carpeta y un tipo dejado', () => {
  const repo = makeRepo();
  put(repo, 'docs/specs/ok.md');
  commitAll(repo);
  const h = hashTree(repo);
  let r = cli(['report', '--cwd', repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.summary, '');
  assert.equal(r.json.lines, 0);
  assert.equal(hashTree(repo), h, 'solo lectura');

  put(repo, '.env', 'A=1\n');
  r = cli(['report', '--cwd', repo]);
  assert.equal(r.status, 0);
  assert.equal(r.json.stray[0].severity, 'high');
  assert.equal(r.json.stray[0].suggest, undefined);
  assert.match(r.json.summary, /^\d+ archivos sueltos o mal ubicados: corré `places\.js report` para verlos y moverlos$/);
  assert.ok(r.json.summary.length <= 200);
  assert.equal(r.json.lines, 1);

  const repo2 = misplacedRepo();
  r = cli(['report', '--cwd', repo2]);
  assert.equal(r.status, 0);
  assert.equal(r.json.misplaced.length, 2);
  assert.ok(r.json.misplaced.every((m) => m.suggest && m.suggest.to.startsWith('docs/specs/')));
  assert.ok(r.json.missing.includes('spec'), 'declarado y sin carpeta');

  const repo3 = makeRepo();
  put(repo3, 'doc/specs/a.md');
  put(repo3, '2026-10-01-z-design.md');
  commitAll(repo3);
  r = cli(['report', '--cwd', repo3]);
  assert.ok(r.json.left.includes('spec'));
  assert.deepEqual(r.json.misplaced, [], 'un tipo dejado no genera avisos de mal ubicados');
  assert.equal(r.status, 0);
});

test('fix preview y apply: parcial, sin --expect, stamp viejo, aprobados que no estaban, strays y no documentos', () => {
  const repo = misplacedRepo();
  const h0 = hashTree(repo);
  const pv = cli(['fix', 'preview', '--cwd', repo]);
  assert.equal(pv.status, 0, pv.stderr);
  assert.deepEqual(pv.json.items.map((i) => [i.from, i.to, i.status]), [
    ['2026-10-01-a-design.md', 'docs/specs/2026-10-01-a-design.md', 'ok'],
    ['2026-10-02-b-design.md', 'docs/specs/2026-10-02-b-design.md', 'ok'],
  ]);
  assert.equal(typeof pv.json.stamp, 'string');
  assert.equal(pv.json.rewrites.length, 1);
  assert.equal(hashTree(repo), h0, 'preview no escribe');

  const file = approvalFile(['2026-10-01-a-design.md']);
  assert.equal(cli(['fix', 'apply', '--moves', file, '--cwd', repo]).status, 2, 'sin --expect');
  assert.equal(cli(['fix', 'apply', '--moves', approvalFile(['otro.md']), '--expect', pv.json.stamp, '--cwd', repo]).status, 2, 'aprobado que no está en la vista previa');

  put(repo, '2026-10-02-b-design.md', '# b cambió\n');
  const stale = cli(['fix', 'apply', '--moves', file, '--expect', pv.json.stamp, '--cwd', repo]);
  assert.equal(stale.status, 1);
  assert.equal(stale.json.kind, 'stale-preview');
  assert.match(stale.stderr, /Alternativa:/);
  assert.ok(fs.existsSync(path.join(repo, '2026-10-01-a-design.md')));
  commitAll(repo, 'b');

  const pv2 = cli(['fix', 'preview', '--cwd', repo]);
  put(repo, '.env', 'A=1\n');
  put(repo, 'x.js', 'x\n');
  commitAll(repo, 'js');
  put(repo, '.env2', 'A=1\n');
  put(repo, 'suelto.md', 'suelto\n');
  const pv3 = cli(['fix', 'preview', '--cwd', repo]);
  const ap = cli(['fix', 'apply', '--moves', approvalFile(['.env2', 'suelto.md', 'x.js', '2026-10-01-a-design.md']), '--expect', pv3.json.stamp, '--cwd', repo]);
  assert.equal(ap.status, 0, ap.stderr);
  const byFrom = Object.fromEntries(ap.json.items.map((i) => [i.from, i]));
  assert.equal(byFrom['.env2'].status, 'refused');
  assert.equal(byFrom['suelto.md'].reason, 'stray-never-moves');
  assert.equal(byFrom['x.js'].reason, 'contains-non-doc');
  assert.equal(byFrom['2026-10-01-a-design.md'].status, 'done');
  assert.ok(fs.existsSync(path.join(repo, 'docs/specs/2026-10-01-a-design.md')));
  assert.ok(fs.existsSync(path.join(repo, '2026-10-02-b-design.md')), 'el otro ítem queda');
  assert.ok(fs.existsSync(path.join(repo, '.env2')) && fs.existsSync(path.join(repo, 'x.js')));
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'ver [a](docs/specs/2026-10-01-a-design.md)\n');
  assert.ok(pv2.json.stamp !== pv3.json.stamp);
});

test('undo tras un fix apply sin commitear: idéntico, idempotente, validaciones del registro', () => {
  const repo = misplacedRepo();
  const h = hashTree(repo);
  const before = status(repo);
  const pv = cli(['fix', 'preview', '--cwd', repo]);
  const ap = cli(['fix', 'apply', '--moves', approvalFile(['2026-10-01-a-design.md']), '--expect', pv.json.stamp, '--cwd', repo]);
  assert.equal(ap.status, 0, ap.stderr);
  assert.ok(ap.json.record);
  const u = cli(['undo', '--record', ap.json.record, '--cwd', repo]);
  assert.equal(u.status, 0, u.stderr);
  assert.equal(hashTree(repo), h);
  assert.equal(status(repo), before);
  const u2 = cli(['undo', '--record', ap.json.record, '--cwd', repo]);
  assert.equal(u2.status, 0);
  assert.equal(u2.json.already, 'undone');

  // el registro debe estar bajo PIGNOLO_HOME/init-backup
  const stray = path.join(makeTempDir('pignolo-rec-'), 'moves.json');
  fs.copyFileSync(ap.json.record, stray);
  assert.equal(cli(['undo', '--record', stray, '--cwd', repo]).status, 2);

  // un registro de otro repo
  const repoB = misplacedRepo();
  const pvA = cli(['fix', 'preview', '--cwd', repo]);
  const apA = cli(['fix', 'apply', '--moves', approvalFile(['2026-10-01-a-design.md']), '--expect', pvA.json.stamp, '--cwd', repo]);
  assert.equal(apA.status, 0, apA.stderr);
  assert.equal(cli(['undo', '--record', apA.json.record, '--cwd', repoB]).status, 2);

  // un archivo reescrito modificado después: modified-since y nada revertido
  fs.writeFileSync(path.join(repo, 'README.md'), 'otra cosa\n');
  const h2 = hashTree(repo);
  const bad = cli(['undo', '--record', apA.json.record, '--cwd', repo]);
  assert.equal(bad.status, 1);
  assert.equal(bad.json.refused, 'modified-since');
  assert.match(bad.stderr, /Alternativa:/);
  assert.equal(hashTree(repo), h2);
});

test('ningún subcomando ejecuta commit/add/push; cada mv trae un origen; un movimiento a medias es exit 3 con el registro', () => {
  const repo = misplacedRepo();
  const real = SM.makeRun(repo);
  const calls = [];
  let failNext = false;
  const run = (args, cwd, o) => { calls.push(args); if (failNext && verbOf(args) === 'mv') { const e = new Error('fatal: simulated'); e.status = 128; throw e; } return real(args, cwd, o); };
  const env = { ...process.env };
  const pv = places.main(['fix', 'preview', '--cwd', repo], env, { run });
  const f = approvalFile(['2026-10-01-a-design.md']);
  const ap = places.main(['fix', 'apply', '--moves', f, '--expect', pv.body.stamp, '--cwd', repo], env, { run });
  assert.equal(ap.code, 0);
  places.main(['undo', '--record', ap.body.record, '--cwd', repo], env, { run });
  places.main(['report', '--cwd', repo], env, { run });
  places.main(['where', 'spec', '--cwd', repo], env, { run });
  assert.ok(calls.length > 0);
  const allowed = new Set(['status', 'ls-files', 'rev-parse', 'mv', 'worktree', 'check-ignore', 'config', 'diff']);
  for (const a of calls) assert.ok(allowed.has(verbOf(a)), a.join(' '));
  for (const a of calls.filter((x) => verbOf(x) === 'mv')) assert.equal(a.filter((x) => x !== 'mv' && x !== '--').length, 2);

  const pv2 = places.main(['fix', 'preview', '--cwd', repo], env, { run });
  failNext = true;
  assert.throws(() => places.main(['fix', 'apply', '--moves', f, '--expect', pv2.body.stamp, '--cwd', repo], env, { run }), (e) => e.code === 1 && e.kind === 'failed' && Boolean(e.extra.record));
  failNext = false;
  // dos ítems: el segundo falla
  const pv3 = places.main(['fix', 'preview', '--cwd', repo], env, { run });
  let n = 0;
  const run2 = (args, cwd, o) => { if (verbOf(args) === 'mv') { n += 1; if (n === 2) { const e = new Error('fatal: simulated'); e.status = 128; throw e; } } return real(args, cwd, o); };
  const two = approvalFile(['2026-10-01-a-design.md', '2026-10-02-b-design.md']);
  assert.throws(() => places.main(['fix', 'apply', '--moves', two, '--expect', pv3.body.stamp, '--cwd', repo], env, { run: run2 }), (e) => e.code === 3 && e.kind === 'partial' && Boolean(e.extra.record));
});

test('fuera de un repo: not-a-repo con Alternativa en stderr', () => {
  const dir = makeTempDir('pignolo-norepo-');
  const r = cli(['report', '--cwd', dir]);
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'not-a-repo');
  assert.match(r.stderr, /Alternativa:/);
});
