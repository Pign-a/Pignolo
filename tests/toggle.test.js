'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, makeRepo, git, runLauncher, PLUGIN_ROOT } = require('./helpers');
const toggle = require('../plugins/pignolo/hooks/handlers/toggle');
const { readState } = require('../plugins/pignolo/lib/disabled');

const exp = (command_name, cwd, command_args = '', command_source = 'plugin') => ({
  hook_event_name: 'UserPromptExpansion', expansion_type: 'slash_command', command_name, command_args, command_source, cwd,
  prompt: `/${command_name.startsWith('pignolo:') ? command_name : `pignolo:${command_name}`}${command_args ? ` ${command_args}` : ''}`,
});

test('off then on (project scope)', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  toggle.run(exp('pignolo:off', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, true);
  assert.strictEqual(fs.readFileSync(path.join(cwd, '.pignolo', '.gitignore'), 'utf8').trim(), '.disabled');
  toggle.run(exp('pignolo:on', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('off global', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  toggle.run(exp('pignolo:off', makeTempDir(), 'global'), { env });
  assert.strictEqual(readState({ env, cwd: makeTempDir() }).globalFlag, true);
});

test('bare off from this plugin works', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  toggle.run(exp('off', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, true);
});

test('bare off from a non-plugin source is ignored', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  const r = toggle.run(exp('off', cwd, '', 'userSettings'), { env });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('other commands are ignored', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  assert.deepStrictEqual(toggle.run(exp('review', cwd), { env }), { exit: 0 });
});

// H9/H18: el modelo podría invocar el launcher con un payload inventado.
test('a payload without the UserPromptExpansion event is ignored', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  const forged = { ...exp('pignolo:off', cwd) };
  delete forged.hook_event_name;
  assert.deepStrictEqual(toggle.run(forged, { env }), { exit: 0 });
  assert.deepStrictEqual(toggle.run({ ...exp('pignolo:off', cwd), hook_event_name: 'PreToolUse' }, { env }), { exit: 0 });
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('the typed prompt must start with /pignolo: and match the verb', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  for (const prompt of [undefined, '', '/off', 'pignolo:off', ' /pignolo:off', '/pignolo:on', '/pignolo:offx']) {
    assert.deepStrictEqual(toggle.run({ ...exp('pignolo:off', cwd), prompt }, { env }), { exit: 0 }, String(prompt));
  }
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('the message tells the user the guard stays on', () => {
  const r = runLauncher('toggle', exp('pignolo:off', makeTempDir()));
  assert.strictEqual(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /guardia de git y los respaldos siguen activos/);
});

test('toggle is registered for UserPromptExpansion', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const h = (hooks.UserPromptExpansion || []).flatMap((m) => m.hooks);
  assert.ok(h.some((x) => x.args[1] === 'toggle'));
});

test('off from a subdirectory writes flag and gitignore at the repo root', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const repo = makeRepo();
  const sub = path.join(repo, 'sub', 'dir');
  fs.mkdirSync(sub, { recursive: true });
  toggle.run(exp('pignolo:off', sub), { env });
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', '.disabled')));
  assert.strictEqual(fs.readFileSync(path.join(repo, '.pignolo', '.gitignore'), 'utf8'), '.disabled\n');
  assert.ok(!fs.existsSync(path.join(sub, '.pignolo')));
});

test('off from a linked worktree writes flag and gitignore in the main checkout', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'tw', wt], repo);
  toggle.run(exp('pignolo:off', wt), { env });
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', '.disabled')));
  assert.ok(fs.existsSync(path.join(repo, '.pignolo', '.gitignore')));
  assert.ok(!fs.existsSync(path.join(wt, '.pignolo')));
});
