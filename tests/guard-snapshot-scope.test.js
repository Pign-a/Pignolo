'use strict';
// D-G4: la instantánea WIP se toma solo antes de lo que puede descartar trabajo o de lo que la guardia no puede
// clasificar; el resto corre sin ella (D-G6: tampoco los scripts propios).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate, DISCARD } = require('../plugins/pignolo/lib/git-guard');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const { makeRepo, makeTempDir } = require('./helpers');

const PS_T = 30000;
const snap = (cmd, shell = 'bash', extra = {}) => evaluate(cmd, { shell, psTimeoutMs: PS_T, ...extra }).snapshot;

const NONE = [
  'ls -la', 'git status', 'git log --oneline -5', 'git diff HEAD', 'git add a.txt', 'git commit -m "feat: x"',
  'git push origin task/x', 'git fetch origin', 'git branch task/x', 'git stash list', 'npm test', 'node --test tests/',
  'node scripts/x.js', 'mkdir -p out/x', 'touch f.txt', 'echo hi >> log.txt', 'npm test > /dev/null 2>&1',
];
const BEFORE = [
  'rm a.txt', 'rm -rf build', 'mv a.txt b.txt', 'cp a.txt b.txt', 'echo x > a.txt', 'npm test > out.log 2>&1',
  'sed -i s/a/b/ a.txt', 'tar -xf x.tgz', 'curl -o f.txt http://x', 'find build -name "*.o" -delete',
  'git checkout main', 'git switch main', 'git merge task/x', 'git pull --rebase', 'git rebase main',
  'git reset --soft HEAD~1', 'git apply p.diff', 'git mv a.txt b.txt', 'git rm a.txt', 'git clean -n',
  'bash -c "rm a.txt"', 'xargs rm < lista.txt', 'node -e "require(\'fs\').writeFileSync(\'a.txt\',\'x\')"',
  "awk -i inplace '{print}' a.txt", 'git submodule update --force', 'git bisect start', 'git sparse-checkout set x',
  'git stash', 'git stash drop', 'python3 -c "print(1)"', 'find . -fprint out.txt',
  'perl -i -pe s/a/b/ a.txt', 'git checkout -- a.txt', 'git restore a.txt',
  // lo que no se clasifica
  'eval "$X"', 'git lg', 'ls "unclosed',
];
const PS_NONE = ['Get-ChildItem src', 'git status'];
const PS_BEFORE = ['Remove-Item a.txt', 'Set-Content a.txt x', 'Out-File a.txt', "[IO.File]::WriteAllText('a.txt','x')", 'New-Item -Force a.txt'];

test('sin instantánea: lo que no descarta trabajo (Bash)', () => {
  const bad = NONE.filter((c) => snap(c) !== 'none').map((c) => `${c} -> ${snap(c)}`);
  assert.deepStrictEqual(bad, []);
});

test('con instantánea previa: lo que puede descartar trabajo o no se clasifica (Bash)', () => {
  const bad = BEFORE.filter((c) => snap(c) !== 'before').map((c) => `${c} -> ${snap(c)}`);
  assert.deepStrictEqual(bad, []);
});

test('PowerShell: la misma separación', () => {
  assert.deepStrictEqual(PS_NONE.filter((c) => snap(c, 'powershell') !== 'none'), []);
  assert.deepStrictEqual(PS_BEFORE.filter((c) => snap(c, 'powershell') !== 'before'), []);
});

test('meta: toda regla de pérdida de trabajo lleva instantánea aunque el veredicto sea block', () => {
  const samples = {
    stash: 'git stash drop', 'checkout-path': 'git checkout -- a.js', 'checkout-force': 'git checkout -f', 'switch-force': 'git switch -f main',
    restore: 'git restore a.js', 'reset-hard': 'git reset --hard', clean: 'git clean -fd', 'rm-force': 'git rm -f a.js',
    'read-tree-update': 'git read-tree -u HEAD', 'checkout-index-force': 'git checkout-index -f -a',
    'worktree-remove-force': 'git worktree remove --force ../wt', 'catastrophic-delete': 'rm -rf .git',
  };
  for (const [rule, cmd] of Object.entries(samples)) {
    const v = evaluate(cmd, { mode: 'bypassPermissions' });
    assert.strictEqual(v.rule, rule, cmd);
    assert.notStrictEqual(v.snapshot, 'none', `${rule}: ${cmd}`);
  }
});

test('la lista cerrada se exporta y cubre los subcomandos de git que tocan el árbol', () => {
  for (const s of ['checkout', 'switch', 'restore', 'reset', 'clean', 'stash', 'rm', 'submodule', 'bisect', 'sparse-checkout', 'filter-branch']) {
    assert.ok(DISCARD.git.has(s), s);
  }
  for (const s of ['status', 'log', 'diff', 'show', 'add', 'commit', 'push', 'fetch', 'branch', 'tag']) assert.ok(!DISCARD.git.has(s), s);
});

// ------------------------------------------------------------ handler
const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

