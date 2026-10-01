'use strict';
// scripts/close-session.js por procesos nuevos (spec §15 `state`: archivado; R-11).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
const L = require(path.join(PLUGIN_ROOT, 'lib', 'learnings.js'));
const seals = require(path.join(PLUGIN_ROOT, 'lib', 'seals.js'));
const { seedShadow } = require(path.join(PLUGIN_ROOT, 'lib', 'git-backup.js'));
const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'close-session.js');

const DAY = 24 * 60 * 60 * 1000;
const day = (d) => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
const PASS = { novelty: 'pass', evidence: 'pass', contradictions: 'pass', safety: 'pass', size: 'pass', scope: 'pass' };
const report = (id, checks = {}, word = 'DONE') => `Informe\n\n\`\`\`json\n${JSON.stringify({ results: [{ id, checks: { ...PASS, ...checks }, contradicts: [], promoteCandidate: false, notes: '' }] })}\n\`\`\`\n\n${word}\n`;

function cli(args, { cwd, env = {} } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* uso */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}
function project(repo) {
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ntest-paths:\n  - tests/\n---\n');
}
const put = (main, kind, id, status, created) => assert.ok(store.writeEntry({ main, kind, id, fields: { status, created }, body: '# T\n\nx\n' }).ok);

test('usage: no verb, unknown verb or missing option exit 2', () => {
  const repo = makeRepo();
  assert.strictEqual(cli([], { cwd: repo }).status, 2);
  assert.strictEqual(cli(['bogus'], { cwd: repo }).status, 2);
  assert.strictEqual(cli(['decide', '--id', 'x'], { cwd: repo }).status, 2);
  assert.strictEqual(cli(['archive', '--days', 'muchos'], { cwd: repo }).status, 2);
});

test('archive: moves the old closed entry only, dry-run lists without moving, index then counts archive as 1', () => {
  const repo = makeRepo();
  project(repo);
  put(repo, 'work', `${day(20)}-old`, 'closed', day(20));
  put(repo, 'work', `${day(3)}-recent`, 'closed', day(3));
  put(repo, 'work', `${day(40)}-open`, 'open', day(40));
  put(repo, 'learnings/rejected', `${day(60)}-rej`, 'rejected', day(60));
  put(repo, 'learnings/accepted', `${day(60)}-acc`, 'accepted', day(60));
  const dry = cli(['archive', '--dry-run'], { cwd: repo });
  assert.strictEqual(dry.status, 0, dry.stderr);
  assert.deepStrictEqual(dry.json.moved.map((m) => m.id), [`${day(20)}-old`]);
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'work'), `${day(20)}-old.md`)));
  const r = cli(['archive'], { cwd: path.join(repo) });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.json.moved.map((m) => m.id), [`${day(20)}-old`]);
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'archive'), `${day(20)}-old.md`)));
  for (const [kind, id] of [['work', `${day(3)}-recent`], ['work', `${day(40)}-open`], ['learnings/rejected', `${day(60)}-rej`], ['learnings/accepted', `${day(60)}-acc`]]) {
    assert.ok(fs.existsSync(path.join(store.stateDir(repo, kind), `${id}.md`)), id);
  }
  const idx = cli(['index'], { cwd: repo });
  assert.strictEqual(idx.status, 0, idx.stderr);
  assert.deepStrictEqual([idx.json.ok, idx.json.changed, idx.json.errors], [true, true, []]);
  const text = fs.readFileSync(idx.json.file, 'utf8');
  assert.ok(text.includes('## archive\n\n- 1 entradas archivadas'), text);
  assert.ok(!text.split('## archive')[0].includes(`${day(20)}-old`), 'ya no está en work');
  assert.ok(text.includes(`${day(3)}-recent`));
});

