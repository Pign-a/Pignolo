'use strict';
// protect-paths: escritura de tests por rol en el momento (implementer/fixer y test-writer).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const payload = (cwd, file_path, agent_type, tool_name = 'Write') => ({ hook_event_name: 'PreToolUse', tool_name, cwd, tool_input: { file_path, content: 'x' }, ...(agent_type ? { agent_type, agent_id: 'a1' } : {}) });
const IMPL = 'pignolo:implementer';

// Repo con project.md (test-paths: [tests/]) commiteado y un worktree real; run.json con la tarea.
function setup(task = {}, { withProject = true, testPaths = ['tests/'] } = {}) {
  const repo = makeRepo();
  if (withProject) {
    fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
    const list = testPaths.map((p) => `  - ${JSON.stringify(p)}\n`).join('');
    fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), `---\ntype: code-tested\ntest-paths:\n${list}---\n`);
    git(['add', '.pignolo/project.md'], repo);
    git(['commit', '-q', '-m', 'project'], repo);
  }
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tw', wt], repo);
  const base = git(['rev-parse', 'HEAD'], repo);
  const run = { v: 1, flow: 'plan', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(), task: { id: 't1', worktree: wt, base, files: [], agents: [], ...task } };
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
  return { repo, wt };
}

test('implementer cannot write a test path; source files pass', () => {
  const { wt } = setup();
  const r = protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa:.*test-authorization/);
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'src', 'a.js'), IMPL), { env: env() }).exit, 0);
});

test('fixer is bound like the implementer', () => {
  const { wt } = setup();
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), 'pignolo:fixer'), { env: env() }).exit, 2);
});

test('test-authorization opens only the test files on the task card', () => {
  const { wt } = setup({ testAuthorization: true, files: ['tests/a.test.js'] });
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'tests', 'otro.test.js'), IMPL), { env: env() }).exit, 2);
});

test('project.md is denied to the implementer even with authorization', () => {
  const { wt } = setup({ testAuthorization: true, files: ['.pignolo/project.md'] });
  const r = protect.run(payload(wt, path.join(wt, '.pignolo', 'project.md'), IMPL, 'Edit'), { env: env() });
  assert.strictEqual(r.exit, 2);
});

test('an absolute path into the worktree is resolved against it even when cwd is the main checkout', () => {
  const { repo, wt } = setup();
  assert.strictEqual(protect.run(payload(repo, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: env() }).exit, 2);
});

test('test-writer writes only in test-paths or the holdout dir of the main checkout', () => {
  const { repo, wt } = setup();
  const w = (p, root = wt) => protect.run(payload(wt, path.join(root, p), 'pignolo:test-writer'), { env: env() });
  const r = w('src/a.js');
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa:.*holdout/);
  assert.strictEqual(w('tests/b.test.js').exit, 0);
  // Hito 4b: en el worktree de la tarea el holdout entraría al diff; solo en el checkout principal.
  assert.strictEqual(w('.pignolo/tmp/holdout/p1/acc.test.js').exit, 2);
  assert.strictEqual(w('.pignolo/tmp/holdout/p1/acc.test.js', repo).exit, 0);
  assert.strictEqual(w('.pignolo/project.md').exit, 2);
});

test('the main thread and other agent types have no per-role rule', () => {
  const { wt } = setup();
  const f = path.join(wt, 'tests', 'a.test.js');
  assert.strictEqual(protect.run(payload(wt, f), { env: env() }).exit, 0);
  assert.strictEqual(protect.run(payload(wt, f, 'pignolo:explorer'), { env: env() }).exit, 0);
});

test('a project without project.md has no per-role rule', () => {
  const { wt } = setup({}, { withProject: false });
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'latest.js'), IMPL), { env: env() }).exit, 0);
});

test('with the project off flag the per-role rule does not apply', () => {
  const { repo, wt } = setup();
  const e = env();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  const before = protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: e }).exit;
  fs.rmSync(path.join(repo, '.pignolo', '.disabled'));
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: e }).exit, 2);
  assert.strictEqual(before, 0);
});

test('an unreadable project.md denies a pignolo writer with the path', () => {
  const { repo, wt } = setup();
  const run = JSON.parse(fs.readFileSync(path.join(repo, '.pignolo', 'run.json'), 'utf8'));
  run.task.base = 'deadbeef'.repeat(5);
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
  const r = protect.run(payload(wt, path.join(wt, 'src', 'a.js'), IMPL), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /src\/a\.js/);
});

// Protects: mayúsculas en globs y rutas · Breaks if: rel sale en minúsculas y un glob con
// mayúsculas (*Test.java) o un archivo de la tarjeta con mayúsculas no coinciden nunca.
test('an uppercase test glob and uppercase task files keep their case', () => {
  const opts = { testPaths: ['src/test/**/*Test.java'] };
  const { wt } = setup({}, opts);
  const f = path.join(wt, 'src', 'test', 'java', 'FooTest.java');
  assert.strictEqual(protect.run(payload(wt, f, IMPL), { env: env() }).exit, 2);
  const auth = setup({ testAuthorization: true, files: ['src/test/java/FooTest.java'] }, opts);
  assert.strictEqual(protect.run(payload(auth.wt, path.join(auth.wt, 'src', 'test', 'java', 'FooTest.java'), IMPL), { env: env() }).exit, 0);
});

