'use strict';
// T5: menos texto de la auditoría en la conversación. Los dos CHECK de la tarjeta (qué deja escribir la guardia a
// un subagente) y el texto de la skill y de la plantilla que salen de ellos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const protect = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'protect-paths.js'));
const handback = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'handback-gate.js'));
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));

const read = (...p) => fs.readFileSync(path.join(PLUGIN_ROOT, ...p), 'utf8');
const env = () => ({ PIGNOLO_HOME: makeTempDir() });
const payload = (cwd, file_path, agent_type) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd, tool_input: { file_path, content: 'x' }, agent_type, agent_id: 'a1' });

function activeRepo() {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\ntest-paths:\n  - "tests/"\n---\n');
  return repo;
}

// CHECK 1: ¿la guardia deja al plan-auditor escribir su informe en una ruta del encargo? No: por eso el informe
// lo guarda el hilo principal y la skill no pide la forma de una línea.
test('T5 CHECK 1: in review mode the guard denies the plan-auditor any write, the audit folder included', () => {
  const repo = activeRepo();
  pa.beginMode({ main: repo, plan: 'p1', mode: 'review' });
  for (const file of [path.join(repo, '.pignolo', 'tmp', 'plan-audit', 'p1', 'report-review.md'), path.join(repo, '.pignolo', 'tmp', 'report.md')]) {
    const r = protect.run(payload(repo, file, 'pignolo:plan-auditor'), { env: env() });
    assert.strictEqual(r.exit, 2, file);
    assert.match(r.stderr, /Alternativa:/);
  }
});

// CHECK 2: ¿puede un subagente editar el archivo del plan? Sí, durante la auditoría (sin tareas registradas).
test('T5 CHECK 2: a pignolo:fixer may edit a plan file under docs/plans during the audit (a plan flow, no task registered), and its DONE is not gated', () => {
  const repo = activeRepo();
  const run = { v: 1, flow: 'plan', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString() };
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
  const planFile = path.join(repo, 'docs', 'plans', '2026-10-05-x.md');
  assert.strictEqual(protect.run(payload(repo, planFile, 'pignolo:fixer'), { env: env() }).exit, 0);
  const done = handback.run({ hook_event_name: 'SubagentStop', cwd: repo, agent_type: 'pignolo:fixer', agent_id: 'a1', last_assistant_message: 'R1-1: lines 10-12\nDONE' }, { env: env() });
  assert.strictEqual(done.exit, 0);
  assert.ok(!done.stdout, 'no block');
});

test('T5: the template tells the fixed summary, the fix pass by one pignolo:fixer on the plan file only, and the fallback to the main thread', () => {
  const t = read('templates', 'plan-audit.md');
  for (const re of [
    /Summary to the human, fixed form, after every round/,
    /`CRITICAL n · IMPORTANT n · MINOR n`/,
    /No tables and no history of earlier rounds unless the human asks/,
    /dispatch one `pignolo:fixer`[^.]*with that file and the plan path/,
    /Its card lists only the plan file/,
    /It edits only that file/,
    /Do not narrate the edits/,
    /do the fix pass yourself in the main thread, still without narrating each edit/,
    /denies the `plan-auditor` every write outside the `scratch\/` of its verify mode/,
  ]) assert.match(t, re);
});

test('T5: the plan skill names the fix agent, the fixed summary and the three options of the escalation, and stays under the size cap', () => {
  const t = read('skills', 'plan', 'SKILL.md');
  assert.match(t, /the fix pass \(one `pignolo:fixer`\) and the fixed summary after each round are in `<P>\/templates\/plan-audit\.md`/);
  assert.match(t, /fix and re-audit only what changed, audit again in full, or leave the plan/);
  assert.ok(t.length <= 14000, `la skill mide ${t.length}`);
});