test('archive: versioned entry is an R in git status; an uncommitted one is renamed; a duplicate destination goes to refused with exit 0', () => {
  const repo = makeRepo();
  put(repo, 'work', `${day(20)}-tracked`, 'closed', day(20));
  git(['add', '.pignolo'], repo);
  git(['commit', '-q', '-m', 'estado'], repo);
  put(repo, 'work', `${day(20)}-fresh`, 'closed', day(20));
  put(repo, 'issues', `${day(30)}-dup`, 'closed', day(30));
  put(repo, 'archive', `${day(30)}-dup`, 'closed', day(30));
  const r = cli(['archive', '--days', '14', '--cwd', repo], { cwd: makeTempDir('pignolo-elsewhere-') });
  assert.strictEqual(r.status, 0, r.stderr);
  const how = Object.fromEntries(r.json.moved.map((m) => [m.id, m.how]));
  assert.deepStrictEqual(how, { [`${day(20)}-tracked`]: 'git-mv', [`${day(20)}-fresh`]: 'rename' });
  assert.deepStrictEqual(r.json.refused.map((x) => [x.id, x.reason]), [[`${day(30)}-dup`, 'exists']]);
  const status = git(['status', '--porcelain'], repo);
  assert.match(status, /^R\s+\.pignolo\/state\/work\/.*-tracked\.md -> \.pignolo\/state\/archive\//m);
  assert.ok(!status.split('\n').some((l) => /^[RDAM]/.test(l) && l.includes('-fresh')), 'la no versionada queda como ?? en archive/');
});

test('every verb refuses with merge-in-progress during a real merge, cherry-pick or rebase in the main checkout and touches nothing', () => {
  const repo = makeRepo();
  project(repo);
  put(repo, 'work', `${day(20)}-old`, 'closed', day(20));
  const conflict = (branch) => {
    git(['checkout', '-q', '-b', branch], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), `${branch}\n`);
    git(['commit', '-q', '-am', branch], repo);
    git(['checkout', '-q', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), `main-${branch}\n`);
    git(['commit', '-q', '-am', `main ${branch}`], repo);
  };
  conflict('m');
  const verbs = [['evidence', '--since', 'HEAD~1'], ['scan', '--id', `${day(20)}-old`], ['decide', '--id', 'x', '--validation-file', 'v.md'], ['archive'], ['index'], ['prune', '--session', 's']];
  const check = (op) => {
    for (const v of verbs) {
      const r = cli(v, { cwd: repo });
      assert.strictEqual(r.status, 1, `${op} ${v[0]}: ${r.stdout}${r.stderr}`);
      assert.deepStrictEqual([r.json.ok, r.json.refused, r.json.operation], [false, 'merge-in-progress', op], v[0]);
    }
    assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'work'), `${day(20)}-old.md`)));
    assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'state', 'INDEX.md')));
  };
  assert.throws(() => git(['merge', '--no-commit', 'm'], repo));
  check('merge');
  git(['merge', '--abort'], repo);
  assert.throws(() => git(['cherry-pick', 'm'], repo));
  check('cherry-pick');
  git(['cherry-pick', '--abort'], repo);
  assert.throws(() => git(['rebase', 'm'], repo));
  check('rebase');
  git(['rebase', '--abort'], repo);
  assert.strictEqual(cli(['index'], { cwd: repo }).status, 0);
});

test('declared limit: a merge in a linked worktree does not refuse the script in the main checkout', () => {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'side', wt], repo);
  git(['checkout', '-q', '-b', 'other'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'other\n');
  git(['commit', '-q', '-am', 'other'], repo);
  git(['checkout', '-q', 'main'], repo);
  fs.writeFileSync(path.join(wt, 'a.txt'), 'side\n');
  git(['commit', '-q', '-am', 'side'], wt);
  assert.throws(() => git(['merge', '--no-commit', 'other'], wt));
  assert.strictEqual(cli(['index'], { cwd: repo }).status, 0);
});

test('prune: without --session or CLAUDE_CODE_SESSION_ID exits 1 with no-session; with either, the gc runs on a seeded shadow; unseeded gives nulls', () => {
  const repo = makeRepo();
  const home = makeTempDir('pignolo-home-');
  const env = { PIGNOLO_HOME: home };
  const no = cli(['prune'], { cwd: repo, env });
  assert.strictEqual(no.status, 1);
  assert.deepStrictEqual([no.json.ok, no.json.refused], [false, 'no-session']);
  const unseeded = cli(['prune', '--session', 'nueva'], { cwd: repo, env });
  assert.strictEqual(unseeded.status, 0, unseeded.stderr);
  assert.deepStrictEqual([unseeded.json.ok, unseeded.json.pruned, unseeded.json.gc], [true, null, null]);
  seedShadow({ cwd: repo, env: { ...process.env, ...env }, sessionId: 's1' });
  const flag = cli(['prune', '--session', 's1'], { cwd: repo, env });
  assert.strictEqual(flag.status, 0, flag.stderr);
  assert.strictEqual(flag.json.gc.ran, true, JSON.stringify(flag.json));
  fs.rmSync(path.join(flag.json.gc && home, 'shadow'), { recursive: true, force: true });
  seedShadow({ cwd: repo, env: { ...process.env, ...env }, sessionId: 's2' });
  const viaEnv = cli(['prune'], { cwd: repo, env: { ...env, CLAUDE_CODE_SESSION_ID: 's2' } });
  assert.strictEqual(viaEnv.status, 0, viaEnv.stderr);
  assert.strictEqual(viaEnv.json.gc.ran, true, JSON.stringify(viaEnv.json));
});

