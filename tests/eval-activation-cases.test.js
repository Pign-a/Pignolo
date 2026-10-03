'use strict';
// Forma de la prueba de activación (tests/evals/activation-cases.js y activation-run.js), sin correr claude.
// Protege: 20 frases que deben activar una skill concreta (con la del autor) y 10 que no activan ninguna de
// las ocho; el parser del stream y el grader; el runner no gasta en --dry-run.
// Se rompe si: cambia el reparto 20/10, una frase positiva apunta a una skill que no existe o el grader
// da por buena una skill equivocada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CASES, EIGHT, invokedSkill, grade } = require('./evals/activation-cases');

const ROOT = path.join(__dirname, '..');

test('20 positive phrases (the author\'s one among them) and 10 negative ones, unique ids and prompts', () => {
  assert.equal(CASES.filter((c) => c.expect).length, 20);
  assert.equal(CASES.filter((c) => !c.expect).length, 10);
  assert.ok(CASES.some((c) => c.prompt === 'quiero que hagamos ahora el panel de datos de la app' && c.expect === 'pignolo-ui:new'));
  assert.equal(new Set(CASES.map((c) => c.id)).size, 30);
  assert.equal(new Set(CASES.map((c) => c.prompt)).size, 30);
});

test('every expected skill is one of the eight and has a SKILL.md without disable-model-invocation', () => {
  for (const c of CASES.filter((x) => x.expect)) {
    assert.ok(EIGHT.includes(c.expect), c.expect);
    const [plugin, name] = c.expect.split(':');
    const text = fs.readFileSync(path.join(ROOT, 'plugins', plugin, 'skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text.split('\n---')[0], /disable-model-invocation/);
  }
  assert.deepEqual([...new Set(CASES.filter((c) => c.expect).map((c) => c.expect))].sort(), [...EIGHT].sort());
});

test('invokedSkill lists every Skill tool_use in order; grade accepts the pignolo:entry detour and nothing else before the expected skill', () => {
  const ev = (content) => JSON.stringify({ type: 'assistant', message: { content } });
  const sk = (skill) => ev([{ type: 'tool_use', name: 'Skill', input: { skill } }]);
  const stream = [JSON.stringify({ type: 'system' }), ev([{ type: 'text', text: 'ok' }]), sk('pignolo:entry'), sk('pignolo-ui:new')].join('\n');
  assert.deepEqual(invokedSkill(stream), ['pignolo:entry', 'pignolo-ui:new']);
  assert.deepEqual(invokedSkill(ev([{ type: 'text', text: 'hola' }])), []);
  assert.deepEqual(invokedSkill('no es json\n{roto'), []);
  // positivas: la esperada sola, o precedida solo por pignolo:entry
  assert.equal(grade('pignolo-ui:new', ['pignolo-ui:new']), true);
  assert.equal(grade('pignolo-ui:new', ['pignolo:entry', 'pignolo-ui:new']), true);
  assert.equal(grade('pignolo-ui:new', ['pignolo:entry', 'pignolo-ui:new', 'pignolo-ui:audit']), true);
  assert.equal(grade('pignolo-ui:new', ['pignolo-ui:improve']), false);
  assert.equal(grade('pignolo-ui:new', ['pignolo-ui:improve', 'pignolo-ui:new']), false);
  assert.equal(grade('pignolo-ui:new', ['pignolo:entry', 'pignolo-ui:improve', 'pignolo-ui:new']), false);
  assert.equal(grade('pignolo-ui:new', ['pignolo:entry']), false);
  assert.equal(grade('pignolo-ui:new', []), false);
  // negativas: ninguna de las ocho en toda la lista
  assert.equal(grade(null, []), true);
  assert.equal(grade(null, ['pignolo:entry']), true);
  assert.equal(grade(null, ['pignolo:entry', 'pignolo:status']), false);
  assert.equal(grade(null, ['pignolo:status']), false);
});

test('the control arm extracts the plugins of the control commit without tar (works on Windows paths)', () => {
  const { pluginsRoot, cleanupControl, CONTROL_COMMIT } = require('./evals/activation-run');
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'act-ctl-'));
  try {
    const root = pluginsRoot('control', tmp);
    assert.ok(fs.existsSync(path.join(root, 'pignolo-ui', 'skills', 'new', 'SKILL.md')));
    // el control es main antes del cambio: las skills de pignolo-ui eran solo humanas
    assert.match(fs.readFileSync(path.join(root, 'pignolo-ui', 'skills', 'new', 'SKILL.md'), 'utf8'), /disable-model-invocation: true/);
    assert.equal(CONTROL_COMMIT, '3882ded');
    cleanupControl(tmp);
    assert.equal(fs.existsSync(root), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the runner keeps the raw stream of every run, one file per run, so it can be regraded', () => {
  const { rawPath } = require('./evals/activation-run');
  assert.equal(path.basename(rawPath('/x/out', 'control', 'P01', 2)), 'control-P01-r2.jsonl');
  assert.equal(path.basename(path.dirname(rawPath('/x/out', 'control', 'P01', 2))), 'raw');
});

test('the runner in --dry-run spends nothing and reports the number of runs; it needs an arm', () => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tests', 'evals', 'activation-run.js'), ...a], { encoding: 'utf8' });
  const ok = run('--arm', 'treatment', '--reps', '3', '--dry-run');
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).runs, 90);
  assert.equal(JSON.parse(run('--arm', 'control', '--reps', '1', '--dry-run').stdout).runs, 30);
  assert.equal(run('--dry-run').status, 2);
});
