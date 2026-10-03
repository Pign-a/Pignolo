'use strict';
// Compuerta de commit de la guardia (T2 del plan 2026-10-03-fuga-leak-values): un commit con archivos privados de
// pignolo en lo que va a registrar sale con exit 2; sacarlos del índice, nunca.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runGuard, makeRepo, makeTempDir, git } = require('./helpers');
const { isPrivatePath } = require('../plugins/pignolo/lib/private-paths');
const { exitCommand } = require('../plugins/pignolo/lib/private-index');

const SECRET = 'SECRETO-XYZ';
const bash = (command, cwd, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd, ...extra });
const put = (repo, rel, text = `["${SECRET}"]\n`) => {
  const f = path.join(repo, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
// Como el incidente: lo ignorado entra al índice con add -f, fuera del hook.
function leaky(rel = '.pignolo-ui/runs/r1/leak-values.json') {
  const repo = makeRepo();
  put(repo, '.pignolo-ui/.gitignore', '*\n');
  put(repo, rel);
  git(['add', '-f', rel], repo);
  return repo;
}
const exit = (r) => `git restore --staged -- "${r}"`;

test('3: a commit with a staged leak-values.json is blocked with the exact exit command and never the contents', () => {
  const repo = leaky();
  const r = runGuard(bash('git commit -m x', repo));
  assert.strictEqual(r.status, 2);
  assert.ok(r.stderr.includes(exit('.pignolo-ui/runs/r1/leak-values.json')), r.stderr);
  assert.ok(!r.stderr.includes(SECRET));
  assert.match(r.stderr, /comando aparte/);
});

test('3: leak-origins.json elsewhere, .pignolo/local/x.txt, a subagent, PIGNOLO_DISABLED and /pignolo:off all block too', () => {
  const o = leaky('docs/leak-origins.json');
  assert.strictEqual(runGuard(bash('git commit -m x', o)).status, 2);
  const l = leaky('.pignolo/local/x.txt');
  assert.strictEqual(runGuard(bash('git commit -m x', l)).status, 2);
  const s = leaky();
  assert.strictEqual(runGuard(bash('git commit -m x', s, { agent_id: 'a1', agent_type: 'pignolo:implementer' })).status, 2);
  assert.strictEqual(runGuard(bash('git commit -m x', s), { PIGNOLO_DISABLED: '1' }).status, 2);
  // /pignolo:off: el flag global apaga los demás hooks, nunca la compuerta
  const home = makeTempDir('pignolo-home-');
  fs.writeFileSync(path.join(home, 'disabled'), '');
  assert.strictEqual(runGuard(bash('git commit -m x', s), { PIGNOLO_HOME: home }).status, 2);
});

test('3: the repo has no .pignolo/project.md (pignolo not initialized) and the gate still runs', () => {
  const repo = leaky();
  assert.ok(!fs.existsSync(path.join(repo, '.pignolo', 'project.md')));
  assert.strictEqual(runGuard(bash('git commit -m x', repo)).status, 2);
});

test('3: git -C <repo> commit from another cwd, and git commit -a with the file tracked and modified', () => {
  const repo = leaky();
  const elsewhere = makeTempDir('pignolo-else-');
  const r = runGuard(bash(`git -C "${repo}" commit -m x`, elsewhere));
  assert.strictEqual(r.status, 2, r.stderr);
  // tracked (cleanly committed by someone) and then modified: only -a puts it in the commit
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'ya trackeado'], repo);
  put(repo, '.pignolo-ui/runs/r1/leak-values.json', `["${SECRET}", "otro"]\n`);
  assert.strictEqual(runGuard(bash('git commit -m x', repo)).status, 0, 'unstaged change: a plain commit takes nothing');
  assert.strictEqual(runGuard(bash('git commit -a -m x', repo)).status, 2);
  assert.strictEqual(runGuard(bash('git commit -am x', repo)).status, 2);
});

