'use strict';
// Pruebas de punta a punta de 8a: /pignolo:init por los scripts y el launcher reales, con
// PIGNOLO_HOME y CLAUDE_CONFIG_DIR temporales (ninguno toca el ~/.claude ni el ~/.pignolo reales).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git, runLauncher, PLUGIN_ROOT } = require('./helpers');

const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { projectState } = require('../plugins/pignolo/lib/project');
const { memorySlug } = require('../plugins/pignolo/lib/auto-memory');

const envFor = (extra = {}) => ({ ...process.env, NODE_TEST_CONTEXT: undefined, PIGNOLO_HOME: makeTempDir('pignolo-e2eh-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-e2ec-'), ...extra });
function script(name, args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { cwd, env: env || envFor(), encoding: 'utf8', timeout: 120000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const write = (cwd, rel, text) => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const porcelain = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ALL = ['ignores', 'gitattributes', 'reflog', 'project-md', 'security-md', 'auto-memory-off'];

function proposalOf(d, gates) {
  const p = {};
  for (const k of ['type', 'gates', 'testPaths', 'protectedTestConfig', 'highRiskPaths', 'contracts', 'serialPaths', 'costPaths', 'visiblePaths', 'depsInstall', 'domainRules']) p[k] = d[k];
  if (gates) p.gates = gates;
  return p;
}
function planFile(obj) {
  const f = path.join(makeTempDir('pignolo-e2eplan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}
// detect -> apply de todos los pasos -> commit de nextCommit.files.
function initAll(repo, env, { gates, approved = ALL } = {}) {
  const det = script('init.js', ['detect', '--cwd', repo], { env });
  assert.equal(det.status, 0, det.stderr);
  const plan = planFile({ v: 1, approved, answers: { channel: 'seguridad@example.invalid', piiPatterns: [] }, proposal: proposalOf(det.json.detection, gates) });
  const ap = script('init.js', ['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(ap.status, 0, ap.stderr);
  const v = script('init.js', ['verify', '--cwd', repo], { env });
  assert.ok(v.json.nextCommit.files.length > 0);
  git(['add', '--', ...v.json.nextCommit.files], repo);
  git(['commit', '-q', '-m', 'chore: init'], repo);
  return { det, ap };
}

const STACKS = {
  'node + vitest': (r) => { write(r, 'package.json', JSON.stringify({ scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' }, devDependencies: { vitest: '1' } })); write(r, 'package-lock.json', '{}'); write(r, 'src/a.test.ts', '// t\n'); },
  'python + pytest': (r) => { write(r, 'pyproject.toml', '[project]\nname = "a"\n'); write(r, 'tests/test_a.py', 'def test_a():\n    pass\n'); },
  go: (r) => { write(r, 'go.mod', 'module a\n'); write(r, 'a_test.go', 'package a\n'); },
  rust: (r) => { write(r, 'Cargo.toml', '[package]\nname = "a"\n'); write(r, 'tests/it.rs', '// t\n'); },
  flutter: (r) => { write(r, 'pubspec.yaml', 'name: a\nflutter:\n  uses-material-design: true\n'); write(r, 'test/a_test.dart', '// t\n'); },
};

test('from zero to active, per stack: apply, commit, no warnings, active, and the Agent hook lets a pignolo agent through', () => {
  for (const [name, build] of Object.entries(STACKS)) {
    const repo = makeRepo();
    build(repo);
    commitAll(repo, 'base');
    const env = envFor();
    initAll(repo, env);
    const cfg = readProjectConfig({ root: repo });
    assert.deepEqual(cfg.warnings, [], `${name}: ${cfg.warnings.join('; ')}`);
    assert.equal(cfg.type, 'code-tested', name);
    assert.equal(projectState({ cwd: repo, env }).active, true, name);
    const res = runLauncher('agent-gate', { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, cwd: repo, session_id: 's' }, { PIGNOLO_HOME: env.PIGNOLO_HOME, CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR });
    assert.equal(res.status, 0, `${name}: ${res.stderr}`);
    assert.doesNotMatch(res.stderr + res.stdout, /conservador/, name);
  }
});

test('gates of §15 with what init deduced: a placeholder never gives PASS; a failing test gives FAIL with the deduced command', () => {
  const ph = makeRepo();
  write(ph, 'package.json', JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
  commitAll(ph, 'base');
  const env = envFor();
  initAll(ph, env);
  const cfg = readProjectConfig({ root: ph });
  assert.equal(cfg.type, 'code-untested');
  assert.equal(cfg.gates['on-done'], undefined);
  const g = script('gate.js', ['--level', 'on-done', '--cwd', ph], { env });
  assert.notEqual(g.json.status, 'PASS');
  assert.ok(['NO_GATE', 'NO_TESTS'].includes(g.json.status), g.json.status);
  assert.equal(g.status, 1);

  const real = makeRepo();
  write(real, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(real, 'tests/a.test.js', "require('node:test')('rojo', () => { throw new Error('falla a propósito'); });\n");
  commitAll(real, 'base');
  initAll(real, env);
  assert.equal(readProjectConfig({ root: real }).gates['on-done'], 'npm run test');
  const f = script('gate.js', ['--level', 'on-done', '--cwd', real], { env });
  assert.equal(f.json.status, 'FAIL');
  assert.equal(f.json.command, 'npm run test');
});

test('seed: a {seed} in on-done is expanded by the gate and sealed (seedInCommand), without it the seal says false', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', "require('node:test')('ok', () => {});\n");
  write(repo, 'check.js', 'process.exit(Number.isInteger(Number(process.argv[2])) ? 0 : 1);\n');
  commitAll(repo, 'base');
  const env = envFor();
  initAll(repo, env, { gates: { 'on-done': 'node check.js {seed}' } });
  const ok = script('gate.js', ['--level', 'on-done', '--seed', '99', '--cwd', repo], { env });
  assert.equal(ok.json.status, 'PASS', ok.stderr);
  assert.equal(ok.json.seedOffered, 99);
  assert.equal(ok.json.seedInCommand, true);

  const plain = makeRepo();
  write(plain, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(plain, 'tests/a.test.js', "require('node:test')('ok', () => {});\n");
  write(plain, 'check.js', 'process.exit(0);\n');
  commitAll(plain, 'base');
  initAll(plain, env, { gates: { 'on-done': 'node check.js' } });
  const no = script('gate.js', ['--level', 'on-done', '--seed', '99', '--cwd', plain], { env });
  assert.equal(no.json.seedInCommand, false);
});

test('limit a of 3b closed: a tracked .pignolo/.gitignore completed by init keeps run.js start and risk --diff clean', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', "require('node:test')('ok', () => {});\n");
  write(repo, '.pignolo/.gitignore', '.gitignore\nrun.json\n.disabled\n');
  git(['add', '-A'], repo);
  git(['add', '-f', '.pignolo/.gitignore'], repo);
  git(['commit', '-q', '-m', 'base'], repo);
  const env = envFor();
  // sin auto-memory-off: este test mira solo el .pignolo/.gitignore versionado (el caso de G31 tiene su propio test)
  initAll(repo, env, { approved: ALL.filter((id) => id !== 'auto-memory-off') });
  assert.equal(script('run.js', ['start', '--flow', 'trivial', '--cwd', repo], { env }).status, 0);
  
  assert.equal(porcelain(repo).split('\n').filter((l) => l && !l.endsWith('.claude/settings.local.json')).join(''), '', 'no leftovers after start (no backups either)');
  const risk = script('risk.js', ['--diff', 'HEAD', '--cwd', repo], { env });
  assert.equal(risk.status, 0, risk.stderr);
  assert.equal(risk.json.laneFloor, 'trivial', JSON.stringify(risk.json));
  assert.ok(!JSON.stringify(risk.json).includes('.pignolo/.gitignore'));
});

test('limit b of 3b, deterministic part: verify flags a vitest config that does not exclude .pignolo/**', () => {
  const env = envFor();
  const mk = (cfg) => {
    const r = makeRepo();
    write(r, 'package.json', JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '1' } }));
    write(r, 'vitest.config.ts', cfg);
    write(r, 'src/a.test.ts', '// t\n');
    commitAll(r, 'base');
    return r;
  };
  assert.deepEqual(script('init.js', ['verify', '--cwd', mk('export default {};\n')], { env }).json.runnerExcludes, [{ runner: 'vitest', applied: false }]);
  assert.deepEqual(script('init.js', ['verify', '--cwd', mk("export default { test: { exclude: ['.pignolo/**'] } };\n")], { env }).json.runnerExcludes, [{ runner: 'vitest', applied: true }]);
});

test('reflog is independent of hooks: with PIGNOLO_DISABLED=1 the policy still lives in .git/config', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', '// t\n');
  commitAll(repo, 'base');
  const env = envFor({ PIGNOLO_DISABLED: '1' });
  const det = script('init.js', ['detect', '--cwd', repo], { env });
  const ap = script('init.js', ['apply', '--plan', planFile({ v: 1, approved: ['reflog'], answers: {}, proposal: proposalOf(det.json.detection) }), '--cwd', repo], { env });
  assert.equal(ap.status, 0, ap.stderr);
  assert.equal(git(['config', '--local', '--get', 'gc.reflogExpire'], repo), 'never');
  assert.equal(git(['config', '--local', '--get', 'gc.reflogExpireUnreachable'], repo), 'never');
});

test('auto-memory: turned off, never migrated, never read; the originals stay intact', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', '// t\n');
  commitAll(repo, 'base');
  const env = envFor();
  const mem = path.join(env.CLAUDE_CONFIG_DIR, 'projects', memorySlug(repo), 'memory');
  const token = `ghp_${'c'.repeat(36)}`;
  write(mem, 'clean.md', 'una nota limpia\n');
  write(mem, 'token.md', `clave ${token}\n`);
  write(mem, 'user.md', '---\ntype: user\n---\nsoy el autor\n');
  const before = ['clean.md', 'token.md', 'user.md'].map((f) => sha(path.join(mem, f)));
  const det = script('init.js', ['detect', '--cwd', repo], { env });
  assert.equal(det.json.memory.files, 3);
  const ap = script('init.js', ['apply', '--plan', planFile({ v: 1, approved: ['auto-memory-off'], answers: {}, proposal: {} }), '--cwd', repo], { env });
  assert.equal(ap.status, 0, ap.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.local.json'), 'utf8')).autoMemoryEnabled, false);
  assert.equal(fs.existsSync(path.join(repo, '.pignolo', 'state')), false);
  for (const out of [det.stdout, ap.stdout]) {
    assert.equal(out.includes(token), false);
    assert.equal(out.includes('soy el autor'), false);
  }
  assert.deepEqual(['clean.md', 'token.md', 'user.md'].map((f) => sha(path.join(mem, f))), before);
});

test('linked worktree under .pignolo/worktrees writes in the main checkout; init stages and commits nothing', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', '// t\n');
  commitAll(repo, 'base');
  const env = envFor();
  const wt = path.join(repo, '.pignolo', 'worktrees', 'daily-x');
  git(['worktree', 'add', '-q', '-b', 'wt-x', wt, 'HEAD'], repo);
  const det = script('init.js', ['detect', '--cwd', wt], { env });
  const head = git(['rev-parse', 'HEAD'], repo);
  const ap = script('init.js', ['apply', '--plan', planFile({ v: 1, approved: ALL, answers: { channel: 'x@example.invalid', piiPatterns: [] }, proposal: proposalOf(det.json.detection) }), '--cwd', wt], { env });
  assert.equal(ap.status, 0, ap.stderr);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  assert.ok(!fs.existsSync(path.join(wt, '.pignolo', 'project.md')));
  assert.equal(git(['diff', '--cached', '--name-only'], repo), '');
  assert.equal(git(['rev-parse', 'HEAD'], repo), head);
});

test('coexistence (§14): domain-rules lists the project rules and none of them changes', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', '// t\n');
  write(repo, 'CLAUDE.md', 'reglas\n');
  write(repo, '.claude/rules/a.md', 'regla a\n');
  write(repo, 'docs/sessions/2026-01-01.md', 'sesión\n');
  commitAll(repo, 'base');
  const files = ['CLAUDE.md', '.claude/rules/a.md', 'docs/sessions/2026-01-01.md'];
  const before = files.map((f) => sha(path.join(repo, f)));
  const env = envFor();
  const det = script('init.js', ['detect', '--cwd', repo], { env });
  assert.deepEqual([...det.json.detection.domainRules].sort(), [...files].sort());
  initAll(repo, env);
  assert.deepEqual(files.map((f) => sha(path.join(repo, f))), before);
});

test('backups outside the tree (A8-05): a second apply over pre-existing files leaves backups only under PIGNOLO_HOME', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', '// t\n');
  write(repo, '.gitattributes', '* text=auto\n');
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\n---\nnotas\n');
  commitAll(repo, 'base');
  write(repo, '.claude/settings.local.json', '{ "a": 1 }');
  const env = envFor();
  const det = script('init.js', ['detect', '--cwd', repo], { env });
  const ap = script('init.js', ['apply', '--plan', planFile({ v: 1, approved: ALL, answers: { channel: 'x@example.invalid', piiPatterns: [] }, proposal: proposalOf(det.json.detection) }), '--cwd', repo], { env });
  assert.equal(ap.status, 0, ap.stderr);
  const backups = ap.json.steps.map((s) => s.backup).filter(Boolean);
  assert.equal(backups.length, 3, JSON.stringify(ap.json.steps));
  for (const b of backups) assert.ok(b.startsWith(env.PIGNOLO_HOME), b);
  assert.ok(!/pignolo-bak|init-backup/.test(porcelain(repo)));
  const v = script('init.js', ['verify', '--cwd', repo], { env });
  assert.ok(!v.json.nextCommit.files.some((f) => /pignolo-bak|init-backup|settings\.local/.test(f)));
});

test('R-21: init files name nothing from hitos 6 and 7', () => {
  const root = path.join(__dirname, '..', 'plugins', 'pignolo');
  const files = [...fs.readdirSync(path.join(root, 'lib')).filter((f) => /^init-.*\.js$/.test(f)).map((f) => path.join(root, 'lib', f)),
    path.join(root, 'lib', 'auto-memory.js'), path.join(root, 'lib', 'claude-settings.js'), path.join(root, 'scripts', 'init.js')];
  assert.ok(files.length >= 6);
  const banned = ['proposeLearning', 'scanLearning', 'readEntries', 'state-store', 'close-session', 'learning-validator', 'pre-merge-files', 'taskWorktreePath'];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const b of banned) assert.equal(text.includes(b), false, `${path.basename(f)} contiene ${b}`);
  }
});

// Protects: G31 (decisión del autor, 2026-10-01) · Breaks if: auto-memory-off deja settings.local.json sin ignorar y risk.js sube el primer flujo a daily.
test('G31 closed: with auto-memory-off approved, risk --diff stays trivial (the file goes to .git/info/exclude)', () => {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  write(repo, 'tests/a.test.js', "require('node:test')('ok', () => {});\n");
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'base'], repo);
  const env = envFor();
  initAll(repo, env); // ALL incluye auto-memory-off
  assert.ok(fs.existsSync(path.join(repo, '.claude', 'settings.local.json')));
  const risk = script('risk.js', ['--diff', 'HEAD', '--cwd', repo], { env });
  assert.equal(risk.status, 0, risk.stderr);
  assert.equal(risk.json.laneFloor, 'trivial', JSON.stringify(risk.json));
  assert.deepEqual(risk.json.hits, []);
});
