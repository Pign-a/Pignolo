'use strict';
// Spec §15 `backup` y criterio de éxito §0(b): un comando indirecto que la guardia
// no detecta pierde trabajo sin commitear no ignorado → recuperable desde el repo
// sombra, también después de borrar .git; sin sombra sembrada → desde
// refs/pignolo/wip o el reflog; un archivo ignorado no se captura (declarado).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, runLauncher, runGuard } = require('./helpers');
const { seedShadow } = require('../plugins/pignolo/lib/git-backup');
const { repoIdForGitDir } = require('../plugins/pignolo/lib/shadow');

const SESSION = 'sesion-e2e';
// El contenido de un script invocado está fuera del alcance de la guardia (§11.6).
const DESTROYER = [
  "const { execFileSync } = require('node:child_process');",
  "const fs = require('node:fs');",
  "execFileSync('git', ['checkout', '--', 'a.txt']);",
  "fs.rmSync('nuevo.txt');",
  "fs.rmSync('secreto.env');",
].join('\n');

function cleanRepo() {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'secreto.env\nlimpiar.js\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'ignore'], repo);
  git(['branch', 'feature'], repo);
  return repo;
}

function makeDirty(repo) {
  fs.writeFileSync(path.join(repo, 'limpiar.js'), DESTROYER);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo sin commitear\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'archivo nuevo\n');
  fs.writeFileSync(path.join(repo, 'secreto.env'), 'CLAVE=x\n');
  return repo;
}

const dirtyRepo = () => makeDirty(cleanRepo());

// El agente pide el comando: pasa por el handler real de la guardia (runGuard), que lo deja
// pasar y toma la instantánea; después el comando corre y destruye.
function runIndirectDestroyer(repo, home) {
  const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node limpiar.js' }, cwd: repo, session_id: SESSION }, { PIGNOLO_HOME: home });
  assert.strictEqual(r.status, 0, `the guard does not detect it: ${r.stderr}`);
  execFileSync(process.execPath, ['limpiar.js'], { cwd: repo });
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'uno\n', 'the work was lost');
  assert.ok(!fs.existsSync(path.join(repo, 'nuevo.txt')));
  return r;
}

const latestWip = (gitArgs, cwd) => git([...gitArgs, 'for-each-ref', '--sort=-refname', '--count=1', '--format=%(refname)', 'refs/pignolo/wip/'], cwd);

// Después de borrar .git: tests/recovery.test.js, con la receta del README tal cual.
test('backup: undetected indirect command → recoverable from the shadow', () => {
  const repo = cleanRepo();
  const home = makeTempDir('pignolo-home-');
  const env = { ...process.env, PIGNOLO_HOME: home };
  seedShadow({ cwd: repo, env, sessionId: SESSION }); // la sesión arranca con el árbol limpio
  makeDirty(repo);
  const shadow = path.join(home, 'shadow', `${repoIdForGitDir(path.join(repo, '.git'))}.git`);
  runIndirectDestroyer(repo, home);

  const S = ['--git-dir', shadow];
  const ref = latestWip(S, repo);
  assert.strictEqual(git([...S, 'show', `${ref}:a.txt`], repo), 'trabajo sin commitear');
  assert.strictEqual(git([...S, 'show', `${ref}:nuevo.txt`], repo), 'archivo nuevo');
  assert.throws(() => git([...S, 'show', `${ref}:secreto.env`], repo), 'ignored files are not captured (declared)');
});