// Protects: alcance de la regla · Breaks if: con una tarea activa, la configuración de la tarea
// se aplica a rutas de otro repo (worktreeOf sube hasta cualquier .git).
test('with a task, paths outside the task worktree have no per-role rule', () => {
  const { wt } = setup();
  const other = makeRepo();
  assert.strictEqual(protect.run(payload(wt, path.join(other, 'tests', 'a.test.js'), IMPL), { env: env() }).exit, 0);
});

// Protects: la regla por rol en NTFS · Breaks if: la ruta se compara con mayúsculas ("TESTS/a.test.js")
// o en forma Git Bash ("/c/Users/.../tests/a.test.js") y el implementer escribe el mismo archivo.
const WIN = { skip: process.platform !== 'win32' && 'NTFS no distingue mayúsculas solo en Windows' };
test('implementer: TESTS/ en mayúsculas y la forma /c/ de Git Bash siguen siendo test-paths', WIN, () => {
  const { wt } = setup();
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'TESTS', 'a.test.js'), IMPL), { env: env() }).exit, 2);
  const gitBash = `/${wt[0].toLowerCase()}${wt.slice(2).split(path.sep).join('/')}/tests/a.test.js`;
  assert.strictEqual(protect.run(payload(wt, gitBash, IMPL), { env: env() }).exit, 2);
});

test('una entrada de task.files con otras mayúsculas autoriza el test en Windows', WIN, () => {
  const { wt } = setup({ testAuthorization: true, files: ['Tests/A.test.js'] });
  assert.strictEqual(protect.run(payload(wt, path.join(wt, 'tests', 'a.test.js'), IMPL), { env: env() }).exit, 0);
});

// ---- Task 10 (D-5-1): Write acotado del agente que experimenta (VERIFY_AGENT) ----
const { VERIFY_AGENT } = require('../plugins/pignolo/lib/plan-agents');
const planAudit = require('../plugins/pignolo/lib/plan-audit');

function auditSetup(mode = 'verify', plan = 'p1') {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  planAudit.beginMode({ main: repo, plan, mode, claims: [{ id: 'C1', claim: 'c', how: 'h' }] });
  return repo;
}
const auditPay = (repo, file, tool = 'Write', agent = VERIFY_AGENT) => payload(repo, file, agent, tool);
const scratch = (repo, plan = 'p1') => path.join(repo, '.pignolo', 'tmp', 'plan-audit', plan, 'scratch');

test('verify agent: Write, Edit and MultiEdit are allowed inside the scratch of the live verify mode', () => {
  const repo = auditSetup();
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    assert.strictEqual(protect.run(auditPay(repo, path.join(scratch(repo), 'exp1.js'), tool), { env: env() }).exit, 0, tool);
  }
});

test('verify agent: everything outside the scratch is denied with an Alternativa', () => {
  const repo = auditSetup();
  const deny = (file, label) => {
    const r = protect.run(auditPay(repo, file), { env: env() });
    assert.strictEqual(r.exit, 2, label);
    assert.match(r.stderr, /Alternativa:/, label);
  };
  deny(path.join(repo, 'src', 'a.js'), 'source');
  deny(path.join(repo, '.pignolo', 'tmp', 'plan-audit', 'p1', 'review.json'), 'review.json');
  deny(path.join(scratch(repo), '..', 'review.json'), 'traversal');
  deny(path.join(scratch(repo, 'p2'), 'x.js'), 'another plan');
  deny(path.join(repo, '.pignolo', 'tmp', 'plan-audit', 'p1', 'scratch'), 'the folder itself is not a file inside');
  if (process.platform === 'win32') {
    deny(path.join(repo, '.PIGNOLO', 'TMP', 'plan-audit', 'p1', 'review.json'), 'uppercase');
    deny(path.join(repo, '.pignolo', 'tmp', 'plan-audit', 'p1', 'review.json').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).split(path.sep).join('/'), 'git bash path');
  }
});

test('verify agent: the same scratch path with other case or as /c/... is allowed on win32', { skip: process.platform !== 'win32' }, () => {
  const repo = auditSetup();
  const file = path.join(scratch(repo), 'exp1.js');
  assert.strictEqual(protect.run(auditPay(repo, file.toUpperCase()), { env: env() }).exit, 0, 'case');
  const gitBash = file.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).split(path.sep).join('/');
  assert.strictEqual(protect.run(auditPay(repo, gitBash), { env: env() }).exit, 0, '/c/...');
});

test('verify agent: review mode and no live mode deny even the scratch; the main thread is not bound', () => {
  const rev = auditSetup('review');
  assert.strictEqual(protect.run(auditPay(rev, path.join(scratch(rev), 'x.js')), { env: env() }).exit, 2);
  const none = makeRepo();
  fs.mkdirSync(path.join(none, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(none, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  const r = protect.run(auditPay(none, path.join(scratch(none), 'x.js')), { env: env() });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /Alternativa:/);
  const verify = auditSetup();
  assert.strictEqual(protect.run(payload(verify, path.join(verify, 'src', 'a.js')), { env: env() }).exit, 0, 'main thread');
  assert.strictEqual(protect.run(auditPay(verify, path.join(verify, 'src', 'a.js'), 'Write', 'pignolo:explorer'), { env: env() }).exit, 0, 'other role');
});