test('decide: session+pass goes to accepted/, web stays as human, a ghp_ secret is rejected, an unparseable validation is pending', () => {
  const repo = makeRepo();
  project(repo);
  const tmp = makeTempDir('pignolo-val-');
  const propose = (id, source, body = '# Usar LF\n\nSiempre LF.\n') => assert.ok(L.proposeLearning({ main: repo, id, source, evidence: 'tests/x.test.js', body }).ok);
  const vfile = (id, text) => { const f = path.join(tmp, `${id}.md`); fs.writeFileSync(f, text); return f; };
  propose('2026-09-30-a', 'session');
  const a = cli(['decide', '--id', '2026-09-30-a', '--validation-file', vfile('a', report('2026-09-30-a'))], { cwd: repo });
  assert.strictEqual(a.status, 0, a.stderr);
  assert.deepStrictEqual([a.json.decision, a.json.moved, a.json.how], ['accepted', true, 'rename']);
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'learnings/accepted'), '2026-09-30-a.md')));
  propose('2026-09-30-b', 'web');
  const b = cli(['decide', '--id', '2026-09-30-b', '--validation-file', vfile('b', report('2026-09-30-b'))], { cwd: repo });
  assert.deepStrictEqual([b.json.decision, b.json.moved], ['human', false]);
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'learnings/proposed'), '2026-09-30-b.md')));
  propose('2026-09-30-c', 'session', `# Token\n\nusá ghp_${'a'.repeat(36)}\n`);
  const sc = cli(['scan', '--id', '2026-09-30-c'], { cwd: repo });
  assert.deepStrictEqual([sc.status, sc.json.clean, sc.json.findings[0].kind], [0, false, 'secret']);
  const c = cli(['decide', '--id', '2026-09-30-c', '--validation-file', vfile('c', report('2026-09-30-c'))], { cwd: repo });
  assert.strictEqual(c.json.decision, 'rejected');
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'learnings/rejected'), '2026-09-30-c.md')));
  propose('2026-09-30-d', 'session');
  const d = cli(['decide', '--id', '2026-09-30-d', '--validation-file', vfile('d', 'sin bloque json\nDONE\n')], { cwd: repo });
  assert.deepStrictEqual([d.json.decision, d.json.moved], ['pending', false]);
  assert.ok(fs.existsSync(path.join(store.stateDir(repo, 'learnings/proposed'), '2026-09-30-d.md')));
  const r = cli(['decide', '--id', '2026-09-30-d', '--validation-file', vfile('r', report('2026-09-30-d')), '--reserved'], { cwd: repo });
  assert.strictEqual(r.json.decision, 'human');
  assert.strictEqual(cli(['decide', '--id', '2026-09-30-nope', '--validation-file', vfile('n', 'x')], { cwd: repo }).status, 1);
});

test('evidence: commits and files since a sha, seals from the seal dir, run with the shape of readRun', () => {
  const repo = makeRepo();
  const base = git(['rev-parse', 'HEAD'], repo);
  fs.writeFileSync(path.join(repo, 'b.txt'), 'dos\n');
  git(['add', 'b.txt'], repo);
  git(['commit', '-q', '-m', 'segundo'], repo);
  fs.writeFileSync(path.join(repo, 'c.txt'), 'tres\n');
  git(['add', 'c.txt'], repo);
  git(['commit', '-q', '-m', 'tercero'], repo);
  const home = makeTempDir('pignolo-home-');
  const r = cli(['evidence', '--since', base], { cwd: repo, env: { PIGNOLO_HOME: home } });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.json.commits.map((c) => c.subject), ['tercero', 'segundo']);
  assert.ok(r.json.commits.every((c) => /^[0-9a-f]{40}$/.test(c.sha)));
  assert.deepStrictEqual(r.json.files, ['b.txt', 'c.txt']);
  assert.deepStrictEqual(r.json.seals, []);
  assert.deepStrictEqual([r.json.run.running, r.json.run.expired], [false, false]);
  const repoId = seals.repoIdFor({ cwd: repo });
  const { file } = seals.writeSeal({ env: { PIGNOLO_HOME: home }, repoId, seal: { v: 1, repoId, sha: base, treeHash: 'a'.repeat(40), treeAfter: 'a'.repeat(40), level: 'on-done', command: 'npm test', exit: 0, status: 'PASS', logHash: '', time: '2026-09-30T10:00:00.000Z', task: null, noTestsReason: null, checks: { scope: [], emptied: [], integrity: [], envDetect: [] } }, log: 'ok\n' });
  const r2 = cli(['evidence', '--since', '2000-01-01'], { cwd: repo, env: { PIGNOLO_HOME: home } });
  assert.strictEqual(r2.status, 0, r2.stderr);
  assert.deepStrictEqual(r2.json.seals, [path.basename(file)]);
  assert.strictEqual(r2.json.commits.length, 3);
  const bad = cli(['evidence', '--since', 'deadbeef'], { cwd: repo });
  assert.deepStrictEqual([bad.status, bad.json.refused], [1, 'git-failed']);
});
