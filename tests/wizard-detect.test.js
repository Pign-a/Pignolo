'use strict';
// Detección para el asistente de inicio (etapa 3 del panel, T1): resumen, escritura segura bajo .git/pignolo/ y hook de arranque.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT } = require('./helpers');
const W = require('../plugins/pignolo/lib/wizard-detect');
const ss = require('../plugins/pignolo/hooks/handlers/session-start');

const INIT = path.join(PLUGIN_ROOT, 'scripts', 'init.js');
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const FILE = (repo) => path.join(repo, '.git', 'pignolo', 'wizard-detect.json');

function nodeRepo() {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '1' } }));
  write(repo, 'package-lock.json', '{}');
  write(repo, 'src/a.test.ts', '// t\n');
  commitAll(repo, 'base');
  return repo;
}
// Un repo recién creado solo con README: en blanco (a.txt de makeRepo es código).
function blankRepo() {
  const repo = makeRepo();
  git(['rm', '-q', 'a.txt'], repo);
  write(repo, 'README.md', '# x\n');
  commitAll(repo, 'solo readme');
  return repo;
}
const startup = (repo, extra = {}, source = 'startup') => ss.run({ source, cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') }, ...extra });

test('wizard-detect: a Node project with a test script gives type, tests command and the three profiles with balanced recommended', () => {
  const repo = nodeRepo();
  const d = W.buildWizardDetect({ main: repo });
  assert.equal(d.schema, 'pignolo-wizard-detect/1');
  assert.match(d.id, /^[0-9a-f]{12}$/);
  assert.equal(d.blank, false);
  assert.equal(d.project.type, 'code-tested');
  assert.deepEqual(d.project.stacks, ['node']);
  assert.equal(d.project.tests.state, 'declared');
  assert.equal(d.project.tests.cmd, 'npm run test');
  assert.equal(d.project.main, 'main');
  assert.deepEqual(d.profiles.map((p) => p.id), ['balanced', 'economy', 'max']);
  assert.deepEqual(d.profiles.filter((p) => p.recommended).map((p) => p.id), ['balanced']);
});

test('wizard-detect: the permission groups come from the shipped permissions template and none has an absolute path', () => {
  const repo = nodeRepo();
  const d = W.buildWizardDetect({ main: repo });
  assert.deepEqual(d.permissions.groups.map((g) => g.id), ['blocks', 'asks', 'free']);
  const tpl = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions;
  assert.ok(tpl.deny.length > 0 && tpl.ask.length > 0);
  // sin reglas en la plantilla no hay grupo de bloqueo ni de pregunta: lo que se dice sale de ella
  const none = W.permissionGroups(() => ({ permissions: { deny: [], ask: [] } }));
  assert.deepEqual(none.map((g) => g.id), ['free']);
  const some = W.permissionGroups(() => ({ permissions: { deny: ['Bash(git push -f *)'], ask: [] } }));
  assert.match(some[0].line, /push -f/);
  assert.doesNotMatch(some[0].line, /reset --hard/);
  for (const g of d.permissions.groups) {
    assert.doesNotMatch(g.line, /[A-Za-z]:[\\/]|^\/|\\\\|Users/);
    assert.doesNotMatch(g.line, /[\r\n]/);
  }
});

test('wizard-detect: a blank project gives blank true and no project, places or permissions detail', () => {
  const repo = blankRepo();
  const d = W.buildWizardDetect({ main: repo });
  assert.equal(d.blank, true);
  assert.equal(d.project, null);
  assert.deepEqual(d.places.candidates, []);
  assert.deepEqual(d.permissions.groups, []);
  assert.deepEqual(d.profiles, []);
  assert.match(d.id, /^[0-9a-f]{12}$/);
});

test('wizard-detect: folders that look like specs or plans appear as candidates with adopt as the decision and their moves listed', () => {
  const repo = nodeRepo();
  write(repo, 'specs/a-design.md', '# a\n');
  write(repo, 'plans/b-plan.md', '# b\n');
  commitAll(repo, 'carpetas');
  const d = W.buildWizardDetect({ main: repo });
  const kinds = d.places.candidates.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ['plan', 'spec']);
  const spec = d.places.candidates.find((c) => c.kind === 'spec');
  assert.equal(spec.decision, 'adopt');
  assert.equal(spec.from, 'specs/');
  assert.equal(spec.to, 'docs/specs/');
  assert.deepEqual(spec.moves, [{ from: 'specs/', to: 'docs/specs/' }]);
  // una carpeta que ya está en su lugar no es candidata
  const ok = nodeRepo();
  write(ok, 'docs/specs/x.md', '# x\n');
  commitAll(ok, 'en su lugar');
  assert.deepEqual(W.buildWizardDetect({ main: ok }).places.candidates, []);
});

test('wizard-detect: the id changes when the detection changes and not when only offer changes', () => {
  const repo = nodeRepo();
  const a = W.buildWizardDetect({ main: repo });
  const b = W.buildWizardDetect({ main: repo });
  assert.equal(a.id, b.id);
  assert.equal(W.idOf({ ...a, offer: true }), a.id);
  assert.equal(W.idOf({ ...a, offer: false }), a.id);
  write(repo, 'specs/a-design.md', '# a\n');
  commitAll(repo, 'carpeta');
  assert.notEqual(W.buildWizardDetect({ main: repo }).id, a.id);
});

test('wizard-detect: write goes to .git/pignolo/wizard-detect.json by temporary file and rename and the file is valid JSON at every moment', () => {
  const repo = nodeRepo();
  const data = { ...W.buildWizardDetect({ main: repo }), offer: true };
  const first = W.writeWizardDetect(repo, data);
  assert.equal(path.resolve(first.path), path.resolve(FILE(repo)));
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE(repo), 'utf8')), data);
  // el temporal se crea aparte y se renombra: se observa cada escritura y rename
  const seen = [];
  const spy = { ...fs, writeFileSync: (f, ...a) => { seen.push(['write', path.basename(String(f))]); return fs.writeFileSync(f, ...a); }, renameSync: (a, b) => { seen.push(['rename', path.basename(String(a)), path.basename(String(b))]); return fs.renameSync(a, b); } };
  const second = W.writeWizardDetect(repo, { ...data, offer: false }, spy);
  assert.ok(second.path);
  const w = seen.find((s) => s[0] === 'write');
  assert.notEqual(w[1], 'wizard-detect.json');
  assert.match(w[1], /\.tmp$/);
  assert.deepEqual(seen.find((s) => s[0] === 'rename').slice(2), ['wizard-detect.json']);
  assert.deepEqual(fs.readdirSync(path.join(repo, '.git', 'pignolo')), ['wizard-detect.json']);
  assert.equal(JSON.parse(fs.readFileSync(FILE(repo), 'utf8')).offer, false);
  // más de 64 KB no se escribe
  const big = W.writeWizardDetect(repo, { ...data, pad: 'x'.repeat(70 * 1024) });
  assert.deepEqual(big, { skipped: 'too-big' });
  assert.equal(JSON.parse(fs.readFileSync(FILE(repo), 'utf8')).offer, false);
});