test('3: commit with a pathspec looks at those paths; --amend looks at the index against HEAD^', () => {
  const repo = leaky();
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'ya trackeado'], repo);
  put(repo, '.pignolo-ui/runs/r1/leak-values.json', `["${SECRET}", "otro"]\n`);
  assert.strictEqual(runGuard(bash('git commit -m x -- .pignolo-ui/runs/r1/leak-values.json', repo)).status, 2);
  assert.strictEqual(runGuard(bash('git commit -m x -- a.txt', repo)).status, 0);
  // amend: HEAD ya lleva el privado (lo commiteó alguien) y el amend lo reescribe
  assert.strictEqual(runGuard(bash('git commit --amend --no-edit', repo)).status, 2);
});

test('4: an index without private files commits; the prefilter does not fire on restore, log, status or log --grep commit', () => {
  const repo = makeRepo();
  put(repo, 'src/a.js', 'x\n');
  git(['add', 'src/a.js'], repo);
  assert.strictEqual(runGuard(bash('git commit -m x', repo)).status, 0);
  const l = leaky();
  for (const c of ['git restore --staged .pignolo-ui/runs', 'git log --oneline', 'git status', 'git log --grep commit']) {
    assert.strictEqual(runGuard(bash(c, l)).status, 0, c);
  }
});

test('5: getting out is never blocked: restore --staged, rm --cached, reset -- (also in one line before the commit)', () => {
  for (const c of ['git restore --staged -- ".pignolo-ui/runs/r1/leak-values.json"', 'git rm --cached -r .pignolo-ui/runs', 'git reset -- .pignolo-ui/runs', 'git reset HEAD -- .pignolo-ui/runs/r1/leak-values.json']) {
    const repo = leaky();
    assert.strictEqual(runGuard(bash(c, repo)).status, 0, c);
    assert.strictEqual(runGuard(bash(c, repo, { agent_id: 'a1', agent_type: 'pignolo:implementer' })).status, 0, `${c} (subagent)`);
  }
  // se corre de verdad el comando del mensaje y el commit pasa
  const repo = leaky();
  const msg = runGuard(bash('git commit -m x', repo)).stderr;
  const cmd = /`(git restore --staged[^`]*)`/.exec(msg)[1];
  assert.strictEqual(runGuard(bash(cmd, repo)).status, 0);
  git(['restore', '--staged', '--', '.pignolo-ui/runs/r1/leak-values.json'], repo);
  assert.strictEqual(runGuard(bash('git commit -m x --allow-empty', repo)).status, 0);
});

test('5: cleaning a tracked private (git rm --cached) and then committing the removal is allowed', () => {
  const repo = leaky();
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'ya trackeado'], repo);
  git(['rm', '--cached', '-q', '-r', '.pignolo-ui'], repo);
  assert.strictEqual(runGuard(bash('git commit -m "sacar privados"', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git commit -a -m "sacar privados"', repo)).status, 0);
  assert.strictEqual(runGuard(bash('git commit --amend --no-edit', repo)).status, 0, 'the amend compares the cleaned index with HEAD^');
});

test('6: capitalization and separators are detected; a leak-values.json in docs/ too; .pignolo/state is not private', () => {
  for (const p of ['.PIGNOLO-UI\\Runs\\r1\\LEAK-VALUES.JSON', './.pignolo-ui/x', 'docs/leak-values.json', '.pignolo/local/a', '.pignolo/tmp/a', '.pignolo/worktrees/w/a', '.pignolo/run.json', '.pignolo/.disabled', '.pignolo/panel-state.json', 'proj/.pignolo-ui/runs/a']) {
    assert.ok(isPrivatePath(p), p);
  }
  for (const p of ['.pignolo/state/decisions.md', '.pignolo/project.md', 'src/pignolo-ui.js', 'a.txt', '']) assert.ok(!isPrivatePath(p), p);
  const repo = leaky('.PIGNOLO-UI/Runs/r1/LEAK-VALUES.JSON');
  assert.strictEqual(runGuard(bash('git commit -m x', repo)).status, 2);
});

test('exitCommand: up to 5 paths, then the parent folder', () => {
  assert.strictEqual(exitCommand(['.pignolo-ui/a/b.json']), 'git restore --staged -- ".pignolo-ui/a/b.json"');
  const many = Array.from({ length: 6 }, (_, i) => `.pignolo-ui/runs/r${i}/leak-values.json`);
  assert.strictEqual(exitCommand(many), 'git restore --staged -- ".pignolo-ui"');
});