test('backup: without a seeded shadow → recoverable from refs/pignolo/wip (and commits from the reflog)', () => {
  const repo = dirtyRepo();
  const home = makeTempDir('pignolo-home-');
  runIndirectDestroyer(repo, home);
  const ref = latestWip([], repo);
  assert.match(ref, /^refs\/pignolo\/wip\//);
  assert.strictEqual(git(['show', `${ref}:a.txt`], repo), 'trabajo sin commitear');
  assert.strictEqual(git(['show', `${ref}:nuevo.txt`], repo), 'archivo nuevo');
  assert.throws(() => git(['show', `${ref}:secreto.env`], repo), 'ignored files are not captured (declared)');

  // Un commit que un comando indirecto descarta sigue en el reflog.
  const lost = git(['rev-parse', 'HEAD'], repo);
  execFileSync(process.execPath, ['-e', "require('node:child_process').execFileSync('git', ['reset', '-q', '--hard', 'HEAD~1'])"], { cwd: repo });
  assert.notStrictEqual(git(['rev-parse', 'HEAD'], repo), lost);
  assert.strictEqual(git(['rev-parse', 'HEAD@{1}'], repo), lost);
});

test('backup: a fallback snapshot while the seed is broken is announced with systemMessage', () => {
  const repo = dirtyRepo();
  const home = makeTempDir('pignolo-home-');
  const shadow = path.join(home, 'shadow', `${repoIdForGitDir(path.join(repo, '.git'))}.git`);
  fs.mkdirSync(path.join(shadow, 'pignolo'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'pignolo', 'status.json'), JSON.stringify({ state: 'error', at: new Date().toISOString(), error: 'simulado' }));
  const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo, session_id: SESSION }, { PIGNOLO_HOME: home });
  assert.strictEqual(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /no se pudo sembrar \(simulado\)/);
});

// SessionStart siembra la sombra en segundo plano (spec §11.6).
const { shadowState } = require('../plugins/pignolo/lib/git-backup');

async function waitFor(fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const sessionStart = (repo, home, extra = {}) => runLauncher('session-start', { hook_event_name: 'SessionStart', source: 'startup', cwd: repo, session_id: SESSION, ...extra }, { PIGNOLO_HOME: home, ...(extra.env || {}) });

test('SessionStart seeds the shadow in the background; later snapshots go there', async () => {
  const repo = cleanRepo();
  const home = makeTempDir('pignolo-home-');
  const env = { ...process.env, PIGNOLO_HOME: home };
  const t0 = Date.now();
  const r = sessionStart(repo, home);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).systemMessage, /sembrando el repo sombra en segundo plano/);
  const ok = await waitFor(() => { const s = shadowState({ cwd: repo, env }); return s && s.state === 'ok' && s; });
  assert.ok(ok, `the seed finished: ${JSON.stringify(shadowState({ cwd: repo, env }))} after ${Date.now() - t0} ms`);
  makeDirty(repo);
  runIndirectDestroyer(repo, home);
  const S = ['--git-dir', ok.gitDir];
  assert.strictEqual(git([...S, 'show', `${latestWip(S, repo)}:a.txt`], repo), 'trabajo sin commitear');
  assert.deepStrictEqual(git(['for-each-ref', 'refs/pignolo/wip'], repo), '', 'no fallback inside the repo');
  // /pignolo:status informa el estado de la sombra.
  const st = runLauncher('session-start', { source: 'status', cwd: repo }, { PIGNOLO_HOME: home });
  assert.match(JSON.parse(st.stdout).systemMessage, /repo sombra ok\.$/);
});

test('SessionStart reports a failed previous seed and retries it', async () => {
  const repo = cleanRepo();
  const home = makeTempDir('pignolo-home-');
  const env = { ...process.env, PIGNOLO_HOME: home };
  seedShadow({ cwd: repo, env, sessionId: 'anterior' });
  const statusFile = path.join(shadowState({ cwd: repo, env }).gitDir, 'pignolo', 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ state: 'error', at: new Date().toISOString(), error: 'disco lleno' }));
  const r = sessionStart(repo, home);
  assert.match(JSON.parse(r.stdout).systemMessage, /última siembra del repo sombra falló \(disco lleno\)/);
  assert.ok(await waitFor(() => shadowState({ cwd: repo, env }).state === 'ok'), 'retried');
});

test('with PIGNOLO_DISABLED=1 SessionStart does not seed', async () => {
  const repo = cleanRepo();
  const home = makeTempDir('pignolo-home-');
  sessionStart(repo, home, { env: { PIGNOLO_DISABLED: '1' } });
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(!fs.existsSync(path.join(home, 'shadow')));
});
