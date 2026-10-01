'use strict';
// Pruebas de punta a punta de la parte 5a (Task 13, spec §15): scope-gate, next, resume,
// present y la receta de la auditoría, por los scripts y por el launcher real, cada consulta
// en un proceso nuevo. Sin agentes: el plan-auditor se simula con los eventos que el host le
// manda a los hooks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir, git, runLauncher } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));
const { PROBES } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-probes.js'));
const { REVIEW_AGENT, VERIFY_AGENT } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-agents.js'));

const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
const REQUEST = 'Quiero una tarjeta de alcance con tres ejemplos de aceptacion y no agregar nada sin avisar.';
const CARD = `# T

## Goal
Una tarjeta.

## Acceptance examples
- Con "una tarjeta de alcance" queda registrada
- Con "tres ejemplos de aceptacion" valida
- Con "no agregar nada sin avisar" lista lo agregado

## Request to spec
- x

## Not included or reinterpreted
- none

## Added without being asked
- none

## Out of scope
- x

## Reserved decisions
- none

## Cost estimate
- x
`;
const J = (obj) => `informe\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`\n`;
const claim = (id, text) => ({ id, task: 'T1', claim: text, how: 'run it' });

function cli(script, cwd, args) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env } });
  let out;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : undefined; } catch (_) { out = r.stdout; }
  return { status: r.status, out, stdout: r.stdout, stderr: r.stderr };
}
const plan = (cwd, args) => cli('plan.js', cwd, args);
const audit = (cwd, args) => cli('plan-audit.js', cwd, args);
const ok = (r, label) => { assert.equal(r.status, 0, `${label}: ${r.stderr}${r.stdout}`); return r.out; };
function file(text, name = 'f.txt') {
  const p = path.join(makeTempDir('e2e-h5-'), name);
  fs.writeFileSync(p, text);
  return p;
}
function project(extra = '') {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'lib'));
  fs.writeFileSync(path.join(repo, 'lib', 'a.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), `---\ntype: code-tested\n${extra}---\n`);
  return repo;
}
const PLAN_MD = '### Task T1: x\n\n**Files:**\n- Modify: `lib/a.js`\n';
// Un plan registrado por la CLI hasta la etapa pedida (scope-card o plan-written).
function walk(repo, upTo) {
  ok(plan(repo, ['new', '--plan', 'p1', '--request-file', file(REQUEST), '--spec', 'docs/specs/x.md']), 'new');
  ok(plan(repo, ['advance', '--plan', 'p1', '--to', 'claims']), 'claims');
  ok(plan(repo, ['claims', 'set', '--plan', 'p1', '--none-reason', 'sin afirmaciones']), 'claims set');
  ok(plan(repo, ['advance', '--plan', 'p1', '--to', 'spec-review']), 'spec-review');
  ok(plan(repo, ['scope-card', 'save', '--plan', 'p1', '--file', file(CARD, 'card.md')]), 'card save');
  ok(plan(repo, ['advance', '--plan', 'p1', '--to', 'scope-card']), 'scope-card');
  if (upTo === 'scope-card') return null;
  const planFile = file(PLAN_MD, 'plan.md');
  ok(plan(repo, ['advance', '--plan', 'p1', '--to', 'plan-written', '--plan-file', planFile]), 'plan-written');
  return planFile;
}
const quiet = (r, label) => { assert.equal(r.status, 0, `${label}: ${r.stderr}`); assert.equal(r.stdout, '', label); };

test('scope-gate (§15): a merge of int/p1 into main without an approved card is blocked; after approving it is not', () => {
  const repo = project();
  walk(repo, 'scope-card');
  git(['branch', 'int/p1'], repo);
  const merge = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git merge int/p1' }, cwd: repo };
  const blocked = runLauncher('scope-gate', merge);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /Alternativa:/);
  ok(plan(repo, ['scope-card', 'approve', '--plan', 'p1', '--quote-file', file('ok, aprobada')]), 'approve');
  quiet(runLauncher('scope-gate', merge), 'after approval (the guard may still ask on its own; only scope-gate is tested)');
  // El comando de otra rama que no es del plan no se toca nunca.
  quiet(runLauncher('scope-gate', { ...merge, tool_input: { command: 'git merge feature/x' } }), 'unrelated branch');
});

test('next and resume: a plan walked to audited answers the same from a new process in main, a worktree and a subdirectory', () => {
  const repo = project();
  const planFile = walk(repo, 'plan-written');
  ok(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]), 'begin-review');
  ok(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims: [] }), 'r.md')]), 'review-done');
  ok(audit(repo, ['probes', '--plan', 'p1']), 'probes');
  ok(audit(repo, ['begin-verify', '--plan', 'p1']), 'begin-verify');
  const fin = ok(audit(repo, ['finish', '--plan', 'p1']), 'finish');
  assert.equal(fin.verdict, 'APPROVE');
  ok(plan(repo, ['advance', '--plan', 'p1', '--to', 'audited', '--plan-file', planFile]), 'audited');

  const wt = path.join(makeTempDir('e2e-h5-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'task-x', wt], repo);
  const sub = path.join(wt, 'lib');
  fs.mkdirSync(sub, { recursive: true });
  const text = (cwd) => spawnSync(process.execPath, [path.join(SCRIPTS, 'next.js'), '--cwd', cwd, '--text'], { encoding: 'utf8', cwd: makeTempDir('e2e-h5-away-') }).stdout.trim();
  const base = text(repo);
  assert.match(base, /El plan p1 está en la etapa audited/);
  assert.equal(text(wt), base);
  assert.equal(text(sub), base);

  const start = runLauncher('session-start', { hook_event_name: 'SessionStart', source: 'compact', cwd: wt, session_id: 's1' });
  assert.equal(start.status, 0, start.stderr);
  const context = JSON.parse(start.stdout).hookSpecificOutput.additionalContext;
  assert.ok(context.includes(base), `${context} no contiene ${base}`);
});

test('present: text blocks publishing, a pii pattern fails check without repeating the datum, and approved versions verify or BLOCK', () => {
  const data = 'cliente-77-confidencial';
  // presentation: text dentro de un flujo.
  const t = project('presentation: text\n');
  fs.writeFileSync(path.join(t, '.pignolo', 'run.json'), JSON.stringify({ v: 1, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: new Date(Date.now() + 3600000).toISOString() }));
  const view = path.join(t, 'view.html');
  fs.writeFileSync(view, '<!doctype html><p>hola</p>');
  const denied = runLauncher('present-gate', { hook_event_name: 'PreToolUse', tool_name: 'Artifact', tool_input: { file_path: view }, cwd: t });
  assert.equal(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, /Alternativa:/);

  // pii-patterns: present.js check sale 1 y no repite el dato.
  const p = project('presentation: ask\npii-patterns:\n  - "cliente-[0-9]+-confidencial"\n');
  const html = path.join(p, 'pii.html');
  fs.writeFileSync(html, `<!doctype html><p>ver ${data}</p>`);
  const chk = cli('present.js', p, ['check', '--html', html, '--cwd', p]);
  assert.equal(chk.status, 1, chk.stderr + chk.stdout);
  assert.ok(!chk.stdout.includes(data) && !chk.stderr.includes(data), 'the datum is never repeated');

  // Aprobados: dos guardados dan -v2 y verifican; editado a mano, BLOCKED.
  const from = makeTempDir('e2e-h5-screens-');
  fs.writeFileSync(path.join(from, 'a.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inicio</title></head><body><h1>Inicio</h1></body></html>\n');
  const root = makeTempDir('e2e-h5-proj-');
  const save = () => ok(cli('approved.js', root, ['save', '--project', root, '--flow', 'checkout', '--from', from, '--date', '2026-09-30']), 'save');
  const first = save();
  const second = save();
  assert.equal(first.path, 'design/approved/checkout');
  assert.equal(second.path, 'design/approved/checkout-v2');
  const verify = (sha, rel = second.path) => cli('approved-verify.js', root, ['--path', rel, '--project', root, '--sha', sha]);
  assert.equal(verify(second.manifestSha256).status, 0);
  assert.equal(verify(first.manifestSha256, first.path).status, 0, 'the first stays intact');
  fs.appendFileSync(path.join(root, second.path, 'a.html'), '<!-- editado a mano -->\n');
  const bad = verify(second.manifestSha256);
  assert.equal(bad.status, 1);
  assert.equal(bad.out.status, 'BLOCKED');
  assert.ok(bad.out.problems.some((x) => x.problem === 'file-changed'), JSON.stringify(bad.out));
});

test('audit recipe with the five real probes: each fixed probe runs on this machine and closes its claim', () => {
  const repo = project();
  const planFile = walk(repo, 'plan-written');
  const claims = [
    claim('C1', '`git apply --numstat` proves the patch applies'),
    claim('C2', "spawn('npm', ['test']) runs without a shell on Windows"),
    claim('C3', 'killing the child also kills its grandchild'),
    claim('C4', 'spawnSync does not block the heartbeat timer'),
    claim('C5', 'process.kill(pid, 0) throws only if the process is dead'),
  ];
  assert.deepEqual(PROBES.map((x) => x.id).sort(), ['git-apply-numstat', 'kill-leaves-grandchild', 'kill0-eperm', 'npm-without-shell', 'spawnsync-blocks-loop']);
  ok(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]), 'begin-review');
  ok(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims }), 'r.md')]), 'review-done');
  const probes = ok(audit(repo, ['probes', '--plan', 'p1']), 'probes');
  const results = JSON.parse(fs.readFileSync(path.join(pa.auditDir(repo, 'p1'), 'probes.json'), 'utf8')).results;
  assert.equal(results.length, 5, 'every claim triggers exactly its probe');
  for (const r of results) assert.ok(typeof r.evidence === 'string' && r.evidence.length > 0, `${r.probe} has evidence`);
  if (process.platform === 'win32') assert.deepEqual([...probes.closed].sort(), ['C1', 'C2', 'C3', 'C4', 'C5'], 'on win32 the five refute');
  else assert.ok(results.every((r) => r.falsified || /\S/.test(r.evidence)), 'elsewhere the ones that do not apply say why');
  const bv = ok(audit(repo, ['begin-verify', '--plan', 'p1']), 'begin-verify');
  if (probes.remaining.length === 0) assert.equal(bv.skipped, true);
  const fin = ok(audit(repo, ['finish', '--plan', 'p1', ...(probes.remaining.length ? ['--report-file', file(J([]), 'v.md')] : [])]), 'finish');
  assert.equal(fin.verdict, 'REQUEST_CHANGES', 'a refuting probe is a finding, never an APPROVE');
  assert.ok(fin.findings.some((f) => /^probe /.test(f.kind)));
});

test('audit hooks through the launcher: review denies Bash, verify counts both events, the stop blocks twice and then lets go as incomplete; finish says ESCALATE', () => {
  const repo = project();
  const planFile = walk(repo, 'plan-written');
  const claims = [claim('C1', 'the helper returns the list sorted'), claim('C2', 'the registry is written atomically'), claim('C3', 'the cache is invalidated on write')];
  const base = { cwd: repo, agent_id: 'a1' };
  const event = (name, agent, extra = {}) => ({ hook_event_name: name, agent_type: agent, ...base, ...extra });
  const bash = { tool_name: 'Bash', tool_input: { command: 'node scratch/c1.js' } };

  ok(audit(repo, ['begin-review', '--plan', 'p1', '--plan-file', planFile]), 'begin-review');
  const pre = runLauncher('plan-audit-gate', event('PreToolUse', REVIEW_AGENT, bash));
  assert.equal(pre.status, 2, pre.stderr);
  assert.match(pre.stderr, /Alternativa:/);
  ok(audit(repo, ['review-done', '--plan', 'p1', '--report-file', file(J({ findings: [], claims }), 'r.md')]), 'review-done');
  assert.deepEqual(ok(audit(repo, ['probes', '--plan', 'p1']), 'probes').remaining, ['C1', 'C2', 'C3']);
  ok(audit(repo, ['begin-verify', '--plan', 'p1']), 'begin-verify');

  quiet(runLauncher('plan-audit-gate', event('PreToolUse', VERIFY_AGENT, bash)), 'verify does not deny');
  quiet(runLauncher('plan-audit-gate', event('PostToolUseFailure', VERIFY_AGENT, bash)), 'a failing Bash');
  assert.equal(pa.readMode({ main: repo }).experiments, 1);

  const msg = J([{ id: 'C1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'ok' }]);
  const stop = () => runLauncher('plan-audit-gate', event('SubagentStop', VERIFY_AGENT, { last_assistant_message: msg }));
  for (let i = 0; i < 2; i += 1) {
    const r = stop();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).decision, 'block');
  }
  quiet(stop(), 'the third attempt lets go');
  const m = pa.readMode({ main: repo });
  assert.equal(m.attempts, 3);
  assert.equal(m.incomplete, true);

  const fin = ok(audit(repo, ['finish', '--plan', 'p1', '--report-file', file(msg, 'v.md')]), 'finish');
  assert.equal(fin.verdict, 'ESCALATE');
  assert.equal(fin.incomplete, true);
  assert.equal(ps.readPlan({ main: repo, plan: 'p1' }).plan.audit.verdict, 'ESCALATE');
  assert.notEqual(ps.auditState({ main: repo, plan: 'p1', planFile }), 'ok');
});
