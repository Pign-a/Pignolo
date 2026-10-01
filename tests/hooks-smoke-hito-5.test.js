'use strict';
// Humo por el launcher real, un caso por hook nuevo del hito 5a (Task 12).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, runLauncher, PLUGIN_ROOT } = require('./helpers');
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const pa = require(path.join(PLUGIN_ROOT, 'lib', 'plan-audit.js'));
const { REVIEW_AGENT, VERIFY_AGENT } = require(path.join(PLUGIN_ROOT, 'lib', 'plan-agents.js'));

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

function project(md = '---\ntype: code-tested\n---\n') {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo', 'state', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), md);
  return repo;
}
const home = () => ({ PIGNOLO_HOME: makeTempDir() });
const quiet = (r, label) => { assert.equal(r.status, 0, `${label}: ${r.stderr}`); assert.equal(r.stdout, '', label); };

test('scope-gate denies a merge of int/p1 into main with a draft card; git status passes', () => {
  const repo = project();
  assert.ok(ps.newPlan({ main: repo, plan: 'p1', request: REQUEST, spec: 's' }).ok);
  assert.ok(ps.saveScopeCard({ main: repo, plan: 'p1', text: CARD }).ok);
  git(['branch', 'int/p1'], repo);
  const merge = runLauncher('scope-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git merge int/p1' }, cwd: repo }, home());
  assert.equal(merge.status, 2, merge.stderr);
  assert.match(merge.stderr, /Alternativa:/);
  quiet(runLauncher('scope-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: repo }, home()), 'git status');
});

test('plan-audit-gate denies Bash to the review agent in review mode', () => {
  const repo = project();
  pa.beginMode({ main: repo, plan: 'p1', mode: 'review' });
  const r = runLauncher('plan-audit-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: repo, agent_type: REVIEW_AGENT, agent_id: 'a1' }, home());
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /Alternativa:/);
});

test('plan-audit-gate counts a PostToolUseFailure of the verify agent in verify mode', () => {
  const repo = project();
  pa.beginMode({ main: repo, plan: 'p1', mode: 'verify', claims: [{ id: 'C1', claim: 'c', how: 'h' }] });
  const r = runLauncher('plan-audit-gate', { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'node fail.js' }, cwd: repo, agent_type: VERIFY_AGENT, agent_id: 'a1' }, home());
  quiet(r, 'failure');
  assert.equal(pa.readMode({ main: repo }).experiments, 1);
});

test('present-gate denies publishing with presentation: text inside a flow', () => {
  const repo = project('---\ntype: code-tested\npresentation: text\n---\n');
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify({ v: 1, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: new Date(Date.now() + 3600000).toISOString() }));
  const f = path.join(repo, 'view.html');
  fs.writeFileSync(f, '<!doctype html><p>hola</p>');
  const r = runLauncher('present-gate', { hook_event_name: 'PreToolUse', tool_name: 'Artifact', tool_input: { file_path: f }, cwd: repo }, home());
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /Alternativa:/);
});

test('payloads with nothing to do exit 0 without output, even in a project with a draft plan', () => {
  const repo = project();
  assert.ok(ps.newPlan({ main: repo, plan: 'p1', request: REQUEST, spec: 's' }).ok);
  assert.ok(ps.saveScopeCard({ main: repo, plan: 'p1', text: CARD }).ok);
  quiet(runLauncher('plan-audit-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: repo, agent_type: 'pignolo:implementer', agent_id: 'a1' }, home()), 'other agent');
  quiet(runLauncher('plan-audit-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: repo }, home()), 'main thread');
  quiet(runLauncher('scope-gate', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: repo }, home()), 'ls');
  quiet(runLauncher('present-gate', { hook_event_name: 'PreToolUse', tool_name: 'Artifact', tool_input: { file_path: path.join(repo, 'x.html') }, cwd: repo }, home()), 'no flow');
});

// Prueba de que el atajo corre antes de cargar el handler: en una copia del lanzador sin
// handlers, un payload que se saltea sale con 0 y uno que no, falla porque no puede cargarlo.
test('the launcher skips before creating the Worker (no handler is loaded)', () => {
  const { spawnSync } = require('node:child_process');
  const copy = makeTempDir('pignolo-launcher-');
  fs.mkdirSync(path.join(copy, 'hooks', 'handlers'), { recursive: true });
  fs.mkdirSync(path.join(copy, 'lib'));
  const entry = path.join(copy, 'hooks', 'launcher.js');
  fs.copyFileSync(path.join(PLUGIN_ROOT, 'hooks', 'launcher.js'), entry);
  for (const f of ['hook-fastpath.js', 'plan-agents.js']) fs.copyFileSync(path.join(PLUGIN_ROOT, 'lib', f), path.join(copy, 'lib', f));
  const go = (name, payload) => spawnSync(process.execPath, [entry, name], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 20000 });
  const skipped = go('plan-audit-gate', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(skipped.stdout + skipped.stderr, '');
  const merge = go('scope-gate', { tool_name: 'Bash', tool_input: { command: 'git merge x' } });
  assert.equal(merge.status, 2, 'a gated payload does reach the Worker and fails to load the handler');
  assert.equal(go('scope-gate', { tool_name: 'Bash', tool_input: { command: 'git status' } }).status, 0);
});
