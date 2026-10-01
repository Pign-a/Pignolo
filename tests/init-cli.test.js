'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeRepo, makeTempDir, git } = require('./helpers');

const INIT = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'init.js');
const { memorySlug } = require('../plugins/pignolo/lib/auto-memory');

function env0(extra = {}) {
  return { ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-clihome-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-clicfg-'), ...extra };
}
function cli(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [INIT, ...args], { cwd, env: env || env0(), encoding: 'utf8', timeout: 60000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const write = (cwd, rel, text) => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const commitAll = (repo, msg = 'c') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const listing = (repo) => fs.readdirSync(repo, { recursive: true }).map(String).filter((f) => !f.split(/[\\/]/).includes('.git')).sort();
const porcelain = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);

function nodeRepo({ vitestConfig = "export default { test: { exclude: ['node_modules'] } };\n" } = {}) {
  const repo = makeRepo();
  write(repo, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' }, devDependencies: { vitest: '1' } }));
  write(repo, 'package-lock.json', '{}');
  write(repo, 'vitest.config.ts', vitestConfig);
  write(repo, 'src/a.test.ts', '// t\n');
  commitAll(repo, 'base');
  return repo;
}
function proposalOf(d) {
  const p = {};
  for (const k of ['type', 'gates', 'testPaths', 'protectedTestConfig', 'highRiskPaths', 'contracts', 'serialPaths', 'costPaths', 'visiblePaths', 'depsInstall', 'domainRules']) p[k] = d[k];
  return p;
}
function planFile(obj) {
  const f = path.join(makeTempDir('pignolo-plan-'), 'plan.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
}
const ALL = ['ignores', 'gitattributes', 'reflog', 'project-md', 'security-md', 'auto-memory-off'];
function fullPlan(repo, env, over = {}) {
  const d = cli(['detect', '--cwd', repo], { env }).json.detection;
  return planFile({ v: 1, approved: ALL, answers: { channel: 'seguridad@example.invalid', piiPatterns: [] }, proposal: proposalOf(d), ...over });
}

test('detect: JSON with the six steps, answers needed, and it writes nothing', () => {
  const repo = nodeRepo();
  const before = listing(repo);
  const r = cli(['detect', '--cwd', repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.detection.type, 'code-tested');
  assert.deepEqual(r.json.steps.map((s) => s.id), ALL);
  assert.deepEqual(r.json.steps.find((s) => s.id === 'security-md').needsAnswer, ['channel']);
  assert.deepEqual(r.json.steps.find((s) => s.id === 'project-md').needsAnswer, ['piiPatterns']);
  assert.equal(r.json.existing.projectMd, false);
  assert.deepEqual(listing(repo), before);
  assert.equal(r.json.detection.seedPlan.plan, 'applied');
  assert.match(r.json.detection.gates['on-done'], /--sequence\.seed=\{seed\}/);
  assert.equal(r.stderr, '');
});

test('apply: approved [] skips everything; approved [reflog] runs only the reflog', () => {
  const repo = nodeRepo();
  const env = env0();
  const before = listing(repo);
  const none = cli(['apply', '--plan', planFile({ v: 1, approved: [], answers: {}, proposal: {} }), '--cwd', repo], { env });
  assert.equal(none.status, 0, none.stderr);
  assert.ok(none.json.steps.every((s) => s.status === 'skipped' && s.reason === 'not-approved'));
  assert.deepEqual(listing(repo), before);
  const one = cli(['apply', '--plan', planFile({ v: 1, approved: ['reflog'], answers: {}, proposal: {} }), '--cwd', repo], { env });
  assert.equal(one.json.steps.find((s) => s.id === 'reflog').status, 'done');
  assert.ok(one.json.steps.filter((s) => s.id !== 'reflog').every((s) => s.status === 'skipped'));
  assert.deepEqual(listing(repo), before);
});

test('an unknown step id is a usage error (exit 2) and nothing is written', () => {
  const repo = nodeRepo();
  const before = listing(repo);
  const r = cli(['apply', '--plan', planFile({ v: 1, approved: ['reflog', 'delete-all'], answers: {}, proposal: {} }), '--cwd', repo]);
  assert.equal(r.status, 2);
  assert.deepEqual(listing(repo), before);
  assert.throws(() => git(['config', '--local', '--get', 'gc.reflogExpire'], repo));
  assert.equal(cli([], { cwd: repo }).status, 2);
  assert.equal(cli(['apply', '--plan', path.join(repo, 'nope.json'), '--cwd', repo]).status, 2);
});

test('preview mirrors apply step by step and writes nothing', () => {
  const repo = nodeRepo();
  const env = env0();
  const plan = fullPlan(repo, env);
  const before = listing(repo);
  const pv = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  assert.equal(pv.status, 0, pv.stderr);
  assert.deepEqual(listing(repo), before);
  assert.equal(porcelain(repo), '');
  const ap = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(ap.status, 0, ap.stderr);
  for (const s of ap.json.steps) {
    const p = pv.json.steps.find((x) => x.id === s.id);
    assert.equal(p.status, s.status === 'done' ? 'would-do' : s.status, s.id);
  }
  assert.ok(ap.json.steps.some((s) => s.status === 'done'));
});

test('idempotent: the second apply skips everything and leaves the repo identical', () => {
  const repo = nodeRepo();
  const env = env0();
  const plan = fullPlan(repo, env);
  const first = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(first.status, 0, first.stderr);
  const snap = { list: listing(repo), status: porcelain(repo), files: Object.fromEntries(['.pignolo/project.md', '.gitattributes', 'SECURITY.md', '.claude/settings.local.json'].map((f) => [f, fs.readFileSync(path.join(repo, f), 'utf8')])) };
  const second = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(second.status, 0, second.stderr);
  assert.ok(second.json.steps.every((s) => s.status === 'skipped'), JSON.stringify(second.json.steps));
  assert.deepEqual(listing(repo), snap.list);
  assert.equal(porcelain(repo), snap.status);
  for (const [f, text] of Object.entries(snap.files)) assert.equal(fs.readFileSync(path.join(repo, f), 'utf8'), text);
});

test('from a linked worktree it writes in the main checkout; outside a repo it fails with an alternative', () => {
  const repo = nodeRepo();
  const env = env0();
  const wt = path.join(makeTempDir('pignolo-clwt-'), 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wtb'], repo);
  const r = cli(['apply', '--plan', fullPlan(repo, env), '--cwd', wt], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  assert.ok(!fs.existsSync(path.join(wt, '.pignolo', 'project.md')));
  const bare = makeTempDir('pignolo-norepo-');
  const out = cli(['detect', '--cwd', bare]);
  assert.equal(out.status, 1);
  assert.equal(out.json.kind, 'not-a-repo');
  assert.match(out.stderr, /Alternativa:/);
});

test('project-md: an existing project.md keeps its values (conflicts), is backed up outside the repo; an unreadable one is refused and the rest runs', () => {
  const repo = nodeRepo();
  const env = env0();
  write(repo, '.pignolo/project.md', '---\ntype: docs\n---\nnotas\n');
  commitAll(repo, 'pm');
  const r = cli(['apply', '--plan', fullPlan(repo, env), '--cwd', repo], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json.conflicts.some((c) => c.key === 'type' && c.existing === 'docs'));
  const text = fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8');
  assert.match(text, /^---\ntype: docs\n/);
  const step = r.json.steps.find((s) => s.id === 'project-md');
  assert.ok(step.backup.startsWith(env.PIGNOLO_HOME));
  assert.ok(!/init-backup|pignolo-bak/.test(porcelain(repo)));

  const bad = nodeRepo();
  write(bad, '.pignolo/project.md', '---\ngates: [a, b]\n---\n');
  commitAll(bad, 'pm');
  const b = cli(['apply', '--plan', fullPlan(bad, env), '--cwd', bad], { env });
  assert.equal(b.json.steps.find((s) => s.id === 'project-md').reason, 'invalid-project-md');
  assert.equal(b.json.steps.find((s) => s.id === 'reflog').status, 'done');
  assert.equal(fs.readFileSync(path.join(bad, '.pignolo', 'project.md'), 'utf8'), '---\ngates: [a, b]\n---\n');
});

test('piiPatterns: a too-broad pattern refuses project-md; a valid one is written', () => {
  const repo = nodeRepo();
  const env = env0();
  const broad = cli(['apply', '--plan', fullPlan(repo, env, { answers: { channel: 'x@example.invalid', piiPatterns: ['.*'] } }), '--cwd', repo], { env });
  const s = broad.json.steps.find((x) => x.id === 'project-md');
  assert.equal(s.status, 'refused');
  assert.equal(s.reason, 'too-broad');
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  const ok = cli(['apply', '--plan', fullPlan(repo, env, { answers: { channel: 'x@example.invalid', piiPatterns: ['\\b\\d{8}\\b'] } }), '--cwd', repo], { env });
  assert.equal(ok.json.steps.find((x) => x.id === 'project-md').status, 'done');
  assert.match(fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8'), /pii-patterns:\n {2}- \\b\\d\{8\}\\b/);
});

test('verify: before apply it is conservative; after apply + commit it is active with no warnings', () => {
  const repo = nodeRepo({ vitestConfig: "export default { test: { exclude: ['.pignolo/**'] } };\n" });
  const env = env0();
  const pre = cli(['verify', '--cwd', repo], { env });
  assert.equal(pre.json.active, false);
  assert.ok(pre.json.warnings.some((w) => /conservador/.test(w)));
  assert.equal(cli(['apply', '--plan', fullPlan(repo, env), '--cwd', repo], { env }).status, 0);
  const files = cli(['verify', '--cwd', repo], { env }).json.nextCommit.files;
  git(['add', '--', ...files], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  const post = cli(['verify', '--cwd', repo], { env });
  assert.equal(post.json.active, true);
  assert.deepEqual(post.json.warnings, []);
  assert.equal(post.json.reflog, true);
  assert.equal(post.json.ignores, true);
});

test('verify: runnerExcludes reports whether the vitest config excludes .pignolo', () => {
  const env = env0();
  const without = cli(['verify', '--cwd', nodeRepo()], { env });
  assert.deepEqual(without.json.runnerExcludes, [{ runner: 'vitest', applied: false }]);
  assert.ok(without.json.notes.some((n) => /vitest/.test(n)));
  const withEx = cli(['verify', '--cwd', nodeRepo({ vitestConfig: "export default { test: { exclude: ['.pignolo/**'] } };\n" })], { env });
  assert.deepEqual(withEx.json.runnerExcludes, [{ runner: 'vitest', applied: true }]);
});

test('nextCommit: git add of the listed files works in a new repo; .pignolo/.gitignore only if tracked; never settings.local or backups', () => {
  const env = env0();
  const repo = nodeRepo();
  assert.equal(cli(['apply', '--plan', fullPlan(repo, env), '--cwd', repo], { env }).status, 0);
  const nc = cli(['verify', '--cwd', repo], { env }).json.nextCommit;
  assert.ok(nc.files.includes('.pignolo/project.md'));
  assert.ok(!nc.files.includes('.pignolo/.gitignore'));
  git(['add', '--', ...nc.files], repo);
  assert.ok(!nc.files.some((f) => /settings\.local|init-backup|pignolo-bak/.test(f)));

  const tracked = nodeRepo();
  write(tracked, '.pignolo/.gitignore', '.gitignore\n');
  git(['add', '-f', '.pignolo/.gitignore'], tracked);
  git(['commit', '-q', '-m', 'ign'], tracked);
  assert.equal(cli(['apply', '--plan', fullPlan(tracked, env), '--cwd', tracked], { env }).status, 0);
  const v = cli(['verify', '--cwd', tracked], { env });
  assert.equal(v.json.trackedModified, true);
  assert.ok(v.json.nextCommit.files.includes('.pignolo/.gitignore'));
});

test('output: clean stderr on success, and nothing from the auto-memory files ever appears', () => {
  const repo = nodeRepo();
  const env = env0();
  const token = `ghp_${'b'.repeat(36)}`;
  const mem = path.join(env.CLAUDE_CONFIG_DIR, 'projects', memorySlug(repo), 'memory');
  fs.mkdirSync(mem, { recursive: true });
  fs.writeFileSync(path.join(mem, 'a.md'), token);
  const d = cli(['detect', '--cwd', repo], { env });
  assert.equal(d.json.memory.files, 1);
  const a = cli(['apply', '--plan', fullPlan(repo, env), '--cwd', repo], { env });
  const v = cli(['verify', '--cwd', repo], { env });
  for (const r of [d, a, v]) {
    assert.equal(r.stderr, '');
    assert.equal(r.stdout.includes(token), false);
    assert.doesNotThrow(() => JSON.parse(r.stdout));
  }
});

// --- Pasada de arreglos 8a ---
const planOnly = (repo, approved, proposal, answers = {}) => planFile({ v: 1, approved, answers, proposal });

// Protects: I-1 · Breaks if: init deja inválido un project.md que era válido y responde ok:true.
test('I-1: a project.md whose gates map uses 4 spaces is merged keeping them; verify still parses it', () => {
  const repo = nodeRepo();
  const env = env0();
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n    on-edit: npm run lint\n---\n');
  commitAll(repo, 'pm');
  const plan = planOnly(repo, ['project-md'], { gates: { 'on-edit': 'npm run lint', 'on-done': 'npm test' } });
  const p = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  assert.equal(p.json.steps.find((s) => s.id === 'project-md').status, 'would-do');
  const a = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.json.steps.find((s) => s.id === 'project-md').status, 'done');
  const text = fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8');
  assert.equal(text, '---\ntype: code-tested\ngates:\n    on-edit: npm run lint\n    on-done: npm test\n---\n');
  const v = cli(['verify', '--cwd', repo], { env });
  assert.equal(v.json.configError, undefined);
  assert.equal(v.json.config.gates['on-done'], 'npm test');
});

// Protects: I-1 (red de seguridad) · Breaks if: se escribe un resultado que el parser rechaza.
test('I-1: a result that does not parse is refused as invalid-result, in preview too, and nothing is written', () => {
  const repo = nodeRepo();
  const env = env0();
  const original = '---\ntype: code-tested\n---\n';
  write(repo, '.pignolo/project.md', original);
  commitAll(repo, 'pm');
  const plan = planOnly(repo, ['project-md'], { gates: { '[bad': 'npm test' } });
  for (const verb of ['preview', 'apply']) {
    const r = cli([verb, '--plan', plan, '--cwd', repo], { env });
    const s = r.json.steps.find((x) => x.id === 'project-md');
    assert.equal(s.status, 'refused', verb);
    assert.equal(s.reason, 'invalid-result', verb);
    assert.equal(fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8'), original);
  }
  assert.equal(fs.existsSync(path.join(env.PIGNOLO_HOME, 'init-backup')), false, 'sin respaldo si no se escribe');
});

// Protects: m-9 · Breaks if: un valor sin comilla posible sale como "inconsistent" / exit 3 sin haber escrito nada.
test('m-9: a value that cannot be quoted is refused as unquotable (exit 0, nothing written)', () => {
  const repo = nodeRepo();
  const env = env0();
  const plan = planOnly(repo, ['project-md', 'reflog'], { type: 'code-tested', gates: { 'on-done': `echo "it's"` } });
  const r = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(r.status, 0, r.stderr);
  const s = r.json.steps.find((x) => x.id === 'project-md');
  assert.equal(s.status, 'refused');
  assert.equal(s.reason, 'unquotable');
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  assert.equal(r.json.steps.find((x) => x.id === 'reflog').status, 'done');
});

// Protects: m-2 · Breaks if: verify sale 0 con ok:false.
test('m-2: verify with an unparseable project.md exits 1 with kind and Alternativa', () => {
  const repo = nodeRepo();
  write(repo, '.pignolo/project.md', '---\ntype: code-tested\ngates:\n    a: 1\n  b: 2\n---\n');
  const v = cli(['verify', '--cwd', repo]);
  assert.equal(v.json.ok, false);
  assert.equal(v.json.kind, 'invalid-config');
  assert.equal(v.status, 1);
  assert.match(v.stderr, /Alternativa:/);
  const good = cli(['verify', '--cwd', nodeRepo()]);
  assert.equal(good.status, 0);
});

// Protects: m-1 · Breaks if: apply acepta un preview vencido.
test('m-1: preview returns a stamp; apply --expect refuses a stale one and accepts the current one', () => {
  const repo = nodeRepo();
  const env = env0();
  const plan = fullPlan(repo, env);
  const p1 = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  assert.match(p1.json.stamp, /^[0-9a-f]{16,}$/);
  assert.equal(cli(['preview', '--plan', plan, '--cwd', repo], { env }).json.stamp, p1.json.stamp, 'estable');
  write(repo, '.gitattributes', '.pignolo/** text eol=lf\n'); // el repo cambia entre preview y apply
  const stale = cli(['apply', '--plan', plan, '--cwd', repo, '--expect', p1.json.stamp], { env });
  assert.equal(stale.status, 1);
  assert.equal(stale.json.refused, 'stale-preview');
  assert.match(stale.stderr, /Alternativa:/);
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'project.md')), 'no escribió nada');
  const p2 = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  assert.notEqual(p2.json.stamp, p1.json.stamp);
  const ok = cli(['apply', '--plan', plan, '--cwd', repo, '--expect', p2.json.stamp], { env });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  const noExpect = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(noExpect.status, 0, 'sin --expect, apply sigue como antes');
});

// Protects: G31 · Breaks if: auto-memory-off deja settings.local.json sin ignorar y el flujo sube a daily.
test('G31 end to end: preview announces the exclude, apply writes it once, git status stays clean of it, risk has no claude-config hit', () => {
  const repo = nodeRepo();
  const env = env0();
  const plan = planOnly(repo, ['auto-memory-off'], {});
  const p = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  const ps = p.json.steps.find((s) => s.id === 'auto-memory-off');
  assert.equal(ps.status, 'would-do');
  assert.equal(ps.exclude, true);
  assert.ok(!fs.existsSync(path.join(repo, '.claude')));
  assert.ok(!/settings\.local/.test(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8')));
  const a = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(a.json.steps.find((s) => s.id === 'auto-memory-off').exclude, true);
  assert.ok(!a.json.notes.some((n) => /no está ignorado/.test(n)), JSON.stringify(a.json.notes));
  assert.equal(porcelain(repo), '');
  const again = cli(['apply', '--plan', plan, '--cwd', repo], { env });
  assert.equal(again.json.steps.find((s) => s.id === 'auto-memory-off').status, 'skipped');
  const lines = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8').split(/\r?\n/).filter((l) => l === '/.claude/settings.local.json');
  assert.equal(lines.length, 1);
});

// Protects: m-8 · Breaks if: con el archivo versionado la nota sigue diciendo "mientras esté sin seguimiento".
test('m-8: with settings.local.json tracked, the note says it is versioned and was modified', () => {
  const repo = nodeRepo();
  const env = env0();
  write(repo, '.claude/settings.local.json', '{"a":1}\n');
  git(['add', '-f', '.claude/settings.local.json'], repo);
  git(['commit', '-q', '-m', 'tracked'], repo);
  const a = cli(['apply', '--plan', planOnly(repo, ['auto-memory-off'], {}), '--cwd', repo], { env });
  const note = a.json.notes.join('\n');
  assert.match(note, /versionado/);
  assert.ok(!/sin seguimiento/.test(note));
  assert.match(porcelain(repo), /^M\s+\.claude\/settings\.local\.json/);
});