test('wizard-detect: with .git as a file (worktree) nothing is written and the reason is reported', () => {
  const dir = makeTempDir('pignolo-wt-');
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /algun/lado/.git/worktrees/x\n');
  const r = W.writeWizardDetect(dir, { schema: W.SCHEMA });
  assert.deepEqual(r, { skipped: 'git-is-a-file' });
  assert.deepEqual(fs.readdirSync(dir), ['.git']);
  assert.equal(W.offerFirst(dir), false);
  assert.deepEqual(fs.readdirSync(dir), ['.git']);
});

test('wizard-detect: with .git/pignolo as a junction or symlink outside the project nothing is written outside', (t) => {
  const repo = nodeRepo();
  const outside = makeTempDir('pignolo-outside-');
  try { fs.symlinkSync(outside, path.join(repo, '.git', 'pignolo'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { t.skip(`sin permiso para crear el enlace: ${e.code}`); return; }
  const r = W.writeWizardDetect(repo, { schema: W.SCHEMA, offer: true });
  assert.deepEqual(r, { skipped: 'link-in-path' });
  assert.equal(W.offerFirst(repo), false);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.deepEqual(W.writeFor(repo), { skipped: 'unsafe' });
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('wizard-detect: with .git itself a link nothing is written through it', (t) => {
  const real = nodeRepo();
  const holder = makeTempDir('pignolo-linkgit-');
  try { fs.symlinkSync(path.join(real, '.git'), path.join(holder, '.git'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { t.skip(`sin permiso para crear el enlace: ${e.code}`); return; }
  assert.deepEqual(W.writeWizardDetect(holder, { schema: W.SCHEMA }), { skipped: 'git-is-a-link' });
  assert.equal(fs.existsSync(path.join(real, '.git', 'pignolo')), false);
});

test('wizard-detect: offerFirst is true once and false afterwards', () => {
  const repo = nodeRepo();
  assert.equal(W.offerFirst(repo), true);
  assert.equal(W.offerFirst(repo), false);
  assert.equal(W.offerFirst(repo), false);
  assert.ok(fs.existsSync(path.join(repo, '.git', 'pignolo', 'wizard-offered')));
});

test('wizard-detect: the verb never creates .pignolo and leaves git status clean', () => {
  const repo = nodeRepo();
  const before = git(['status', '--porcelain', '--untracked-files=all'], repo);
  const run = (args) => spawnSync(process.execPath, [INIT, 'wizard-detect', '--cwd', repo, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-home-') } });
  const dry = run([]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).schema, 'pignolo-wizard-detect/1');
  assert.equal(fs.existsSync(FILE(repo)), false); // sin --write no escribe nada
  const wr = run(['--write']);
  assert.equal(wr.status, 0, wr.stderr);
  assert.ok(fs.existsSync(FILE(repo)));
  assert.equal(JSON.parse(wr.stdout).path.replace(/\\/g, '/').endsWith('.git/pignolo/wizard-detect.json'), true);
  assert.equal(fs.existsSync(path.join(repo, '.pignolo')), false);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all'], repo), before);
  const bad = spawnSync(process.execPath, [INIT, 'wizard-detect', '--bogus'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

// El hook no espera: lanza un proceso desacoplado. `wizardSpawn` (solo tests) cuenta los lanzamientos sin correrlos.
const spy = () => { const calls = []; return { calls, wizardSpawn: (main, budget) => calls.push([main, budget]) }; };
async function waitFor(fn, ms = 30000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, 150));
  }
}
const readOffer = (repo) => { try { return JSON.parse(fs.readFileSync(FILE(repo), 'utf8')).offer; } catch (_) { return undefined; } };

test('wizard-detect: a file that is not UTF-8, empty, huge or with a BOM never makes the hook or the writer throw', () => {
  const repo = nodeRepo();
  fs.mkdirSync(path.join(repo, '.git', 'pignolo'), { recursive: true });
  for (const content of [Buffer.from([0xff, 0xfe, 0x00, 0xc3]), Buffer.alloc(0), Buffer.alloc(200 * 1024, 0x61), Buffer.from('\uFEFF{"x":1}')]) {
    fs.writeFileSync(FILE(repo), content);
    assert.doesNotThrow(() => startup(repo, spy()));
    assert.doesNotThrow(() => W.writeFor(repo));
    JSON.parse(fs.readFileSync(FILE(repo), 'utf8')); // se reemplazó por uno válido
  }
});

test('session-start: without project.md the detection is launched on startup and resume and not on clear, compact, status or fork', () => {
  for (const [source, expected] of [['startup', 1], ['resume', 1], ['clear', 0], ['compact', 0], ['status', 0], ['fork', 0]]) {
    const repo = nodeRepo();
    const s = spy();
    const r = startup(repo, s, source);
    assert.equal(r.exit, 0);
    assert.equal(s.calls.length, expected, source);
    if (expected) assert.deepEqual(s.calls[0], [path.resolve(repo), 3000]);
  }
});

test('session-start: the launched detection writes the file on startup, says offer only the first time and survives the hook returning first', async () => {
  const repo = nodeRepo();
  const r = startup(repo); // lanzamiento real, desacoplado
  assert.equal(r.exit, 0);
  assert.ok(await waitFor(() => fs.existsSync(FILE(repo))), 'el proceso desacoplado dejó el archivo');
  const d = JSON.parse(fs.readFileSync(FILE(repo), 'utf8'));
  assert.equal(d.schema, 'pignolo-wizard-detect/1');
  assert.equal(d.offer, true); // la primera vez
  startup(repo, {}, 'resume');
  assert.equal(await waitFor(() => readOffer(repo) === false), true, 'la segunda vez no se vuelve a ofrecer');
});

test('session-start: with project.md present it writes nothing, launches nothing and the output is the same as before', () => {
  const repo = nodeRepo();
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\n---\n');
  write(repo, '.pignolo/.gitignore', 'run.json\nworktrees/\ntmp/\n.disabled\n');
  commitAll(repo, 'con pignolo');
  const s = spy();
  const r = ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') }, ...s });
  assert.equal(r.exit, 0);
  assert.equal(s.calls.length, 0);
  assert.equal(fs.existsSync(path.join(repo, '.git', 'pignolo')), false);
  assert.doesNotMatch(String(r.stdout), /wizard|asistente/i);
});

test('session-start: a failing or slow detection leaves no file and the hook output is unchanged', async () => {
  // el mismo arranque con y sin lanzamiento da la misma salida
  const a = nodeRepo();
  const withSpy = startup(a, spy());
  assert.equal(withSpy.exit, 0);
  const noOp = ss.run({ source: 'startup', cwd: a }, { env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') }, wizardSpawn: () => { throw new Error('no se pudo lanzar'); } });
  assert.deepEqual([noOp.exit, Object.keys(noOp.stdout ? JSON.parse(noOp.stdout) : {}).sort()], [withSpy.exit, Object.keys(withSpy.stdout ? JSON.parse(withSpy.stdout) : {}).sort()]);
  // plazo agotado (0 ms): el proceso no deja archivo y borra el viejo; tampoco gasta el marcador de "ya se ofreció"
  const repo = nodeRepo();
  fs.mkdirSync(path.join(repo, '.git', 'pignolo'), { recursive: true });
  fs.writeFileSync(FILE(repo), '{"viejo":true}\n');
  const r = startup(repo, { wizardBudgetMs: 0 });
  assert.equal(r.exit, 0);
  assert.equal(await waitFor(() => !fs.existsSync(FILE(repo))), true, 'el archivo viejo se borró');
  assert.equal(fs.existsSync(path.join(repo, '.git', 'pignolo', 'wizard-offered')), false);
});

test('session-start: with pignolo off nothing is launched or written', () => {
  const repo = nodeRepo();
  const home = makeTempDir('pignolo-home-');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'disabled'), '');
  const s = spy();
  ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: home }, ...s });
  assert.equal(s.calls.length, 0);
  assert.equal(fs.existsSync(path.join(repo, '.git', 'pignolo')), false);
  const repo2 = nodeRepo();
  const s2 = spy();
  ss.run({ source: 'startup', cwd: repo2 }, { env: { PIGNOLO_HOME: makeTempDir('pignolo-home-'), PIGNOLO_DISABLED: '1' }, ...s2 });
  assert.equal(s2.calls.length, 0);
  assert.equal(fs.existsSync(path.join(repo2, '.git', 'pignolo')), false);
});

test('session-start: it launches nothing in a folder that is not a git repository', () => {
  const dir = makeTempDir('pignolo-nogit-');
  const s = spy();
  const r = startup(dir, s);
  assert.equal(r.exit, 0);
  assert.equal(s.calls.length, 0);
});

test('wizard-detect: the code writes only under .git/pignolo', () => {
  const lib = fs.readFileSync(path.join(PLUGIN_ROOT, 'lib', 'wizard-detect.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
  const sites = [...lib.matchAll(/\b(?:fs\.)?(writeFileSync|mkdirSync|renameSync|rmSync|unlinkSync|appendFileSync|copyFileSync)\(\s*([^,)]+)/g)].map((m) => `${m[1]} ${m[2].trim()}`);
  assert.ok(sites.length >= 5);
  // todo destino sale de safe.dir / dir / file / tmp (rutas armadas sobre <main>/.git/pignolo), nunca de un argumento del que llama
  for (const s of sites) assert.match(s, /\b(safe\.dir|file|tmp|path\.join\(safe\.dir)/, s);
});
