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

test('detect: JSON with the eight steps, answers needed, and it writes nothing', () => {
  const repo = nodeRepo();
  const before = listing(repo);
  const r = cli(['detect', '--cwd', repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.detection.type, 'code-tested');
  assert.deepEqual(r.json.steps.map((s) => s.id), ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md', 'security-md', 'auto-memory-off']);
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

// Hito 8d, Task 4: detect suma `places` (solo lectura).
test('detect: places lists the existing folders and writes nothing', () => {
  const repo = nodeRepo();
  write(repo, 'doc/specs/a.md', 'a\n');
  write(repo, 'plans/p.md', 'p\n');
  commitAll(repo, 'docs');
  const before = listing(repo);
  const status = porcelain(repo);
  const r = cli(['detect', '--cwd', repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(r.json.places).sort(), ['ambiguous', 'candidates', 'caseCollisions', 'existing']);
  assert.deepEqual(r.json.places.candidates.map((c) => [c.kind, c.path]), [['spec', 'doc/specs/'], ['plan', 'plans/']]);
  assert.equal(r.json.places.existing, true);
  assert.deepEqual(listing(repo), before);
  assert.equal(porcelain(repo), status);

  const bare = makeTempDir('pignolo-bare-');
  git(['init', '-q', '-b', 'main'], bare);
  const e = cli(['detect', '--cwd', bare]);
  assert.equal(e.status, 0, e.stderr);
  assert.equal(e.json.places.existing, false);
  assert.deepEqual(e.json.places.candidates, []);
});

// ---------------------------------------------------------------- hito 8d, Task 8: adapt y skeleton
const { hashTree } = require('./helpers');
const PLACES = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'places.js');
const STEPS_8D = ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md', 'security-md', 'auto-memory-off'];
const withExpect = (args, stamp) => [...args, '--expect', stamp];

function docRepo() {
  const repo = makeRepo();
  write(repo, 'doc/specs/2026-01-01-a-design.md', '# a\n');
  write(repo, 'README.md', 'ver [la spec](doc/specs/2026-01-01-a-design.md)\n');
  commitAll(repo, 'docs');
  return repo;
}
function freshRepo() {
  const d = makeTempDir('pignolo-fresh-');
  git(['init', '-q', '-b', 'main'], d);
  git(['config', 'user.name', 't'], d);
  git(['config', 'user.email', 't@example.invalid'], d);
  return d;
}
const adaptPlan = (answersOver = {}) => planFile({
  v: 1,
  approved: ['adapt', 'skeleton', 'project-md'],
  answers: { piiPatterns: [], places: { spec: { decision: 'move', from: 'doc/specs/' } }, ...answersOver },
  proposal: { type: 'docs' },
});
const stepOf = (r, id) => r.json.steps.find((s) => s.id === id);
const undoCli = (record, repo, env) => spawnSync(process.execPath, [PLACES, 'undo', '--record', record, '--cwd', repo], { env, encoding: 'utf8' });

test('8d: STEP_IDS exacto; el apply de 8a sin adapt no pide --expect; id desconocido o public mal formado es exit 2', () => {
  const { STEP_IDS } = require('../plugins/pignolo/scripts/init');
  assert.deepEqual(STEP_IDS, STEPS_8D);
  const repo = nodeRepo();
  const ok = cli(['apply', '--plan', planFile({ v: 1, approved: ['reflog'], answers: {}, proposal: {} }), '--cwd', repo]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(stepOf(ok, 'adapt').reason, 'not-approved');
  assert.equal(cli(['apply', '--plan', planFile({ v: 1, approved: ['adapt-all'], answers: {}, proposal: {} }), '--cwd', repo]).status, 2);
  assert.equal(cli(['apply', '--plan', planFile({ v: 1, approved: [], answers: { public: 'no' }, proposal: {} }), '--cwd', repo]).status, 2);
});

test('8d: proyecto nuevo con skeleton y project-md: seis lugares con public false, cinco sin public; adapt no corre', () => {
  const env = env0();
  const a = freshRepo();
  const planA = planFile({ v: 1, approved: ['adapt', 'skeleton', 'project-md'], answers: { public: false, piiPatterns: [] }, proposal: { type: 'docs' } });
  const stamp = cli(['preview', '--plan', planA, '--cwd', a], { env }).json.stamp;
  const ra = cli(withExpect(['apply', '--plan', planA, '--cwd', a], stamp), { env });
  assert.equal(ra.status, 0, ra.stderr + ra.stdout);
  assert.equal(stepOf(ra, 'adapt').reason, 'nothing-to-adapt');
  const pm = fs.readFileSync(path.join(a, '.pignolo', 'project.md'), 'utf8');
  for (const k of ['spec', 'plan', 'research', 'design', 'private', 'reference']) assert.match(pm, new RegExp(`^ {2}${k}: `, 'm'), k);
  assert.ok(fs.existsSync(path.join(a, 'docs', 'specs', 'README.md')));
  assert.ok(fs.existsSync(path.join(a, 'docs', 'references', 'README.md')));
  assert.ok(!fs.existsSync(path.join(a, 'docs', 'specs', '.gitkeep')));

  const b = freshRepo();
  const rb = cli(['apply', '--plan', planFile({ v: 1, approved: ['skeleton', 'project-md'], answers: { piiPatterns: [] }, proposal: { type: 'docs' } }), '--cwd', b], { env });
  assert.equal(rb.status, 0, rb.stderr + rb.stdout);
  const pmb = fs.readFileSync(path.join(b, '.pignolo', 'project.md'), 'utf8');
  assert.doesNotMatch(pmb, /reference:/);
  assert.ok(!fs.existsSync(path.join(b, 'docs', 'references')));
  assert.ok(fs.existsSync(path.join(b, 'docs', 'specs', 'README.md')));
});

test('8d: preview no escribe y da stamp; apply con adapt sin --expect es exit 2; con --expect mueve y escribe el mapa', () => {
  const repo = docRepo();
  const env = env0();
  const plan = adaptPlan();
  const h = hashTree(repo);
  const pv = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  assert.equal(pv.status, 0, pv.stderr + pv.stdout);
  assert.equal(hashTree(repo), h, 'preview no escribe');
  assert.equal(porcelain(repo), '');
  assert.match(pv.json.stamp, /^[0-9a-f]{24}$/);
  const adaptPv = stepOf(pv, 'adapt');
  assert.equal(adaptPv.status, 'would-do');
  assert.deepEqual(adaptPv.items.map((i) => [i.kind, i.from, i.to]), [['spec', 'doc/specs/', 'docs/specs/']]);
  assert.ok(adaptPv.rewrites.some((w) => w.file === 'README.md'));
  assert.equal(cli(['apply', '--plan', plan, '--cwd', repo], { env }).status, 2);
  assert.equal(hashTree(repo), h, 'sin --expect no se movió nada');
  const ap = cli(withExpect(['apply', '--plan', plan, '--cwd', repo], pv.json.stamp), { env });
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  assert.ok(fs.existsSync(path.join(repo, 'docs', 'specs', '2026-01-01-a-design.md')));
  assert.ok(!fs.existsSync(path.join(repo, 'doc', 'specs')));
  assert.match(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), /\]\(docs\/specs\/2026-01-01-a-design\.md\)/);
  assert.match(fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8'), /^ {2}spec: docs\/specs\/$/m);
  assert.ok(stepOf(ap, 'adapt').record, 'el registro para deshacer');
});

test('8d: un .js o un junction creado en el origen entre preview y apply es stale-preview y no se escribe nada', (t) => {
  const env = env0();
  const plan = adaptPlan();
  const repo = docRepo();
  const stamp = cli(['preview', '--plan', plan, '--cwd', repo], { env }).json.stamp;
  write(repo, 'doc/specs/helper.js', 'module.exports = 1;\n');
  const h = hashTree(repo);
  const r = cli(withExpect(['apply', '--plan', plan, '--cwd', repo], stamp), { env });
  assert.equal(r.status, 1);
  assert.equal(r.json.kind, 'stale-preview');
  assert.equal(hashTree(repo), h);

  const repo2 = docRepo();
  const stamp2 = cli(['preview', '--plan', plan, '--cwd', repo2], { env }).json.stamp;
  const link = path.join(repo2, 'doc', 'specs', 'enlace');
  try { fs.symlinkSync(makeTempDir('pignolo-out-'), link, 'junction'); } catch (e) { t.skip(`sin junction: ${e.code}`); return; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { /* ya no está */ } });
  const h2 = hashTree(repo2);
  const r2 = cli(withExpect(['apply', '--plan', plan, '--cwd', repo2], stamp2), { env });
  assert.equal(r2.status, 1);
  assert.equal(r2.json.kind, 'stale-preview');
  assert.equal(hashTree(repo2), h2);
});

test('8d: preview y apply listan los mismos ítems; skeleton en dry no anuncia crear lo que adapt va a mover ahí', () => {
  const repo = docRepo();
  const env = env0();
  const plan = adaptPlan();
  const pv = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  const created = (stepOf(pv, 'skeleton').created || []).map((c) => (typeof c === 'string' ? c : c.path));
  assert.ok(!created.some((p) => /docs\/specs/.test(p)), `skeleton anuncia crear docs/specs: ${created}`);
  const ap = cli(withExpect(['apply', '--plan', plan, '--cwd', repo], pv.json.stamp), { env });
  const key = (s) => s.items.map((i) => [i.kind, i.from, i.to]);
  assert.deepEqual(key(stepOf(ap, 'adapt')), key(stepOf(pv, 'adapt')));
  assert.deepEqual(stepOf(ap, 'adapt').rewrites.map((w) => w.file), stepOf(pv, 'adapt').rewrites.map((w) => w.file));
});

test('8d: el undo deja los documentos como estaban y le quita al mapa solo lo que escribió init; una edición manual se respeta', () => {
  const env = env0();
  const plan = adaptPlan();
  const repo = docRepo();
  const stamp = cli(['preview', '--plan', plan, '--cwd', repo], { env }).json.stamp;
  const ap = cli(withExpect(['apply', '--plan', plan, '--cwd', repo], stamp), { env });
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  const un = undoCli(stepOf(ap, 'adapt').record, repo, env);
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'specs', '2026-01-01-a-design.md')));
  assert.ok(!fs.existsSync(path.join(repo, 'docs', 'specs', '2026-01-01-a-design.md')));
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'ver [la spec](doc/specs/2026-01-01-a-design.md)\n');
  const pm = fs.readFileSync(path.join(repo, '.pignolo', 'project.md'), 'utf8');
  assert.doesNotMatch(pm, /spec: docs\/specs\//);
  assert.match(pm, /type: docs/);

  const repo2 = docRepo();
  const st2 = cli(['preview', '--plan', plan, '--cwd', repo2], { env }).json.stamp;
  const ap2 = cli(withExpect(['apply', '--plan', plan, '--cwd', repo2], st2), { env });
  const pmFile = path.join(repo2, '.pignolo', 'project.md');
  fs.writeFileSync(pmFile, fs.readFileSync(pmFile, 'utf8').replace('spec: docs/specs/', 'spec: documentos/specs/'));
  const un2 = undoCli(stepOf(ap2, 'adapt').record, repo2, env);
  assert.equal(un2.status, 0, un2.stderr + un2.stdout);
  assert.match(fs.readFileSync(pmFile, 'utf8'), /spec: documentos\/specs\//);
  assert.deepEqual(JSON.parse(un2.stdout).mapLeft, [{ kind: 'spec', current: 'documentos/specs/' }]);
});

test('8d: idempotencia (segundo apply sin cambios) y un mapa declarado distinto es conflicto sin tocar project.md', () => {
  const env = env0();
  const plan = adaptPlan();
  const repo = docRepo();
  const stamp = cli(['preview', '--plan', plan, '--cwd', repo], { env }).json.stamp;
  assert.equal(cli(withExpect(['apply', '--plan', plan, '--cwd', repo], stamp), { env }).status, 0);
  const h = hashTree(repo);
  const st = porcelain(repo);
  const pv2 = cli(['preview', '--plan', plan, '--cwd', repo], { env });
  const second = cli(withExpect(['apply', '--plan', plan, '--cwd', repo], pv2.json.stamp), { env });
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.equal(hashTree(repo), h);
  assert.equal(porcelain(repo), st);
  assert.equal(stepOf(second, 'adapt').status, 'skipped');
  assert.ok(['nothing-to-adapt', 'already-in-place'].includes(stepOf(second, 'adapt').reason), stepOf(second, 'adapt').reason);

  const repo3 = docRepo();
  const pmText = '---\ntype: docs\nplaces:\n  spec: otro/specs/\n---\n';
  write(repo3, '.pignolo/project.md', pmText);
  commitAll(repo3, 'pm');
  const pv3 = cli(['preview', '--plan', plan, '--cwd', repo3], { env });
  const r3 = cli(withExpect(['apply', '--plan', plan, '--cwd', repo3], pv3.json.stamp), { env });
  assert.equal(r3.status, 0, r3.stderr + r3.stdout);
  const pm3 = fs.readFileSync(path.join(repo3, '.pignolo', 'project.md'), 'utf8');
  assert.match(pm3, /^ {2}spec: otro\/specs\/$/m);
  assert.doesNotMatch(pm3, /docs\/specs/);
  assert.ok(fs.existsSync(path.join(repo3, 'doc', 'specs')), 'no se movió nada');
  assert.ok(r3.json.conflicts.length > 0 || stepOf(r3, 'adapt').status !== 'done', JSON.stringify(r3.json));
});

test('8d: un movimiento a medias da exit 3 partial con el registro y skeleton y project-md no corren', () => {
  const { main: initMain } = require('../plugins/pignolo/scripts/init');
  const SMlib = require('../plugins/pignolo/lib/safe-move');
  const repo = docRepo();
  const env = env0();
  const plan = adaptPlan();
  const stamp = cli(['preview', '--plan', plan, '--cwd', repo], { env }).json.stamp;
  const orig = SMlib.writeAtomic;
  SMlib.writeAtomic = () => { throw new Error('disco lleno simulado'); };
  let r;
  try { r = initMain(withExpect(['apply', '--plan', plan, '--cwd', repo], stamp), env); } finally { SMlib.writeAtomic = orig; }
  assert.equal(r.code, 3, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'partial');
  assert.ok(r.body.record);
  assert.match(r.alt, /places\.js undo/);
  for (const id of ['skeleton', 'project-md']) assert.equal(r.body.steps.find((s) => s.id === id).reason, 'adapt-failed');
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  const un = undoCli(r.body.record, repo, env);
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'specs', '2026-01-01-a-design.md')));
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'ver [la spec](doc/specs/2026-01-01-a-design.md)\n');
});