test('handler: un comando inocuo no llama a la instantánea; uno de la lista la llama una vez; un block no la llama', () => {
  const repo = makeRepo();
  let calls = 0;
  const ctx = { env: {}, snapshot: () => { calls += 1; return null; } };
  assert.strictEqual(guard.run(bash('ls', repo), ctx).exit, 0);
  assert.strictEqual(calls, 0);
  assert.strictEqual(guard.run(bash('rm tmp.txt', repo), ctx).exit, 0);
  assert.strictEqual(calls, 1);
  assert.strictEqual(guard.run(bash('git reset --hard', repo), ctx).exit, 2);
  assert.strictEqual(calls, 1);
});

test('handler: una instantánea que lanza error en un comando de la lista deja exit 0 con systemMessage', () => {
  const r = guard.run(bash('rm a.txt', makeRepo()), { env: {}, snapshot: () => { throw new Error('boom'); } });
  assert.strictEqual(r.exit, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /instantánea WIP falló \(boom\)/);
});

test('PIGNOLO_CANARY=1 no toma instantánea', () => {
  let calls = 0;
  const r = guard.run(bash('rm a.txt', makeRepo()), { env: { PIGNOLO_CANARY: '1' }, snapshot: () => { calls += 1; } });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(calls, 0);
});

// ------------------------------------------------------------ directorio real (H7)
test('snapshotDirs: el directorio real del punto de descarte, no el cwd del hook', () => {
  const base = makeTempDir();
  fs.mkdirSync(path.join(base, 'hook'));
  fs.mkdirSync(path.join(base, 'wt'));
  const cwd = path.join(base, 'hook');
  const wt = path.join(base, 'wt');
  const dirs = (cmd) => evaluate(cmd, { cwd, root: cwd }).snapshotDirs.map((d) => path.resolve(d));
  assert.deepStrictEqual(dirs('cd ../wt && git checkout -- a.txt'), [wt]);
  assert.deepStrictEqual(dirs('cd ../wt && rm a.txt'), [wt]);
  assert.deepStrictEqual(dirs('env -C ../wt rm a.txt'), [wt]);
  assert.deepStrictEqual(dirs('rm a.txt'), [path.resolve(cwd)]);
  // un directorio que no se conoce: el handler suma el cwd del hook
  const v = evaluate('cd "$D" && rm a.txt', { cwd, root: cwd });
  assert.strictEqual(v.snapshotUnknown, true);
});

test('handler: respalda el directorio real y no el del hook', () => {
  const base = makeTempDir();
  fs.mkdirSync(path.join(base, 'hook'));
  fs.mkdirSync(path.join(base, 'wt'));
  const got = [];
  const ctx = { env: {}, snapshot: (o) => { got.push(path.resolve(o.cwd)); return null; } };
  const r = guard.run(bash('cd ../wt && rm a.txt', path.join(base, 'hook')), ctx);
  assert.strictEqual(r.exit, 0);
  assert.deepStrictEqual(got, [path.join(base, 'wt')]);
});

// ------------------------------------------------------------ snapshot-required (R-2)
// Hasta T11 ninguna forma devuelve 'required': el handler se prueba con un evaluador inyectado.
const required = (dirs, unknown = false) => () => ({
  decision: 'allow', rule: null, snapshot: 'required', snapshotDirs: dirs, snapshotUnknown: unknown, reason: '', alternative: '',
});

test('required: una instantánea que lanza error, parcial o nula en un no-repo se niega con snapshot-required', () => {
  const dir = makeTempDir();
  const run = (snapshot, extra = {}) => guard.run(bash('x', dir), { env: {}, evaluate: required([dir]), snapshot, cleanRepo: () => false, ...extra });
  const thrown = run(() => { throw new Error('plazo'); });
  assert.strictEqual(thrown.exit, 2);
  assert.match(thrown.stderr, /solo pasa con una instantánea previa/);
  assert.strictEqual(run(() => ({ partial: true, ref: 'r' })).exit, 2);
  assert.strictEqual(run(() => null).exit, 2); // null en un directorio que no es un repo limpio: no hay respaldo
  assert.strictEqual(run(() => null, { cleanRepo: () => true }).exit, 0); // árbol limpio: nada que respaldar
  assert.strictEqual(run(() => ({ ref: 'r' })).exit, 0);
});

test('required: con PIGNOLO_CANARY=1 se niega', () => {
  const dir = makeTempDir();
  const r = guard.run(bash('x', dir), { env: { PIGNOLO_CANARY: '1' }, evaluate: required([dir]), snapshot: () => ({ ref: 'r' }) });
  assert.strictEqual(r.exit, 2);
});

test('required: respalda cada directorio real y suma el del hook si alguno no se conoce', () => {
  const a = makeTempDir();
  const b = makeTempDir();
  const got = [];
  guard.run(bash('x', b), { env: {}, evaluate: required([a], true), snapshot: (o) => { got.push(o.cwd); return { ref: 'r' }; } });
  assert.deepStrictEqual(got.sort(), [a, b].sort());
});

test('snapshot-required es una regla deny declarada', () => {
  assert.strictEqual(require('../plugins/pignolo/lib/git-guard').RULES['snapshot-required'][0], 'deny');
});
