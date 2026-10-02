'use strict';
// Regla subagent-main (decisión del autor, 2026-10-02): push y merge sobre main/master solo los hace
// el hilo principal. Un subagente los tiene negados; el hilo principal pasa sin preguntar.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const { makeRepo, makeTempDir, git } = require('./helpers');

const PS_T = 30000;
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: PS_T, subagent: true, agentType: 'pignolo:implementer', ...o });
const main = (command, o = {}) => sub(command, { subagent: false, agentType: null, ...o });
const out = (v) => (v.decision === 'block' ? v.rule : v.decision);

const onMain = makeRepo();
const onFeat = makeRepo();
git(['checkout', '-q', '-b', 'feat'], onFeat);
const detached = makeRepo();
git(['checkout', '-q', '--detach'], detached);
const posix = (p) => p.split(path.sep).join('/');

// [nombre, comando, cwd]: todo esto lo niega un subagente y lo deja pasar el hilo principal.
const DENIED = [
  ['push explicit main', 'git push origin main', onFeat],
  ['push master', 'git push origin master', onFeat],
  ['push HEAD:main', 'git push origin HEAD:main', onFeat],
  ['push feat:main', 'git push origin feat:main', onFeat],
  ['push refs/heads/main', 'git push origin HEAD:refs/heads/main', onFeat],
  ['push -u main', 'git push -u origin main', onFeat],
  ['push main with HEAD elsewhere, bare ref and others', 'git push origin feat main', onFeat],
  ['push --all', 'git push --all origin', onFeat],
  ['push --delete main', 'git push origin --delete main', onFeat],
  ['plain push on main', 'git push', onMain],
  ['push origin on main', 'git push origin', onMain],
  ['push origin HEAD on main', 'git push origin HEAD', onMain],
  ['plain push, HEAD unreadable', 'git push', detached],
  ['push after cd to a repo on main', `cd "${posix(onMain)}" && git push`, onFeat],
  ['push with -C to a repo on main', `git -C "${posix(onMain)}" push origin`, onFeat],
  ['push in a compound command', 'git add a.js && git commit -m x && git push origin main', onFeat],
  ['merge on main', 'git merge feat', onMain],
  ['merge --no-ff on main', 'git merge --no-ff feat', onMain],
  ['merge, HEAD unreadable', 'git merge feat', detached],
  ['merge after cd to a repo on main', `cd "${posix(onMain)}" && git merge feat`, onFeat],
  ['merge with -C to a repo on main', `git -C "${posix(onMain)}" merge feat`, onFeat],
  ['merge after switching to main', 'git switch main && git merge feat', onFeat],
];

for (const [name, cmd, cwd] of DENIED) {
  test(`subagente niega: ${name}`, () => {
    const v = sub(cmd, { cwd });
    assert.strictEqual(out(v), 'subagent-main', `${cmd} -> ${JSON.stringify(v)}`);
  });
  test(`hilo principal permite: ${name}`, () => {
    const v = main(cmd, { cwd });
    assert.notStrictEqual(out(v), 'subagent-main', cmd);
    if (!/\$d|--delete/.test(cmd)) assert.strictEqual(v.decision, 'allow', `${cmd} -> ${JSON.stringify(v)}`);
  });
}

test('subagente niega en PowerShell: push a main, push plano en main, merge en main, tras Set-Location y con -C', () => {
  for (const [cmd, cwd] of [
    ['git push origin main', onFeat], ['git push origin HEAD:main', onFeat], ['git push', onMain], ['git merge feat', onMain],
    [`Set-Location "${onMain}"; git push`, onFeat], [`git -C "${onMain}" merge feat`, onFeat], ['git add a.js; git commit -m "x"; git push origin main', onFeat],
  ]) {
    assert.strictEqual(out(sub(cmd, { cwd, shell: 'powershell' })), 'subagent-main', cmd);
    assert.strictEqual(main(cmd, { cwd, shell: 'powershell' }).decision, 'allow', `hilo principal: ${cmd}`);
  }
});

test('subagente: push y merge de otra rama pasan', () => {
  for (const cmd of ['git push origin feat', 'git push -u origin feat', 'git push', 'git push origin HEAD', 'git push origin HEAD:feat', 'git push --tags', 'git push origin refs/heads/feat', 'git push origin maintenance', 'git merge main', 'git merge --no-ff main']) {
    assert.strictEqual(sub(cmd, { cwd: onFeat }).decision, 'allow', cmd);
  }
  assert.strictEqual(sub(`cd "${posix(onFeat)}" && git push`, { cwd: onMain }).decision, 'allow', 'cd a una rama de tarea');
});

test('subagente: las lecturas no cambian en main', () => {
  for (const cmd of ['git log --oneline -3', 'git status', 'git show HEAD', 'git diff', 'git branch', 'git merge-base main HEAD', 'git fetch origin']) {
    assert.strictEqual(sub(cmd, { cwd: onMain }).decision, 'allow', cmd);
  }
});

test('subagente: el mensaje dice que lo hace el hilo principal y da la alternativa', () => {
  const v = sub('git push origin main', { cwd: onFeat });
  assert.match(v.reason, /hilo principal/);
  assert.match(v.alternative, /hilo principal/);
});

test('push forzado y borrado remoto conservan su regla también para un subagente', () => {
  assert.strictEqual(out(sub('git push --force origin feat', { cwd: onFeat })), 'push-force');
  assert.strictEqual(sub('git push origin --delete feat', { cwd: onFeat }).rule, 'push-delete');
  assert.strictEqual(sub('git -C "$d" merge feat', { cwd: onFeat }).decision, 'block', 'merge con -C sin resolver: cerrado');
});