test('8d: verify nombra una ruta del mapa inexistente y la referencia manual que quedó; desde una worktree enlazada init escribe en el principal', () => {
  const env = env0();
  const repo = docRepo();
  write(repo, '.pignolo/project.md', '---\ntype: docs\nplaces:\n  plan: docs/plans/\n---\n');
  commitAll(repo, 'pm');
  const v = cli(['verify', '--cwd', repo], { env });
  assert.equal(v.status, 0, v.stderr);
  assert.ok(v.json.notes.some((n) => /places\.plan/.test(n) && /docs\/plans\//.test(n)), JSON.stringify(v.json.notes));

  const repo2 = docRepo();
  write(repo2, 'scripts/build.js', "require('../doc/specs/x');\n");
  commitAll(repo2, 'js');
  const plan = adaptPlan({ places: { spec: { decision: 'move', from: 'doc/specs/', force: true } } });
  const wt = path.join(makeTempDir('pignolo-8dwt-'), 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wt8d'], repo2);
  const stamp = cli(['preview', '--plan', plan, '--cwd', wt], { env }).json.stamp;
  const ap = cli(withExpect(['apply', '--plan', plan, '--cwd', wt], stamp), { env });
  assert.equal(ap.status, 0, ap.stderr + ap.stdout);
  assert.ok(ap.json.notes.some((n) => /worktree enlazada/.test(n)), JSON.stringify(ap.json.notes));
  assert.ok(fs.existsSync(path.join(repo2, 'docs', 'specs')));
  assert.ok(fs.existsSync(path.join(wt, 'doc', 'specs')), 'la worktree conserva su layout');
  const v2 = cli(['verify', '--cwd', repo2], { env });
  assert.equal(v2.status, 0, v2.stderr + v2.stdout);
  assert.ok(v2.json.notes.some((n) => /referencia a una ruta vieja/.test(n) && /build\.js/.test(n)), JSON.stringify(v2.json.notes));
});
